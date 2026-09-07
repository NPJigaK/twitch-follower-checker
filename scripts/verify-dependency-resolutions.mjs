import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

function resolvedDependencyVersion(packageName, dependencyName) {
  const packageManifestPath = resolve(
    workspace,
    "node_modules",
    ...packageName.split("/"),
    "package.json",
  );
  const packageRequire = createRequire(packageManifestPath);
  const dependencyManifestPath = packageRequire.resolve(`${dependencyName}/package.json`);
  return JSON.parse(readFileSync(dependencyManifestPath, "utf8")).version;
}

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

const expectedReactIsVersion = packageManifest.dependencies?.react;
const muiReactIsResolutions = ["@mui/material", "@mui/utils"].map(
  (packageName) => [packageName, resolvedDependencyVersion(packageName, "react-is")],
);

if (
  typeof expectedReactIsVersion !== "string" ||
  packageManifest.resolutions?.["@mui/material/react-is"] !== expectedReactIsVersion ||
  packageManifest.resolutions?.["@mui/utils/react-is"] !== expectedReactIsVersion ||
  packageManifest.resolutions?.["react-is"] !== undefined ||
  muiReactIsResolutions.some(([, version]) => version !== expectedReactIsVersion)
) {
  console.error(
    "Expected MUI's react-is resolution to match the installed React version",
  );
  process.exit(1);
}

console.log(
  `Dependency resolutions verified: PostCSS ${expectedPostcssVersion}; MUI react-is ${expectedReactIsVersion}.`,
);
