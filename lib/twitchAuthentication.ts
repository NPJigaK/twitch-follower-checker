import { useCallback, useEffect, useRef, useState } from "react";
import { accessTokenKey, clientId } from "./constants";
import {
  TwitchRequestError,
  validateAccessToken,
} from "./twitchApi";

export type TwitchAuthenticationReason =
  | "missing_token"
  | "invalid_token"
  | "missing_scope"
  | "oauth_denied";

export type TwitchAuthenticationErrorCode =
  | "storage_unavailable"
  | "network"
  | "timeout"
  | "server_error"
  | "rate_limited"
  | "invalid_response";

export type TwitchAuthenticationState =
  | Readonly<{ status: "checking" }>
  | Readonly<{
      status: "authenticated";
      credentials: {
        accessToken: string;
        userId: string;
        scopes: string[];
      };
    }>
  | Readonly<{
      status: "unauthenticated";
      reason: TwitchAuthenticationReason;
    }>
  | Readonly<{
      status: "error";
      code: TwitchAuthenticationErrorCode;
      retryAt: number | null;
    }>;

export const AUTHENTICATION_MESSAGES: Record<
  Exclude<TwitchAuthenticationReason, "missing_token"> |
    TwitchAuthenticationErrorCode,
  string
> = {
  invalid_token:
    "Your Twitch session is no longer valid. Please authenticate with Twitch again.",
  missing_scope:
    "This app needs permission to read your followers. Please authenticate with Twitch again.",
  oauth_denied:
    "Twitch authentication was cancelled. Try again when you are ready.",
  storage_unavailable:
    "Browser storage is unavailable. Enable site storage and try again.",
  network:
    "Twitch authentication could not be checked. Check your connection and try again.",
  timeout: "The Twitch authentication check timed out. Please try again.",
  server_error: "Twitch is temporarily unavailable. Please try again later.",
  rate_limited:
    "Twitch temporarily rate-limited this check. Please retry after the cooldown.",
  invalid_response:
    "Twitch returned an unexpected authentication response. Please try again later.",
};

type ActiveAuthentication = {
  generation: number;
  controller: AbortController;
};

type TokenResolution =
  | { ok: true; token: string }
  | { ok: true; token: null; oauthDenied: boolean }
  | { ok: false };

const getStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const removeOAuthFragment = (): void => {
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  try {
    window.history.replaceState(null, document.title, cleanUrl);
  } catch {
    // Assignment is only a fallback for browsers that reject replaceState.
    // Neither path exposes the fragment or token in an error message.
    window.location.hash = "";
  }
};

const mapAuthenticationError = (
  error: TwitchRequestError
): Extract<TwitchAuthenticationState, { status: "error" }> => {
  let code: TwitchAuthenticationErrorCode;
  switch (error.code) {
    case "network":
      code = "network";
      break;
    case "timeout":
      code = "timeout";
      break;
    case "server_error":
      code = "server_error";
      break;
    case "rate_limited":
      code = "rate_limited";
      break;
    default:
      code = "invalid_response";
  }

  const retryAt =
    error.code === "rate_limited"
      ? error.rateLimitReset !== undefined
        ? error.rateLimitReset * 1000
        : Date.now() + 60_000
      : null;

  return { status: "error", code, retryAt };
};

export type AuthenticationInvalidationReason =
  | "invalid_token"
  | "missing_scope";

export function useTwitchAuthentication() {
  const [state, setState] = useState<TwitchAuthenticationState>({
    status: "checking",
  });
  const [attempt, setAttempt] = useState(0);
  const [, setRetryTimerRevision] = useState(0);
  const stateRef = useRef(state);
  const generationRef = useRef(0);
  const activeRef = useRef<ActiveAuthentication | null>(null);
  // undefined means the OAuth fragment has not been inspected. A captured
  // token remains in memory across Strict Mode's effect cleanup/replay.
  const hashTokenRef = useRef<string | null | undefined>(undefined);
  const oauthDeniedRef = useRef(false);

  const publish = useCallback((nextState: TwitchAuthenticationState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const active = { generation, controller };
    activeRef.current?.controller.abort();
    activeRef.current = active;
    publish({ status: "checking" });

    const isCurrent = () =>
      activeRef.current === active &&
      generationRef.current === generation &&
      !controller.signal.aborted;

    const resolveAccessToken = (): TokenResolution => {
      // Consume the OAuth result before touching Web Storage. A browser policy
      // may make localStorage throw, but that must not leave an access token in
      // the visible URL/history for the lifetime of the error screen.
      if (hashTokenRef.current === undefined) {
        const hash = window.location.hash;
        const params = new URLSearchParams(
          hash.startsWith("#") ? hash.substring(1) : hash
        );
        const hashToken = params.get("access_token");
        const containsOAuthResult =
          hashToken !== null || params.has("error") || params.has("error_description");

        hashTokenRef.current =
          hashToken !== null && hashToken.trim().length > 0 ? hashToken : null;
        oauthDeniedRef.current = params.has("error");
        if (containsOAuthResult) {
          removeOAuthFragment();
        }
      }

      const storage = getStorage();
      if (storage === null) {
        return { ok: false };
      }

      if (oauthDeniedRef.current) {
        return { ok: true, token: null, oauthDenied: true };
      }

      const hashToken = hashTokenRef.current;
      try {
        if (hashToken) {
          storage.setItem(accessTokenKey, hashToken);
          return { ok: true, token: hashToken };
        }
        return {
          ok: true,
          token: storage.getItem(accessTokenKey),
          oauthDenied: false,
        };
      } catch {
        return { ok: false };
      }
    };

    const removeTokenIfUnchanged = (capturedToken: string): void => {
      const storage = getStorage();
      if (storage === null) {
        return;
      }
      try {
        if (storage.getItem(accessTokenKey) === capturedToken) {
          storage.removeItem(accessTokenKey);
        }
      } catch {
        // The in-memory authentication state still fails closed even when a
        // browser policy prevents cleanup of the persistent token.
      }
    };

    const run = async (): Promise<void> => {
      let capturedToken: string | null = null;
      try {
        const tokenResult = resolveAccessToken();
        if (!isCurrent()) {
          return;
        }
        if (!tokenResult.ok) {
          publish({
            status: "error",
            code: "storage_unavailable",
            retryAt: null,
          });
          return;
        }
        if (tokenResult.token === null) {
          publish({
            status: "unauthenticated",
            reason: tokenResult.oauthDenied ? "oauth_denied" : "missing_token",
          });
          return;
        }

        capturedToken = tokenResult.token;
        const validated = await validateAccessToken(capturedToken, clientId, {
          signal: controller.signal,
        });
        if (!isCurrent()) {
          return;
        }
        publish({
          status: "authenticated",
          credentials: {
            accessToken: capturedToken,
            userId: validated.user_id,
            scopes: validated.scopes,
          },
        });
      } catch (cause) {
        if (!isCurrent()) {
          return;
        }
        if (cause instanceof TwitchRequestError) {
          if (cause.code === "aborted") {
            return;
          }
          if (cause.code === "auth_invalid") {
            if (capturedToken) {
              removeTokenIfUnchanged(capturedToken);
            }
            publish({ status: "unauthenticated", reason: "invalid_token" });
            return;
          }
          if (cause.code === "permission_denied") {
            if (capturedToken) {
              removeTokenIfUnchanged(capturedToken);
            }
            publish({ status: "unauthenticated", reason: "missing_scope" });
            return;
          }
          publish(mapAuthenticationError(cause));
          return;
        }
        publish({
          status: "error",
          code: "invalid_response",
          retryAt: null,
        });
      } finally {
        if (activeRef.current === active) {
          activeRef.current = null;
        }
      }
    };

    void run();

    return () => {
      if (activeRef.current === active) {
        activeRef.current = null;
      }
      controller.abort();
    };
  }, [attempt, publish]);

  useEffect(() => {
    if (
      state.status !== "error" ||
      state.retryAt === null ||
      state.retryAt <= Date.now()
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => setRetryTimerRevision((revision) => revision + 1),
      Math.min(state.retryAt - Date.now(), 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  const retry = useCallback(() => {
    if (activeRef.current !== null) {
      return;
    }
    const current = stateRef.current;
    if (
      current.status === "error" &&
      current.retryAt !== null &&
      current.retryAt > Date.now()
    ) {
      return;
    }
    setAttempt((value) => value + 1);
  }, []);

  const invalidate = useCallback(
    (reason: AuthenticationInvalidationReason) => {
      generationRef.current += 1;
      activeRef.current?.controller.abort();
      activeRef.current = null;

      const current = stateRef.current;
      const capturedToken =
        current.status === "authenticated"
          ? current.credentials.accessToken
          : null;
      const storage = getStorage();
      if (capturedToken !== null && storage !== null) {
        try {
          if (storage.getItem(accessTokenKey) === capturedToken) {
            storage.removeItem(accessTokenKey);
          }
        } catch {
          // State invalidation remains authoritative for this mounted app.
        }
      }
      publish({ status: "unauthenticated", reason });
    },
    [publish]
  );

  const canRetry =
    state.status === "error" &&
    (state.retryAt === null || state.retryAt <= Date.now());

  return { state, retry, invalidate, canRetry };
}
