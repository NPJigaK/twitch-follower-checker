import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  lastCheckedDateKey,
  storedAllFollowersKey,
  clientId,
} from "./constants";
import {
  commitFollowerSnapshot,
  diffFollowers,
  readStoredSnapshot,
  type SnapshotCommitError,
  type SnapshotReadError,
} from "./followerSnapshot";
import {
  runFollowerRefreshWorkflow,
  type CompleteFollowerSnapshot,
} from "./followerRefreshWorkflow";
import { RefreshCoordinator } from "./refreshCoordinator";
import { reportRefreshTelemetry } from "./refreshTelemetry";
import {
  fetchAllFollowers,
  getAuthenticatedUser,
  TwitchRequestError,
  type TwitchRequestErrorCode,
  type TwitchDiagnosticReason,
  type TwitchRequestStage,
} from "./twitchApi";

export type FollowerRefreshProblemCode =
  | TwitchRequestErrorCode
  | "storage_unavailable"
  | "stored_snapshot_invalid"
  | "storage_write_failed"
  | "storage_rollback_failed"
  | "unexpected";

export type FollowerRefreshProblem = Readonly<{
  code: FollowerRefreshProblemCode;
  message: string;
  retryAt: number | null;
  requiresReauthentication: boolean;
  diagnostic?: Readonly<{
    stage?: TwitchRequestStage;
    reason?: TwitchDiagnosticReason;
    page?: number;
    status?: number;
  }>;
}>;

const REFRESH_MESSAGES: Record<FollowerRefreshProblemCode, string> = {
  auth_invalid:
    "Your Twitch session is no longer valid. Please authenticate with Twitch again.",
  permission_denied:
    "Twitch did not allow follower access. Please authenticate again and approve the follower permission.",
  bad_request:
    "Twitch rejected the follower request. Your previous follower lists were kept.",
  rate_limited:
    "Twitch is temporarily rate limiting requests. Try again after the displayed wait time.",
  server_error:
    "Twitch is temporarily unavailable. Your previous follower lists were kept.",
  network:
    "Twitch could not be reached. Check your connection and try again.",
  timeout:
    "The Twitch request took too long. Your previous follower lists were kept.",
  aborted: "The follower refresh was cancelled.",
  invalid_json:
    "Twitch returned an unexpected response. Your previous follower lists were kept.",
  invalid_response:
    "Twitch returned an unexpected response. Your previous follower lists were kept.",
  follower_details_unavailable:
    "Twitch returned a follower count without follower details. Your previous baseline was not changed.",
  pagination_loop:
    "Twitch returned incomplete pagination data. Your previous baseline was not changed.",
  storage_unavailable:
    "Browser storage is unavailable. Your previous baseline was not changed.",
  stored_snapshot_invalid:
    "The stored follower baseline is invalid. Clear this site's stored data before trying again.",
  storage_write_failed:
    "The follower baseline could not be saved. The previous baseline and check date were kept.",
  storage_rollback_failed:
    "The follower baseline could not be saved, and browser storage could not confirm the previous value. Reload before making another baseline change.",
  unexpected:
    "The follower lists could not be refreshed. Your previous baseline was not changed.",
};

const problem = (
  code: FollowerRefreshProblemCode,
  options: {
    retryAt?: number | null;
    requiresReauthentication?: boolean;
    diagnostic?: FollowerRefreshProblem["diagnostic"];
  } = {}
): FollowerRefreshProblem => ({
  code,
  message: REFRESH_MESSAGES[code],
  retryAt: options.retryAt ?? null,
  requiresReauthentication: options.requiresReauthentication ?? false,
  diagnostic: options.diagnostic,
});

const mapTwitchProblem = (cause: TwitchRequestError): FollowerRefreshProblem =>
  problem(cause.code, {
    retryAt:
      cause.code === "rate_limited"
        ? cause.rateLimitReset !== undefined
          ? cause.rateLimitReset * 1000
          : Date.now() + 60_000
        : null,
    requiresReauthentication:
      cause.code === "auth_invalid" || cause.code === "permission_denied",
    diagnostic: {
      stage: cause.stage,
      reason: cause.reason,
      page: cause.page,
      status: cause.status,
    },
  });

const mapUnknownProblem = (cause: unknown): FollowerRefreshProblem =>
  cause instanceof TwitchRequestError
    ? mapTwitchProblem(cause)
    : problem("unexpected");

const mapReadProblem = (error: SnapshotReadError): FollowerRefreshProblem =>
  error === "storage_unavailable"
    ? problem("storage_unavailable")
    : problem("stored_snapshot_invalid");

const mapCommitProblem = (
  error: SnapshotCommitError
): FollowerRefreshProblem =>
  error === "storage_unavailable"
    ? problem("storage_unavailable")
    : error === "rollback_failed"
      ? problem("storage_rollback_failed")
    : error === "invalid_snapshot" || error === "invalid_argument"
      ? problem("stored_snapshot_invalid")
      : problem("storage_write_failed");

const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export type UseNowAllFollowersOptions = {
  accessToken: string;
  authenticatedUserId: string;
  onAuthenticationInvalid: (
    reason: "invalid_token" | "missing_scope"
  ) => void;
};

export const useNowAllFollowers = ({
  accessToken,
  authenticatedUserId,
  onAuthenticationInvalid,
}: UseNowAllFollowersOptions) => {
  const committedSnapshotRef = useRef<CompleteFollowerSnapshot | null>(null);

  const coordinator = useMemo(
    () =>
      new RefreshCoordinator<CompleteFollowerSnapshot, FollowerRefreshProblem>(
        async (signal) => {
          let stage = "users";
          let ignoredUserMetadata = false;
          const result = await runFollowerRefreshWorkflow<FollowerRefreshProblem>(
            {
              expectedBroadcasterId: authenticatedUserId,
              getAuthenticatedUserId: async (requestSignal) => {
                const user = await getAuthenticatedUser(
                  accessToken,
                  clientId,
                  authenticatedUserId,
                  {
                    signal: requestSignal,
                    onNotice: () => {
                      ignoredUserMetadata = true;
                    },
                  }
                );
                return user.id;
              },
              getAllFollowers: (broadcasterId, requestSignal) => {
                stage = "followers";
                return fetchAllFollowers(
                  accessToken,
                  clientId,
                  broadcasterId,
                  { signal: requestSignal }
                );
              },
              readBaseline: (broadcasterId) => {
                stage = "baseline_read";
                const storage = browserStorage();
                if (storage === null) {
                  return {
                    ok: false,
                    error: problem("storage_unavailable"),
                  };
                }
                const stored = readStoredSnapshot({
                  storage,
                  baseKey: storedAllFollowersKey,
                  legacyDateKey: lastCheckedDateKey,
                  broadcasterId,
                });
                if (!stored.ok) {
                  return { ok: false, error: mapReadProblem(stored.error) };
                }
                return {
                  ok: true,
                  baseline: stored.found
                    ? {
                        followers: stored.snapshot,
                        lastCheckedAt: stored.checkedAt,
                      }
                    : null,
                };
              },
              writeInitialBaseline: (
                broadcasterId,
                followers,
                checkedAt
              ) => {
                stage = "baseline_write";
                const storage = browserStorage();
                if (storage === null) {
                  return {
                    ok: false,
                    error: problem("storage_unavailable"),
                  };
                }
                const committed = commitFollowerSnapshot({
                  storage,
                  baseKey: storedAllFollowersKey,
                  broadcasterId,
                  followers,
                  checkedAt,
                });
                return committed.ok
                  ? { ok: true }
                  : {
                      ok: false,
                      error: mapCommitProblem(committed.error),
                    };
              },
              diffFollowers: (current, baseline) => {
                stage = "comparison";
                return diffFollowers(current, baseline);
              },
              now: () => new Date().toISOString(),
              mapError: mapUnknownProblem,
              abortedError: () => problem("aborted"),
            },
            signal
          );

          if (result.ok && result.value.baselineInitialized) {
            committedSnapshotRef.current = result.value;
          }
          // A single-flight execution owns one terminal event. Unmount and
          // superseded generations abort this signal and cannot report a late
          // result (including the discarded Strict Mode development replay).
          if (!signal.aborted) {
            const diagnostic = result.ok ? undefined : result.error.diagnostic;
            reportRefreshTelemetry({
              outcome: result.ok ? "success" : "failure",
              code: result.ok ? "none" : result.error.code,
              stage: result.ok ? "complete" : diagnostic?.stage ?? stage,
              reason: diagnostic?.reason,
              page: diagnostic?.page,
              status: result.ok ? 200 : diagnostic?.status,
              ignoredUserMetadata,
            });
          }
          return result;
        },
        mapUnknownProblem
      ),
    [accessToken, authenticatedUserId]
  );

  const [refreshState, setRefreshState] = useState(() =>
    coordinator.getState()
  );

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setRefreshState);
    coordinator.activate();
    void coordinator.refresh();

    return () => {
      unsubscribe();
      coordinator.deactivate();
    };
  }, [coordinator]);

  useEffect(() => {
    const refreshProblem = refreshState.error;
    if (!refreshProblem?.requiresReauthentication) {
      return;
    }
    onAuthenticationInvalid(
      refreshProblem.code === "auth_invalid"
        ? "invalid_token"
        : "missing_scope"
    );
  }, [onAuthenticationInvalid, refreshState.error]);

  const refresh = useCallback(() => coordinator.refresh(), [coordinator]);

  const commitCurrentSnapshot = useCallback((): boolean => {
    const candidate = coordinator.getCommitCandidate();
    if (
      candidate === null ||
      committedSnapshotRef.current === candidate.value
    ) {
      return false;
    }

    const storage = browserStorage();
    if (storage === null) {
      coordinator.invalidate(problem("storage_unavailable"));
      return false;
    }

    const checkedAt = new Date().toISOString();
    const result = commitFollowerSnapshot({
      storage,
      baseKey: storedAllFollowersKey,
      broadcasterId: candidate.value.broadcasterId,
      followers: candidate.value.followers,
      checkedAt,
    });
    if (!result.ok) {
      coordinator.invalidate(mapCommitProblem(result.error));
      return false;
    }

    const updatedSnapshot = { ...candidate.value, lastCheckedAt: checkedAt };
    committedSnapshotRef.current = updatedSnapshot;
    return coordinator.replaceCommittedValue(
      candidate.generation,
      updatedSnapshot
    );
  }, [coordinator]);

  const snapshot = refreshState.value;
  const commitCandidate = coordinator.getCommitCandidate();
  const canCommitBaseline =
    commitCandidate !== null &&
    committedSnapshotRef.current !== commitCandidate.value;

  return {
    nowAllFollowers: snapshot?.followers ?? null,
    newAllFollowers: snapshot?.newFollowers ?? null,
    oldAllFollowers: snapshot?.unfollowedFollowers ?? null,
    lastCheckedAt: snapshot?.lastCheckedAt ?? null,
    status: refreshState.status,
    error: refreshState.error,
    stale: refreshState.stale,
    isRefreshing:
      refreshState.status === "idle" || refreshState.status === "loading",
    retryAt: refreshState.error?.retryAt ?? null,
    canCommitBaseline,
    refresh,
    commitCurrentSnapshot,
  };
};
