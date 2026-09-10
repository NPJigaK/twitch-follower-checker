import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";
import axe from "axe-core";

const rawTestPort = process.env.PLAYWRIGHT_TEST_PORT ?? "4173";
const testPort = Number(rawTestPort);
if (!/^[1-9]\d{0,4}$/.test(rawTestPort) || testPort > 65_535) {
  throw new Error(
    "PLAYWRIGHT_TEST_PORT must be a canonical integer from 1 through 65535",
  );
}
const LOCAL_ORIGIN = `http://127.0.0.1:${testPort}`;
const responsiveThemeCases = [
  { width: 320, height: 700, colorScheme: "light" },
  { width: 320, height: 700, colorScheme: "dark" },
  { width: 390, height: 844, colorScheme: "light" },
  { width: 390, height: 844, colorScheme: "dark" },
  { width: 412, height: 915, colorScheme: "light" },
  { width: 412, height: 915, colorScheme: "dark" },
  { width: 768, height: 1024, colorScheme: "light" },
  { width: 768, height: 1024, colorScheme: "dark" },
  { width: 1024, height: 768, colorScheme: "light" },
  { width: 1024, height: 768, colorScheme: "dark" },
  { width: 1280, height: 900, colorScheme: "light" },
  { width: 1280, height: 900, colorScheme: "dark" },
  { width: 1440, height: 900, colorScheme: "light" },
  { width: 1440, height: 900, colorScheme: "dark" },
] as const;
const SYNTHETIC_TOKEN = "synthetic-e2e-token-not-a-real-credential";
const CLIENT_ID = "h0pe6dkb6r51jzkk27ujasldoqgio9";
const BROADCASTER_ID = "channel-e2e";
const SNAPSHOT_KEY = `previousFollowersKey:v1:${encodeURIComponent(BROADCASTER_ID)}`;
const BASELINE_CHECKED_AT = "2026-01-01T00:00:00.000Z";
const OPAQUE_CURSOR = "opaque+cursor&with=reserved=1#fixture";
const EXPECTED_FOLLOWER_SEARCH_HREFS = [
  "/de/how_to_use/#follower-pr%C3%BCfen",
  "/de/how_to_use/#follower-liste",
  "/de/how_to_use/#neue-follower-liste",
  "/de/how_to_use/#neueste-informationen-abrufen",
  "/de/how_to_use/#f-was-kann-ich-tun-wenn-das-laden-langsam-ist",
  "/de/#was-ist-der-twitch-follower-checker",
  "/de/#was-ist-der-twitch-follower-checker",
  "/de/#hauptfunktionen",
  "/de/#hauptfunktionen",
  "/de/#hauptfunktionen",
  "/de/#wie-verwendet-man-den-twitch-follower-checker",
  "/en/#what-is-twitch-follower-checker",
  "/en/#what-is-twitch-follower-checker",
  "/en/#main-features",
  "/en/#main-features",
  "/en/#main-features",
  "/en/#how-to-use-twitch-follower-checker",
  "/es/#qu%C3%A9-es-twitch-follower-checker",
  "/es/#qu%C3%A9-es-twitch-follower-checker",
  "/es/#c%C3%B3mo-utilizar-twitch-follower-checker",
  "/fr/#quest-ce-que-twitch-follower-checker-",
  "/fr/#quest-ce-que-twitch-follower-checker-",
  "/fr/#comment-utiliser-twitch-follower-checker",
  "/pt/#o-que-%C3%A9-o-twitch-follower-checker",
  "/pt/#o-que-%C3%A9-o-twitch-follower-checker",
  "/pt/#como-usar-o-twitch-follower-checker",
  "/ru/#%D1%87%D1%82%D0%BE-%D1%82%D0%B0%D0%BA%D0%BE%D0%B5-twitch-follower-checker",
  "/ru/#%D1%87%D1%82%D0%BE-%D1%82%D0%B0%D0%BA%D0%BE%D0%B5-twitch-follower-checker",
  "/ru/#%D0%BA%D0%B0%D0%BA-%D0%B8%D1%81%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D1%8C-twitch-follower-checker",
  "/de/contribute/",
  "/en/contribute/",
  "/en/how_to_use/#twitch-authentication",
  "/en/how_to_use/#checking-followers",
  "/en/how_to_use/#follower-list",
  "/en/how_to_use/#fetching-latest-information",
  "/en/how_to_use/#q-what-should-i-do-if-loading-is-slow",
  "/es/contribute/",
  "/fr/contribute/",
  "/ko/how_to_use/#follower-list",
  "/pt/contribute/",
  "/ru/contribute/",
  "/ja/how_to_use/#follower-list",
] as const;

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

const browserNavigationCancellationReasons = new Set([
  "NS_BINDING_ABORTED",
  "net::ERR_ABORTED",
  "cancelled",
]);

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
  private nextTerminalFollowerTotal: number | null = null;
  private nextEmptyPositiveTotal: number | null = null;
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

  reportNextTerminalFollowerTotal(total: number): void {
    this.nextTerminalFollowerTotal = total;
  }

  returnNextEmptyPositiveFollowerPage(total: number): void {
    this.nextEmptyPositiveTotal = total;
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

    if (!hasAfter && this.nextEmptyPositiveTotal !== null) {
      const total = this.nextEmptyPositiveTotal;
      this.nextEmptyPositiveTotal = null;
      await route.fulfill({
        status: 200,
        json: { data: [], total, pagination: {} },
      });
      return;
    }

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

    const terminalTotal =
      this.nextTerminalFollowerTotal ?? currentFollowers.length;
    this.nextTerminalFollowerTotal = null;
    await route.fulfill({
      status: 200,
      json: {
        data: secondFollowerPage,
        total: terminalTotal,
        pagination: {},
      },
    });
  }
}

type NetworkAuditOptions = Readonly<{
  mockTwitch?: boolean;
  allowedLocalStatus?: (url: URL, status: number) => boolean;
  allowedConsoleHttpStatuses?: readonly number[];
  mockedExternalNavigation?: (url: URL, request: Request) => boolean;
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
  const mockedExternalNavigations: string[] = [];
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
    // Browsers legitimately cancel generated assets that were prefetched or
    // became unnecessary during a later navigation. Missing assets still
    // produce audited HTTP errors, and every non-cancellation transport error
    // remains a failure.
    const wasBenignStaticAssetCancellation =
      !request.isNavigationRequest() &&
      url.pathname.startsWith("/_next/static/") &&
      browserNavigationCancellationReasons.has(
        request.failure()?.errorText ?? ""
      );
    if (
      url.origin === LOCAL_ORIGIN &&
      !wasBenignStaticAssetCancellation
    ) {
      const headers = request.headers();
      const purpose = headers["sec-purpose"] ?? headers.purpose ?? "none";
      const reason = request.failure()?.errorText ?? "unknown";
      localFailures.push(
        `${safeRequestPath(request)} [${request.resourceType()}; purpose=${purpose}; failure=${reason}]`
      );
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
      request.isNavigationRequest() &&
      options.mockedExternalNavigation?.(url, request)
    ) {
      mockedExternalNavigations.push(url.href);
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>Mocked reviewed external destination</title>",
      });
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
    mockedExternalNavigations,
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

const expectTouchControlInViewport = async (control: Locator): Promise<void> => {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  const viewport = control.page().viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) {
    return;
  }

  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
};

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

test("unauthenticated root remains usable across the responsive theme matrix", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const audit = await installNetworkAudit(page);
  const initialCase = responsiveThemeCases[0];

  await page.setViewportSize({
    width: initialCase.width,
    height: initialCase.height,
  });
  await page.emulateMedia({ colorScheme: initialCase.colorScheme });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  for (const { width, height, colorScheme } of responsiveThemeCases) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme });
    await expect(
      page.getByText("Authenticate with Twitch", { exact: true }),
    ).toBeVisible();
    if (colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    }

    const horizontalOverflow = await page.evaluate(() =>
      Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    // Let every engine finish any work triggered by the viewport/theme change
    // before the next matrix entry.
    await page.waitForLoadState("networkidle");
  }
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
      // Drain route prefetches before the next deliberate full navigation so
      // WebKit does not surface their cancellation as a spurious page error.
      await page.waitForLoadState("networkidle");
    }
  }

  await audit.assertClean();
});

test("documentation search preserves the production result and keyboard order", async ({
  page,
}) => {
  const audit = await installNetworkAudit(page);
  await page.goto("/en/how_to_use/");
  const input = page.locator('input[type="search"]:visible');
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-autocomplete", "list");
  const searchIndexResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === LOCAL_ORIGIN &&
      url.pathname === "/_next/static/chunks/nextra-data-en-US.json" &&
      response.status() === 200
    );
  });

  await input.pressSequentially("follower", { delay: 25 });
  await searchIndexResponse;
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const results = page.getByRole("listbox");
  const options = results.getByRole("option");
  await expect(options).toHaveCount(EXPECTED_FOLLOWER_SEARCH_HREFS.length);

  const hrefs = await options.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("href")),
  );
  expect(hrefs).toEqual(EXPECTED_FOLLOWER_SEARCH_HREFS);

  const firstOptionId = await options.first().getAttribute("id");
  const secondOptionId = await options.nth(1).getAttribute("id");
  expect(firstOptionId).not.toBeNull();
  expect(secondOptionId).not.toBeNull();
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    firstOptionId as string,
  );
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    secondOptionId as string,
  );
  await expect(input).toBeFocused();
  await input.press("ArrowUp");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    firstOptionId as string,
  );
  await input.press("Enter");
  await expect(page).toHaveURL(
    `${LOCAL_ORIGIN}${EXPECTED_FOLLOWER_SEARCH_HREFS[0]}`,
  );
  await audit.assertClean();
});

test("mobile documentation search preserves the production result order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const audit = await installNetworkAudit(page);
  await page.goto("/en/how_to_use/");
  const searchIndexResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === LOCAL_ORIGIN &&
      url.pathname === "/_next/static/chunks/nextra-data-en-US.json" &&
      response.status() === 200
    );
  });
  await page.keyboard.press("Control+k");
  const input = page.locator('input[type="search"]:visible');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-autocomplete", "list");

  await input.pressSequentially("follower", { delay: 25 });
  await searchIndexResponse;
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const results = page.getByRole("listbox");
  const options = results.getByRole("option");
  await expect(options).toHaveCount(EXPECTED_FOLLOWER_SEARCH_HREFS.length);
  expect(
    await options.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")),
    ),
  ).toEqual(EXPECTED_FOLLOWER_SEARCH_HREFS);

  const firstOptionId = await options.first().getAttribute("id");
  const secondOptionId = await options.nth(1).getAttribute("id");
  expect(firstOptionId).not.toBeNull();
  expect(secondOptionId).not.toBeNull();
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    firstOptionId as string,
  );
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    secondOptionId as string,
  );
  await expect(input).toBeFocused();
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
  await page.waitForLoadState("networkidle");

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

  await page.getByRole("tab", { name: "Follower List" }).click();
  await expect(
    followerPanel.getByText("Synthetic New 19", { exact: true })
  ).toBeVisible();
  await page.getByRole("tab", { name: "Unfollowed List" }).click();

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

test("follower tabs expose keyboard and assistive technology relationships", async ({
  page,
}) => {
  const { audit } = await openAuthenticatedApp(page);
  const tablist = page.getByRole("tablist", { name: "Follower list tabs" });
  const tabs = tablist.getByRole("tab");
  const labels = [
    "Follower List",
    "New followed List",
    "Unfollowed List",
  ] as const;
  const relationshipIds: string[] = [];

  await expect(tabs).toHaveCount(labels.length);
  await expect(tablist.locator(":scope > [role=tab]")).toHaveCount(labels.length);
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
  await expect(tabs.nth(2)).toHaveAttribute("tabindex", "-1");

  for (const label of labels) {
    const tab = page.getByRole("tab", { name: label, exact: true });
    const panel = activePanel(page, label);
    const tabId = await tab.getAttribute("id");
    const panelId = await panel.getAttribute("id");
    const search = panel.locator("input").first();
    const searchId = await search.getAttribute("id");

    expect(tabId).toMatch(/^[-a-z0-9]+$/);
    expect(panelId).toMatch(/^[-a-z0-9]+$/);
    expect(searchId).toMatch(/^[-a-z0-9]+$/);
    relationshipIds.push(tabId as string, panelId as string, searchId as string);
    await expect(tab).toHaveAttribute("aria-controls", panelId as string);
    await expect(panel).toHaveAttribute("aria-labelledby", tabId as string);
    await expect(panel.locator(`label[for="${searchId}"]`)).toHaveText("Search...");
    await expect(search).toHaveAttribute("aria-label", `Search ${label}`);
    await expect(panel.locator('[role="treegrid"]')).toHaveAttribute(
      "aria-label",
      `${label} grid`
    );
    await expect(
      tab.locator("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])")
    ).toHaveCount(0);
  }
  expect(new Set(relationshipIds).size).toBe(relationshipIds.length);

  const followerTab = page.getByRole("tab", {
    name: "Follower List",
    exact: true,
  });
  const newTab = page.getByRole("tab", {
    name: "New followed List",
    exact: true,
  });
  const unfollowedTab = page.getByRole("tab", {
    name: "Unfollowed List",
    exact: true,
  });
  const followerPanel = activePanel(page, "Follower List");
  const newPanel = activePanel(page, "New followed List");
  const unfollowedPanel = activePanel(page, "Unfollowed List");

  await expect(followerTab).toHaveAttribute("aria-selected", "true");
  await expect(newTab).toHaveAttribute("aria-selected", "false");
  await expect(unfollowedTab).toHaveAttribute("aria-selected", "false");
  await expect(followerPanel).toBeVisible();
  await expect(followerPanel).not.toHaveAttribute("inert");
  await expect(followerPanel).toHaveAttribute("aria-hidden", "false");
  await expect(newPanel).toHaveAttribute("inert", "");
  await expect(newPanel).toHaveAttribute("aria-hidden", "true");
  await expect(unfollowedPanel).toHaveAttribute("inert", "");
  await expect(unfollowedPanel).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Follower List", exact: true })
  ).toHaveCount(1);
  await expect(
    page.getByRole("tabpanel", { name: "New followed List", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel", { name: "Unfollowed List", exact: true })
  ).toHaveCount(0);
  await expect(newPanel.getByRole("textbox")).toBeHidden();
  await expect(unfollowedPanel.getByRole("textbox")).toBeHidden();
  await expect(followerPanel.getByRole("treegrid")).toHaveAccessibleName(
    "Follower List grid"
  );

  await page.getByRole("button", { name: "Refresh follower lists" }).focus();
  await page.keyboard.press("Tab");
  await expect(followerTab).toBeFocused();

  const downWasPrevented = await followerTab.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(downWasPrevented).toBe(false);

  await followerTab.focus();
  await followerTab.press("ArrowRight");
  await expect(newTab).toBeFocused();
  await expect(newTab).toHaveAttribute("tabindex", "0");
  await expect(followerTab).toHaveAttribute("tabindex", "-1");
  await expect(newTab).toHaveAttribute("aria-selected", "true");
  await expect(newPanel).toBeVisible();
  await expect(newPanel).not.toHaveAttribute("inert");
  await expect(newPanel).toHaveAttribute("aria-hidden", "false");
  await expect(newPanel.getByRole("treegrid")).toHaveAccessibleName(
    "New followed List grid"
  );
  await expect(followerPanel).toHaveAttribute("inert", "");
  await expect(followerPanel).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Follower List", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel", { name: "New followed List", exact: true })
  ).toHaveCount(1);

  await newTab.focus();
  await page.keyboard.press("Tab");
  const newSearch = newPanel.getByRole("textbox", {
    name: "Search New followed List",
  });
  await expect(newSearch).toBeFocused();
  await newSearch.fill("Synthetic New 07");
  await page.keyboard.press("Shift+Tab");
  await expect(newTab).toBeFocused();

  await newTab.press("ArrowRight");
  await expect(unfollowedTab).toBeFocused();
  await expect(newPanel).toHaveAttribute("inert", "");
  await expect
    .poll(() =>
      newPanel.evaluate((panel) => panel.contains(document.activeElement))
    )
    .toBe(false);
  await unfollowedTab.press("ArrowLeft");
  await expect(newTab).toBeFocused();
  await expect(newSearch).toHaveValue("Synthetic New 07");
  await expect(newPanel.getByText("Synthetic New 07", { exact: true })).toBeVisible();
  await newTab.press("End");
  await expect(unfollowedTab).toBeFocused();
  await expect(unfollowedPanel.getByRole("treegrid")).toHaveAccessibleName(
    "Unfollowed List grid"
  );
  await unfollowedTab.press("Home");
  await expect(followerTab).toBeFocused();
  await followerTab.press("ArrowLeft");
  await expect(unfollowedTab).toBeFocused();
  await unfollowedTab.press("ArrowRight");
  await expect(followerTab).toBeFocused();
  await followerTab.press(" ");
  await expect(followerTab).toHaveAttribute("aria-selected", "true");

  await page.addScriptTag({ content: axe.source });
  const structuralViolations = await page.evaluate(async () => {
    const results = await (window as any).axe.run("main", {
      // The #212 contract is the tab/panel accessibility structure. Keep this
      // deterministic and pair it with the real keyboard assertions above;
      // visual color-contrast work is not silently folded into this UI-neutral
      // interaction fix.
      runOnly: {
        type: "rule",
        values: [
          "aria-allowed-attr",
          "aria-hidden-focus",
          "aria-prohibited-attr",
          "aria-required-attr",
          "aria-required-children",
          "aria-required-parent",
          "aria-roles",
          "aria-valid-attr-value",
          "aria-valid-attr",
          "duplicate-id-aria",
          "label",
          "nested-interactive",
          "tabindex",
        ],
      },
    });
    return results.violations
      .map(
        ({ id, impact, nodes }: { id: string; impact: string | null; nodes: any[] }) => ({
          id,
          impact,
          targets: nodes.map((node) => node.target),
        })
      );
  });
  expect(structuralViolations).toEqual([]);

  await audit.assertClean();
});

test("authenticated main tool remains usable across the responsive theme matrix", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  const { audit } = await openAuthenticatedApp(page);

  for (const { width, height, colorScheme } of responsiveThemeCases) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme });
    await expect(applicationStatus(page)).toHaveText("Follower lists updated.");

    const followerPanel = activePanel(page, "Follower List");
    await expect(followerPanel.getByRole("treegrid")).toBeVisible();
    await expect(
      followerPanel.getByText("Retained Viewer", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh follower lists" }),
    ).toBeVisible();
    await expect(
      followerPanel.getByRole("button", { name: "Check done" }),
    ).toBeDisabled();
    const tabBoxes: Array<Readonly<{ x: number; y: number; width: number; height: number }>> = [];
    for (const tab of [
      "Follower List",
      "New followed List",
      "Unfollowed List",
    ]) {
      const tabElement = page.getByRole("tab", { name: tab });
      await expect(tabElement).toBeVisible();
      const box = await tabElement.boundingBox();
      if (box === null) {
        throw new Error(`The ${tab} tab has no rendered bounds`);
      }
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      tabBoxes.push(box);
    }
    for (let leftIndex = 0; leftIndex < tabBoxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < tabBoxes.length; rightIndex += 1) {
        const left = tabBoxes[leftIndex];
        const right = tabBoxes[rightIndex];
        const overlapWidth = Math.max(
          0,
          Math.min(left.x + left.width, right.x + right.width) -
            Math.max(left.x, right.x),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(left.y + left.height, right.y + right.height) -
            Math.max(left.y, right.y),
        );
        expect(overlapWidth * overlapHeight).toBeLessThanOrEqual(0.5);
      }
    }
    await page.getByRole("tab", { name: "New followed List" }).click();
    await expect(
      page.getByRole("tab", { name: "New followed List" })
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Unfollowed List" }).click();
    await expect(
      page.getByRole("tab", { name: "Unfollowed List" })
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Follower List" }).click();
    if (colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    }

    const horizontalOverflow = await page.evaluate(() =>
      Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    await page.waitForLoadState("networkidle");
  }

  await audit.assertClean();
});

test("legacy Japanese route preserves its reviewed external redirect contract", async ({
  page,
}) => {
  const expectedDestination =
    "https://blog.devkey.jp/posts/twitch-follower-checker/";
  const audit = await installNetworkAudit(page, {
    mockedExternalNavigation: (url) => url.href === expectedDestination,
  });

  const localResponse = await page.request.get(`${LOCAL_ORIGIN}/jp/`);
  expect(localResponse.status()).toBe(200);
  await page.goto("/jp/");
  await expect(page).toHaveURL(expectedDestination);
  expect(audit.mockedExternalNavigations).toEqual([expectedDestination]);
  await audit.assertClean();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`emulated touch devices preserve the core follower workflow after rotation (${colorScheme}) @touch`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    expect(testInfo.project.name).toMatch(/-(?:phone|tablet)-emulated$/);
    await page.emulateMedia({ colorScheme });
    const { audit } = await openAuthenticatedApp(page);
    await expect
      .poll(() =>
        page.locator("html").evaluate((element) =>
          element.classList.contains("dark"),
        ),
      )
      .toBe(colorScheme === "dark");
    const initialViewport = page.viewportSize();
    if (initialViewport === null) {
      throw new Error("The emulated touch project must define a viewport");
    }

    const refresh = page.getByRole("button", { name: "Refresh follower lists" });
    await refresh.tap();
    await expect(applicationStatus(page)).toHaveText("Follower lists updated.");

    const newTab = page.getByRole("tab", {
      name: "New followed List",
      exact: true,
    });
    await newTab.tap();
    const newPanel = activePanel(page, "New followed List");
    const search = newPanel.getByRole("textbox", {
      name: "Search New followed List",
    });
    await search.tap();
    await search.pressSequentially("Synthetic New 07");
    await expect(
      newPanel.getByText("Synthetic New 07", { exact: true }),
    ).toBeVisible();

    const checkDone = newPanel.getByRole("button", { name: "Check done" });
    const criticalControls = [refresh, newTab, search, checkDone];
    for (const control of criticalControls) {
      await expectTouchControlInViewport(control);
    }

    await page.setViewportSize({
      width: initialViewport.height,
      height: initialViewport.width,
    });
    await expect
      .poll(() => page.viewportSize())
      .toEqual({
        width: initialViewport.height,
        height: initialViewport.width,
      });
    await expect(newTab).toHaveAttribute("aria-selected", "true");
    await expect(search).toHaveValue("Synthetic New 07");
    for (const control of criticalControls) {
      await expectTouchControlInViewport(control);
    }
    const horizontalOverflow = await page.evaluate(() =>
      Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);

    await search.fill("");
    const followerTab = page.getByRole("tab", {
      name: "Follower List",
      exact: true,
    });
    await followerTab.tap();
    const followerPanel = activePanel(page, "Follower List");
    const nextPage = followerPanel.locator('[aria-label="Next Page"]');
    await nextPage.tap();
    await expect(
      followerPanel.getByText("Synthetic New 19", { exact: true }),
    ).toBeVisible();
    await expect(
      followerPanel.getByRole("link", {
        name: "synthetic_new_19",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://www.twitch.tv/synthetic_new_19");

    const unfollowedTab = page.getByRole("tab", {
      name: "Unfollowed List",
      exact: true,
    });
    await unfollowedTab.tap();
    const unfollowedPanel = activePanel(page, "Unfollowed List");
    const finalCheckDone = unfollowedPanel.getByRole("button", {
      name: "Check done",
    });
    await finalCheckDone.tap();
    await expect(applicationStatus(page)).toHaveText(
      "Follower baseline and check date saved.",
    );
    await expect(finalCheckDone).toBeDisabled();
    await audit.assertClean();
  });
}

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

test("dynamic terminal totals do not reject a completed cursor traversal", async ({
  page,
}) => {
  const { audit, twitch } = await openAuthenticatedApp(page);
  const storedBeforeRefresh = await page.evaluate(
    (key) => localStorage.getItem(key),
    SNAPSHOT_KEY
  );

  twitch.reportNextTerminalFollowerTotal(currentFollowers.length + 3);
  await page.getByRole("button", { name: "Refresh follower lists" }).click();

  await expect(applicationStatus(page)).toHaveText("Follower lists updated.");
  await expect(applicationAlert(page)).toHaveCount(0);
  const followerPanel = activePanel(page, "Follower List");
  await expect(
    followerPanel.getByText("Retained Viewer", { exact: true })
  ).toBeVisible();
  await page.getByRole("tab", { name: "New followed List" }).click();
  await expect(
    activePanel(page, "New followed List").getByRole("button", {
      name: "Check done",
    })
  ).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY)).toBe(
    storedBeforeRefresh
  );
  await audit.assertClean();
});

test("an empty positive response remains fail-closed with a specific recovery message", async ({
  page,
}) => {
  const { audit, twitch } = await openAuthenticatedApp(page);
  const baselineBeforeFailure = await page.evaluate(
    (key) => localStorage.getItem(key),
    SNAPSHOT_KEY
  );

  twitch.returnNextEmptyPositiveFollowerPage(8);
  await page.getByRole("button", { name: "Refresh follower lists" }).click();

  const alert = applicationAlert(page);
  await expect(alert).toContainText(
    "Twitch returned a follower count without follower details."
  );
  await expect(alert).toContainText(
    "Showing the last successfully loaded follower lists."
  );
  await expect(
    activePanel(page, "Follower List").getByText("Retained Viewer", {
      exact: true,
    })
  ).toBeVisible();
  await page.getByRole("tab", { name: "New followed List" }).click();
  await expect(
    activePanel(page, "New followed List").getByRole("button", {
      name: "Check done",
    })
  ).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY)).toBe(
    baselineBeforeFailure
  );
  await audit.assertClean();
});
