import assert from "node:assert/strict";
import test from "node:test";

const {
  REQUIRED_FOLLOWER_SCOPE,
  TwitchRequestError,
  fetchAllFollowers,
  getAuthenticatedUser,
  validateAccessToken,
} = await import("../lib/twitchApi.ts");

const jsonResponse = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });

const textResponse = (body, status = 200, extraHeaders = {}) =>
  new Response(body, {
    status,
    headers: extraHeaders,
  });

const follower = (id, overrides = {}) => ({
  user_id: id,
  user_login: `${id}-login`,
  user_name: `${id}-name`,
  followed_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const tokenBody = (overrides = {}) => ({
  client_id: "client-123",
  scopes: [REQUIRED_FOLLOWER_SCOPE],
  expires_in: 3599,
  user_id: "user-123",
  ...overrides,
});

const userBody = (overrides = {}) => ({
  data: [
    {
      id: "user-123",
      login: "channel-owner",
      display_name: "Channel Owner",
      ...overrides,
    },
  ],
});

const queuedFetch = (...responses) => {
  const calls = [];
  let index = 0;
  const fetchImpl = async (input, init) => {
    calls.push({ url: new URL(input), init });
    const next = responses[index++];
    if (next === undefined) {
      throw new Error("unexpected fetch call");
    }
    if (typeof next === "function") {
      return next(input, init);
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { calls, fetchImpl };
};

const assertTwitchError = async (promise, code, extra = {}) => {
  await assert.rejects(
    promise,
    (error) => {
      assert.ok(error instanceof TwitchRequestError);
      assert.equal(error.code, code);
      for (const [key, value] of Object.entries(extra)) {
        assert.equal(error[key], value);
      }
      return true;
    }
  );
};

test("validateAccessToken accepts a valid user token even inside the one-hour window", async () => {
  const { calls, fetchImpl } = queuedFetch(jsonResponse(tokenBody()));

  const validated = await validateAccessToken("secret-token", "client-123", {
    fetchImpl,
  });

  assert.deepEqual(validated, tokenBody());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, "https://id.twitch.tv/oauth2/validate");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
});

test("validateAccessToken rejects missing scope, wrong client, and malformed schema", async (t) => {
  await t.test("missing required scope is permission denied", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse(tokenBody({ scopes: ["user:read:email"] }))
    );
    await assertTwitchError(
      validateAccessToken("token", "client-123", { fetchImpl }),
      "permission_denied"
    );
  });

  await t.test("client mismatch requires fresh authentication", async () => {
    const { fetchImpl } = queuedFetch(jsonResponse(tokenBody()));
    await assertTwitchError(
      validateAccessToken("token", "another-client", { fetchImpl }),
      "auth_invalid"
    );
  });

  await t.test("missing subject and non-positive expiry are invalid", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse(tokenBody({ user_id: "" }))
    );
    await assertTwitchError(
      validateAccessToken("token", "client-123", { fetchImpl }),
      "invalid_response"
    );

    const second = queuedFetch(jsonResponse(tokenBody({ expires_in: 0 })));
    await assertTwitchError(
      validateAccessToken("token", "client-123", { fetchImpl: second.fetchImpl }),
      "invalid_response"
    );
  });
});

test("HTTP status failures map to sanitized taxonomy and preserve rate-limit reset", async (t) => {
  const statuses = [
    [400, "bad_request"],
    [401, "auth_invalid"],
    [403, "permission_denied"],
    [500, "server_error"],
    [503, "server_error"],
  ];

  for (const [status, code] of statuses) {
    await t.test(`${status} -> ${code}`, async () => {
      const responses = [
        textResponse("token or response body must never appear", status),
      ];
      if (status === 503) {
        responses.push(
          textResponse("second 503 body must never appear", status)
        );
      }
      const { fetchImpl } = queuedFetch(...responses);
      await assertTwitchError(
        validateAccessToken("very-secret-token", undefined, { fetchImpl }),
        code
      );
    });
  }

  await t.test("429 exposes Unix Ratelimit-Reset without exposing body", async () => {
    const { fetchImpl } = queuedFetch(
      textResponse("sensitive upstream details", 429, {
        "Ratelimit-Reset": "1735689600",
      })
    );
    await assert.rejects(
      validateAccessToken("very-secret-token", undefined, { fetchImpl }),
      (error) => {
        assert.ok(error instanceof TwitchRequestError);
        assert.equal(error.code, "rate_limited");
        assert.equal(error.status, 429);
        assert.equal(error.rateLimitReset, 1735689600);
        assert.ok(!error.message.includes("sensitive"));
        assert.ok(!error.message.includes("very-secret"));
        return true;
      }
    );
  });
});

test("users and followers apply the same fail-closed HTTP status taxonomy", async (t) => {
  const endpoints = [
    [
      "users",
      (fetchImpl) =>
        getAuthenticatedUser("secret-token", "client-123", "user-123", {
          fetchImpl,
        }),
    ],
    [
      "followers",
      (fetchImpl) =>
        fetchAllFollowers(
          "secret-token",
          "client-123",
          "user-123",
          { fetchImpl }
        ),
    ],
  ];
  const statuses = [
    [400, "bad_request"],
    [401, "auth_invalid"],
    [403, "permission_denied"],
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
  ];

  for (const [endpoint, invoke] of endpoints) {
    for (const [status, code] of statuses) {
      await t.test(`${endpoint}: ${status} -> ${code}`, async () => {
        const makeResponse = () =>
          textResponse("sensitive upstream response", status, {
            "Ratelimit-Reset": "1735689600",
          });
        const responses = [makeResponse()];
        if (status === 503) {
          responses.push(makeResponse());
        }
        const { fetchImpl } = queuedFetch(...responses);
        await assertTwitchError(invoke(fetchImpl), code, {
          status,
          ...(status === 429
            ? { rateLimitReset: 1735689600 }
            : {}),
        });
      });
    }
  }
});

test("a single 503 is retried once and can recover", async () => {
  const { calls, fetchImpl } = queuedFetch(
    textResponse("temporarily unavailable", 503),
    jsonResponse(tokenBody())
  );

  const validated = await validateAccessToken("token", "client-123", {
    fetchImpl,
  });

  assert.equal(validated.user_id, "user-123");
  assert.equal(calls.length, 2);
});

test("invalid content type, empty body, invalid JSON, and non-object JSON fail closed", async (t) => {
  const cases = [
    [textResponse("{}", 200, { "content-type": "text/html" }), "invalid_response"],
    [textResponse("", 200, { "content-type": "application/json" }), "invalid_json"],
    [textResponse("not-json", 200, { "content-type": "application/json" }), "invalid_json"],
    [textResponse("null", 200, { "content-type": "application/json" }), "invalid_response"],
    [textResponse("[]", 200, { "content-type": "application/json" }), "invalid_response"],
  ];

  for (const [response, code] of cases) {
    await t.test(code, async () => {
      const { fetchImpl } = queuedFetch(response);
      await assertTwitchError(
        validateAccessToken("token", undefined, { fetchImpl }),
        code
      );
    });
  }
});

test("getAuthenticatedUser requires exactly one user and optionally checks token subject", async (t) => {
  await t.test("returns the validated identity", async () => {
    const { calls, fetchImpl } = queuedFetch(jsonResponse(userBody()));
    const user = await getAuthenticatedUser(
      "token",
      "client-123",
      "user-123",
      { fetchImpl }
    );
    assert.deepEqual(user, {
      id: "user-123",
      login: "channel-owner",
      display_name: "Channel Owner",
    });
    assert.equal(calls[0].url.pathname, "/helix/users");
    assert.equal(calls[0].init.headers["Client-ID"], "client-123");
  });

  await t.test("subject mismatch is permission denied", async () => {
    const { fetchImpl } = queuedFetch(jsonResponse(userBody()));
    await assertTwitchError(
      getAuthenticatedUser("token", "client-123", "different-user", {
        fetchImpl,
      }),
      "permission_denied"
    );
  });

  await t.test("zero or multiple users are invalid", async () => {
    const empty = queuedFetch(jsonResponse({ data: [] }));
    await assertTwitchError(
      getAuthenticatedUser("token", "client-123", undefined, {
        fetchImpl: empty.fetchImpl,
      }),
      "invalid_response"
    );

    const multiple = queuedFetch(
      jsonResponse({ data: [userBody().data[0], userBody().data[0]] })
    );
    await assertTwitchError(
      getAuthenticatedUser("token", "client-123", undefined, {
        fetchImpl: multiple.fetchImpl,
      }),
      "invalid_response"
    );
  });
});

test("fetchAllFollowers uses URLSearchParams, omits first-page after, and accepts a valid zero snapshot", async (t) => {
  await t.test("single page", async () => {
    const { calls, fetchImpl } = queuedFetch(
      jsonResponse({ data: [follower("a")], total: 1, pagination: {} })
    );
    const followers = await fetchAllFollowers(
      "token",
      "client-123",
      "broadcaster-123",
      { fetchImpl }
    );
    assert.deepEqual(followers, [follower("a")]);
    assert.equal(calls[0].url.searchParams.get("broadcaster_id"), "broadcaster-123");
    assert.equal(calls[0].url.searchParams.get("first"), "100");
    assert.equal(calls[0].url.searchParams.has("after"), false);
  });

  await t.test("empty list with total zero", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse({ data: [], total: 0, pagination: {} })
    );
    assert.deepEqual(
      await fetchAllFollowers("token", "client-123", "broadcaster", {
        fetchImpl,
      }),
      []
    );
  });
});

test("fetchAllFollowers follows opaque cursors, encodes them, and deduplicates repeated rows", async () => {
  const cursor = "opaque+cursor&with=reserved#characters";
  const first = follower("a");
  const second = follower("b");
  const { calls, fetchImpl } = queuedFetch(
    jsonResponse({
      data: [first],
      total: 2,
      pagination: { cursor },
    }),
    jsonResponse({
      data: [first, second],
      total: 2,
      pagination: {},
    })
  );

  assert.deepEqual(
    await fetchAllFollowers("token", "client-123", "broadcaster", {
      fetchImpl,
    }),
    [first, second]
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.searchParams.get("after"), cursor);
  assert.ok(calls[1].url.href.includes("%2B"));
  assert.ok(calls[1].url.href.includes("%26"));
  assert.ok(calls[1].url.href.includes("%3D"));
  assert.ok(calls[1].url.href.includes("%23"));
});

test("fetchAllFollowers deduplicates repeated rows within one page", async () => {
  const duplicate = follower("duplicate");
  const { fetchImpl } = queuedFetch(
    jsonResponse({
      data: [duplicate, duplicate],
      total: 1,
      pagination: {},
    })
  );

  assert.deepEqual(
    await fetchAllFollowers("token", "client-123", "broadcaster", {
      fetchImpl,
    }),
    [duplicate]
  );
});

test("fetchAllFollowers rejects non-authoritative and malformed/partial pages", async (t) => {
  const cases = [
    [
      { total: 10, pagination: {} },
      "non_authoritative_snapshot",
      "total-only response",
    ],
    [
      { data: [], total: 10, pagination: {} },
      "non_authoritative_snapshot",
      "empty first page with positive total",
    ],
    [
      { data: [follower("a")], total: 1 },
      "invalid_response",
      "missing pagination object",
    ],
    [
      { data: [follower("a")], total: 2, pagination: {} },
      "non_authoritative_snapshot",
      "terminal first page contains fewer rows than total",
    ],
    [
      { data: [{ user_id: "a" }], total: 1, pagination: {} },
      "invalid_response",
      "missing follower fields",
    ],
    [
      { data: [follower("a")], total: -1, pagination: {} },
      "invalid_response",
      "negative total",
    ],
    [
      { data: [follower("a")], total: 0, pagination: {} },
      "invalid_response",
      "data with zero total",
    ],
    [
      { data: [], total: 0, pagination: { cursor: null } },
      "invalid_response",
      "null cursor",
    ],
  ];

  for (const [body, code, name] of cases) {
    await t.test(name, async () => {
      const { fetchImpl } = queuedFetch(jsonResponse(body));
      await assertTwitchError(
        fetchAllFollowers("token", "client-123", "broadcaster", {
          fetchImpl,
        }),
        code
      );
    });
  }

  await t.test("failure on a later page rejects the complete operation", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse({
        data: [follower("a")],
        total: 2,
        pagination: { cursor: "next" },
      }),
      textResponse("upstream body", 500)
    );
    await assertTwitchError(
      fetchAllFollowers("token", "client-123", "broadcaster", {
        fetchImpl,
      }),
      "server_error"
    );
  });

  await t.test("an incomplete terminal page rejects the accumulated rows", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse({
        data: [follower("a")],
        total: 2,
        pagination: { cursor: "next" },
      }),
      jsonResponse({ data: [], total: 2, pagination: {} })
    );
    await assertTwitchError(
      fetchAllFollowers("token", "client-123", "broadcaster", {
        fetchImpl,
      }),
      "non_authoritative_snapshot"
    );
  });

  await t.test(
    "a total decrease during pagination retains already traversed rows",
    async () => {
      const { fetchImpl } = queuedFetch(
        jsonResponse({
          data: [follower("a")],
          total: 2,
          pagination: { cursor: "next" },
        }),
        jsonResponse({ data: [], total: 0, pagination: {} })
      );

      assert.deepEqual(
        await fetchAllFollowers("token", "client-123", "broadcaster", {
          fetchImpl,
        }),
        [follower("a")]
      );
    }
  );

  await t.test("a later page cannot contain rows when its total is zero", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse({
        data: [],
        total: 0,
        pagination: { cursor: "next" },
      }),
      jsonResponse({
        data: [follower("impossible")],
        total: 0,
        pagination: {},
      })
    );
    await assertTwitchError(
      fetchAllFollowers("token", "client-123", "broadcaster", {
        fetchImpl,
      }),
      "invalid_response"
    );
  });

  await t.test("repeated cursors fail instead of looping forever", async () => {
    const { fetchImpl } = queuedFetch(
      jsonResponse({
        data: [follower("a")],
        total: 2,
        pagination: { cursor: "same" },
      }),
      jsonResponse({
        data: [follower("b")],
        total: 2,
        pagination: { cursor: "same" },
      })
    );
    await assertTwitchError(
      fetchAllFollowers("token", "client-123", "broadcaster", {
        fetchImpl,
      }),
      "pagination_loop"
    );
  });
});

test("transport cancellation and timeout are sanitized, including body consumption", async (t) => {
  await t.test("network error", async () => {
    const { fetchImpl } = queuedFetch(new TypeError("contains secret token"));
    await assertTwitchError(
      validateAccessToken("secret-token", undefined, { fetchImpl }),
      "network"
    );
  });

  await t.test("caller abort", async () => {
    const controller = new AbortController();
    const { fetchImpl } = queuedFetch(async (_input, init) => {
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(init.signal.aborted, true);
      throw new DOMException("aborted", "AbortError");
    });
    await assertTwitchError(
      validateAccessToken("secret-token", undefined, {
        fetchImpl,
        signal: controller.signal,
      }),
      "aborted"
    );
  });

  await t.test("timeout while body is still pending", async () => {
    const { fetchImpl } = queuedFetch(async (_input, init) => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => new Promise((resolve) => {
        init.signal.addEventListener("abort", () => resolve(JSON.stringify(tokenBody())));
      }),
    }));
    await assertTwitchError(
      validateAccessToken("secret-token", undefined, {
        fetchImpl,
        timeoutMs: 5,
      }),
      "timeout"
    );
  });

  await t.test("timeout while fetch itself ignores AbortSignal", async () => {
    const { fetchImpl } = queuedFetch(
      () => new Promise(() => {})
    );
    await assertTwitchError(
      validateAccessToken("secret-token", undefined, {
        fetchImpl,
        timeoutMs: 5,
      }),
      "timeout"
    );
  });
});
