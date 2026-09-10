import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { after, test } from "node:test";
import {
  normalizeNextraSearchIndexes,
  orderNextraSearchData,
  verifyNextraSearchIndexes,
} from "../scripts/normalize-nextra-search-index.mjs";

const workspace = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const autoprefixer = require("autoprefixer");
const postcss = require("postcss");
const postcssConfig = require("../postcss.config.js");
const { getSupportedBrowsers } = require("next/dist/build/utils");
const packageManifest = JSON.parse(
  readFileSync(join(workspace, "package.json"), "utf8"),
);
const yarnConfiguration = readFileSync(
  join(workspace, ".yarnrc.yml"),
  "utf8",
).replaceAll("\r\n", "\n");
const playwrightConfiguration = readFileSync(
  join(workspace, "playwright.config.ts"),
  "utf8",
).replaceAll("\r\n", "\n");
const pagesWorkflow = readFileSync(
  join(workspace, ".github", "workflows", "nextjs.yml"),
  "utf8",
).replaceAll("\r\n", "\n");
const browserSupportPolicy = readFileSync(
  join(workspace, "BROWSER_SUPPORT.md"),
  "utf8",
).replaceAll("\r\n", "\n");
const temporaryRoot = mkdtempSync(join(tmpdir(), "tfc-build-tooling-"));
const resolvedTemporaryRoot = resolve(temporaryRoot);
const resolvedSystemTemporaryDirectory = `${resolve(tmpdir())}${sep}`;

if (!`${resolvedTemporaryRoot}${sep}`.startsWith(resolvedSystemTemporaryDirectory)) {
  throw new Error("Refusing to create test fixtures outside the system temporary directory");
}

after(() => rmSync(resolvedTemporaryRoot, { force: true, recursive: true }));

function writeFixtureFile(root, relativePath, contents) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function createComparableExport(
  name,
  { assetHash = "0123456789abcdef", buildId, css = "body{}", lastmod, json },
) {
  const root = join(resolvedTemporaryRoot, name);
  writeFixtureFile(
    root,
    "index.html",
    `<link href="/_next/static/css/site-${assetHash}.css"><script src="/_next/static/${buildId}/_buildManifest.js"></script><script id="__NEXT_DATA__" type="application/json">{"buildId":"${buildId}"}</script>`,
  );
  writeFixtureFile(root, `_next/static/css/site-${assetHash}.css`, css);
  writeFixtureFile(root, "_next/static/chunks/nextra-data-en-US.json", json);
  writeFixtureFile(
    root,
    `_next/static/${buildId}/_buildManifest.js`,
    `self.__BUILD_MANIFEST={"css":["static/css/site-${assetHash}.css"]}`,
  );
  writeFixtureFile(root, `_next/static/${buildId}/_ssgManifest.js`, "self.__SSG_MANIFEST=new Set");
  writeFixtureFile(root, "favicon.ico", "icon");
  writeFixtureFile(root, "nav-icon.svg", "<svg/>");
  writeFixtureFile(root, "og-image.jpg", "image");
  writeFixtureFile(
    root,
    "sitemap.xml",
    "<sitemapindex><sitemap><loc>https://example.test/sitemap-0.xml</loc></sitemap></sitemapindex>",
  );
  writeFixtureFile(
    root,
    "sitemap-0.xml",
    `<urlset><url><loc>https://example.test/</loc><lastmod>${lastmod}</lastmod></url></urlset>`,
  );
  writeFixtureFile(root, "robots.txt", "User-agent: *\nAllow: /\n");
  return root;
}

function compareExports(arguments_) {
  return spawnSync(
    process.execPath,
    [join(workspace, "scripts", "compare-static-exports.mjs"), ...arguments_],
    { encoding: "utf8" },
  );
}

function createSearchIndexFixture(name, json, routes = ["/a", "/b"]) {
  const root = join(resolvedTemporaryRoot, name);
  const output = join(root, "out");
  const contract = join(root, "contract.json");
  writeFixtureFile(
    output,
    "_next/static/chunks/nextra-data-en-US.json",
    json,
  );
  writeFixtureFile(
    root,
    "contract.json",
    JSON.stringify({
      schemaVersion: 1,
      routeOrderSha256: {
        "nextra-data-en-US.json": createHash("sha256")
          .update(routes.join("\n"))
          .digest("hex"),
      },
      indexes: { "nextra-data-en-US.json": routes },
    }),
  );
  return { contract, output };
}

test("Autoprefixer compatibility targets do not override Next.js browser targets", () => {
  assert.equal(packageManifest.browserslist, undefined);
  assert.deepEqual(getSupportedBrowsers(workspace, false), [
    "chrome 64",
    "edge 79",
    "firefox 67",
    "opera 51",
    "safari 12",
  ]);
  assert.deepEqual(postcssConfig.plugins.autoprefixer.overrideBrowserslist, [
    "defaults",
    "Chrome >= 109",
    "Edge >= 120",
    "Firefox >= 115",
    "Safari >= 16.6",
    "iOS >= 15.6",
    "Opera >= 105",
    "Samsung >= 22",
  ]);
});

test("Autoprefixer emits the reviewed legacy WebKit UI fallbacks", async () => {
  const result = await postcss([
    autoprefixer(postcssConfig.plugins.autoprefixer),
  ]).process(
    ".compatibility-probe{backdrop-filter:blur(1px);hyphens:auto}",
    { from: undefined },
  );

  assert.match(result.css, /-webkit-backdrop-filter:blur\(1px\)/);
  assert.match(result.css, /-webkit-hyphens:auto/);
});

test("the protected build keeps the aggregate cross-browser and device gate", () => {
  const projectBlocks = new Map(
    [...playwrightConfiguration.matchAll(
      /    \{\n      name: "([^"]+)",([\s\S]*?)\n    \},/g,
    )].map((match) => [match[1], match[2]]),
  );
  const expectedProjects = [
    ["chromium-desktop", 'devices["Desktop Chrome"]', "grepInvert: /@touch/"],
    ["firefox-desktop", 'devices["Desktop Firefox"]', "grepInvert: /@touch/"],
    ["webkit-desktop", 'devices["Desktop Safari"]', "grepInvert: /@touch/"],
    ["chromium-phone-emulated", 'devices["Pixel 7"]', "grep: /@touch/"],
    ["webkit-phone-emulated", 'devices["iPhone 15"]', "grep: /@touch/"],
    ["chromium-tablet-emulated", 'devices["Galaxy Tab S9"]', "grep: /@touch/"],
    ["webkit-tablet-emulated", 'devices["iPad Pro 11"]', "grep: /@touch/"],
  ];
  assert.equal(projectBlocks.size, expectedProjects.length);
  for (const [project, descriptor, selector] of expectedProjects) {
    const projectBlock = projectBlocks.get(project);
    assert.ok(projectBlock, `${project} must remain configured`);
    assert.ok(
      projectBlock.includes(descriptor),
      `${project} must use ${descriptor}`,
    );
    assert.ok(
      projectBlock.includes(selector),
      `${project} must retain its touch-suite partition`,
    );
  }

  const buildJob = pagesWorkflow.match(
    /\n  build:\n[\s\S]*?(?=\n  [A-Za-z0-9_-]+:\n|$)/,
  )?.[0];
  assert.ok(buildJob, "the protected build job must remain present");
  assert.match(
    buildJob,
    /yarn playwright install --with-deps chromium firefox webkit/,
  );
  assert.match(
    buildJob,
    /name: Run cross-browser and emulated-device regression tests\n\s+run: yarn test:e2e/,
  );

  const playwrightList = execFileSync(
    process.execPath,
    [require.resolve("@playwright/test/cli"), "test", "--list"],
    {
      cwd: workspace,
      encoding: "utf8",
      env: { ...process.env, PLAYWRIGHT_TEST_PORT: "4211" },
    },
  ).replaceAll("\r\n", "\n");
  assert.match(playwrightList, /Total: 73 tests in 2 files/);
  for (const [project] of expectedProjects) {
    const listedCount = playwrightList
      .split("\n")
      .filter((line) => line.includes(`[${project}]`)).length;
    assert.equal(
      listedCount,
      project.endsWith("-desktop") ? 19 : 4,
      `${project} must retain its expected aggregate assignments`,
    );
  }

  const phaseBSection = browserSupportPolicy.match(
    /## Native and manual Phase B matrix[\s\S]*?(?=\n## Pull-request release gate)/,
  )?.[0];
  assert.ok(phaseBSection, "the native Phase B matrix must remain present");
  const phaseBRows = phaseBSection
    .split("\n")
    .filter((line) => /^\| .+ \| .+ \| Not yet verified \| — \|$/.test(line));
  assert.equal(phaseBRows.length, 8);
  for (const environment of [
    "Windows NVDA + Firefox",
    "Windows NVDA + Chrome, where available",
    "macOS VoiceOver + Safari",
    "iPhone VoiceOver + iOS Safari",
    "iPad VoiceOver + iPadOS Safari",
    "Android TalkBack + Chrome",
    "Desktop browser zoom at 200%",
    "Applicable WCAG reflow scenario",
  ]) {
    assert.ok(
      phaseBRows.some((line) => line.startsWith(`| ${environment} |`)),
      `${environment} must remain explicitly unverified`,
    );
  }
});

test("dependency verifier confirms PostCSS, MUI, and shared React resolutions", () => {
  assert.doesNotThrow(() =>
    execFileSync(
      process.execPath,
      [join(workspace, "scripts", "verify-dependency-resolutions.mjs")],
      { cwd: workspace, stdio: "pipe" },
    ),
  );
});

test("Twoslash receives the repository's exact TypeScript provider", () => {
  const typescriptVersion = packageManifest.devDependencies.typescript;
  const twoslashEntry = require.resolve("@shikijs/twoslash");
  const twoslashManifest = JSON.parse(
    readFileSync(resolve(dirname(twoslashEntry), "..", "package.json"), "utf8"),
  );
  assert.equal(typeof typescriptVersion, "string");
  assert.equal(twoslashManifest.version, "1.29.2");
  assert.match(
    yarnConfiguration,
    new RegExp(
      `packageExtensions:\\n  "@shikijs/twoslash@1\\.29\\.2":\\n    dependencies:\\n      typescript: "${typescriptVersion.replaceAll(".", "\\.")}"(?:\\n|$)`,
    ),
  );
  const twoslashRequire = createRequire(
    resolve(dirname(twoslashEntry), "..", "package.json"),
  );
  assert.equal(
    twoslashRequire("typescript/package.json").version,
    typescriptVersion,
  );
  assert.equal(require("typescript/package.json").version, typescriptVersion);
});

test("artifact comparison normalizes build IDs and sitemap dates", () => {
  const baseline = createComparableExport("baseline", {
    buildId: "AAAAAAAAAAAAAAAAAAAAA",
    json: '{"/b":{"data":{"one":"1","two":"2"}},"/a":{"data":{"one":"1","two":"2"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("candidate", {
    buildId: "BBBBBBBBBBBBBBBBBBBBB",
    json: '{"/b":{"data":{"one":"1","two":"2"}},"/a":{"data":{"one":"1","two":"2"}}}',
    lastmod: "2026-09-07T00:01:00.000Z",
  });

  const result = compareExports([baseline, candidate]);
  assert.equal(result.status, 0, result.stderr);
});

test("artifact comparison rejects a changed Nextra route insertion order", () => {
  const baseline = createComparableExport("route-order-baseline", {
    buildId: "KKKKKKKKKKKKKKKKKKKKK",
    json: '{"/b":{"data":{"one":"1"}},"/a":{"data":{"one":"1"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("route-order-candidate", {
    buildId: "LLLLLLLLLLLLLLLLLLLLL",
    json: '{"/a":{"data":{"one":"1"}},"/b":{"data":{"one":"1"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });

  for (const arguments_ of [
    [baseline, candidate],
    ["--ui-only", baseline, candidate],
  ]) {
    const result = compareExports(arguments_);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /static asset (?:added|changed|removed)/);
  }
});

test("artifact comparison rejects a changed browser payload", () => {
  const baseline = createComparableExport("payload-baseline", {
    buildId: "CCCCCCCCCCCCCCCCCCCCC",
    css: "body{color:black}",
    json: '{"a":1}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("payload-candidate", {
    buildId: "DDDDDDDDDDDDDDDDDDDDD",
    css: "body{color:red}",
    json: '{"a":1}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });

  const result = compareExports([baseline, candidate]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /static asset (?:added|changed|removed)/);
});

test("UI-only comparison ignores SEO-only changes", () => {
  const baseline = createComparableExport("seo-baseline", {
    buildId: "EEEEEEEEEEEEEEEEEEEEE",
    json: '{"a":1}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("seo-candidate", {
    buildId: "FFFFFFFFFFFFFFFFFFFFF",
    json: '{"a":1}',
    lastmod: "2026-09-08T00:00:00.000Z",
  });
  writeFileSync(
    join(candidate, "robots.txt"),
    `${readFileSync(join(candidate, "robots.txt"), "utf8")}Sitemap: https://example.test/sitemap.xml\n`,
  );

  const result = compareExports(["--ui-only", baseline, candidate]);
  assert.equal(result.status, 0, result.stderr);
});

test("UI-only comparison rejects changed logical asset filenames", () => {
  const baseline = createComparableExport("asset-name-baseline", {
    assetHash: "1111111111111111",
    buildId: "IIIIIIIIIIIIIIIIIIIII",
    json: '{"/":{"data":{"first":"1"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("asset-name-candidate", {
    assetHash: "2222222222222222",
    buildId: "JJJJJJJJJJJJJJJJJJJJJ",
    json: '{"/":{"data":{"first":"1"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });

  const result = compareExports(["--ui-only", baseline, candidate]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /(?:HTML|Next\.js manifest|static asset) (?:added|changed|removed)/);
});

test("artifact comparison preserves Nextra heading insertion order", () => {
  const baseline = createComparableExport("heading-order-baseline", {
    buildId: "GGGGGGGGGGGGGGGGGGGGG",
    json: '{"/":{"data":{"first":"1","second":"2"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("heading-order-candidate", {
    buildId: "HHHHHHHHHHHHHHHHHHHHH",
    json: '{"/":{"data":{"second":"2","first":"1"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });

  const result = compareExports([baseline, candidate]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /static asset (?:added|changed|removed)/);
});

test("Nextra search ordering preserves route values and heading order", () => {
  const input = {
    "/b": {
      title: "B",
      data: { second: "line one\r\nline two", first: "one" },
    },
    "/a": {
      title: "A",
      data: { heading: "content" },
    },
  };

  const ordered = orderNextraSearchData(input, ["/a", "/b"], "fixture");
  assert.deepEqual(Object.keys(ordered), ["/a", "/b"]);
  assert.deepEqual(ordered["/a"], input["/a"]);
  assert.deepEqual(ordered["/b"], input["/b"]);
  assert.deepEqual(Object.keys(ordered["/b"].data), ["second", "first"]);
  assert.equal(ordered["/b"].data.second, "line one\r\nline two");
});

test("Nextra search-index normalization is deterministic and idempotent", () => {
  const fixture = createSearchIndexFixture(
    "search-normalization",
    JSON.stringify({
      "/b": { title: "B", data: { second: "two", first: "one" } },
      "/a": { title: "A", data: { heading: "content" } },
    }),
  );

  assert.deepEqual(
    normalizeNextraSearchIndexes(fixture.output, fixture.contract),
    ["nextra-data-en-US.json"],
  );
  assert.deepEqual(
    normalizeNextraSearchIndexes(fixture.output, fixture.contract),
    [],
  );
  assert.doesNotThrow(() =>
    verifyNextraSearchIndexes(fixture.output, fixture.contract),
  );

  const indexPath = join(
    fixture.output,
    "_next/static/chunks/nextra-data-en-US.json",
  );
  const parsed = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.deepEqual(Object.keys(parsed), ["/a", "/b"]);
  assert.deepEqual(Object.keys(parsed["/b"].data), ["second", "first"]);

  writeFileSync(
    indexPath,
    JSON.stringify({ "/b": parsed["/b"], "/a": parsed["/a"] }),
  );
  assert.throws(
    () => verifyNextraSearchIndexes(fixture.output, fixture.contract),
    /not in the canonical route order/,
  );
});

test("Nextra search-index normalization fails closed on invalid inputs", () => {
  const fixtures = [
    createSearchIndexFixture("search-non-object", "[]"),
    createSearchIndexFixture(
      "search-missing-route",
      JSON.stringify({
        "/a": { title: "A", data: { heading: "content" } },
      }),
    ),
    createSearchIndexFixture(
      "search-unexpected-route",
      JSON.stringify({
        "/a": { title: "A", data: { heading: "content" } },
        "/b": { title: "B", data: { heading: "content" } },
        "/c": { title: "C", data: { heading: "content" } },
      }),
    ),
    createSearchIndexFixture(
      "search-malformed-value",
      JSON.stringify({
        "/a": { title: "A", data: [] },
        "/b": { title: "B", data: { heading: "content" } },
      }),
    ),
    createSearchIndexFixture("search-invalid-json", "{not-json"),
  ];

  for (const fixture of fixtures) {
    const indexPath = join(
      fixture.output,
      "_next/static/chunks/nextra-data-en-US.json",
    );
    const original = readFileSync(indexPath, "utf8");
    assert.throws(() =>
      normalizeNextraSearchIndexes(fixture.output, fixture.contract),
    );
    assert.equal(readFileSync(indexPath, "utf8"), original);
  }
});

test("Nextra search-index normalization rejects index-file drift", () => {
  const missing = createSearchIndexFixture(
    "search-missing-index-file",
    JSON.stringify({
      "/a": { title: "A", data: { heading: "content" } },
      "/b": { title: "B", data: { heading: "content" } },
    }),
  );
  rmSync(
    join(
      missing.output,
      "_next/static/chunks/nextra-data-en-US.json",
    ),
  );
  assert.throws(
    () => normalizeNextraSearchIndexes(missing.output, missing.contract),
    /files differ from the canonical contract/,
  );

  const unexpected = createSearchIndexFixture(
    "search-unexpected-index-file",
    JSON.stringify({
      "/a": { title: "A", data: { heading: "content" } },
      "/b": { title: "B", data: { heading: "content" } },
    }),
  );
  writeFixtureFile(
    unexpected.output,
    "_next/static/chunks/nextra-data-fr-FR.json",
    "{}",
  );
  assert.throws(
    () => normalizeNextraSearchIndexes(unexpected.output, unexpected.contract),
    /files differ from the canonical contract/,
  );
});

test("Nextra search-index normalization rejects a contract checksum mismatch", () => {
  const fixture = createSearchIndexFixture(
    "search-checksum-mismatch",
    JSON.stringify({
      "/a": { title: "A", data: { heading: "content" } },
      "/b": { title: "B", data: { heading: "content" } },
    }),
  );
  writeFileSync(
    fixture.contract,
    JSON.stringify({
      schemaVersion: 1,
      routeOrderSha256: {
        "nextra-data-en-US.json": "0".repeat(64),
      },
      indexes: { "nextra-data-en-US.json": ["/a", "/b"] },
    }),
  );

  assert.throws(
    () => normalizeNextraSearchIndexes(fixture.output, fixture.contract),
    /route-order checksum does not match its contract/,
  );
});
