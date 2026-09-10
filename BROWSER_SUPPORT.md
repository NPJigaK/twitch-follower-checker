# Browser, Device, and Assistive-Technology Policy

This application is intended to remain usable in mainstream browser environments on desktop computers, smartphones, and tablets. This policy defines what the repository tests automatically, what still requires native verification, and what evidence a browser-facing change must provide.

The phrase "all browsers" is not an unlimited promise for every historical browser, embedded web view, or operating-system version. Exact product support floors still require the native Phase B review tracked by [Issue #305](https://github.com/NPJigaK/twitch-follower-checker/issues/305).

## Current status

- **Phase A — automated:** the aggregate Playwright gate covers Chromium, Firefox, and WebKit desktop engines plus touch-capable phone and tablet emulations.
- **Phase B — native/manual:** not complete. No row in the native matrix below may be treated as verified until an actual environment, version, date, journey, and result are recorded.
- The automated gate changes no production UI. A defect exposed by the gate requires its own user-impact review and correction.

## Evidence vocabulary

Use these terms precisely in issues, pull requests, and release records:

- **Primary environment:** a real browser/OS/device combination the product intends to support.
- **Playwright engine:** the browser binary paired with the pinned Playwright release. Playwright Chromium is not branded Google Chrome or Microsoft Edge, its Firefox build is patched for automation, and Playwright WebKit is not Safari.
- **Emulated device:** a Playwright context that supplies a representative user agent, viewport, screen, device scale, mobile mode, and touch capability. It is not physical hardware or its native browser chrome.
- **Native assistive technology (AT):** an actual screen reader and browser running on its native operating system. axe-core, ARIA assertions, keyboard tests, and browser accessibility representations are complementary automation, not native-AT proof.

## Automated release matrix

`yarn test:e2e` is the aggregate release gate. It runs all configured projects; a Chromium-only result is insufficient for a browser-reaching change.

| Playwright project | Engine / emulation | Automated scope |
| --- | --- | --- |
| `chromium-desktop` | Playwright Chromium, 1280x900 default | Full non-touch E2E suite |
| `firefox-desktop` | Playwright patched Firefox, 1280x900 default | Full non-touch E2E suite |
| `webkit-desktop` | Playwright WebKit, 1280x900 default | Full non-touch E2E suite |
| `chromium-phone-emulated` | Pixel 7 descriptor | Touch-specific core journeys |
| `webkit-phone-emulated` | iPhone 15 descriptor | Touch-specific core journeys |
| `chromium-tablet-emulated` | Galaxy Tab S9 descriptor | Touch-specific core journeys and viewport rotation |
| `webkit-tablet-emulated` | iPad Pro 11 descriptor | Touch-specific core journeys and viewport rotation |

The full desktop suite explicitly exercises the following CSS-pixel viewport and theme pairs in each engine:

| Class | Viewport | Themes |
| --- | ---: | --- |
| Small phone | 320x700 | Light and dark |
| Phone | 390x844 | Light and dark |
| Large phone | 412x915 | Light and dark |
| Tablet portrait | 768x1024 | Light and dark |
| Tablet landscape | 1024x768 | Light and dark |
| Desktop | 1280x900 | Light and dark |
| Wide desktop | 1440x900 | Light and dark |

The emulated-device projects additionally use Playwright's pinned device descriptors, run their touch journeys in both light and dark modes, perform real Playwright `tap()` operations in a touch-enabled context, and swap the viewport dimensions to exercise a portrait/landscape layout transition. Firefox is not presented as a mobile emulation because Playwright does not support its `isMobile` option for Firefox.

### Automated journeys

The aggregate gate uses synthetic identities, tokens, followers, and Twitch responses only. It covers:

- the unauthenticated application root, light/dark presentation, control visibility, and page-level overflow;
- all current documentation locales (`en`, `de`, `es`, `fr`, `ja`, `ko`, `pt`, and `ru`) for localized navigation, breadcrumbs, pagination, and table-of-contents fragments, plus English desktop/mobile search;
- the legacy `/list/` return-to-tool route and the custom 404 route;
- a synthetic authenticated follower journey across Current, New followed, and Unfollowed lists;
- grid labels, filtering, pagination, profile-link attributes, Refresh Lists, loading, error, retry, Check Done, and baseline persistence;
- the #212 tab, focus, keyboard, inactive-panel, unique-ID/label, ARIA, and grid accessible-name contracts;
- light/dark touch navigation, touch search/filter, touch pagination, touch refresh/commit, control bounds, and state retention across an emulated orientation change;
- unexpected page, console, local-resource, HTTP, WebSocket, and unmocked external-network failures.

`/ja/` is the supported Japanese documentation tree. `/jp/` is a legacy client-side redirect to an external Japanese article and is not another documentation locale; the automated gate verifies both its local static artifact and its exact outbound destination without contacting the external site.

## Intended primary environments and evidence boundary

The following is the intended support surface. The automated column is a regression signal, not a native certification or an exact minimum-version promise.

| Intended primary environment | Current automated proxy | Native evidence |
| --- | --- | --- |
| Desktop Google Chrome / Microsoft Edge | Playwright Chromium | Not yet verified |
| Desktop Mozilla Firefox | Playwright Firefox | Not yet verified |
| macOS Safari | Playwright WebKit | Not yet verified |
| Android Chrome on a smartphone | Chromium Pixel emulation | Not yet verified |
| iOS Safari on an iPhone | WebKit iPhone emulation | Not yet verified |
| iPadOS Safari on an iPad | WebKit iPad emulation | Not yet verified |
| Android Chrome on a tablet | Chromium Galaxy Tab emulation | Not yet verified |

Embedded and in-app browsers are currently **best effort**, not a primary release-gate environment. When storage, OAuth navigation, or another required browser capability is unavailable, the recovery path is to open the site in a current standalone browser and authenticate there. A reproducible failure in an embedded browser should be triaged before any broader support claim is made.

The CSS compatibility targets in `postcss.config.js` are transpilation/fallback inputs, not the product's browser support promise. Dependency-specific browser floors are likewise constraints to review, not automatic product commitments. Phase B must reconcile those inputs and publish exact supported versions without silently widening or narrowing the user promise.

## Native and manual Phase B matrix

Every row is intentionally unverified. Do not fill a version, date, or result from emulation or automated accessibility output.

| Environment | Required representative journey | Status | Version / date / evidence |
| --- | --- | --- | --- |
| Windows NVDA + Firefox | Authentication, three follower lists, grid reading, refresh/error/recovery, Check Done | Not yet verified | — |
| Windows NVDA + Chrome, where available | Same critical journey | Not yet verified | — |
| macOS VoiceOver + Safari | Documentation and authenticated critical journey | Not yet verified | — |
| iPhone VoiceOver + iOS Safari | Touch-screen-reader critical journey, follower-grid/page scrolling, and rotation | Not yet verified | — |
| iPad VoiceOver + iPadOS Safari | Touch-screen-reader critical journey, follower-grid/page scrolling and navigation, and rotation | Not yet verified | — |
| Android TalkBack + Chrome | Touch-screen-reader critical journey, follower-grid/page scrolling, and rotation | Not yet verified | — |
| Desktop browser zoom at 200% | Core controls, reflow, focus, grid, errors, and retained state | Not yet verified | — |
| Applicable WCAG reflow scenario | Core flow at 320 CSS px / equivalent narrow layout | Not yet verified | — |

Native records must include the OS, browser, AT version, execution date, exact journey, and result. They must never contain credentials, access tokens, account names, follower identities, or other real user data.

## Pull-request release gate

A change is browser-reaching when it can alter emitted HTML, JavaScript, CSS, DOM, layout, focus, ARIA, keyboard or touch interaction, authentication UI, grids, search, navigation, or pagination.

- Browser-reaching changes run the aggregate `yarn test:e2e` matrix and record the result.
- Major browser-facing migrations, including #227, #235, and #236, also require exact-head artifact comparison and risk-appropriate native/manual checks. Missing native environments must be recorded as unavailable or not verified, never inferred from automation.
- A browser-unreachable build, type, or lockfile-only change may use an abbreviated browser gate only when an exact artifact comparison proves that browser output is unchanged.
- The required GitHub `build` check owns the aggregate Playwright invocation so a configured engine/device project cannot fail without failing the protected check.
- A new product defect should receive an independent issue only when it needs its own priority and lifecycle; otherwise record it in #305's matrix to avoid fragmented tracking.

Local reproduction starts from a fresh static export:

```sh
yarn install --immutable
yarn build
yarn playwright install chromium firefox webkit
yarn test:e2e
```

Run a single automation surface for diagnosis, not as aggregate release evidence:

```sh
yarn playwright test --project=webkit-desktop
yarn playwright test --project=webkit-phone-emulated
```

Concurrent local diagnostics must set `PLAYWRIGHT_TEST_PORT` to a different unused port for each command. The Playwright base URL and deterministic static server consume that value, and custom-port runs automatically isolate their `test-results-<port>` and `playwright-report-<port>` directories. Runs that omit the variable retain the CI-compatible `test-results` and `playwright-report` paths.

## Triage terms

Classify a failure before making a support statement:

- **Product regression:** the supported user journey is broken and requires a product fix.
- **Support-floor limitation:** the environment is below a documented, source-backed minimum.
- **Automation or emulator limitation:** the failure is specific to Playwright, its patched engine, or emulation and has been proven not to reproduce natively.
- **Native AT unverified:** no real screen-reader result exists; automation must not be substituted.
- **Environmental failure:** browser installation, CI runner, static server, or test artifact failed before exercising the product.

## Primary references

These contracts were reviewed on 2026-09-10 and must be rechecked when Playwright, the tested engines, or the support policy changes:

- [Playwright projects](https://playwright.dev/docs/test-projects)
- [Playwright browsers and browser-binary contracts](https://playwright.dev/docs/browsers)
- [Playwright device emulation](https://playwright.dev/docs/emulation)
- [Playwright touch input](https://playwright.dev/docs/api/class-touchscreen)
- [Playwright accessibility-testing limitations](https://playwright.dev/docs/accessibility-testing)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [WHATWG HTML `inert` contract](https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
