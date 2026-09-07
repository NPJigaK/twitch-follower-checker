import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateDependencyPolicy,
  lockfileVersionsFor,
  verifyWorkspace,
} from "../scripts/verify-dependency-policy.mjs";

const issue = "https://github.com/NPJigaK/twitch-follower-checker/issues/227";
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fixture() {
  const manifest = {
    packageManager: "yarn@4.12.0",
    dependencies: {
      "@material-tailwind/react": "2.1.10",
      "@mui/icons-material": "5.18.0",
      "@mui/material": "5.18.0",
      "ag-grid-community": "31.0.3",
      "ag-grid-react": "31.0.3",
      next: "14.1.0",
      nextra: "3.0.0-alpha.12",
      "nextra-theme-docs": "3.0.0-alpha.8",
      react: "18.2.0",
      "react-dom": "18.2.0",
    },
    devDependencies: {
      "@types/node": "24.13.3",
      "@types/react": "18.2.42",
      "@types/react-dom": "18.2.19",
      autoprefixer: "10.5.5",
      "eslint-config-next": "14.0.3",
      postcss: "8.5.28",
      tailwindcss: "3.4.19",
    },
  };
  const policy = {
    schemaVersion: 1,
    packageManager: "yarn@4.12.0",
    requireExactDirectVersions: true,
    sameVersionGroups: [
      ["@mui/icons-material", "@mui/material"],
      ["ag-grid-community", "ag-grid-react"],
      ["nextra", "nextra-theme-docs"],
      ["react", "react-dom"],
    ],
    sameMajorGroups: [
      ["next", "eslint-config-next"],
      ["nextra", "nextra-theme-docs"],
      ["react", "@types/react"],
      ["react-dom", "@types/react-dom"],
    ],
    nodeTypesPackage: "@types/node",
    minimumVersions: {
      "@material-tailwind/react": "2.1.10",
      "@mui/icons-material": "5.18.0",
      "@mui/material": "5.18.0",
      "ag-grid-community": "31.3.4",
      "ag-grid-react": "31.3.4",
      autoprefixer: "10.5.5",
      next: "15.0.0",
      nextra: "3.3.1",
      "nextra-theme-docs": "3.3.1",
      postcss: "8.5.28",
      tailwindcss: "3.4.19",
    },
    singleResolutionPackages: [
      "@material-tailwind/react",
      "@mui/icons-material",
      "@mui/material",
      "ag-grid-community",
      "ag-grid-react",
      "autoprefixer",
      "next",
      "nextra",
      "nextra-theme-docs",
      "postcss",
      "react",
      "react-dom",
      "tailwindcss",
    ],
    temporaryExceptions: [
      {
        rule: "minimumVersion",
        package: "ag-grid-community",
        version: "31.0.3",
        issue,
        expiresOn: "2026-10-07",
      },
      {
        rule: "minimumVersion",
        package: "ag-grid-react",
        version: "31.0.3",
        issue,
        expiresOn: "2026-10-07",
      },
      {
        rule: "minimumVersion",
        package: "next",
        version: "14.1.0",
        issue,
        expiresOn: "2026-12-31",
      },
      ...["nextra", "nextra-theme-docs"].flatMap((packageName) => [
        {
          rule: "minimumVersion",
          package: packageName,
          version: manifest.dependencies[packageName],
          issue,
          expiresOn: "2026-12-31",
        },
        {
          rule: "prerelease",
          package: packageName,
          version: manifest.dependencies[packageName],
          issue,
          expiresOn: "2026-12-31",
        },
        {
          rule: "sameVersion",
          package: packageName,
          version: manifest.dependencies[packageName],
          issue,
          expiresOn: "2026-12-31",
        },
      ]),
    ],
  };
  const allDependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  const installedVersions = new Map(Object.entries(allDependencies));
  const lockfileVersions = new Map(
    policy.singleResolutionPackages.map((packageName) => [
      packageName,
      new Set([allDependencies[packageName]]),
    ]),
  );
  return {
    manifest,
    policy,
    nodeVersion: "24\n",
    installedVersions,
    lockfileVersions,
    today: "2026-09-07",
  };
}

function failuresFor(mutate) {
  const state = fixture();
  mutate?.(state);
  return evaluateDependencyPolicy(state);
}

test("accepts the reviewed dependency compatibility baseline", () => {
  assert.deepEqual(failuresFor(), []);
});

test("accepts the installed repository and real Yarn lockfile", () => {
  assert.deepEqual(verifyWorkspace(workspace), []);
});

test("rejects floating direct dependency versions", () => {
  const failures = failuresFor(({ manifest, installedVersions }) => {
    manifest.dependencies.react = "^18.2.0";
    installedVersions.set("react", "18.2.0");
  });
  assert(failures.some((failure) => failure.includes("must use an exact version")));
});

test("rejects malformed exact-looking semantic versions", () => {
  const failures = failuresFor(({ manifest, installedVersions }) => {
    manifest.dependencies.react = "018.2.0";
    installedVersions.set("react", "018.2.0");
  });
  assert(failures.some((failure) => failure.includes("must use an exact version")));
});

test("rejects mismatched coupled package versions", () => {
  const failures = failuresFor(({ manifest, installedVersions }) => {
    manifest.dependencies["ag-grid-react"] = "31.0.4";
    installedVersions.set("ag-grid-react", "31.0.4");
  });
  assert(failures.some((failure) => failure.includes("same version")));
});

test("rejects mismatched Material UI package versions", () => {
  const failures = failuresFor(({ manifest, installedVersions, lockfileVersions }) => {
    manifest.dependencies["@mui/icons-material"] = "5.17.0";
    installedVersions.set("@mui/icons-material", "5.17.0");
    lockfileVersions.set("@mui/icons-material", new Set(["5.17.0"]));
  });
  assert(failures.some((failure) => failure.includes("must use the same version")));
});

test("rejects an undeclared prerelease dependency", () => {
  const failures = failuresFor(({ manifest, installedVersions }) => {
    manifest.dependencies.react = "19.0.0-rc.1";
    manifest.dependencies["react-dom"] = "19.0.0-rc.1";
    manifest.devDependencies["@types/react"] = "19.0.0";
    manifest.devDependencies["@types/react-dom"] = "19.0.0";
    installedVersions.set("react", "19.0.0-rc.1");
    installedVersions.set("react-dom", "19.0.0-rc.1");
    installedVersions.set("@types/react", "19.0.0");
    installedVersions.set("@types/react-dom", "19.0.0");
  });
  assert(failures.some((failure) => failure.includes("is not covered")));
});

test("rejects expired temporary exceptions", () => {
  const state = fixture();
  state.today = "2027-01-01";
  const failures = evaluateDependencyPolicy(state);
  assert(failures.some((failure) => failure.includes("expired")));
});

test("rejects Node type definitions for a different Node major", () => {
  const failures = failuresFor(({ manifest, installedVersions }) => {
    manifest.devDependencies["@types/node"] = "20.11.17";
    installedVersions.set("@types/node", "20.11.17");
  });
  assert(failures.some((failure) => failure.includes("must match @types/node")));
});

test("rejects missing installed direct dependencies", () => {
  const failures = failuresFor(({ installedVersions }) => {
    installedVersions.delete("react");
  });
  assert(failures.some((failure) => failure.includes("metadata is missing")));
});

test("rejects multiple security-sensitive lockfile resolutions", () => {
  const failures = failuresFor(({ lockfileVersions }) => {
    lockfileVersions.get("ag-grid-community").add("30.0.0");
  });
  assert(failures.some((failure) => failure.includes("lockfile resolution")));
});

test("rejects a dependency below its minimum without an exception", () => {
  const failures = failuresFor(
    ({ manifest, installedVersions, lockfileVersions, policy }) => {
      manifest.devDependencies.postcss = "8.4.31";
      installedVersions.set("postcss", "8.4.31");
      lockfileVersions.set("postcss", new Set(["8.4.31"]));
      policy.temporaryExceptions = policy.temporaryExceptions.filter(
        (exception) => exception.package !== "postcss",
      );
    },
  );
  assert(failures.some((failure) => failure.includes("below the required minimum")));
});

test("rejects stale temporary exceptions after an upgrade", () => {
  const failures = failuresFor(
    ({ manifest, installedVersions, lockfileVersions }) => {
      manifest.dependencies.next = "15.0.0";
      manifest.devDependencies["eslint-config-next"] = "15.0.0";
      installedVersions.set("next", "15.0.0");
      installedVersions.set("eslint-config-next", "15.0.0");
      lockfileVersions.set("next", new Set(["15.0.0"]));
    },
  );
  assert(failures.some((failure) => failure.includes("is stale")));
});

test("rejects duplicate declarations across dependency sections", () => {
  const failures = failuresFor(({ manifest }) => {
    manifest.devDependencies.react = manifest.dependencies.react;
  });
  assert(failures.some((failure) => failure.includes("both dependency sections")));
});

test("rejects dependency sections that are outside the policy contract", () => {
  for (const section of ["optionalDependencies", "peerDependencies"]) {
    const failures = failuresFor(({ manifest }) => {
      manifest[section] = { example: "1.0.0-rc.1" };
    });
    assert(
      failures.some((failure) => failure.includes(`${section} is not supported`)),
    );
  }
});

test("rejects malformed exception calendar dates", () => {
  const failures = failuresFor(({ policy }) => {
    policy.temporaryExceptions[0].expiresOn = "2026-02-30";
  });
  assert(failures.some((failure) => failure.includes("malformed")));
});

test("parses exact scoped and unscoped Yarn lockfile resolutions", () => {
  const lockfile = [
    '  resolution: "react@npm:18.2.0"',
    '  resolution: "react@npm:19.2.0"',
    '  resolution: "@types/react@npm:18.2.42"',
  ].join("\n");
  const parsed = lockfileVersionsFor(lockfile, ["react", "@types/react"]);
  assert.deepEqual([...parsed.get("react")].sort(), ["18.2.0", "19.2.0"]);
  assert.deepEqual([...parsed.get("@types/react")], ["18.2.42"]);
});

test("fails closed for unsupported non-npm Yarn lockfile resolutions", () => {
  const parsed = lockfileVersionsFor(
    '  resolution: "react@patch:react@npm%3A18.2.0#./react.patch"',
    ["react"],
  );
  const state = fixture();
  state.lockfileVersions.set("react", parsed.get("react"));
  const failures = evaluateDependencyPolicy(state);
  assert(failures.some((failure) => failure.includes("lockfile resolution")));
});
