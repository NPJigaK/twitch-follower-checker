import assert from "node:assert/strict";
import { test } from "node:test";
import { sharedReactRuntimeFailures } from "../scripts/shared-react-runtime-policy.mjs";

const version = "18.3.1";
const materialTailwind = "@material-tailwind/react";

function fixture() {
  return {
    manifest: {
      dependencies: { react: version, "react-dom": version },
      resolutions: {
        [`${materialTailwind}/react`]: version,
        [`${materialTailwind}/react-dom`]: version,
      },
    },
    rootRuntimes: new Map([
      ["react", { version, manifestPath: "/root/react/package.json" }],
      ["react-dom", { version, manifestPath: "/root/react-dom/package.json" }],
    ]),
    consumerRuntimes: new Map([
      [
        materialTailwind,
        new Map([
          ["react", { version, manifestPath: "/root/react/package.json" }],
          [
            "react-dom",
            { version, manifestPath: "/root/react-dom/package.json" },
          ],
        ]),
      ],
      [
        "another-browser-consumer",
        new Map([
          ["react", { version, manifestPath: "/root/react/package.json" }],
          [
            "react-dom",
            { version, manifestPath: "/root/react-dom/package.json" },
          ],
        ]),
      ],
    ]),
    scopedConsumer: materialTailwind,
  };
}

function failuresFor(mutate) {
  const state = fixture();
  mutate?.(state);
  return sharedReactRuntimeFailures(state);
}

test("accepts one scoped and physically shared React runtime", () => {
  assert.deepEqual(failuresFor(), []);
});

test("rejects a missing scoped Material Tailwind resolution", () => {
  const failures = failuresFor(({ manifest }) => {
    delete manifest.resolutions[`${materialTailwind}/react`];
  });
  assert(failures.some((failure) => failure.includes("must match")));
});

test("rejects a mismatched scoped Material Tailwind version", () => {
  const failures = failuresFor(({ manifest }) => {
    manifest.resolutions[`${materialTailwind}/react-dom`] = "18.2.0";
  });
  assert(failures.some((failure) => failure.includes("must match")));
});

test("rejects an unscoped React override", () => {
  const failures = failuresFor(({ manifest }) => {
    manifest.resolutions.react = version;
  });
  assert(failures.some((failure) => failure.includes("unscoped resolution")));
});

test("rejects a consumer on another React version", () => {
  const failures = failuresFor(({ consumerRuntimes }) => {
    consumerRuntimes.get(materialTailwind).get("react").version = "18.2.0";
  });
  assert(failures.some((failure) => failure.includes("outside the application")));
});

test("rejects a second physical React runtime at the same version", () => {
  const failures = failuresFor(({ consumerRuntimes }) => {
    consumerRuntimes.get(materialTailwind).get("react").manifestPath =
      "/nested/react/package.json";
  });
  assert(failures.some((failure) => failure.includes("different physical")));
});

test("rejects mismatched React and React DOM application versions", () => {
  const failures = failuresFor(({ manifest }) => {
    manifest.dependencies["react-dom"] = "18.2.0";
  });
  assert(failures.some((failure) => failure.includes("matching runtime")));
});
