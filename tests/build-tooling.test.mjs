import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

const workspace = resolve(import.meta.dirname, "..");
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

test("dependency verifier confirms reviewed PostCSS and MUI React resolutions", () => {
  assert.doesNotThrow(() =>
    execFileSync(
      process.execPath,
      [join(workspace, "scripts", "verify-dependency-resolutions.mjs")],
      { cwd: workspace, stdio: "pipe" },
    ),
  );
});

test("artifact comparison normalizes build IDs, sitemap dates, and Nextra route order", () => {
  const baseline = createComparableExport("baseline", {
    buildId: "AAAAAAAAAAAAAAAAAAAAA",
    json: '{"/b":{"data":{"one":"1","two":"2"}},"/a":{"data":{"one":"1","two":"2"}}}',
    lastmod: "2026-09-07T00:00:00.000Z",
  });
  const candidate = createComparableExport("candidate", {
    buildId: "BBBBBBBBBBBBBBBBBBBBB",
    json: '{"/a":{"data":{"one":"1","two":"2"}},"/b":{"data":{"one":"1","two":"2"}}}',
    lastmod: "2026-09-07T00:01:00.000Z",
  });

  const result = compareExports([baseline, candidate]);
  assert.equal(result.status, 0, result.stderr);
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
