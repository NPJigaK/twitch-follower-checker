import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { sharedReactRuntimeFailures } from "./shared-react-runtime-policy.mjs";

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

function resolvedDependency(packageName, dependencyName) {
  const packageManifestPath = resolve(
    workspace,
    "node_modules",
    ...packageName.split("/"),
    "package.json",
  );
  const packageRequire = createRequire(packageManifestPath);
  const dependencyManifestPath = realpathSync(
    packageRequire.resolve(`${dependencyName}/package.json`),
  );
  return {
    manifestPath: dependencyManifestPath,
    version: JSON.parse(readFileSync(dependencyManifestPath, "utf8")).version,
  };
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
  (packageName) => [packageName, resolvedDependency(packageName, "react-is").version],
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

const reactRuntimePackages = ["react", "react-dom"];
const reviewedReactConsumers = [
  "@material-tailwind/react",
  "@mui/material",
  "ag-grid-react",
  "next",
  "nextra",
  "react-social-login-buttons",
];
const rootReactRuntimes = new Map(
  reactRuntimePackages.map((dependencyName) => {
    const manifestPath = realpathSync(
      resolve(workspace, "node_modules", dependencyName, "package.json"),
    );
    return [
      dependencyName,
      {
        manifestPath,
        version: JSON.parse(readFileSync(manifestPath, "utf8")).version,
      },
    ];
  }),
);
const consumerReactRuntimes = new Map(
  reviewedReactConsumers.map((packageName) => [
    packageName,
    new Map(
      reactRuntimePackages.map((dependencyName) => [
        dependencyName,
        resolvedDependency(packageName, dependencyName),
      ]),
    ),
  ]),
);

const reactRuntimeFailures = sharedReactRuntimeFailures({
  manifest: packageManifest,
  rootRuntimes: rootReactRuntimes,
  consumerRuntimes: consumerReactRuntimes,
  scopedConsumer: "@material-tailwind/react",
});
if (reactRuntimeFailures.length > 0) {
  reactRuntimeFailures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Dependency resolutions verified: PostCSS ${expectedPostcssVersion}; MUI react-is ${expectedReactIsVersion}; shared React runtime ${expectedReactIsVersion} across ${reviewedReactConsumers.length} consumers.`,
);
