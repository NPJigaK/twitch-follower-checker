import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const arguments_ = process.argv.slice(2);
const uiOnly = arguments_[0] === "--ui-only";
const directories = uiOnly ? arguments_.slice(1) : arguments_;

if (directories.length !== 2) {
  console.error(
    "Usage: node scripts/compare-static-exports.mjs [--ui-only] <baseline> <candidate>",
  );
  process.exit(1);
}

const [baselineDirectory, candidateDirectory] = directories.map((directory) =>
  resolve(directory),
);
const failures = [];

function toPosixPath(filePath) {
  return filePath.split(sep).join("/");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function filesFor(directory) {
  return walk(directory).map((filePath) => ({
    absolutePath: filePath,
    relativePath: toPosixPath(relative(directory, filePath)),
  }));
}

function buildIds(files) {
  return new Set(
    files
      .map(({ relativePath }) =>
        relativePath.match(/^_next\/static\/([^/]+)\/(?:_buildManifest|_ssgManifest)\.js$/),
      )
      .filter(Boolean)
      .map((match) => match[1]),
  );
}

function digestMap(files, predicate, transform = (value) => value) {
  return new Map(
    files.filter(predicate).map(({ absolutePath, relativePath }) => [
      relativePath,
      sha256(transform(readFileSync(absolutePath), relativePath)),
    ]),
  );
}

function canonicalStaticAsset(contents, relativePath) {
  if (!/^_next\/static\/chunks\/nextra-data-[^/]+\.json$/.test(relativePath)) {
    return contents;
  }

  const searchData = JSON.parse(contents.toString("utf8"));
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(searchData)
        .sort()
        .map((route) => [route, searchData[route]]),
    ),
  );
}

function nextraRouteOrder(files) {
  const searchFile = files.find(({ relativePath }) =>
    /^_next\/static\/chunks\/nextra-data-[^/]+\.json$/.test(relativePath),
  );
  if (!searchFile) return undefined;
  return Object.keys(JSON.parse(readFileSync(searchFile.absolutePath, "utf8")));
}

function compareMaps(label, baseline, candidate) {
  const paths = new Set([...baseline.keys(), ...candidate.keys()]);
  for (const path of [...paths].sort()) {
    if (!baseline.has(path)) failures.push(`${label} added: ${path}`);
    else if (!candidate.has(path)) failures.push(`${label} removed: ${path}`);
    else if (baseline.get(path) !== candidate.get(path)) failures.push(`${label} changed: ${path}`);
  }
}

for (const directory of [baselineDirectory, candidateDirectory]) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    console.error(`Static export directory does not exist: ${directory}`);
    process.exit(1);
  }
}

const baselineFiles = filesFor(baselineDirectory);
const candidateFiles = filesFor(candidateDirectory);
const baselineBuildIds = buildIds(baselineFiles);
const candidateBuildIds = buildIds(candidateFiles);

if (baselineBuildIds.size !== 1 || candidateBuildIds.size !== 1) {
  failures.push("Each static export must contain exactly one Next.js build ID");
}

function canonicalHtml(contents, ids) {
  let html = contents.toString("utf8");
  for (const id of ids) html = html.replaceAll(id, "<BUILD_ID>");
  return html;
}

compareMaps(
  "HTML",
  digestMap(
    baselineFiles,
    ({ relativePath }) => relativePath.endsWith(".html"),
    (contents) => canonicalHtml(contents, baselineBuildIds),
  ),
  digestMap(
    candidateFiles,
    ({ relativePath }) => relativePath.endsWith(".html"),
    (contents) => canonicalHtml(contents, candidateBuildIds),
  ),
);

const isStableStaticAsset = ({ relativePath }) =>
  relativePath.startsWith("_next/static/") &&
  !/(?:^|\/)(?:_buildManifest|_ssgManifest)\.js$/.test(relativePath);
compareMaps(
  "static asset",
  digestMap(baselineFiles, isStableStaticAsset, canonicalStaticAsset),
  digestMap(candidateFiles, isStableStaticAsset, canonicalStaticAsset),
);

function manifestDigests(directory, ids) {
  const digests = new Map();
  for (const id of ids) {
    for (const name of ["_buildManifest.js", "_ssgManifest.js"]) {
      const path = join(directory, "_next", "static", id, name);
      if (existsSync(path)) {
        const contents = readFileSync(path);
        digests.set(name, sha256(contents));
      }
    }
  }
  return digests;
}
compareMaps(
  "Next.js manifest",
  manifestDigests(baselineDirectory, baselineBuildIds),
  manifestDigests(candidateDirectory, candidateBuildIds),
);

const publicAssets = new Set(["favicon.ico", "nav-icon.svg", "og-image.jpg"]);
compareMaps(
  "public asset",
  digestMap(baselineFiles, ({ relativePath }) => publicAssets.has(relativePath)),
  digestMap(candidateFiles, ({ relativePath }) => publicAssets.has(relativePath)),
);

if (!uiOnly) {
  const canonicalSeo = (contents, relativePath) => {
    const text = contents.toString("utf8").replace(/\r\n/g, "\n");
    return relativePath.endsWith(".xml")
      ? text.replace(/<lastmod>[^<]+<\/lastmod>/g, "<lastmod><LASTMOD></lastmod>")
      : text;
  };
  const isSeoFile = ({ relativePath }) =>
    relativePath === "robots.txt" || /^sitemap(?:-\d+)?\.xml$/.test(relativePath);
  compareMaps(
    "SEO artifact",
    digestMap(baselineFiles, isSeoFile, canonicalSeo),
    digestMap(candidateFiles, isSeoFile, canonicalSeo),
  );
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const baselineNextraOrder = nextraRouteOrder(baselineFiles);
const candidateNextraOrder = nextraRouteOrder(candidateFiles);
if (
  baselineNextraOrder &&
  candidateNextraOrder &&
  baselineNextraOrder.join("\n") !== candidateNextraOrder.join("\n")
) {
  console.warn(
    "Nextra search route insertion order differs; per-route content and heading order still match.",
  );
}

console.log(
  `Static exports match${uiOnly ? " for UI-bearing artifacts" : " after known volatile values are normalized"}.`,
);
