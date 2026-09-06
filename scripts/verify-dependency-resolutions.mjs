import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expectedPostcssVersion = "8.5.28";
const workspace = resolve(import.meta.dirname, "..");
const lockfile = readFileSync(resolve(workspace, "yarn.lock"), "utf8");
const packageManifest = JSON.parse(
  readFileSync(resolve(workspace, "package.json"), "utf8"),
);
const installedManifest = JSON.parse(
  readFileSync(resolve(workspace, "node_modules", "postcss", "package.json"), "utf8"),
);
const lockfileVersions = new Set();

try {
  for (const match of lockfile.matchAll(
    /^\s+resolution: "postcss@npm:([^"\\]+)"\s*$/gm,
  )) {
    lockfileVersions.add(match[1]);
  }
} catch {
  console.error("Unable to inspect the Yarn lockfile");
  process.exit(1);
}

if (
  packageManifest.devDependencies?.postcss !== expectedPostcssVersion ||
  packageManifest.resolutions?.postcss !== expectedPostcssVersion ||
  installedManifest.version !== expectedPostcssVersion ||
  lockfileVersions.size !== 1 ||
  !lockfileVersions.has(expectedPostcssVersion)
) {
  console.error(
    `Expected the manifest, install, and every lockfile resolution to use PostCSS ${expectedPostcssVersion}`,
  );
  process.exit(1);
}

console.log(`Dependency resolutions verified: PostCSS ${expectedPostcssVersion}.`);
