import { defineConfig, devices } from "@playwright/test";

const rawPort = process.env.PLAYWRIGHT_TEST_PORT ?? "4173";
const port = Number(rawPort);
if (!/^[1-9]\d{0,4}$/.test(rawPort) || port > 65_535) {
  throw new Error(
    "PLAYWRIGHT_TEST_PORT must be a canonical integer from 1 through 65535",
  );
}
const baseURL = `http://127.0.0.1:${port}`;
const localArtifactSuffix =
  process.env.PLAYWRIGHT_TEST_PORT === undefined ? "" : `-${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.ts",
  outputDir: `test-results${localArtifactSuffix}`,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["line"],
        [
          "html",
          {
            open: "never",
            outputFolder: `playwright-report${localArtifactSuffix}`,
          },
        ],
      ]
    : "list",
  expect: {
    timeout: 5_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      grepInvert: /@touch/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "firefox-desktop",
      grepInvert: /@touch/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "webkit-desktop",
      grepInvert: /@touch/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "chromium-phone-emulated",
      grep: /@touch/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "webkit-phone-emulated",
      grep: /@touch/,
      use: { ...devices["iPhone 15"] },
    },
    {
      name: "chromium-tablet-emulated",
      grep: /@touch/,
      use: { ...devices["Galaxy Tab S9"] },
    },
    {
      name: "webkit-tablet-emulated",
      grep: /@touch/,
      use: { ...devices["iPad Pro 11"] },
    },
  ],
  use: {
    baseURL,
    colorScheme: "light",
    locale: "en-US",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2e/static-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
