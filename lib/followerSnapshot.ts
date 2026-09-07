export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredFollower {
  readonly user_id: string;
  readonly user_login: string;
  readonly user_name: string;
  readonly followed_at: string;
}

export const FOLLOWER_SNAPSHOT_VERSION = 1 as const;

export interface FollowerSnapshotEnvelope<
  T extends StoredFollower = StoredFollower,
> {
  readonly version: typeof FOLLOWER_SNAPSHOT_VERSION;
  readonly broadcasterId: string;
  readonly followers: T[];
  /** The check time belonging to this exact follower baseline. */
  readonly checkedAt: string;
}

export type SnapshotReadError =
  | "invalid_argument"
  | "storage_unavailable"
  | "invalid_json"
  | "invalid_schema"
  | "account_mismatch";

export type SnapshotReadResult<T extends StoredFollower = StoredFollower> =
  | Readonly<{
      ok: true;
      found: false;
      snapshot: null;
      checkedAt: null;
      source: "missing";
      identityVerified: false;
    }>
  | Readonly<{
      ok: true;
      found: true;
      snapshot: T[];
      checkedAt: string | null;
      source: "scoped" | "legacy";
      identityVerified: boolean;
    }>
  | Readonly<{ ok: false; error: SnapshotReadError }>;

export type SnapshotCommitError =
  | "invalid_argument"
  | "invalid_snapshot"
  | "serialization_failed"
  | "storage_unavailable"
  | "storage_write_failed"
  | "rollback_failed";

export type SnapshotCommitResult<T extends StoredFollower = StoredFollower> =
  | Readonly<{
      ok: true;
      storageKey: string;
      envelope: FollowerSnapshotEnvelope<T>;
    }>
  | Readonly<{
      ok: false;
      error: SnapshotCommitError;
      rolledBack: boolean;
    }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isStorage = (value: unknown): value is SnapshotStorage => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.getItem === "function" &&
    typeof value.setItem === "function" &&
    typeof value.removeItem === "function"
  );
};

const isFollower = (value: unknown): value is StoredFollower =>
  isRecord(value) &&
  isNonEmptyString(value.user_id) &&
  isNonEmptyString(value.user_login) &&
  isNonEmptyString(value.user_name) &&
  isNonEmptyString(value.followed_at);

export function dedupeFollowers<T extends StoredFollower>(
  followers: readonly T[]
): T[] {
  if (!Array.isArray(followers) || followers.some((item) => !isFollower(item))) {
    throw new TypeError("Invalid follower snapshot");
  }

  const seen = new Set<string>();
  const unique: T[] = [];
  followers.forEach((follower) => {
    if (!seen.has(follower.user_id)) {
      seen.add(follower.user_id);
      unique.push(follower);
    }
  });
  return unique;
}

export function diffFollowers<T extends StoredFollower>(
  current: readonly T[],
  baseline: readonly T[]
): Readonly<{ newFollowers: T[]; unfollowedFollowers: T[] }> {
  const currentUnique = dedupeFollowers(current);
  const baselineUnique = dedupeFollowers(baseline);
  const currentIds = new Set(currentUnique.map(({ user_id }) => user_id));
  const baselineIds = new Set(baselineUnique.map(({ user_id }) => user_id));

  return {
    // These directions are the existing product semantics and are covered by
    // characterization tests: current - baseline is newly followed.
    newFollowers: currentUnique.filter(
      ({ user_id }) => !baselineIds.has(user_id)
    ),
    unfollowedFollowers: baselineUnique.filter(
      ({ user_id }) => !currentIds.has(user_id)
    ),
  };
}

export function scopedSnapshotKey(
  baseKey: string,
  broadcasterId: string
): string {
  if (!isNonEmptyString(baseKey) || !isNonEmptyString(broadcasterId)) {
    throw new TypeError("Snapshot key and broadcaster ID are required");
  }
  return `${baseKey}:v1:${encodeURIComponent(broadcasterId)}`;
}

const readValue = (
  storage: SnapshotStorage,
  key: string
): { ok: true; value: string | null } | { ok: false } => {
  try {
    const value = storage.getItem(key);
    return typeof value === "string" || value === null
      ? { ok: true, value }
      : { ok: false };
  } catch {
    return { ok: false };
  }
};

const parseJson = (
  raw: string
): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

const parseFollowers = <T extends StoredFollower>(
  value: unknown
): { ok: true; value: T[] } | { ok: false } => {
  if (!Array.isArray(value)) {
    return { ok: false };
  }
  try {
    return { ok: true, value: dedupeFollowers(value as T[]) };
  } catch {
    return { ok: false };
  }
};

const parseEnvelope = <T extends StoredFollower>(
  value: unknown,
  broadcasterId: string
):
  | { ok: true; envelope: FollowerSnapshotEnvelope<T> }
  | { ok: false; error: "invalid_schema" | "account_mismatch" } => {
  if (
    !isRecord(value) ||
    value.version !== FOLLOWER_SNAPSHOT_VERSION ||
    !isNonEmptyString(value.broadcasterId) ||
    !isNonEmptyString(value.checkedAt)
  ) {
    return { ok: false, error: "invalid_schema" };
  }
  if (value.broadcasterId !== broadcasterId) {
    return { ok: false, error: "account_mismatch" };
  }
  const followers = parseFollowers<T>(value.followers);
  if (!followers.ok) {
    return { ok: false, error: "invalid_schema" };
  }
  return {
    ok: true,
    envelope: {
      version: FOLLOWER_SNAPSHOT_VERSION,
      broadcasterId,
      followers: followers.value,
      checkedAt: value.checkedAt,
    },
  };
};

export function readStoredSnapshot<T extends StoredFollower>({
  storage,
  baseKey,
  legacyDateKey,
  broadcasterId,
}: {
  storage: SnapshotStorage | null | undefined;
  baseKey: string;
  legacyDateKey: string;
  broadcasterId: string;
}): SnapshotReadResult<T> {
  if (
    !isStorage(storage) ||
    !isNonEmptyString(baseKey) ||
    !isNonEmptyString(legacyDateKey) ||
    !isNonEmptyString(broadcasterId) ||
    baseKey === legacyDateKey
  ) {
    return { ok: false, error: "invalid_argument" };
  }

  const scopedKey = scopedSnapshotKey(baseKey, broadcasterId);
  const scoped = readValue(storage, scopedKey);
  if (!scoped.ok) {
    return { ok: false, error: "storage_unavailable" };
  }
  if (scoped.value !== null) {
    const parsed = parseJson(scoped.value);
    if (!parsed.ok) {
      return { ok: false, error: "invalid_json" };
    }
    const envelope = parseEnvelope<T>(parsed.value, broadcasterId);
    if (!envelope.ok) {
      return envelope;
    }
    return {
      ok: true,
      found: true,
      snapshot: envelope.envelope.followers,
      checkedAt: envelope.envelope.checkedAt,
      source: "scoped",
      identityVerified: true,
    };
  }

  const legacy = readValue(storage, baseKey);
  if (!legacy.ok) {
    return { ok: false, error: "storage_unavailable" };
  }
  if (legacy.value === null) {
    // A date without a legacy array is not a baseline. A later complete API
    // result may safely bootstrap the new single-record format.
    return {
      ok: true,
      found: false,
      snapshot: null,
      checkedAt: null,
      source: "missing",
      identityVerified: false,
    };
  }

  const parsedLegacy = parseJson(legacy.value);
  if (!parsedLegacy.ok) {
    return { ok: false, error: "invalid_json" };
  }
  const legacyFollowers = parseFollowers<T>(parsedLegacy.value);
  if (!legacyFollowers.ok) {
    return { ok: false, error: "invalid_schema" };
  }
  const legacyDate = readValue(storage, legacyDateKey);
  if (!legacyDate.ok) {
    return { ok: false, error: "storage_unavailable" };
  }
  return {
    ok: true,
    found: true,
    snapshot: legacyFollowers.value,
    checkedAt:
      legacyDate.value !== null && legacyDate.value.trim().length > 0
        ? legacyDate.value
        : null,
    source: "legacy",
    identityVerified: false,
  };
}

export function commitFollowerSnapshot<T extends StoredFollower>({
  storage,
  baseKey,
  broadcasterId,
  followers,
  checkedAt,
}: {
  storage: SnapshotStorage | null | undefined;
  baseKey: string;
  broadcasterId: string;
  followers: readonly T[];
  checkedAt: string;
}): SnapshotCommitResult<T> {
  if (
    !isStorage(storage) ||
    !isNonEmptyString(baseKey) ||
    !isNonEmptyString(broadcasterId) ||
    !isNonEmptyString(checkedAt)
  ) {
    return { ok: false, error: "invalid_argument", rolledBack: true };
  }

  let uniqueFollowers: T[];
  try {
    uniqueFollowers = dedupeFollowers(followers);
  } catch {
    return { ok: false, error: "invalid_snapshot", rolledBack: true };
  }

  const storageKey = scopedSnapshotKey(baseKey, broadcasterId);
  const previous = readValue(storage, storageKey);
  if (!previous.ok) {
    return { ok: false, error: "storage_unavailable", rolledBack: true };
  }
  const envelope: FollowerSnapshotEnvelope<T> = {
    version: FOLLOWER_SNAPSHOT_VERSION,
    broadcasterId,
    followers: uniqueFollowers,
    checkedAt,
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    return { ok: false, error: "serialization_failed", rolledBack: true };
  }

  try {
    storage.setItem(storageKey, serialized);
    return { ok: true, storageKey, envelope };
  } catch {
    // Web Storage specifies setItem as atomic on failure. The rollback also
    // protects against nonconforming shims that mutate before throwing.
    try {
      if (previous.value === null) {
        storage.removeItem(storageKey);
      } else {
        storage.setItem(storageKey, previous.value);
      }
      return {
        ok: false,
        error: "storage_write_failed",
        rolledBack: true,
      };
    } catch {
      return { ok: false, error: "rollback_failed", rolledBack: false };
    }
  }
}
