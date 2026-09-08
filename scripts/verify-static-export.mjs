import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { verifyNextraSearchIndexes } from "./normalize-nextra-search-index.mjs";

const outputDirectory = resolve(process.argv[2] ?? "out");
const locales = ["de", "en", "es", "fr", "ja", "ko", "pt", "ru"];
const siteOrigin = "https://twitch-follower-checker.devkey.jp";
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

function requireNonEmptyFile(relativePath) {
  const filePath = join(outputDirectory, relativePath);
  if (!existsSync(filePath) || !statSync(filePath).isFile() || statSync(filePath).size === 0) {
    failures.push(`Missing or empty artifact: ${relativePath}`);
  }
}

function normalizeRoutePath(pathname) {
  const decodedPath = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");
  if (!decodedPath) return "index.html";
  if (pathname.endsWith("/")) return `${decodedPath}/index.html`;
  if (extname(decodedPath)) return decodedPath;
  return decodedPath;
}

function resolvesInsideArtifact(pathname, artifactFiles) {
  const normalized = normalizeRoutePath(pathname);
  const candidates = extname(normalized)
    ? [normalized]
    : [normalized, `${normalized}.html`, `${normalized}/index.html`];
  return candidates.some((candidate) => artifactFiles.has(candidate));
}

function htmlDocumentPath(htmlFile) {
  if (htmlFile === "index.html") return "/";
  if (htmlFile.endsWith("/index.html")) {
    return `/${htmlFile.slice(0, -"index.html".length)}`;
  }
  return `/${htmlFile}`;
}

function xmlLocations(xml) {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  return [...withoutComments.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(
    (match) => match[1],
  );
}

if (!existsSync(outputDirectory) || !statSync(outputDirectory).isDirectory()) {
  console.error(`Static export directory does not exist: ${outputDirectory}`);
  process.exit(1);
}

const expectedHtmlFiles = [
  "404.html",
  "404/index.html",
  "index.html",
  "jp/index.html",
  "list/index.html",
  ...locales.flatMap((locale) => [
    `${locale}/index.html`,
    `${locale}/contribute/index.html`,
    `${locale}/how_to_use/index.html`,
  ]),
];

const requiredFiles = [
  ...expectedHtmlFiles,
  "favicon.ico",
  "nav-icon.svg",
  "og-image.jpg",
  "robots.txt",
  "sitemap-0.xml",
  "sitemap.xml",
];
requiredFiles.forEach(requireNonEmptyFile);

const artifactPaths = walk(outputDirectory);
const artifactFiles = new Set(
  artifactPaths.map((filePath) => toPosixPath(relative(outputDirectory, filePath))),
);
const htmlFiles = [...artifactFiles].filter((filePath) => filePath.endsWith(".html"));
const javascriptFiles = [...artifactFiles].filter((filePath) => filePath.endsWith(".js"));
const cssFiles = [...artifactFiles].filter((filePath) => filePath.endsWith(".css"));
const sourceMaps = [...artifactFiles].filter((filePath) => filePath.endsWith(".map"));

try {
  verifyNextraSearchIndexes(outputDirectory);
} catch (error) {
  failures.push(
    error instanceof Error
      ? error.message
      : "Nextra search-index verification failed",
  );
}

if (htmlFiles.length !== expectedHtmlFiles.length) {
  failures.push(
    `Expected ${expectedHtmlFiles.length} HTML files, found ${htmlFiles.length}`,
  );
}
if (javascriptFiles.length === 0) failures.push("No JavaScript assets were generated");
if (cssFiles.length === 0) failures.push("No CSS assets were generated");
if (sourceMaps.length > 0) failures.push("Unexpected browser source maps were generated");
for (const assetFile of [...javascriptFiles, ...cssFiles]) {
  if (statSync(join(outputDirectory, assetFile)).size === 0) {
    failures.push(`Empty browser asset: ${assetFile}`);
  }
}

for (const cssFile of cssFiles) {
  const css = readFileSync(join(outputDirectory, cssFile), "utf8");
  if (
    /(?:[A-Za-z]:\\|\/home\/runner\/work\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:^|\/)\.env(?:\.|\/|$))/i.test(
      css,
    )
  ) {
    failures.push(`Generated CSS contains a forbidden local-path or secret marker: ${cssFile}`);
  }
}

const hasBuildManifest = [...artifactFiles].some((filePath) =>
  /^_next\/static\/[^/]+\/_buildManifest\.js$/.test(filePath),
);
const hasSsgManifest = [...artifactFiles].some((filePath) =>
  /^_next\/static\/[^/]+\/_ssgManifest\.js$/.test(filePath),
);
if (!hasBuildManifest) failures.push("Next.js build manifest is missing");
if (!hasSsgManifest) failures.push("Next.js SSG manifest is missing");

const localReferencePattern = /(?:src|href)=["']([^"']+)["']/g;
for (const htmlFile of htmlFiles) {
  const html = readFileSync(join(outputDirectory, htmlFile), "utf8");
  const documentUrl = new URL(htmlDocumentPath(htmlFile), siteOrigin);
  for (const match of html.matchAll(localReferencePattern)) {
    const reference = match[1];
    let resolvedReference;
    try {
      resolvedReference = new URL(reference, documentUrl);
    } catch {
      failures.push(`Malformed URL reference in ${htmlFile}`);
      continue;
    }
    if (resolvedReference.origin !== siteOrigin) continue;
    if (!resolvesInsideArtifact(resolvedReference.pathname, artifactFiles)) {
      failures.push(`Broken local reference in ${htmlFile}: ${resolvedReference.pathname}`);
    }
  }
}

const sitemapIndexPath = join(outputDirectory, "sitemap.xml");
const sitemapPath = join(outputDirectory, "sitemap-0.xml");
if (existsSync(sitemapIndexPath) && existsSync(sitemapPath)) {
  const sitemapIndex = readFileSync(sitemapIndexPath, "utf8");
  const sitemapIndexLocations = xmlLocations(sitemapIndex);
  if (
    !/<sitemapindex(?:\s|>)/.test(sitemapIndex) ||
    sitemapIndexLocations.length !== 1 ||
    sitemapIndexLocations[0] !== `${siteOrigin}/sitemap-0.xml`
  ) {
    failures.push("Sitemap index does not reference sitemap-0.xml");
  }

  const sitemap = readFileSync(sitemapPath, "utf8");
  const locations = xmlLocations(sitemap);
  const expectedPaths = new Set([
    "/",
    ...locales.flatMap((locale) => [
      `/${locale}`,
      `/${locale}/contribute`,
      `/${locale}/how_to_use`,
    ]),
  ]);
  const actualPaths = new Set();
  for (const location of locations) {
    let parsedLocation;
    try {
      parsedLocation = new URL(location);
    } catch {
      failures.push("Sitemap contains an invalid URL");
      continue;
    }
    if (
      parsedLocation.origin !== siteOrigin ||
      parsedLocation.username ||
      parsedLocation.password ||
      parsedLocation.search ||
      parsedLocation.hash
    ) {
      failures.push("Sitemap URL is not a canonical URL on the configured origin");
    }
    const pathname = parsedLocation.pathname;
    actualPaths.add(pathname === "/" ? pathname : pathname.replace(/\/$/, ""));
  }

  if (locations.length !== expectedPaths.size) {
    failures.push(`Expected ${expectedPaths.size} sitemap URLs, found ${locations.length}`);
  }
  for (const expectedPath of expectedPaths) {
    if (!actualPaths.has(expectedPath)) failures.push(`Sitemap route missing: ${expectedPath}`);
  }
  for (const actualPath of actualPaths) {
    if (!expectedPaths.has(actualPath)) failures.push(`Unexpected sitemap route: ${actualPath}`);
  }
  if (actualPaths.has("/jp") || actualPaths.has("/list")) {
    failures.push("Redirect-only routes must not be included in the sitemap");
  }
}

const robotsPath = join(outputDirectory, "robots.txt");
if (existsSync(robotsPath)) {
  const robots = readFileSync(robotsPath, "utf8").replace(/\r\n/g, "\n").trimEnd();
  const expectedRobots = [
    "# *",
    "User-agent: *",
    "Allow: /",
    "",
    "# Host",
    `Host: ${siteOrigin}`,
    "",
    "# Sitemaps",
    `Sitemap: ${siteOrigin}/sitemap.xml`,
  ].join("\n");
  if (robots !== expectedRobots) {
    failures.push("robots.txt directives differ from the expected allow-all policy");
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Static artifact verified: ${htmlFiles.length} HTML, ${javascriptFiles.length} JavaScript, ` +
    `${cssFiles.length} CSS, ${1 + locales.length * 3} sitemap URLs.`,
);
