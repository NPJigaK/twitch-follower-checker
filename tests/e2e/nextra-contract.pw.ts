import { expect, test, type Locator, type Page } from "@playwright/test";

const LOCAL_ORIGIN = "http://127.0.0.1:4173";

const localeDefinitions = {
  en: {
    language: "en-US",
    documentation: "Documentation",
    pages: {
      index: "Introduction",
      how_to_use: "How to Use",
      contribute: "Contribute",
    },
  },
  de: {
    language: "de-DE",
    documentation: "Dokumentation",
    pages: {
      index: "Einleitung",
      how_to_use: "Verwendung",
      contribute: "Beitragen",
    },
  },
  es: {
    language: "es-ES",
    documentation: "Documentación",
    pages: {
      index: "Introducción",
      how_to_use: "Cómo usar",
      contribute: "Contribuir",
    },
  },
  fr: {
    language: "fr-FR",
    documentation: "Documentation",
    pages: {
      index: "Introduction",
      how_to_use: "Comment utiliser",
      contribute: "Contribuer",
    },
  },
  ja: {
    language: "ja-JP",
    documentation: "ドキュメント",
    pages: {
      index: "はじめに",
      how_to_use: "使い方",
      contribute: "貢献",
    },
  },
  ko: {
    language: "ko-KR",
    documentation: "문서",
    pages: {
      index: "소개",
      how_to_use: "사용법",
      contribute: "기여하기",
    },
  },
  pt: {
    language: "pt-BR",
    documentation: "Documentação",
    pages: {
      index: "Introdução",
      how_to_use: "Como Usar",
      contribute: "Contribuir",
    },
  },
  ru: {
    language: "ru-RU",
    documentation: "Документация",
    pages: {
      index: "Введение",
      how_to_use: "Как использовать",
      contribute: "Вклад",
    },
  },
} as const;

type Locale = keyof typeof localeDefinitions;
type PageKey = keyof (typeof localeDefinitions)["en"]["pages"];

const locales = Object.keys(localeDefinitions) as Locale[];
const NO_RESULTS_QUERY = "\u2603\uFE0F\u2603\uFE0F";

const pageDefinitions: ReadonlyArray<{
  key: PageKey;
  path: string;
  tocCount: number;
  previous: PageKey | null;
  next: PageKey | null;
}> = [
  { key: "index", path: "", tocCount: 3, previous: null, next: "how_to_use" },
  {
    key: "how_to_use",
    path: "how_to_use/",
    tocCount: 11,
    previous: "index",
    next: "contribute",
  },
  {
    key: "contribute",
    path: "contribute/",
    tocCount: 1,
    previous: "how_to_use",
    next: null,
  },
];

const pageDefinition = (key: PageKey) =>
  pageDefinitions.find((definition) => definition.key === key) as (typeof pageDefinitions)[number];

const routeFor = (locale: Locale, key: PageKey): string => {
  const path = pageDefinition(key).path;
  return `/${locale}/${path}`;
};

const navigationEntries = async (locator: ReturnType<Page["locator"]>) =>
  locator.evaluateAll((elements) =>
    elements.map((element) => ({
      href: element.getAttribute("href"),
      text: element.textContent?.trim() ?? "",
    })),
  );

const escapeAttributeValue = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const decodeFragment = (href: string): string => {
  const fragment = href.startsWith("#")
    ? href.slice(1)
    : new URL(href, LOCAL_ORIGIN).hash.slice(1);
  return decodeURIComponent(fragment);
};

type BrowserGuard = Readonly<{
  assertClean: () => Promise<void>;
}>;

const installBrowserGuard = async (page: Page): Promise<BrowserGuard> => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const unexpectedExternalRequests: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.name);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("net::ERR_BLOCKED_BY_CLIENT") &&
      !message.text().includes("googletagmanager.com")
    ) {
      consoleErrors.push(message.text());
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === LOCAL_ORIGIN) {
      await route.continue();
      return;
    }
    // GTM is intentionally blocked in browser tests because it is globally
    // present in the current application shell and is not part of this
    // deterministic local contract.
    if (url.origin === "https://www.googletagmanager.com") {
      await route.abort("blockedbyclient");
      return;
    }
    unexpectedExternalRequests.push(`${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
  });

  return {
    assertClean: async () => {
      await page.waitForLoadState("networkidle");
      expect(pageErrors, "browser page errors").toEqual([]);
      expect(consoleErrors, "browser console errors").toEqual([]);
      expect(
        unexpectedExternalRequests,
        "unexpected external requests",
      ).toEqual([]);
    },
  };
};

const expectStaticRoute = async (page: Page, path: string): Promise<void> => {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await expect(page.locator("article main")).toBeVisible();
};

const expectInViewport = async (locator: Locator): Promise<void> => {
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        const viewport = locator.page().viewportSize();
        return Boolean(
          box &&
            viewport &&
            box.x < viewport.width &&
            box.x + box.width > 0 &&
            box.y < viewport.height &&
            box.y + box.height > 0,
        );
      },
      {
        message: "expected the element to intersect the browser viewport",
        timeout: 3_000,
      },
    )
    .toBe(true);
};

const openMobileMenu = async (page: Page): Promise<Locator> => {
  const menuButton = page.locator('button[aria-label="Menu"]:visible');
  await expect(menuButton).toHaveCount(1);
  await menuButton.click();
  const mobileMenu = page.locator(".nextra-menu-mobile");
  await expect(mobileMenu).toHaveCount(1);
  await expectInViewport(mobileMenu);
  return mobileMenu;
};

test.describe("Nextra 3.3.1 documentation contracts", () => {
  test("desktop localized sidebars, breadcrumbs, and same-locale pagination stay complete", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const guard = await installBrowserGuard(page);

    for (const locale of locales) {
      const definition = localeDefinitions[locale];
      await page.emulateMedia({ colorScheme: "light" });

      for (const pageInfo of pageDefinitions) {
        const path = routeFor(locale, pageInfo.key);
        await expectStaticRoute(page, path);
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          definition.language,
        );
        await expect(page.locator("html")).not.toHaveAttribute("translate");

        const navbar = page.locator(".nextra-nav-container nav");
        await expect(navbar).toHaveCount(1);
        await expect(
          navbar.locator('a[data-docs-link="primary"]'),
        ).toHaveCount(1);
        await expect(
          navbar.getByRole("button", { name: "lang(doc)", exact: true }),
        ).toHaveCount(1);
        await expect(
          navbar.locator(
            'a[href="https://github.com/NPJigaK/twitch-follower-checker"]',
          ),
        ).toHaveCount(1);
        for (const hiddenLocale of locales.filter(
          (candidate) => candidate !== "en",
        )) {
          await expect(
            navbar.locator(`a[href^="/${hiddenLocale}"]`),
          ).toHaveCount(0);
        }

        const sidebarLinks = page.locator(".nextra-menu-desktop > li > a");
        await expect(sidebarLinks).toHaveCount(3);
        expect(await navigationEntries(sidebarLinks)).toEqual([
          {
            href: `/${locale}/`,
            text: definition.pages.index,
          },
          {
            href: `/${locale}/how_to_use/`,
            text: definition.pages.how_to_use,
          },
          {
            href: `/${locale}/contribute/`,
            text: definition.pages.contribute,
          },
        ]);

        const breadcrumb = page.locator(".nextra-breadcrumb");
        await expect(breadcrumb).toHaveCount(1);
        expect(
          await breadcrumb.locator("[title]").evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("title")),
          ),
        ).toEqual([
          definition.documentation,
          definition.pages[pageInfo.key],
        ]);

        const documentationCrumb = breadcrumb.locator(
          `a[title="${escapeAttributeValue(definition.documentation)}"]`,
        );
        if (pageInfo.key === "index") {
          await expect(documentationCrumb).toHaveCount(0);
        } else {
          await expect(documentationCrumb).toHaveCount(1);
          await expect(documentationCrumb).toHaveAttribute(
            "href",
            `/${locale}/`,
          );
        }
        await expect(
          breadcrumb.locator(
            `span[title="${escapeAttributeValue(definition.pages[pageInfo.key])}"]`,
          ),
        ).toHaveCount(1);

        const expectedPager = [
          ...(pageInfo.previous === null
            ? []
            : [
                {
                  href: routeFor(locale, pageInfo.previous),
                  text: definition.pages[pageInfo.previous],
                },
              ]),
          ...(pageInfo.next === null
            ? []
            : [
                {
                  href: routeFor(locale, pageInfo.next),
                  text: definition.pages[pageInfo.next],
                },
              ]),
        ];
        // The breadcrumb's documentation link also has a title attribute and
        // shares the root href with the first page. Remove that known link
        // before asserting the pager contract.
        const titleLinks = await navigationEntries(
          page.locator("article main a[title]"),
        );
        const pagerEntries = titleLinks.filter(
          (entry) =>
            !(
              entry.href === `/${locale}/` &&
              entry.text === definition.documentation
            ),
        );
        expect(pagerEntries).toEqual(expectedPager);
      }
    }

    await guard.assertClean();
  });

  test("TOC links target unique headings and Unicode fragments remain navigable", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const guard = await installBrowserGuard(page);

    for (const locale of locales) {
      for (const pageInfo of pageDefinitions) {
        const path = routeFor(locale, pageInfo.key);
        await expectStaticRoute(page, path);

        const tocLinks = page.locator('.nextra-toc a[href^="#"]');
        await expect(tocLinks).toHaveCount(pageInfo.tocCount);
        const tocHrefs = await tocLinks.evaluateAll((elements) =>
          elements
            .map((element) => element.getAttribute("href"))
            .filter((href): href is string => href !== null),
        );
        expect(tocHrefs).toHaveLength(pageInfo.tocCount);
        expect(tocHrefs.every((href) => href.startsWith("#"))).toBe(true);

        const headingIds = await page
          .locator("article main h2[id], article main h3[id]")
          .evaluateAll((elements) =>
            elements
              .map((element) => element.getAttribute("id"))
              .filter((id): id is string => id !== null),
          );
        expect(new Set(headingIds).size).toBe(headingIds.length);
        expect(headingIds).toHaveLength(pageInfo.tocCount);
        for (const href of tocHrefs) {
          expect(headingIds).toContain(decodeFragment(href));
        }

        if (pageInfo.key === "how_to_use") {
          const links = await tocLinks.all();
          for (const link of [links[0], links[links.length - 1]]) {
            const href = await link.getAttribute("href");
            expect(href).not.toBeNull();
            await link.click();
            expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(
              decodeFragment(href as string),
            );
            await expect(
              page.locator(
                `article main [id="${escapeAttributeValue(decodeFragment(href as string))}"]`,
              ),
            ).toHaveCount(1);
          }
        }
      }
    }

    await guard.assertClean();
  });

  test("mobile navigation exposes only the current locale without narrow-screen overflow", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const guard = await installBrowserGuard(page);

    for (const locale of locales) {
      await page.emulateMedia({
        colorScheme: locale === "en" || locale === "ja" ? "dark" : "light",
      });
      await expectStaticRoute(page, routeFor(locale, "how_to_use"));
      if (locale === "en" || locale === "ja") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      }

      const mobileMenu = await openMobileMenu(page);

      const currentFolder = mobileMenu.locator(
        `li:has(> button[data-href="/${locale}"])`,
      );
      await expect(currentFolder).toHaveCount(1);
      await expect(currentFolder).toBeVisible();
      for (const pageInfo of pageDefinitions) {
        const currentPageLink = currentFolder.locator(
          `a[href="${routeFor(locale, pageInfo.key)}"]:visible`,
        );
        await expect(currentPageLink).toHaveCount(1);
        await expectInViewport(currentPageLink);
      }

      for (const otherLocale of locales.filter((candidate) => candidate !== locale)) {
        const otherFolder = mobileMenu.locator(
          `li:has(> button[data-href="/${otherLocale}"])`,
        );
        await expect(otherFolder).toHaveCount(1);
        await expect(otherFolder).toBeHidden();
      }

      const horizontalOverflow = await page.evaluate(() =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth,
        ) - document.documentElement.clientWidth,
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ colorScheme: "dark" });
    await expectStaticRoute(page, routeFor("en", "how_to_use"));
    await openMobileMenu(page);
    const narrowOverflow = await page.evaluate(() =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
        document.documentElement.clientWidth,
    );
    expect(narrowOverflow).toBeLessThanOrEqual(1);

    await guard.assertClean();
  });

  test("client-side locale changes keep document language and mobile navigation synchronized", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const guard = await installBrowserGuard(page);
    await expectStaticRoute(page, routeFor("ja", "how_to_use"));
    await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");

    const mobileMenu = await openMobileMenu(page);
    await mobileMenu.getByRole("link", { name: "Deutsch", exact: true }).click();
    await page.waitForURL(`${LOCAL_ORIGIN}/de/`);

    await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
    await expect(page.locator("html")).not.toHaveAttribute("translate");
    await openMobileMenu(page);
    await expect(
      mobileMenu.locator('li:has(> button[data-href="/de"])'),
    ).toBeVisible();
    await expect(
      mobileMenu.locator('li:has(> button[data-href="/ja"])'),
    ).toBeHidden();

    await guard.assertClean();
  });

  test("desktop Combobox search supports listbox navigation, Escape, and no results", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const guard = await installBrowserGuard(page);
    await expectStaticRoute(page, "/en/how_to_use/");

    const searchInput = page.locator('input[role="combobox"]:visible');
    await expect(searchInput).toHaveCount(1);
    await expect(searchInput).toHaveAttribute("aria-autocomplete", "list");
    await expect(searchInput).toHaveAttribute("aria-expanded", "false");

    const searchIndexResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === LOCAL_ORIGIN &&
        url.pathname === "/_next/static/chunks/nextra-data-en-US.json" &&
        response.status() === 200
      );
    });
    await searchInput.click();
    await searchIndexResponse;
    await searchInput.fill("follower");
    const results = page.locator(".nextra-search-results:visible");
    await expect(results).toBeVisible();
    await expect(searchInput).toHaveAttribute("aria-expanded", "true");
    const options = results.getByRole("option");
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);
    const firstOption = options.first();
    const firstHref = await firstOption.getAttribute("href");
    expect(firstHref).toMatch(/^\/[a-z]{2}(?:\/|#)/);

    await searchInput.press("ArrowDown");
    const activeDescendant = await searchInput.getAttribute(
      "aria-activedescendant",
    );
    expect(activeDescendant).not.toBeNull();
    await expect(
      page.locator(
        `[role="option"][id="${escapeAttributeValue(activeDescendant as string)}"]`,
      ),
    ).toBeVisible();

    await searchInput.press("Escape");
    await expect(searchInput).toHaveAttribute("aria-expanded", "false");
    await expect(results).toBeHidden();

    // Re-focus after Escape and use real key events so Headless UI reopens the
    // combobox and FlexSearch receives the changed query.
    await searchInput.click();
    await searchInput.fill("");
    await searchInput.pressSequentially(NO_RESULTS_QUERY);
    await expect(results).toBeVisible();
    await expect(results.getByText("No results found.", { exact: true })).toBeVisible();
    await expect(options).toHaveCount(0);

    await searchInput.click();
    await searchInput.fill("");
    await searchInput.pressSequentially("follower");
    await expect(options).not.toHaveCount(0);
    const secondHref = await options.nth(1).getAttribute("href");
    expect(secondHref).not.toBeNull();
    await searchInput.press("ArrowDown");
    await searchInput.press("Enter");
    const selectedUrl = new URL(secondHref as string, LOCAL_ORIGIN);
    await page.waitForURL(
      (url) =>
        url.origin === selectedUrl.origin &&
        url.pathname === selectedUrl.pathname &&
        decodeURIComponent(url.hash) === decodeURIComponent(selectedUrl.hash),
    );
    expect(new URL(page.url()).pathname).toBe(selectedUrl.pathname);
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(
      decodeURIComponent(selectedUrl.hash),
    );

    await guard.assertClean();
  });

  test("mobile Combobox keeps the same listbox and Escape semantics", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const guard = await installBrowserGuard(page);
    await expectStaticRoute(page, "/en/how_to_use/");

    await openMobileMenu(page);
    const searchInput = page.locator('input[role="combobox"]:visible');
    await expect(searchInput).toHaveCount(1);
    const searchIndexResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === LOCAL_ORIGIN &&
        url.pathname === "/_next/static/chunks/nextra-data-en-US.json" &&
        response.status() === 200
      );
    });
    await searchInput.click();
    await searchIndexResponse;
    await searchInput.fill("follower");
    const results = page.locator(".nextra-search-results:visible");
    await expect(results).toBeVisible();
    await expect(searchInput).toHaveAttribute("aria-expanded", "true");
    await expect(results.getByRole("option")).not.toHaveCount(0);
    await searchInput.press("Escape");
    await expect(searchInput).toHaveAttribute("aria-expanded", "false");
    await expect(results).toBeHidden();
    await guard.assertClean();
  });
});
