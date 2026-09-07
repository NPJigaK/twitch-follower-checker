import assert from "node:assert/strict";
import test from "node:test";

import { RefreshCoordinator } from "../lib/refreshCoordinator.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("refresh is single-flight and publishes one successful generation", async () => {
  const result = deferred();
  let executions = 0;
  const coordinator = new RefreshCoordinator(
    async () => {
      executions += 1;
      return result.promise;
    },
    () => "unexpected"
  );

  coordinator.activate();
  const first = coordinator.refresh();
  const second = coordinator.refresh();

  assert.strictEqual(first, second);
  assert.equal(executions, 1);
  assert.equal(coordinator.getState().status, "loading");
  assert.equal(coordinator.getCommitCandidate(), null);

  result.resolve({ ok: true, value: "snapshot" });
  assert.equal(await first, true);
  assert.deepEqual(coordinator.getState(), {
    status: "success",
    generation: 1,
    value: "snapshot",
    error: null,
    stale: false,
  });
  assert.deepEqual(coordinator.getCommitCandidate(), {
    generation: 1,
    value: "snapshot",
  });

  assert.equal(
    coordinator.replaceCommittedValue(1, "snapshot-with-check-date"),
    true
  );
  assert.equal(coordinator.getState().value, "snapshot-with-check-date");
  assert.equal(coordinator.replaceCommittedValue(0, "stale"), false);
  assert.equal(coordinator.getState().value, "snapshot-with-check-date");
});

test("a loading listener receives the real in-flight promise on reentry", async () => {
  const result = deferred();
  const coordinator = new RefreshCoordinator(
    async () => result.promise,
    () => "unexpected"
  );
  let reentrantPromise;

  coordinator.activate();
  coordinator.subscribe((state) => {
    if (state.status === "loading") {
      reentrantPromise = coordinator.refresh();
    }
  });

  const originalPromise = coordinator.refresh();
  assert.strictEqual(reentrantPromise, originalPromise);

  let settled = false;
  void reentrantPromise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  result.resolve({ ok: true, value: "snapshot" });
  assert.equal(await originalPromise, true);
});

test("a failed refresh retains the last successful value and a retry recovers", async () => {
  const results = [
    { ok: true, value: "last-good" },
    { ok: false, error: "network" },
    { ok: true, value: "recovered" },
  ];
  const coordinator = new RefreshCoordinator(
    async () => results.shift(),
    () => "unexpected"
  );
  coordinator.activate();

  assert.equal(await coordinator.refresh(), true);
  assert.equal(await coordinator.refresh(), false);
  assert.deepEqual(coordinator.getState(), {
    status: "error",
    generation: 2,
    value: "last-good",
    error: "network",
    stale: true,
  });
  assert.equal(coordinator.getCommitCandidate(), null);

  assert.equal(await coordinator.refresh(), true);
  assert.deepEqual(coordinator.getState(), {
    status: "success",
    generation: 3,
    value: "recovered",
    error: null,
    stale: false,
  });
});

test("Strict Mode cleanup releases the lock and a late aborted result cannot overwrite replay", async () => {
  const requestA = deferred();
  const requestB = deferred();
  const requests = [requestA, requestB];
  const signals = [];
  const coordinator = new RefreshCoordinator(
    async (signal) => {
      signals.push(signal);
      return requests.shift().promise;
    },
    () => "unexpected"
  );

  coordinator.activate();
  const firstMount = coordinator.refresh();
  coordinator.deactivate();
  assert.equal(signals[0].aborted, true);

  coordinator.activate();
  const replay = coordinator.refresh();
  assert.notStrictEqual(firstMount, replay);

  requestB.resolve({ ok: true, value: "new" });
  assert.equal(await replay, true);
  assert.equal(coordinator.getState().value, "new");

  requestA.resolve({ ok: true, value: "old" });
  assert.equal(await firstMount, false);
  assert.equal(coordinator.getState().value, "new");
  assert.equal(coordinator.getState().status, "success");
});

test("an old finally cannot clear the newer single-flight lock", async () => {
  const requestA = deferred();
  const requestB = deferred();
  const requestC = deferred();
  const requests = [requestA, requestB, requestC];
  let executions = 0;
  const coordinator = new RefreshCoordinator(
    async () => {
      executions += 1;
      return requests.shift().promise;
    },
    () => "unexpected"
  );

  coordinator.activate();
  const first = coordinator.refresh();
  coordinator.deactivate();
  coordinator.activate();
  const second = coordinator.refresh();

  requestA.resolve({ ok: true, value: "old" });
  await first;

  const duplicateOfSecond = coordinator.refresh();
  assert.strictEqual(duplicateOfSecond, second);
  assert.equal(executions, 2);

  requestB.resolve({ ok: true, value: "new" });
  await second;

  const third = coordinator.refresh();
  assert.equal(executions, 3);
  requestC.resolve({ ok: true, value: "newest" });
  assert.equal(await third, true);
});

test("deactivation contains rejected requests without publishing or rejecting", async () => {
  const request = deferred();
  const states = [];
  const coordinator = new RefreshCoordinator(
    async () => request.promise,
    () => "unexpected"
  );
  coordinator.activate();
  coordinator.subscribe((state) => states.push(state));

  const refresh = coordinator.refresh();
  coordinator.deactivate();
  request.reject(new DOMException("Aborted", "AbortError"));

  await assert.doesNotReject(refresh);
  assert.equal(await refresh, false);
  assert.equal(states.length, 1);
  assert.equal(states[0].status, "loading");
});

test("valid empty values can be committed while loading/error/inactive values cannot", async () => {
  let result = { ok: true, value: [] };
  const coordinator = new RefreshCoordinator(
    async () => result,
    () => "unexpected"
  );
  coordinator.activate();

  assert.equal(await coordinator.refresh(), true);
  assert.deepEqual(coordinator.getCommitCandidate()?.value, []);

  result = { ok: false, error: "partial" };
  await coordinator.refresh();
  assert.equal(coordinator.getCommitCandidate(), null);

  coordinator.deactivate();
  assert.equal(coordinator.getCommitCandidate(), null);
});

test("unexpected executor throws never become unhandled refresh rejections", async () => {
  const coordinator = new RefreshCoordinator(
    async () => {
      throw new Error("unexpected");
    },
    () => "mapped unexpected error"
  );
  coordinator.activate();

  await assert.doesNotReject(() => coordinator.refresh());
  assert.equal(coordinator.getState().status, "error");
  assert.equal(coordinator.getState().error, "mapped unexpected error");
  assert.equal(coordinator.getCommitCandidate(), null);
});
