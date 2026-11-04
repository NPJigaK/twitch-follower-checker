/**
 * Privacy-safe diagnostics for one completed follower refresh.
 *
 * This module deliberately accepts untrusted runtime values and constructs a
 * new, fixed-shape payload.  It never forwards a caller-owned object, request
 * detail, identifier, URL, cursor, token, response body, or free-form error
 * message.
 *
 * The default sink only enqueues this event in `window.dataLayer`.  GTM must
 * separately configure a custom-event trigger/tag for `follower_refresh_result`;
 * an enqueue is not proof that a tag ran or that an analytics backend ingested it.
 */

export const REFRESH_TELEMETRY_EVENT = "follower_refresh_result" as const;
export const REFRESH_TELEMETRY_SCHEMA = 1 as const;
export const REFRESH_TELEMETRY_APP_VERSION = "2.2.0" as const;

export const REFRESH_TELEMETRY_OUTCOMES = ["success", "failure"] as const;
export type RefreshTelemetryOutcome =
  (typeof REFRESH_TELEMETRY_OUTCOMES)[number];

/**
 * `validate` is included because token validation is a distinct request
 * boundary even though most refreshes begin at `users`.
 */
export const REFRESH_TELEMETRY_STAGES = [
  "validate",
  "users",
  "followers",
  "baseline_read",
  "baseline_write",
  "comparison",
  "complete",
  "unknown",
] as const;
export type RefreshTelemetryStage = (typeof REFRESH_TELEMETRY_STAGES)[number];

/**
 * This is intentionally an explicit allowlist.  New diagnostic reasons must
 * be reviewed and added here rather than allowing arbitrary runtime strings.
 * The names cover the public Twitch response-boundary diagnostic union plus
 * the two local fallback values. Storage and request categories belong in the
 * separate `code` field.
 */
export const REFRESH_TELEMETRY_REASONS = [
  "none",
  "unknown",
  // Twitch response-boundary reasons. Keep these in lockstep with the public
  // diagnostic union in twitchApi.ts; error/storage categories belong in the
  // separate `code` field, and unknown values collapse to `unknown` below.
  "response_shape",
  "content_type",
  "empty_body",
  "malformed_json",
  "json_shape",
  "schema",
  "user_collection",
  "user_record",
  "user_id",
  "follower_record",
  "follower_user_id",
  "follower_user_login",
  "follower_user_name",
  "follower_followed_at",
  "total",
  "page_total",
  "pagination_missing",
  "pagination",
  "cursor",
] as const;
export type RefreshTelemetryReason =
  (typeof REFRESH_TELEMETRY_REASONS)[number];

/**
 * Error codes are kept separate from `reason`: code is the stable user-facing
 * problem taxonomy, while reason can describe the response boundary that led
 * to it.  `none` is used for a successful refresh and `unknown` is the safe
 * fallback for an unrecognised failure code.
 */
export const REFRESH_TELEMETRY_CODES = [
  "none",
  "unknown",
  "auth_invalid",
  "permission_denied",
  "bad_request",
  "rate_limited",
  "server_error",
  "network",
  "timeout",
  "aborted",
  "invalid_json",
  "invalid_response",
  "follower_details_unavailable",
  "pagination_loop",
  "storage_unavailable",
  "stored_snapshot_invalid",
  "storage_write_failed",
  "storage_rollback_failed",
  "unexpected",
] as const;
export type RefreshTelemetryCode = (typeof REFRESH_TELEMETRY_CODES)[number];

export const REFRESH_TELEMETRY_PAGE_BUCKETS = [
  "none",
  "1",
  "2_3",
  "4_10",
  "11_plus",
] as const;
export type RefreshTelemetryPageBucket =
  (typeof REFRESH_TELEMETRY_PAGE_BUCKETS)[number];

export const REFRESH_TELEMETRY_STATUS_CLASSES = [
  "none",
  "2xx",
  "3xx",
  "4xx",
  "5xx",
] as const;
export type RefreshTelemetryStatusClass =
  (typeof REFRESH_TELEMETRY_STATUS_CLASSES)[number];

export const REFRESH_TELEMETRY_COMPATIBILITY = [
  "none",
  "ignored_user_metadata",
] as const;
export type RefreshTelemetryCompatibility =
  (typeof REFRESH_TELEMETRY_COMPATIBILITY)[number];

/** Runtime values are unknown on purpose: this boundary must sanitize them. */
export interface RefreshTelemetryInput {
  outcome?: unknown;
  code?: unknown;
  stage?: unknown;
  reason?: unknown;
  /** Internal page number; only a coarse bucket is emitted. */
  page?: unknown;
  /** Internal HTTP status; only the broad class is emitted. */
  status?: unknown;
  /** True only when optional Twitch user metadata was intentionally ignored. */
  ignoredUserMetadata?: unknown;
}

export interface RefreshTelemetryPayload {
  readonly event: typeof REFRESH_TELEMETRY_EVENT;
  readonly diagnostic_schema: typeof REFRESH_TELEMETRY_SCHEMA;
  readonly app_version: typeof REFRESH_TELEMETRY_APP_VERSION;
  readonly outcome: RefreshTelemetryOutcome;
  readonly code: RefreshTelemetryCode;
  readonly stage: RefreshTelemetryStage;
  readonly reason: RefreshTelemetryReason;
  readonly page_bucket: RefreshTelemetryPageBucket;
  readonly status_class: RefreshTelemetryStatusClass;
  readonly compatibility: RefreshTelemetryCompatibility;
}

export type RefreshTelemetrySink = (payload: RefreshTelemetryPayload) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  (typeof value === "object" && value !== null) || typeof value === "function";

/** Read a hostile/proxied input without letting a getter escape this boundary. */
const readInput = (input: unknown, key: keyof RefreshTelemetryInput): unknown => {
  if (!isRecord(input)) {
    return undefined;
  }
  try {
    return input[key];
  } catch {
    return undefined;
  }
};

const isAllowedString = (
  value: unknown,
  allowed: readonly string[]
): value is string => typeof value === "string" && allowed.includes(value);

const normalizeOutcome = (value: unknown): RefreshTelemetryOutcome =>
  value === "success" ? "success" : "failure";

const normalizeCode = (
  value: unknown,
  outcome: RefreshTelemetryOutcome
): RefreshTelemetryCode => {
  if (isAllowedString(value, REFRESH_TELEMETRY_CODES)) {
    return value as RefreshTelemetryCode;
  }
  return outcome === "success" ? "none" : "unknown";
};

const normalizeStage = (value: unknown): RefreshTelemetryStage =>
  isAllowedString(value, REFRESH_TELEMETRY_STAGES)
    ? (value as RefreshTelemetryStage)
    : "unknown";

const normalizeReason = (
  value: unknown,
  outcome: RefreshTelemetryOutcome
): RefreshTelemetryReason => {
  if (isAllowedString(value, REFRESH_TELEMETRY_REASONS)) {
    return value as RefreshTelemetryReason;
  }
  return outcome === "success" ? "none" : "unknown";
};

const normalizePageBucket = (value: unknown): RefreshTelemetryPageBucket => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return "none";
  }
  if (value === 1) {
    return "1";
  }
  if (value <= 3) {
    return "2_3";
  }
  if (value <= 10) {
    return "4_10";
  }
  return "11_plus";
};

const normalizeStatusClass = (value: unknown): RefreshTelemetryStatusClass => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return "none";
  }
  if (value >= 200 && value <= 299) {
    return "2xx";
  }
  if (value >= 300 && value <= 399) {
    return "3xx";
  }
  if (value >= 400 && value <= 499) {
    return "4xx";
  }
  if (value >= 500 && value <= 599) {
    return "5xx";
  }
  return "none";
};

const normalizeCompatibility = (
  value: unknown
): RefreshTelemetryCompatibility =>
  value === true ? "ignored_user_metadata" : "none";

/** Build the fixed-shape payload without performing I/O. */
export const buildRefreshTelemetryPayload = (
  input: RefreshTelemetryInput | null | undefined
): RefreshTelemetryPayload => {
  const outcome = normalizeOutcome(readInput(input, "outcome"));

  // Do not spread `input`: every output property below is selected from a
  // reviewed allowlist or a coarse bucket.
  // Keep the runtime object mutable. GTM may annotate dataLayer messages with
  // fields such as `gtm.uniqueEventId`; the fixed construction above still
  // prevents caller input from adding any diagnostic fields.
  return {
    event: REFRESH_TELEMETRY_EVENT,
    diagnostic_schema: REFRESH_TELEMETRY_SCHEMA,
    app_version: REFRESH_TELEMETRY_APP_VERSION,
    outcome,
    code: normalizeCode(readInput(input, "code"), outcome),
    stage: normalizeStage(readInput(input, "stage")),
    reason: normalizeReason(readInput(input, "reason"), outcome),
    page_bucket: normalizePageBucket(readInput(input, "page")),
    status_class: normalizeStatusClass(readInput(input, "status")),
    compatibility: normalizeCompatibility(
      readInput(input, "ignoredUserMetadata")
    ),
  };
};

interface DataLayerQueue {
  push?: (payload: RefreshTelemetryPayload) => unknown;
}

interface DataLayerWindow {
  dataLayer?: DataLayerQueue;
}

const enqueueInDataLayer = (payload: RefreshTelemetryPayload): boolean => {
  try {
    if (typeof window === "undefined") {
      return false;
    }
    const currentWindow = window as unknown as DataLayerWindow;
    let dataLayer = currentWindow.dataLayer;
    if (dataLayer === undefined) {
      // Preserve the browser/GTM contract: an early event is queued in the
      // same array the tag loader will consume later. Only an actually absent
      // queue is initialized; malformed or frozen existing queues are never
      // overwritten.
      const queue: RefreshTelemetryPayload[] = [];
      currentWindow.dataLayer = queue;
      dataLayer = queue;
    }
    if (typeof dataLayer.push !== "function") {
      return false;
    }
    dataLayer.push(payload);
    return true;
  } catch {
    // A missing, frozen, proxied, or otherwise broken observer must not affect
    // the refresh result.  `false` means only that enqueueing was not confirmed.
    return false;
  }
};

/**
 * Enqueue a sanitized terminal refresh event.  The return value reports only
 * whether the injected/default sink accepted the call without throwing; it
 * does not claim that GTM or an analytics backend ingested the event.
 */
export const reportRefreshTelemetry = (
  input: RefreshTelemetryInput | null | undefined,
  sink?: RefreshTelemetrySink
): boolean => {
  const payload = buildRefreshTelemetryPayload(input);
  if (sink !== undefined) {
    if (typeof sink !== "function") {
      return false;
    }
    try {
      sink(payload);
      return true;
    } catch {
      return false;
    }
  }
  return enqueueInDataLayer(payload);
};
