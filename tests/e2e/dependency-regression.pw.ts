import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const LOCAL_ORIGIN = "http://127.0.0.1:4173";
const SYNTHETIC_TOKEN = "synthetic-e2e-token-not-a-real-credential";
const CLIENT_ID = "h0pe6dkb6r51jzkk27ujasldoqgio9";
const BROADCASTER_ID = "channel-e2e";
const SNAPSHOT_KEY = `previousFollowersKey:v1:${encodeURIComponent(BROADCASTER_ID)}`;
const BASELINE_CHECKED_AT = "2026-01-01T00:00:00.000Z";
const OPAQUE_CURSOR = "opaque+cursor&with=reserved=1#fixture";

type Follower = Readonly<{
  user_id: string;
  user_login: string;
  user_name: string;
  followed_at: string;
}>;

type Deferred = Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}>;

type FollowerHold = Readonly<{
  started: Promise<void>;
  release: () => void;
}>;

const retainedFollower: Follower = {
  user_id: "retained-viewer-id",
  user_login: "retained_viewer",
  user_name: "Retained Viewer",
  followed_at: "2025-12-01T00:00:00.000Z",
};

const unfollowedFollower: Follower = {
  user_id: "unfollowed-viewer-id",
  user_login: "unfollowed_viewer",
  user_name: "Synthetic Unfollowed Viewer",
  followed_at: "2025-11-01T00:00:00.000Z",
};

const newFollowers: Follower[] = Array.from({ length: 19 }, (_, index) => {
  const sequence = String(index + 1).padStart(2, "0");
  return {
    user_id: `synthetic-new-${sequence}-id`,
    user_login: `synthetic_new_${sequence}`,
    user_name: `Synthetic New ${sequence}`,
    followed_at: `2026-01-${String(index + 2).padStart(2, "0")}T00:00:00.000Z`,
  };
});

const currentFollowers = [retainedFollower, ...newFollowers];
const firstFollowerPage = currentFollowers.slice(0, 15);
// Twitch documents follower lists as dynamic. The repeated row proves that a
// dependency migration still exercises the app's deliberate de-duplication.
const secondFollowerPage = [
  firstFollowerPage[0],
  ...currentFollowers.slice(15),
];

const makeDeferred = (): Deferred => {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: () => settle?.(),
  };
};

const safeMessage = (message: string): string =>
  message
    .replaceAll(SYNTHETIC_TOKEN, "<redacted-test-token>")
    .replace(/https?:\/\/[^\s)]+/g, (candidate) => {
      try {
        const url = new URL(candidate);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "<redacted-url>";
      }
    });

const safeRequestPath = (request: Request): string => {
  const url = new URL(request.url());
  return `${request.method()} ${url.origin}${url.pathname}`;
};

const isSeparatelyAuditedNetworkMessage = (
  message: string,
  allowedHttpStatuses: readonly number[]
): boolean => {
  if (message === "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector") {
    return true;
  }
  const statusMatch = message.match(
    /^Failed to load resource: the server responded with a status of (\d+) \(.+\)$/
  );
  return (
    statusMatch !== null && allowedHttpStatuses.includes(Number(statusMatch[1]))
  );
};

class TwitchMock {
  private nextFollowerStatus: number | null = null;
  private nextFollowerHold:
    | Readonly<{ started: Deferred; release: Deferred }>
    | null = null;

  readonly contractFailures: string[] = [];
  readonly followerRequests: Array<
    Readonly<{ hasAfter: boolean; after: string | null }>
  > = [];

  failNextFollowerRequest(status: number): void {
    this.nextFollowerStatus = status;
  }

  holdNextFollowerRequest(): FollowerHold {
    const started = makeDeferred();
    const release = makeDeferred();
    this.nextFollowerHold = { started, release };
    return {
      started: started.promise,
      release: release.resolve,
    };
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const headers = request.headers();

    if (request.method() !== "GET") {
      this.contractFailures.push(`unexpected method for ${url.pathname}`);
    }
    if (headers.authorization !== `Bearer ${SYNTHETIC_TOKEN}`) {
      this.contractFailures.push(`unexpected authorization for ${url.pathname}`);
    }

    if (url.origin === "https://id.twitch.tv" && url.pathname === "/oauth2/validate") {
      if (url.search !== "" || headers["client-id"] !== undefined) {
        this.contractFailures.push("unexpected validate request shape");
      }
      await route.fulfill({
        status: 200,
        json: {
          client_id: CLIENT_ID,
          scopes: ["moderator:read:followers"],
          expires_in: 3_600,
          user_id: BROADCASTER_ID,
        },
      });
      return;
    }

    if (headers["client-id"] !== CLIENT_ID) {
      this.contractFailures.push(`unexpected Client-ID for ${url.pathname}`);
    }

    if (url.origin === "https://api.twitch.tv" && url.pathname === "/helix/users") {
      if (url.search !== "") {
        this.contractFailures.push("unexpected users request query");
      }
      await route.fulfill({
        status: 200,
        json: {
          data: [
            {
              id: BROADCASTER_ID,
              login: "channel_e2e",
              display_name: "Channel E2E",
            },
          ],
        },
      });
      return;
    }

    if (
      url.origin !== "https://api.twitch.tv" ||
      url.pathname !== "/helix/channels/followers"
    ) {
      this.contractFailures.push(`unexpected Twitch endpoint ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }

    if (
      url.searchParams.get("broadcaster_id") !== BROADCASTER_ID ||
      url.searchParams.get("first") !== "100"
    ) {
      this.contractFailures.push("unexpected follower request parameters");
    }

    const hasAfter = url.searchParams.has("after");
    const after = url.searchParams.get("after");
    this.followerRequests.push({ hasAfter, after });

    if (this.nextFollowerStatus !== null) {
      const status = this.nextFollowerStatus;
      this.nextFollowerStatus = null;
      await route.fulfill({
        status,
        json: { error: "synthetic failure" },
      });
      return;
    }

    if (this.nextFollowerHold !== null) {
      const hold = this.nextFollowerHold;
      this.nextFollowerHold = null;
      hold.started.resolve();
      await hold.release.promise;
    }

    if (!hasAfter) {
      await route.fulfill({
        status: 200,
        json: {
          data: firstFollowerPage,
          total: currentFollowers.length,
          pagination: { cursor: OPAQUE_CURSOR },
        },
      });
      return;
    }

    if (after !== OPAQUE_CURSOR) {
      this.contractFailures.push("opaque pagination cursor was not preserved");
      await route.fulfill({
        status: 400,
        json: { error: "unexpected synthetic cursor" },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        data: secondFollowerPage,
        total: currentFollowers.length,
        pagination: {},
      },
    });
  }
}

type NetworkAuditOptions = Readonly<{
  mockTwitch?: boolean;
  allowedLocalStatus?: (url: URL, status: number) => boolean;
  allowedConsoleHttpStatuses?: readonly number[];
}>;

const installNetworkAudit = async (
  page: Page,
  options: NetworkAuditOptions = {}
) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const localFailures: string[] = [];
  const localHttpErrors: string[] = [];
  const unexpectedExternalRequests: string[] = [];
  const twitch = options.mockTwitch ? new TwitchMock() : null;

  page.on("pageerror", (error) => {
    pageErrors.push(safeMessage(`${error.name}: ${error.message}`));
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !isSeparatelyAuditedNetworkMessage(
        message.text(),
        options.allowedConsoleHttpStatuses ?? []
      )
    ) {
      consoleErrors.push(safeMessage(message.text()));
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === LOCAL_ORIGIN) {
      localFailures.push(safeRequestPath(request));
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === LOCAL_ORIGIN &&
      response.status() >= 400 &&
      !options.allowedLocalStatus?.(url, response.status())
    ) {
      localHttpErrors.push(`${response.status()} ${url.pathname}`);
    }
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === LOCAL_ORIGIN) {
      await route.continue();
      return;
    }

    if (
      url.origin === "https://www.googletagmanager.com" &&
      (url.pathname === "/gtm.js" || url.pathname === "/ns.html")
    ) {
      // The current production app loads GTM globally (#213). Browser tests
      // explicitly block it so no test identity or page state leaves localhost.
      await route.abort("blockedbyclient");
      return;
    }

    if (
      twitch !== null &&
      (url.origin === "https://id.twitch.tv" ||
        url.origin === "https://api.twitch.tv")
    ) {
      await twitch.handle(route);
      return;
    }

    unexpectedExternalRequests.push(`${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
  });

  await page.routeWebSocket("**/*", async (webSocket) => {
    const url = new URL(webSocket.url());
    unexpectedExternalRequests.push(`websocket ${url.origin}${url.pathname}`);
    await webSocket.close({
      code: 1008,
      reason: "Blocked by deterministic browser test",
    });
  });

  return {
    twitch,
    assertClean: async () => {
      await page.waitForLoadState("networkidle");
      expect(pageErrors, "browser page errors").toEqual([]);
      expect(consoleErrors, "browser console errors").toEqual([]);
      expect(localFailures, "failed localhost resources").toEqual([]);
      expect(localHttpErrors, "unexpected localhost HTTP errors").toEqual([]);
      expect(
        unexpectedExternalRequests,
        "unrecognized external requests"
      ).toEqual([]);
      expect(twitch?.contractFailures ?? [], "Twitch mock contract failures").toEqual(
        []
      );
    },
  };
};

const seedAuthenticatedStorage = async (page: Page): Promise<void> => {
  await page.addInitScript(
    ({ token, snapshotKey, broadcasterId, checkedAt, baselineFollowers }) => {
      localStorage.setItem("twitchAccessToken", token);
      localStorage.setItem(
        snapshotKey,
        JSON.stringify({
          version: 1,
          broadcasterId,
          followers: baselineFollowers,
          checkedAt,
        })
      );
    },
    {
      token: SYNTHETIC_TOKEN,
      snapshotKey: SNAPSHOT_KEY,
      broadcasterId: BROADCASTER_ID,
      checkedAt: BASELINE_CHECKED_AT,
      baselineFollowers: [retainedFollower, unfollowedFollower],
    }
  );
};

const activePanel = (page: Page, label: string) =>
  page.locator(`[role="tabpanel"][data-value="${label}"]`);

const applicationStatus = (page: Page) =>
  page.locator('div[role="status"][aria-live="polite"][aria-atomic="true"]');

const applicationAlert = (page: Page) =>
  page.locator('div[role="alert"][aria-atomic="true"]');

const openAuthenticatedApp = async (
  page: Page,
  options: Pick<NetworkAuditOptions, "allowedConsoleHttpStatuses"> = {}
) => {
  await seedAuthenticatedStorage(page);
  const audit = await installNetworkAudit(page, {
    ...options,
    mockTwitch: true,
  });
  await page.goto("/");
  await expect(applicationStatus(page)).toHaveText("Follower lists updated.");
  const followerPanel = activePanel(page, "Follower List");
  await expect(followerPanel).toHaveCSS("opacity", "1");
  await expect(followerPanel.getByText("Retained Viewer", { exact: true })).toBeVisible();
  return { audit, twitch: audit.twitch as TwitchMock };
};

test("unauthenticated root remains usable at a narrow dark viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const audit = await installNetworkAudit(page);

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Authenticate with Twitch", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);

  const horizontalOverflow = await page.evaluate(() =>
    Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
      document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await audit.assertClean();
});

test("all localized documentation routes hydrate from the static export", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const audit = await installNetworkAudit(page);
  const locales = [
    ["en", "en-US"],
    ["de", "de-DE"],
    ["es", "es-ES"],
    ["fr", "fr-FR"],
    ["ja", "ja-JP"],
    ["ko", "ko-KR"],
    ["pt", "pt-BR"],
    ["ru", "ru-RU"],
  ] as const;

  for (const [locale, language] of locales) {
    for (const route of ["", "contribute/", "how_to_use/"]) {
      const response = await page.goto(`/${locale}/${route}`);
      expect(response?.status(), `/${locale}/${route}`).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator("article main")).toBeVisible();
      await expect(page.locator("article main h1, article main h2").first()).toBeVisible();
    }
  }

  await audit.assertClean();
});

test("legacy list route and custom 404 preserve their static navigation contracts", async ({
  page,
}) => {
  const missingPath = "/synthetic-route-that-does-not-exist/";
  const audit = await installNetworkAudit(page, {
    allowedLocalStatus: (url, status) =>
      url.pathname === missingPath && status === 404,
    allowedConsoleHttpStatuses: [404],
  });

  for (const traversalPath of ["/..%2Fpackage.json", "/..%5Cpackage.json"]) {
    const traversalResponse = await page.request.get(
      `${LOCAL_ORIGIN}${traversalPath}`
    );
    expect(traversalResponse.status()).toBe(403);
    expect(await traversalResponse.body()).toHaveLength(0);
  }

  const listResponse = await page.goto("/list/");
  expect(listResponse?.status()).toBe(200);
  await page.waitForURL(`${LOCAL_ORIGIN}/`);
  await expect(page.getByText("Authenticate with Twitch", { exact: true })).toBeVisible();

  const notFoundResponse = await page.goto(missingPath);
  expect(notFoundResponse?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "404: Page Not Found", exact: true })
  ).toBeVisible();
  await audit.assertClean();
});

test("synthetic authenticated lists keep grid, diff, filter, pagination, and commit semantics", async ({
  page,
}) => {
  const { audit, twitch } = await openAuthenticatedApp(page);
  const followerPanel = activePanel(page, "Follower List");

  const grid = followerPanel.getByRole("treegrid");
  await expect(grid).toBeVisible();
  for (const header of ["Followed At", "Display Name", "User Name", "User ID"]) {
    await expect(grid.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(followerPanel.getByRole("button", { name: "Check done" })).toBeDisabled();
  await expect(
    followerPanel.getByText("Synthetic New 19", { exact: true })
  ).not.toBeVisible();

  const nextPage = followerPanel.locator('[aria-label="Next Page"]');
  await expect(nextPage).toBeEnabled();
  await nextPage.click();
  await expect(followerPanel.getByText("Synthetic New 19", { exact: true })).toBeVisible();
  const profileLink = followerPanel.getByRole("link", {
    name: "synthetic_new_19",
    exact: true,
  });
  await expect(profileLink).toHaveAttribute(
    "href",
    "https://www.twitch.tv/synthetic_new_19"
  );
  await expect(profileLink).toHaveAttribute("target", "_blank");
  await expect(profileLink).toHaveAttribute("rel", "noopener noreferrer");

  await page.getByRole("tab", { name: "New followed List" }).click();
  const newPanel = activePanel(page, "New followed List");
  await expect(newPanel).toHaveCSS("opacity", "1");
  await expect(newPanel.getByText("Synthetic New 01", { exact: true })).toBeVisible();
  await expect(newPanel.getByText("Retained Viewer", { exact: true })).not.toBeVisible();

  const search = newPanel.getByRole("textbox");
  await search.fill("Synthetic New 07");
  await expect(newPanel.getByText("Synthetic New 07", { exact: true })).toBeVisible();
  await expect(newPanel.getByText("Synthetic New 01", { exact: true })).not.toBeVisible();
  await search.fill("no-such-synthetic-viewer");
  await expect(newPanel.getByText("Synthetic New 07", { exact: true })).not.toBeVisible();
  await search.fill("");
  await expect(newPanel.getByText("Synthetic New 01", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Unfollowed List" }).click();
  const unfollowedPanel = activePanel(page, "Unfollowed List");
  await expect(unfollowedPanel).toHaveCSS("opacity", "1");
  await expect(
    unfollowedPanel.getByText("Synthetic Unfollowed Viewer", { exact: true })
  ).toBeVisible();
  await expect(unfollowedPanel.getByText("Synthetic New 01", { exact: true })).not.toBeVisible();

  const checkDone = unfollowedPanel.getByRole("button", { name: "Check done" });
  await expect(checkDone).toBeEnabled();
  await checkDone.click();
  await expect(applicationStatus(page)).toHaveText(
    "Follower baseline and check date saved."
  );
  await expect(checkDone).toBeDisabled();

  const storedSnapshot = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, SNAPSHOT_KEY);
  expect(storedSnapshot).toMatchObject({
    version: 1,
    broadcasterId: BROADCASTER_ID,
  });
  expect(storedSnapshot.checkedAt).not.toBe(BASELINE_CHECKED_AT);
  expect(storedSnapshot.followers.map((follower: Follower) => follower.user_id)).toEqual(
    currentFollowers.map((follower) => follower.user_id)
  );

  expect(twitch.followerRequests.some((request) => !request.hasAfter)).toBe(true);
  expect(
    twitch.followerRequests.some(
      (request) => request.hasAfter && request.after === OPAQUE_CURSOR
    )
  ).toBe(true);
  await audit.assertClean();
});

test("manual refresh exposes loading without discarding the last valid lists", async ({
  page,
}) => {
  const { audit, twitch } = await openAuthenticatedApp(page);
  await page.getByRole("tab", { name: "New followed List" }).click();
  const newPanel = activePanel(page, "New followed List");
  const checkDone = newPanel.getByRole("button", { name: "Check done" });
  await expect(checkDone).toBeEnabled();

  const hold = twitch.holdNextFollowerRequest();
  await page.getByRole("button", { name: "Refresh follower lists" }).click();
  await hold.started;
  try {
    await expect(
      page.getByRole("button", { name: "Refreshing follower lists" })
    ).toBeDisabled();
    await expect(page.locator('div[aria-busy="true"]')).toHaveCount(1);
    await expect(applicationStatus(page)).toHaveText(
      "Refreshing follower lists. The last loaded lists remain available while you wait."
    );
    await expect(newPanel.getByText("Synthetic New 01", { exact: true })).toBeVisible();
    await expect(checkDone).toBeDisabled();
  } finally {
    hold.release();
  }

  await expect(applicationStatus(page)).toHaveText("Follower lists updated.");
  await expect(newPanel.getByText("Synthetic New 01", { exact: true })).toBeVisible();
  await audit.assertClean();
});

test("failed manual refresh is recoverable and never mutates the baseline", async ({
  page,
}) => {
  const { audit, twitch } = await openAuthenticatedApp(page, {
    allowedConsoleHttpStatuses: [500],
  });
  await page.getByRole("tab", { name: "New followed List" }).click();
  const newPanel = activePanel(page, "New followed List");
  const checkDone = newPanel.getByRole("button", { name: "Check done" });
  const baselineBeforeFailure = await page.evaluate(
    (key) => localStorage.getItem(key),
    SNAPSHOT_KEY
  );

  twitch.failNextFollowerRequest(500);
  await page.getByRole("button", { name: "Refresh follower lists" }).click();
  const alert = applicationAlert(page);
  await expect(alert).toContainText("Twitch is temporarily unavailable.");
  await expect(alert).toContainText(
    "Showing the last successfully loaded follower lists."
  );
  await expect(newPanel.getByText("Synthetic New 01", { exact: true })).toBeVisible();
  await expect(checkDone).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh follower lists" })
  ).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY)).toBe(
    baselineBeforeFailure
  );

  await page.getByRole("button", { name: "Refresh follower lists" }).click();
  await expect(applicationStatus(page)).toHaveText("Follower lists updated.");
  await expect(alert).toHaveCount(0);
  await expect(checkDone).toBeEnabled();
  await audit.assertClean();
});
