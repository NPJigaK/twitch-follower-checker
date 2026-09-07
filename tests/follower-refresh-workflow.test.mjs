import assert from "node:assert/strict";
import test from "node:test";

import { runFollowerRefreshWorkflow } from "../lib/followerRefreshWorkflow.ts";

const follower = (id) => ({
  user_id: id,
  user_login: `${id}-login`,
  user_name: `${id}-name`,
  followed_at: "2026-01-01T00:00:00Z",
});

function dependencies(overrides = {}) {
  const writes = [];
  const defaults = {
    expectedBroadcasterId: "channel-1",
    getAuthenticatedUserId: async () => "channel-1",
    getAllFollowers: async () => [follower("a"), follower("c")],
    readBaseline: () => ({
      ok: true,
      baseline: {
        followers: [follower("a"), follower("b")],
        lastCheckedAt: "2025-12-31T00:00:00Z",
      },
    }),
    writeInitialBaseline: (broadcasterId, followers, checkedAt) => {
      writes.push({ broadcasterId, followers, checkedAt });
      return { ok: true };
    },
    diffFollowers: (current, baseline) => {
      const currentIds = new Set(current.map((item) => item.user_id));
      const baselineIds = new Set(baseline.map((item) => item.user_id));
      return {
        newFollowers: current.filter(
          (item) => !baselineIds.has(item.user_id)
        ),
        unfollowedFollowers: baseline.filter(
          (item) => !currentIds.has(item.user_id)
        ),
      };
    },
    now: () => "2026-01-02T00:00:00Z",
    mapError: (cause) =>
      cause && typeof cause === "object" && "code" in cause
        ? cause.code
        : "mapped-error",
    abortedError: () => "aborted",
  };

  return { value: { ...defaults, ...overrides }, writes };
}

test("returns a complete snapshot with the existing baseline difference", async () => {
  const setup = dependencies();
  const result = await runFollowerRefreshWorkflow(
    setup.value,
    new AbortController().signal
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.newFollowers.map((item) => item.user_id),
    ["c"]
  );
  assert.deepEqual(
    result.value.unfollowedFollowers.map((item) => item.user_id),
    ["b"]
  );
  assert.equal(result.value.lastCheckedAt, "2025-12-31T00:00:00Z");
  assert.equal(result.value.baselineInitialized, false);
  assert.equal(setup.writes.length, 0);
});

test("a baseline without a legacy check date is compared, never reset or bootstrapped", async () => {
  const setup = dependencies({
    getAllFollowers: async () => [follower("a")],
    readBaseline: () => ({
      ok: true,
      baseline: {
        followers: [follower("a"), follower("unfollowed")],
        lastCheckedAt: null,
      },
    }),
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    new AbortController().signal
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.baselineInitialized, false);
  assert.equal(result.value.lastCheckedAt, null);
  assert.deepEqual(
    result.value.unfollowedFollowers.map((item) => item.user_id),
    ["unfollowed"]
  );
  assert.equal(setup.writes.length, 0);
});

test("bootstraps a missing baseline only after the complete follower request", async () => {
  const events = [];
  const setup = dependencies({
    getAuthenticatedUserId: async () => {
      events.push("identity");
      return "channel-1";
    },
    getAllFollowers: async () => {
      events.push("followers-complete");
      return [];
    },
    readBaseline: () => {
      events.push("baseline-read");
      return { ok: true, baseline: null };
    },
    writeInitialBaseline: (broadcasterId, followers, checkedAt) => {
      events.push("baseline-write");
      setup.writes.push({ broadcasterId, followers, checkedAt });
      return { ok: true };
    },
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    new AbortController().signal
  );

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    "identity",
    "followers-complete",
    "baseline-read",
    "baseline-write",
  ]);
  assert.deepEqual(result.value.followers, []);
  assert.deepEqual(result.value.newFollowers, []);
  assert.deepEqual(result.value.unfollowedFollowers, []);
  assert.equal(result.value.lastCheckedAt, "2026-01-02T00:00:00Z");
  assert.equal(result.value.baselineInitialized, true);
  assert.equal(setup.writes.length, 1);
});

test("a partial follower failure never reads or writes the baseline", async () => {
  let reads = 0;
  const setup = dependencies({
    getAllFollowers: async () => {
      throw { code: "partial-page" };
    },
    readBaseline: () => {
      reads += 1;
      return { ok: true, baseline: null };
    },
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    new AbortController().signal
  );

  assert.deepEqual(result, { ok: false, error: "partial-page" });
  assert.equal(reads, 0);
  assert.equal(setup.writes.length, 0);
});

test("a diff failure cannot commit an initial baseline", async () => {
  const setup = dependencies({
    readBaseline: () => ({ ok: true, baseline: null }),
    diffFollowers: () => {
      throw new Error("diff failed");
    },
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    new AbortController().signal
  );

  assert.deepEqual(result, { ok: false, error: "mapped-error" });
  assert.equal(setup.writes.length, 0);
});

test("abort after follower resolution prevents all storage access", async () => {
  const controller = new AbortController();
  let reads = 0;
  const setup = dependencies({
    getAllFollowers: async () => {
      controller.abort();
      return [follower("a")];
    },
    readBaseline: () => {
      reads += 1;
      return { ok: true, baseline: null };
    },
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    controller.signal
  );

  assert.deepEqual(result, { ok: false, error: "aborted" });
  assert.equal(reads, 0);
  assert.equal(setup.writes.length, 0);
});

test("identity mismatch fails closed before fetching followers or storage", async () => {
  let followerCalls = 0;
  let reads = 0;
  const setup = dependencies({
    getAuthenticatedUserId: async () => "different-channel",
    getAllFollowers: async () => {
      followerCalls += 1;
      return [];
    },
    readBaseline: () => {
      reads += 1;
      return { ok: true, baseline: null };
    },
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    new AbortController().signal
  );

  assert.deepEqual(result, { ok: false, error: "mapped-error" });
  assert.equal(followerCalls, 0);
  assert.equal(reads, 0);
  assert.equal(setup.writes.length, 0);
});

test("storage read and bootstrap write failures fail closed", async (t) => {
  await t.test("read failure", async () => {
    const setup = dependencies({
      readBaseline: () => ({ ok: false, error: "storage-read" }),
    });
    const result = await runFollowerRefreshWorkflow(
      setup.value,
      new AbortController().signal
    );

    assert.deepEqual(result, { ok: false, error: "storage-read" });
    assert.equal(setup.writes.length, 0);
  });

  await t.test("write failure", async () => {
    const setup = dependencies({
      readBaseline: () => ({ ok: true, baseline: null }),
      writeInitialBaseline: () => ({
        ok: false,
        error: "storage-write",
      }),
    });
    const result = await runFollowerRefreshWorkflow(
      setup.value,
      new AbortController().signal
    );

    assert.deepEqual(result, { ok: false, error: "storage-write" });
    assert.equal(setup.writes.length, 0);
  });
});

test("already-aborted refresh does not start any request or storage operation", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const setup = dependencies({
    getAuthenticatedUserId: async () => {
      calls += 1;
      return "channel-1";
    },
    getAllFollowers: async () => {
      calls += 1;
      return [];
    },
    readBaseline: () => {
      calls += 1;
      return { ok: true, baseline: null };
    },
  });

  const result = await runFollowerRefreshWorkflow(
    setup.value,
    controller.signal
  );

  assert.deepEqual(result, { ok: false, error: "aborted" });
  assert.equal(calls, 0);
  assert.equal(setup.writes.length, 0);
});
