import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRefreshTelemetryPayload,
  REFRESH_TELEMETRY_CODES,
  REFRESH_TELEMETRY_COMPATIBILITY,
  REFRESH_TELEMETRY_EVENT,
  REFRESH_TELEMETRY_PAGE_BUCKETS,
  REFRESH_TELEMETRY_REASONS,
  REFRESH_TELEMETRY_SCHEMA,
  REFRESH_TELEMETRY_STAGES,
  REFRESH_TELEMETRY_STATUS_CLASSES,
  reportRefreshTelemetry,
} from "../lib/refreshTelemetry.ts";
import { TWITCH_DIAGNOSTIC_REASONS } from "../lib/twitchApi.ts";

const payloadKeys = [
  "app_version",
  "code",
  "compatibility",
  "diagnostic_schema",
  "event",
  "outcome",
  "page_bucket",
  "reason",
  "stage",
  "status_class",
].sort();

const assertFixedShape = (payload) => {
  assert.deepEqual(Object.keys(payload).sort(), payloadKeys);
  assert.equal(payload.event, REFRESH_TELEMETRY_EVENT);
  assert.equal(payload.diagnostic_schema, REFRESH_TELEMETRY_SCHEMA);
  assert.ok(REFRESH_TELEMETRY_CODES.includes(payload.code));
  assert.ok(REFRESH_TELEMETRY_STAGES.includes(payload.stage));
  assert.ok(REFRESH_TELEMETRY_REASONS.includes(payload.reason));
  assert.ok(REFRESH_TELEMETRY_PAGE_BUCKETS.includes(payload.page_bucket));
  assert.ok(REFRESH_TELEMETRY_STATUS_CLASSES.includes(payload.status_class));
  assert.ok(REFRESH_TELEMETRY_COMPATIBILITY.includes(payload.compatibility));
};

test("builds a success event with only fixed, privacy-safe fields", () => {
  const syntheticPii = {
    outcome: "success",
    code: undefined,
    stage: "complete",
    reason: undefined,
    page: 1,
    status: 200,
    ignoredUserMetadata: false,
    accessToken: "secret-token-do-not-emit",
    userId: "private-user-id-do-not-emit",
    userName: "private-name-do-not-emit",
    url: "https://api.example.test/private?cursor=secret",
    cursor: "opaque-cursor-do-not-emit",
    body: { display_name: "private" },
    rawMessage: "private response body",
  };

  const payload = buildRefreshTelemetryPayload(syntheticPii);

  assertFixedShape(payload);
  assert.deepEqual(payload, {
    event: "follower_refresh_result",
    diagnostic_schema: 1,
    app_version: "2.2.0",
    outcome: "success",
    code: "none",
    stage: "complete",
    reason: "none",
    page_bucket: "1",
    status_class: "2xx",
    compatibility: "none",
  });
  const serialized = JSON.stringify(payload);
  for (const secret of [
    "secret-token-do-not-emit",
    "private-user-id-do-not-emit",
    "private-name-do-not-emit",
    "opaque-cursor-do-not-emit",
    "private response body",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("builds a failure event with the stable code, reason, stage, and compatibility flag", () => {
  const payload = buildRefreshTelemetryPayload({
    outcome: "failure",
    code: "invalid_response",
    stage: "users",
    reason: "schema",
    page: 7,
    status: 503,
    ignoredUserMetadata: true,
  });

  assertFixedShape(payload);
  assert.equal(payload.outcome, "failure");
  assert.equal(payload.code, "invalid_response");
  assert.equal(payload.stage, "users");
  assert.equal(payload.reason, "schema");
  assert.equal(payload.page_bucket, "4_10");
  assert.equal(payload.status_class, "5xx");
  assert.equal(payload.compatibility, "ignored_user_metadata");
});

test("coarsely buckets every supported page range", () => {
  const cases = [
    [undefined, "none"],
    [null, "none"],
    [0, "none"],
    [-1, "none"],
    [1, "1"],
    [2, "2_3"],
    [3, "2_3"],
    [4, "4_10"],
    [10, "4_10"],
    [11, "11_plus"],
    [1000, "11_plus"],
    [1.5, "none"],
    ["11", "none"],
    [Number.NaN, "none"],
  ];

  for (const [page, expected] of cases) {
    assert.equal(
      buildRefreshTelemetryPayload({ outcome: "success", page }).page_bucket,
      expected,
      `page ${String(page)}`
    );
  }
});

test("coarsely buckets HTTP status classes and never emits raw status", () => {
  const cases = [
    [undefined, "none"],
    [0, "none"],
    [199, "none"],
    [200, "2xx"],
    [299, "2xx"],
    [300, "3xx"],
    [399, "3xx"],
    [400, "4xx"],
    [499, "4xx"],
    [500, "5xx"],
    [599, "5xx"],
    [600, "none"],
    ["503", "none"],
    [503.5, "none"],
  ];

  for (const [status, expected] of cases) {
    assert.equal(
      buildRefreshTelemetryPayload({ outcome: "failure", status }).status_class,
      expected,
      `status ${String(status)}`
    );
  }
});

test("unknown runtime values collapse to safe allowlist fallbacks", () => {
  const payload = buildRefreshTelemetryPayload({
    outcome: "not-an-outcome",
    code: "https://private.example/secret",
    stage: "private-stage",
    reason: "private raw error with token",
    page: Infinity,
    status: 700,
    ignoredUserMetadata: "true",
  });

  assertFixedShape(payload);
  assert.equal(payload.outcome, "failure");
  assert.equal(payload.code, "unknown");
  assert.equal(payload.stage, "unknown");
  assert.equal(payload.reason, "unknown");
  assert.equal(payload.page_bucket, "none");
  assert.equal(payload.status_class, "none");
  assert.equal(payload.compatibility, "none");
});

test("keeps every Twitch response-boundary reason in the telemetry allowlist", () => {
  for (const reason of TWITCH_DIAGNOSTIC_REASONS) {
    assert.equal(
      buildRefreshTelemetryPayload({
        outcome: "failure",
        code: "invalid_response",
        stage: "users",
        reason,
      }).reason,
      reason
    );
  }
});

test("a throwing input getter cannot escape the payload builder", () => {
  const input = new Proxy(
    {},
    {
      get() {
        throw new Error("private getter details");
      },
    }
  );

  assert.doesNotThrow(() => buildRefreshTelemetryPayload(input));
  assert.equal(buildRefreshTelemetryPayload(input).outcome, "failure");
});

test("an injected sink receives the sanitized payload and reports enqueue success", () => {
  const received = [];
  const accepted = reportRefreshTelemetry(
    {
      outcome: "success",
      stage: "complete",
      page: 11,
      status: 204,
    },
    (payload) => received.push(payload)
  );

  assert.equal(accepted, true);
  assert.equal(received.length, 1);
  assertFixedShape(received[0]);
  assert.equal(received[0].page_bucket, "11_plus");
  assert.equal(received[0].status_class, "2xx");
});

test("sink failures are contained and return false", () => {
  assert.doesNotThrow(() => {
    assert.equal(
      reportRefreshTelemetry({ outcome: "failure" }, () => {
        throw new Error("observer failed");
      }),
      false
    );
  });
});

test("the default dataLayer sink initializes an early queue and preserves it for the tag loader", () => {
  const previousWindow = globalThis.window;

  try {
    globalThis.window = {};
    assert.equal(
      reportRefreshTelemetry({ outcome: "success", stage: "complete" }),
      true
    );
    const earlyQueue = globalThis.window.dataLayer;
    assert.ok(Array.isArray(earlyQueue));
    assert.equal(earlyQueue.length, 1);
    assertFixedShape(earlyQueue[0]);

    // A later GTM/tag-loader initialization uses the same queue and must not
    // lose an event emitted before its script was available.
    earlyQueue.push({ event: "gtm.js", "gtm.start": 123 });
    assert.strictEqual(globalThis.window.dataLayer, earlyQueue);
    assert.equal(earlyQueue.length, 2);
    assertFixedShape(earlyQueue[0]);
  } finally {
    delete globalThis.window;
    if (previousWindow !== undefined) {
      globalThis.window = previousWindow;
    }
  }
});

test("the default dataLayer sink is best effort for missing, frozen, and throwing observers", () => {
  const previousWindow = globalThis.window;

  try {
    delete globalThis.window;
    assert.equal(
      reportRefreshTelemetry({ outcome: "success", stage: "complete" }),
      false
    );

    const frozenQueue = Object.freeze([]);
    globalThis.window = { dataLayer: frozenQueue };
    assert.doesNotThrow(() => {
      assert.equal(
        reportRefreshTelemetry({ outcome: "success", stage: "complete" }),
        false
      );
    });
    assert.strictEqual(globalThis.window.dataLayer, frozenQueue);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      get() {
        throw new Error("observer getter failed");
      },
    });
    assert.doesNotThrow(() => {
      assert.equal(
        reportRefreshTelemetry({ outcome: "success", stage: "complete" }),
        false
      );
    });
  } finally {
    delete globalThis.window;
    if (previousWindow !== undefined) {
      globalThis.window = previousWindow;
    }
  }
});

test("a GTM-compatible observer may annotate the mutable event object", () => {
  let observed;
  let keysBeforeObserver;
  const accepted = reportRefreshTelemetry(
    { outcome: "success", stage: "complete" },
    (payload) => {
      keysBeforeObserver = Object.keys(payload).sort();
      payload.gtm = { uniqueEventId: 42 };
      observed = payload;
    }
  );

  assert.equal(accepted, true);
  assert.deepEqual(keysBeforeObserver, payloadKeys);
  const { gtm, ...core } = observed;
  assertFixedShape(core);
  assert.deepEqual(observed.gtm, { uniqueEventId: 42 });
});
