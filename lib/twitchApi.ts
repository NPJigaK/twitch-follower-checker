/**
 * Small, dependency-free client for the Twitch endpoints used by the app.
 *
 * The React layer deliberately does not use the raw `fetch` responses.  A
 * follower list is only useful as a snapshot when the complete request chain
 * succeeded and the response shape is authoritative.  This module therefore
 * validates every response and exposes a stable, sanitized error taxonomy for
 * the UI/lifecycle layer.
 */

export const TWITCH_API_BASE_URL = "https://api.twitch.tv/helix";
export const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
export const REQUIRED_FOLLOWER_SCOPE = "moderator:read:followers";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface Follower {
  user_id: string;
  user_login: string;
  user_name: string;
  followed_at: string;
}

export interface ValidatedToken {
  client_id: string;
  scopes: string[];
  expires_in: number;
  user_id: string;
}

export interface AuthenticatedUser {
  id: string;
  login?: string;
  display_name?: string;
}

export type TwitchRequestErrorCode =
  | "auth_invalid"
  | "permission_denied"
  | "bad_request"
  | "rate_limited"
  | "server_error"
  | "network"
  | "timeout"
  | "aborted"
  | "invalid_json"
  | "invalid_response"
  | "follower_details_unavailable"
  | "pagination_loop";

export interface TwitchRequestErrorOptions {
  status?: number;
  /** Unix timestamp in seconds from Twitch's `Ratelimit-Reset` header. */
  rateLimitReset?: number;
}

/**
 * Errors intentionally contain no response body, token, or request URL.  The
 * message is safe to display to a user and the code is stable for UI logic.
 */
export class TwitchRequestError extends Error {
  readonly code: TwitchRequestErrorCode;
  readonly status?: number;
  readonly rateLimitReset?: number;

  constructor(
    code: TwitchRequestErrorCode,
    message: string,
    options: TwitchRequestErrorOptions = {}
  ) {
    super(message);
    this.name = "TwitchRequestError";
    this.code = code;
    this.status = options.status;
    this.rateLimitReset = options.rateLimitReset;
    Object.setPrototypeOf(this, TwitchRequestError.prototype);
  }
}

interface ResponseHeaders {
  get(name: string): string | null;
}

interface TwitchResponse {
  status: number;
  headers: ResponseHeaders;
  text(): Promise<string>;
}

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<TwitchResponse>;

export interface TwitchRequestOptions {
  /** Injected in tests; the browser's global `fetch` is used by default. */
  fetchImpl?: FetchImplementation;
  /** A caller-owned signal shared by every page in one refresh. */
  signal?: AbortSignal;
  /** Timeout for each HTTP request, including response-body consumption. */
  timeoutMs?: number;
}

const ERROR_MESSAGES: Record<TwitchRequestErrorCode, string> = {
  auth_invalid: "Twitch authentication is invalid or expired.",
  permission_denied:
    "The Twitch access token is not authorized for follower access.",
  bad_request: "Twitch rejected the request.",
  rate_limited: "Twitch rate limit reached.",
  server_error: "Twitch is temporarily unavailable.",
  network: "Unable to reach Twitch.",
  timeout: "The Twitch request timed out.",
  aborted: "The Twitch request was cancelled.",
  invalid_json: "Twitch returned invalid JSON.",
  invalid_response: "Twitch returned an invalid response.",
  follower_details_unavailable:
    "Twitch did not return follower details.",
  pagination_loop: "Twitch returned an invalid pagination cursor.",
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isResponseLike = (value: unknown): value is TwitchResponse => {
  if (
    !isRecord(value) ||
    typeof value.status !== "number" ||
    typeof value.text !== "function" ||
    !isRecord(value.headers) ||
    typeof value.headers.get !== "function"
  ) {
    return false;
  }
  return true;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const createError = (
  code: TwitchRequestErrorCode,
  options: TwitchRequestErrorOptions = {}
): TwitchRequestError =>
  new TwitchRequestError(code, ERROR_MESSAGES[code], options);

const createTimeoutError = (): TwitchRequestError => createError("timeout");

const createAbortedError = (): TwitchRequestError => createError("aborted");

const getFetchImplementation = (
  fetchImpl?: FetchImplementation
): FetchImplementation => {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch === "function") {
    return fetch.bind(globalThis) as FetchImplementation;
  }

  // This is a configuration/runtime failure, but expose it through the same
  // sanitized network category rather than leaking an implementation error.
  return async () => {
    throw createError("network");
  };
};

interface RequestSignal {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
}

/**
 * Make a request-local signal while retaining the caller's cancellation.  A
 * new controller per page prevents one page's timer from mutating another
 * page, while the caller signal still cancels the whole refresh.
 */
const createRequestSignal = (
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): RequestSignal => {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const abortFromParent = (): void => {
    controller.abort();
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
};

const isAbortLike = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return value instanceof Error && value.name === "AbortError";
  }

  return value.name === "AbortError" || value.code === "ABORT_ERR";
};

const classifyTransportError = (
  value: unknown,
  requestSignal: RequestSignal,
  parentSignal: AbortSignal | undefined
): TwitchRequestError => {
  if (requestSignal.didTimeout()) {
    return createTimeoutError();
  }
  if (parentSignal?.aborted || requestSignal.signal.aborted) {
    return createAbortedError();
  }
  if (value instanceof TwitchRequestError) {
    return value;
  }
  // An AbortError from an injected/alternate fetch implementation is only
  // considered cancellation when a caller actually cancelled this request.
  if (isAbortLike(value) && parentSignal?.aborted) {
    return createAbortedError();
  }
  return createError("network");
};

const parseRateLimitReset = (headers: ResponseHeaders): number | undefined => {
  const raw = headers.get("Ratelimit-Reset");
  if (raw === null || raw.trim() === "") {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

const statusError = (
  status: number,
  headers: ResponseHeaders
): TwitchRequestError => {
  if (status === 401) {
    return createError("auth_invalid", { status });
  }
  if (status === 403) {
    return createError("permission_denied", { status });
  }
  if (status === 429) {
    return createError("rate_limited", {
      status,
      rateLimitReset: parseRateLimitReset(headers),
    });
  }
  if (status >= 500 && status <= 599) {
    return createError("server_error", { status });
  }
  if (status >= 400 && status <= 499) {
    return createError("bad_request", { status });
  }
  return createError("invalid_response", { status });
};

const raceWithRequestCancellation = async <T>(
  operation: PromiseLike<T>,
  requestSignal: RequestSignal,
  parentSignal: AbortSignal | undefined
): Promise<T> => {
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<T>((_, reject) => {
    onAbort = () => {
      reject(
        requestSignal.didTimeout()
          ? createTimeoutError()
          : parentSignal?.aborted
            ? createAbortedError()
            : createAbortedError()
      );
    };
    if (requestSignal.signal.aborted) {
      onAbort();
      return;
    }
    requestSignal.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    // Promise.race attaches rejection handlers to both inputs, so a custom
    // fetch/body implementation that finishes after cancellation cannot
    // create an unhandled rejection.
    return await Promise.race([operation, abortPromise]);
  } finally {
    if (onAbort) {
      requestSignal.signal.removeEventListener("abort", onAbort);
    }
  }
};

const readBodyWithCancellation = async (
  response: TwitchResponse,
  requestSignal: RequestSignal,
  parentSignal: AbortSignal | undefined
): Promise<string> =>
  raceWithRequestCancellation(
    // Resolve on a microtask so a non-conforming response.text implementation
    // that throws synchronously is handled by the normal transport path.
    Promise.resolve().then(() => response.text()),
    requestSignal,
    parentSignal
  );

const requestJsonOnce = async (
  url: URL,
  token: string,
  clientId: string | undefined,
  options: TwitchRequestOptions
): Promise<Record<string, unknown>> => {
  const timeoutMs =
    options.timeoutMs === undefined
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : 0;
  const requestSignal = createRequestSignal(options.signal, timeoutMs);
  const fetchImpl = getFetchImplementation(options.fetchImpl);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (clientId !== undefined) {
    headers["Client-ID"] = clientId;
  }

  try {
    if (requestSignal.signal.aborted) {
      throw requestSignal.didTimeout()
        ? createTimeoutError()
        : createAbortedError();
    }

    let responseValue: unknown;
    try {
      responseValue = await raceWithRequestCancellation(
        fetchImpl(url, {
          method: "GET",
          headers,
          signal: requestSignal.signal,
        }),
        requestSignal,
        options.signal
      );
    } catch (error) {
      throw classifyTransportError(error, requestSignal, options.signal);
    }

    if (!isResponseLike(responseValue)) {
      throw createError("invalid_response");
    }
    const response = responseValue;

    if (requestSignal.signal.aborted) {
      throw requestSignal.didTimeout()
        ? createTimeoutError()
        : createAbortedError();
    }

    if (response.status !== 200) {
      throw statusError(response.status, response.headers);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !/\bapplication\/json\b/i.test(contentType)) {
      throw createError("invalid_response");
    }

    let text: string;
    try {
      text = await readBodyWithCancellation(
        response,
        requestSignal,
        options.signal
      );
    } catch (error) {
      if (error instanceof TwitchRequestError) {
        throw error;
      }
      throw classifyTransportError(error, requestSignal, options.signal);
    }

    if (requestSignal.signal.aborted) {
      throw requestSignal.didTimeout()
        ? createTimeoutError()
        : createAbortedError();
    }
    if (typeof text !== "string" || text.trim() === "") {
      throw createError("invalid_json");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw createError("invalid_json");
    }
    if (!isRecord(parsed)) {
      throw createError("invalid_response");
    }
    return parsed;
  } finally {
    requestSignal.cleanup();
  }
};

/** Twitch recommends retrying one 503 response; all other failures surface. */
const requestJson = async (
  url: URL,
  token: string,
  clientId: string | undefined,
  options: TwitchRequestOptions
): Promise<Record<string, unknown>> => {
  try {
    return await requestJsonOnce(url, token, clientId, options);
  } catch (cause) {
    if (
      cause instanceof TwitchRequestError &&
      cause.code === "server_error" &&
      cause.status === 503 &&
      !options.signal?.aborted
    ) {
      return requestJsonOnce(url, token, clientId, options);
    }
    throw cause;
  }
};

const requireToken = (token: string): void => {
  if (!isNonEmptyString(token)) {
    throw createError("auth_invalid");
  }
};

const requireClientId = (clientId: string): void => {
  if (!isNonEmptyString(clientId)) {
    throw createError("invalid_response");
  }
};

const requireId = (value: unknown): string => {
  if (!isNonEmptyString(value)) {
    throw createError("invalid_response");
  }
  return value;
};

/** Validate a user access token without exposing the raw response. */
export const validateAccessToken = async (
  token: string,
  expectedClientId?: string,
  options: TwitchRequestOptions = {}
): Promise<ValidatedToken> => {
  requireToken(token);
  const response = await requestJson(
    new URL(TWITCH_VALIDATE_URL),
    token,
    undefined,
    options
  );

  const tokenClientId = requireId(response.client_id);
  if (expectedClientId !== undefined && tokenClientId !== expectedClientId) {
    // The token may be valid in isolation, but it cannot authorize this
    // application. Treat it as unusable authentication so the UI offers a
    // fresh Twitch authorization instead of an endless retry loop.
    throw createError("auth_invalid");
  }

  if (
    !Array.isArray(response.scopes) ||
    response.scopes.some((scope) => !isNonEmptyString(scope))
  ) {
    throw createError("invalid_response");
  }
  if (!response.scopes.includes(REQUIRED_FOLLOWER_SCOPE)) {
    throw createError("permission_denied");
  }

  const userId = requireId(response.user_id);
  if (!isPositiveInteger(response.expires_in)) {
    throw createError("invalid_response");
  }

  return {
    client_id: tokenClientId,
    scopes: [...response.scopes],
    expires_in: response.expires_in,
    user_id: userId,
  };
};

/** Resolve and validate the Twitch user represented by the access token. */
export const getAuthenticatedUser = async (
  token: string,
  clientId: string,
  expectedUserId?: string,
  options: TwitchRequestOptions = {}
): Promise<AuthenticatedUser> => {
  requireToken(token);
  requireClientId(clientId);

  const response = await requestJson(
    new URL(`${TWITCH_API_BASE_URL}/users`),
    token,
    clientId,
    options
  );
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw createError("invalid_response");
  }
  const rawUser = response.data[0];
  if (!isRecord(rawUser)) {
    throw createError("invalid_response");
  }

  const id = requireId(rawUser.id);
  if (expectedUserId !== undefined && id !== expectedUserId) {
    throw createError("permission_denied");
  }

  const user: AuthenticatedUser = { id };
  if (rawUser.login !== undefined) {
    user.login = requireId(rawUser.login);
  }
  if (rawUser.display_name !== undefined) {
    user.display_name = requireId(rawUser.display_name);
  }
  return user;
};

interface ParsedFollowerPage {
  followers: Follower[];
  nextCursor?: string;
  total: number;
}

const parseFollower = (value: unknown): Follower => {
  if (!isRecord(value)) {
    throw createError("invalid_response");
  }
  return {
    user_id: requireId(value.user_id),
    user_login: requireId(value.user_login),
    user_name: requireId(value.user_name),
    followed_at: requireId(value.followed_at),
  };
};

const parseFollowerPage = (
  response: Record<string, unknown>
): ParsedFollowerPage => {
  if (!isNonNegativeInteger(response.total)) {
    throw createError("invalid_response");
  }
  if (!Array.isArray(response.data)) {
    // A successful response with only `total` is not an empty follower list;
    // treating it as [] would corrupt the baseline.
    throw createError("follower_details_unavailable");
  }
  if (!hasOwn(response, "pagination") || !isRecord(response.pagination)) {
    throw createError("invalid_response");
  }

  const followers = response.data.map(parseFollower);
  const pagination = response.pagination;
  let nextCursor: string | undefined;
  if (hasOwn(pagination, "cursor")) {
    if (!isNonEmptyString(pagination.cursor)) {
      throw createError("invalid_response");
    }
    nextCursor = pagination.cursor;
  }

  const uniquePageFollowerCount = new Set(
    followers.map((follower) => follower.user_id)
  ).size;
  if (response.total < uniquePageFollowerCount) {
    throw createError("invalid_response");
  }

  return { followers, nextCursor, total: response.total };
};

const makeFollowersUrl = (
  broadcasterId: string,
  cursor: string | undefined
): URL => {
  const url = new URL(`${TWITCH_API_BASE_URL}/channels/followers`);
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("first", "100");
  if (cursor !== undefined) {
    // URLSearchParams is intentional: Twitch cursors are opaque and must not
    // be interpolated into a query string by hand.
    url.searchParams.set("after", cursor);
  }
  return url;
};

/**
 * Enumerate follower rows through Twitch's terminal cursor. Twitch documents
 * list cursors as dynamic: pages can be empty or contain duplicates, and this
 * endpoint's `total` can change during pagination. Consequently, `total` is a
 * diagnostic value rather than a point-in-time completeness checksum.
 *
 * Any transport, schema, or cursor error still rejects the whole operation so
 * callers can retain their previous valid baseline. A traversal that reports
 * a positive total but never exposes even one follower detail also rejects;
 * accepting that ambiguous response as [] could erase a valid baseline when
 * Twitch has returned count-only data because follower details are unavailable.
 */
export const fetchAllFollowers = async (
  token: string,
  clientId: string,
  broadcasterId: string,
  options: TwitchRequestOptions = {}
): Promise<Follower[]> => {
  requireToken(token);
  requireClientId(clientId);
  requireClientId(broadcasterId);

  const allFollowers: Follower[] = [];
  const seenUserIds = new Set<string>();
  const visitedCursors = new Set<string>();
  let maximumReportedTotal = 0;
  let cursor: string | undefined;

  while (true) {
    const isFirstPage = cursor === undefined;
    if (cursor !== undefined) {
      if (visitedCursors.has(cursor)) {
        throw createError("pagination_loop");
      }
      visitedCursors.add(cursor);
    }

    const response = await requestJson(
      makeFollowersUrl(broadcasterId, cursor),
      token,
      clientId,
      options
    );
    const page = parseFollowerPage(response);
    maximumReportedTotal = Math.max(maximumReportedTotal, page.total);

    // Twitch documents count-only responses when follower details are not
    // authorized. An empty first page with a positive total is indistinguishable
    // from that response and must never be accepted as an empty baseline.
    if (isFirstPage && page.followers.length === 0 && page.total > 0) {
      throw createError("follower_details_unavailable");
    }

    for (const follower of page.followers) {
      // Dynamic Twitch lists can repeat a row across cursor pages.  Keep one
      // canonical row per opaque user_id; metadata changes are not identity
      // changes and are intentionally not represented as duplicate rows.
      if (!seenUserIds.has(follower.user_id)) {
        seenUserIds.add(follower.user_id);
        allFollowers.push(follower);
      }
    }

    if (page.nextCursor === undefined) {
      if (allFollowers.length === 0 && maximumReportedTotal > 0) {
        throw createError("follower_details_unavailable");
      }
      return allFollowers;
    }
    cursor = page.nextCursor;
  }
};
