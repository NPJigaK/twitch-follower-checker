import assert from "node:assert/strict";
import test from "node:test";

import {
  commitFollowerSnapshot,
  diffFollowers,
  readStoredSnapshot,
  scopedSnapshotKey,
} from "../lib/followerSnapshot.ts";

const BASE_KEY = "previousFollowersKey";
const DATE_KEY = "lastCheckedDate";
const USER_ID = "channel-1";

const follower = (id, metadata = {}) => ({
  user_id: id,
  user_login: `${id}-login`,
  user_name: `${id}-name`,
  followed_at: "2026-01-01T00:00:00Z",
  ...metadata,
});

class MemoryStorage {
  values = new Map();
  failGet = new Set();
  failSet = new Set();
  failRemove = new Set();
  mutateBeforeSetFailure = new Set();

  constructor(initial = {}) {
    Object.entries(initial).forEach(([key, value]) =>
      this.values.set(key, value)
    );
  }

  getItem(key) {
    if (this.failGet.has(key)) {
      throw new DOMException("Unavailable", "SecurityError");
    }
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSet.has(key)) {
      this.failSet.delete(key);
      if (this.mutateBeforeSetFailure.has(key)) {
        this.mutateBeforeSetFailure.delete(key);
        this.values.set(key, value);
      }
      throw new DOMException("Full", "QuotaExceededError");
    }
    this.values.set(key, value);
  }

  removeItem(key) {
    if (this.failRemove.has(key)) {
      throw new DOMException("Unavailable", "SecurityError");
    }
    this.values.delete(key);
  }
}

const read = (storage, broadcasterId = USER_ID) =>
  readStoredSnapshot({
    storage,
    baseKey: BASE_KEY,
    legacyDateKey: DATE_KEY,
    broadcasterId,
  });

test("diff direction is current-baseline => new and baseline-current => unfollowed", () => {
  const current = [
    follower("same", { user_name: "new metadata" }),
    follower("new"),
    follower("new", { user_name: "duplicate" }),
  ];
  const baseline = [
    follower("same", { user_name: "old metadata" }),
    follower("gone"),
  ];
  const beforeCurrent = structuredClone(current);
  const beforeBaseline = structuredClone(baseline);

  const result = diffFollowers(current, baseline);

  assert.deepEqual(result.newFollowers, [current[1]]);
  assert.deepEqual(result.unfollowedFollowers, [baseline[1]]);
  assert.deepEqual(current, beforeCurrent);
  assert.deepEqual(baseline, beforeBaseline);
  assert.deepEqual(diffFollowers([], []), {
    newFollowers: [],
    unfollowedFollowers: [],
  });
});

test("missing remains distinct from a valid empty scoped snapshot", () => {
  const storage = new MemoryStorage({ [DATE_KEY]: "orphaned legacy date" });
  assert.deepEqual(read(storage), {
    ok: true,
    found: false,
    snapshot: null,
    checkedAt: null,
    source: "missing",
    identityVerified: false,
  });

  const committed = commitFollowerSnapshot({
    storage,
    baseKey: BASE_KEY,
    broadcasterId: USER_ID,
    followers: [],
    checkedAt: "2026-09-07T00:00:00Z",
  });
  assert.equal(committed.ok, true);
  const result = read(storage);
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.deepEqual(result.snapshot, []);
  assert.equal(result.identityVerified, true);
});

test("reads and deduplicates the legacy array without claiming identity", () => {
  const first = follower("legacy");
  const storage = new MemoryStorage({
    [BASE_KEY]: JSON.stringify([first, follower("legacy")]),
    [DATE_KEY]: "legacy date",
  });

  assert.deepEqual(read(storage), {
    ok: true,
    found: true,
    snapshot: [first],
    checkedAt: "legacy date",
    source: "legacy",
    identityVerified: false,
  });
});

test("a legacy baseline remains authoritative when its separate date is missing", () => {
  const legacyFollower = follower("legacy-without-date");
  const storage = new MemoryStorage({
    [BASE_KEY]: JSON.stringify([legacyFollower]),
  });

  assert.deepEqual(read(storage), {
    ok: true,
    found: true,
    snapshot: [legacyFollower],
    checkedAt: null,
    source: "legacy",
    identityVerified: false,
  });
});

test("a scoped envelope is authoritative and isolated by broadcaster", () => {
  const storage = new MemoryStorage({
    [BASE_KEY]: JSON.stringify([follower("legacy")]),
    [DATE_KEY]: "legacy date",
  });
  for (const broadcasterId of ["channel/A", "channel/B"]) {
    const result = commitFollowerSnapshot({
      storage,
      baseKey: BASE_KEY,
      broadcasterId,
      followers: [follower(broadcasterId)],
      checkedAt: `${broadcasterId}-date`,
    });
    assert.equal(result.ok, true);
  }

  assert.equal(read(storage, "channel/A").snapshot[0].user_id, "channel/A");
  assert.equal(read(storage, "channel/B").snapshot[0].user_id, "channel/B");
  assert.equal(storage.getItem(DATE_KEY), "legacy date");
});

test("malformed, invalid, and mismatched scoped data fail closed", () => {
  const scopedKey = scopedSnapshotKey(BASE_KEY, USER_ID);
  const cases = [
    ["not-json", "invalid_json"],
    [JSON.stringify({ version: 1, broadcasterId: USER_ID }), "invalid_schema"],
    [
      JSON.stringify({
        version: 1,
        broadcasterId: USER_ID,
        followers: [{ user_id: "only-an-id" }],
        checkedAt: "date",
      }),
      "invalid_schema",
    ],
    [
      JSON.stringify({
        version: 1,
        broadcasterId: "another-user",
        followers: [],
        checkedAt: "date",
      }),
      "account_mismatch",
    ],
  ];

  cases.forEach(([raw, error]) => {
    const storage = new MemoryStorage({ [scopedKey]: raw });
    assert.deepEqual(read(storage), { ok: false, error });
  });
});

test("storage read failures never turn into an empty baseline", () => {
  const storage = new MemoryStorage();
  storage.failGet.add(scopedSnapshotKey(BASE_KEY, USER_ID));
  assert.deepEqual(read(storage), {
    ok: false,
    error: "storage_unavailable",
  });
});

test("commit writes one account-scoped envelope and leaves legacy keys intact", () => {
  const storage = new MemoryStorage({
    [BASE_KEY]: JSON.stringify([follower("old")]),
    [DATE_KEY]: "old date",
  });
  const result = commitFollowerSnapshot({
    storage,
    baseKey: BASE_KEY,
    broadcasterId: USER_ID,
    followers: [follower("new"), follower("new")],
    checkedAt: "2026-09-07T00:00:00Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.storageKey, scopedSnapshotKey(BASE_KEY, USER_ID));
  assert.deepEqual(JSON.parse(storage.getItem(result.storageKey)), {
    version: 1,
    broadcasterId: USER_ID,
    followers: [follower("new")],
    checkedAt: "2026-09-07T00:00:00Z",
  });
  assert.equal(storage.getItem(DATE_KEY), "old date");
  assert.deepEqual(JSON.parse(storage.getItem(BASE_KEY)), [follower("old")]);
});

test("a quota failure rolls back a nonconforming partial write", () => {
  const storageKey = scopedSnapshotKey(BASE_KEY, USER_ID);
  const oldEnvelope = JSON.stringify({
    version: 1,
    broadcasterId: USER_ID,
    followers: [follower("old")],
    checkedAt: "old date",
  });
  const storage = new MemoryStorage({
    [storageKey]: oldEnvelope,
    [DATE_KEY]: "legacy date",
  });
  storage.failSet.add(storageKey);
  storage.mutateBeforeSetFailure.add(storageKey);

  const result = commitFollowerSnapshot({
    storage,
    baseKey: BASE_KEY,
    broadcasterId: USER_ID,
    followers: [follower("new")],
    checkedAt: "new date",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "storage_write_failed",
    rolledBack: true,
  });
  assert.equal(storage.getItem(storageKey), oldEnvelope);
  assert.equal(storage.getItem(DATE_KEY), "legacy date");
});

test("invalid and unserializable snapshots do not touch storage", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(
    commitFollowerSnapshot({
      storage,
      baseKey: BASE_KEY,
      broadcasterId: USER_ID,
      followers: [{ user_id: "incomplete" }],
      checkedAt: "date",
    }),
    { ok: false, error: "invalid_snapshot", rolledBack: true }
  );

  const cyclic = follower("cyclic");
  cyclic.self = cyclic;
  assert.deepEqual(
    commitFollowerSnapshot({
      storage,
      baseKey: BASE_KEY,
      broadcasterId: USER_ID,
      followers: [cyclic],
      checkedAt: "date",
    }),
    { ok: false, error: "serialization_failed", rolledBack: true }
  );
  assert.equal(storage.values.size, 0);
});
