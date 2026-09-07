export interface WorkflowFollower {
  user_id: string;
  user_login: string;
  user_name: string;
  followed_at: string;
}

export type WorkflowBaseline = Readonly<{
  followers: WorkflowFollower[];
  lastCheckedAt: string | null;
}>;

export type WorkflowReadResult<E> =
  | Readonly<{ ok: true; baseline: WorkflowBaseline | null }>
  | Readonly<{ ok: false; error: E }>;

export type WorkflowWriteResult<E> =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; error: E }>;

export type WorkflowDiff = Readonly<{
  newFollowers: WorkflowFollower[];
  unfollowedFollowers: WorkflowFollower[];
}>;

export type CompleteFollowerSnapshot = Readonly<{
  broadcasterId: string;
  capturedAt: string;
  baselineInitialized: boolean;
  followers: WorkflowFollower[];
  newFollowers: WorkflowFollower[];
  unfollowedFollowers: WorkflowFollower[];
  lastCheckedAt: string | null;
}>;

export type FollowerRefreshWorkflowResult<E> =
  | Readonly<{ ok: true; value: CompleteFollowerSnapshot }>
  | Readonly<{ ok: false; error: E }>;

export interface FollowerRefreshWorkflowDependencies<E> {
  expectedBroadcasterId: string;
  getAuthenticatedUserId(signal: AbortSignal): Promise<string>;
  getAllFollowers(
    broadcasterId: string,
    signal: AbortSignal
  ): Promise<WorkflowFollower[]>;
  readBaseline(broadcasterId: string): WorkflowReadResult<E>;
  writeInitialBaseline(
    broadcasterId: string,
    followers: WorkflowFollower[],
    checkedAt: string
  ): WorkflowWriteResult<E>;
  diffFollowers(
    current: WorkflowFollower[],
    baseline: WorkflowFollower[]
  ): WorkflowDiff;
  now(): string;
  mapError(cause: unknown): E;
  abortedError(): E;
}

/**
 * Runs one complete refresh as a transaction boundary.
 *
 * No baseline write is attempted until identity resolution and every follower
 * page have completed. Cancellation is checked after each asynchronous step
 * and immediately before the only possible bootstrap write.
 */
export async function runFollowerRefreshWorkflow<E>(
  dependencies: FollowerRefreshWorkflowDependencies<E>,
  signal: AbortSignal
): Promise<FollowerRefreshWorkflowResult<E>> {
  const failIfAborted = (): FollowerRefreshWorkflowResult<E> | null =>
    signal.aborted
      ? { ok: false, error: dependencies.abortedError() }
      : null;

  try {
    const beforeStart = failIfAborted();
    if (beforeStart) {
      return beforeStart;
    }

    const broadcasterId = await dependencies.getAuthenticatedUserId(signal);
    const afterIdentity = failIfAborted();
    if (afterIdentity) {
      return afterIdentity;
    }
    if (broadcasterId !== dependencies.expectedBroadcasterId) {
      return {
        ok: false,
        error: dependencies.mapError(
          new Error("Authenticated Twitch subject changed during refresh.")
        ),
      };
    }

    const followers = await dependencies.getAllFollowers(
      broadcasterId,
      signal
    );
    const afterFollowers = failIfAborted();
    if (afterFollowers) {
      return afterFollowers;
    }

    const baselineResult = dependencies.readBaseline(broadcasterId);
    if (!baselineResult.ok) {
      return baselineResult;
    }

    const capturedAt = dependencies.now();
    let baseline = baselineResult.baseline;
    const baselineInitialized = baseline === null;
    if (baseline === null) {
      baseline = {
        followers,
        lastCheckedAt: capturedAt,
      };
    }

    const diff = dependencies.diffFollowers(followers, baseline.followers);
    const completedResult: FollowerRefreshWorkflowResult<E> = {
      ok: true,
      value: {
        broadcasterId,
        capturedAt,
        baselineInitialized,
        followers,
        newFollowers: diff.newFollowers,
        unfollowedFollowers: diff.unfollowedFollowers,
        lastCheckedAt: baseline.lastCheckedAt,
      },
    };

    if (baselineInitialized) {
      // Finish every validation and calculation before the one durable write.
      // A diff or result-construction failure must never turn a failed refresh
      // into a silently committed baseline.
      const beforeBootstrap = failIfAborted();
      if (beforeBootstrap) {
        return beforeBootstrap;
      }

      const writeResult = dependencies.writeInitialBaseline(
        broadcasterId,
        followers,
        capturedAt
      );
      if (!writeResult.ok) {
        return writeResult;
      }
    }

    return completedResult;
  } catch (cause) {
    return {
      ok: false,
      error: dependencies.mapError(cause),
    };
  }
}
