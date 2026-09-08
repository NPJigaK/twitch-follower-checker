import { readFileSync, realpathSync } from "node:fs";
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

const expectedReactRuntimeVersions = new Map([
  ["react", packageManifest.dependencies?.react],
  ["react-dom", packageManifest.dependencies?.["react-dom"]],
]);
const reviewedReactConsumers = [
  "@material-tailwind/react",
  "@mui/material",
  "ag-grid-react",
  "next",
  "nextra",
  "react-social-login-buttons",
];
const rootReactRuntimes = new Map(
  [...expectedReactRuntimeVersions].map(([dependencyName]) => {
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
const materialTailwindReactRuntimes = new Map(
  [...expectedReactRuntimeVersions].map(([dependencyName]) => [
    dependencyName,
    resolvedDependency("@material-tailwind/react", dependencyName),
  ]),
);
const consumerReactRuntimes = new Map(
  reviewedReactConsumers.map((packageName) => [
    packageName,
    new Map(
      [...expectedReactRuntimeVersions].map(([dependencyName]) => [
        dependencyName,
        resolvedDependency(packageName, dependencyName),
      ]),
    ),
  ]),
);

if (
  new Set(expectedReactRuntimeVersions.values()).size !== 1 ||
  [...expectedReactRuntimeVersions].some(([dependencyName, expectedVersion]) => {
    const rootRuntime = rootReactRuntimes.get(dependencyName);
    const materialTailwindRuntime =
      materialTailwindReactRuntimes.get(dependencyName);
    return (
      typeof expectedVersion !== "string" ||
      packageManifest.resolutions?.[
        `@material-tailwind/react/${dependencyName}`
      ] !== expectedVersion ||
      rootRuntime?.version !== expectedVersion ||
      materialTailwindRuntime?.version !== expectedVersion ||
      materialTailwindRuntime.manifestPath !== rootRuntime.manifestPath ||
      reviewedReactConsumers.some((packageName) => {
        const consumerRuntime = consumerReactRuntimes
          .get(packageName)
          ?.get(dependencyName);
        return (
          consumerRuntime?.version !== expectedVersion ||
          consumerRuntime?.manifestPath !== rootRuntime?.manifestPath
        );
      })
    );
  })
) {
  console.error(
    "Expected every reviewed browser dependency to resolve one shared React runtime",
  );
  process.exit(1);
}

console.log(
  `Dependency resolutions verified: PostCSS ${expectedPostcssVersion}; MUI react-is ${expectedReactIsVersion}; shared React runtime ${expectedReactIsVersion} across ${reviewedReactConsumers.length} consumers.`,
);
