import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ISSUE_URL =
  /^https:\/\/github\.com\/NPJigaK\/twitch-follower-checker\/issues\/\d+$/;
const SUPPORTED_DEPENDENCY_SECTIONS = ["dependencies", "devDependencies"];
const UNSUPPORTED_DEPENDENCY_SECTIONS = [
  "optionalDependencies",
  "peerDependencies",
];

function dependencyVersions(manifest) {
  return Object.assign(
    {},
    ...SUPPORTED_DEPENDENCY_SECTIONS.map((section) => manifest[section] ?? {}),
  );
}

function parseExactVersion(value) {
  if (typeof value !== "string") return null;
  const match = value.match(EXACT_VERSION);
  if (!match) return null;
  const prerelease = match[4] ?? null;
  if (
    prerelease?.split(".").some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith("0"),
    )
  ) {
    return null;
  }
  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;

  const leftIdentifiers = left.prerelease.split(".");
  const rightIdentifiers = right.prerelease.split(".");
  const identifierCount = Math.max(
    leftIdentifiers.length,
    rightIdentifiers.length,
  );
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftIsNumeric = /^\d+$/.test(leftIdentifier);
    const rightIsNumeric = /^\d+$/.test(rightIdentifier);
    if (leftIsNumeric && rightIsNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }
    if (leftIsNumeric) return -1;
    if (rightIsNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function exceptionKey(rule, packageName, version) {
  return `${rule}\u0000${packageName}\u0000${version}`;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateExceptions(policy, today, failures) {
  const exceptions = new Map();
  for (const exception of policy.temporaryExceptions ?? []) {
    if (
      !exception ||
      !["minimumVersion", "prerelease", "sameVersion"].includes(
        exception.rule,
      ) ||
      typeof exception.package !== "string" ||
      parseExactVersion(exception.version) === null ||
      typeof exception.issue !== "string" ||
      !ISSUE_URL.test(exception.issue) ||
      !isIsoDate(exception.expiresOn)
    ) {
      failures.push("Dependency policy contains a malformed temporary exception");
      continue;
    }
    const key = exceptionKey(exception.rule, exception.package, exception.version);
    if (exceptions.has(key)) {
      failures.push(
        `Dependency policy contains a duplicate temporary exception for ${exception.package}`,
      );
      continue;
    }
    if (exception.expiresOn < today) {
      failures.push(
        `Temporary ${exception.rule} exception for ${exception.package}@${exception.version} expired on ${exception.expiresOn}`,
      );
      continue;
    }
    exceptions.set(key, { ...exception, used: false });
  }
  return exceptions;
}

function consumeException(exceptions, rule, packageName, version) {
  const entry = exceptions.get(exceptionKey(rule, packageName, version));
  if (!entry) return false;
  entry.used = true;
  return true;
}

export function evaluateDependencyPolicy({
  manifest,
  policy,
  nodeVersion,
  installedVersions,
  lockfileVersions,
  today = new Date().toISOString().slice(0, 10),
}) {
  const failures = [];
  const versions = dependencyVersions(manifest);
  const parsedVersions = new Map();
  const exceptions = validateExceptions(policy, today, failures);

  if (!isIsoDate(today)) {
    failures.push("Dependency policy evaluation date is invalid");
  }

  for (const section of UNSUPPORTED_DEPENDENCY_SECTIONS) {
    if (Object.keys(manifest[section] ?? {}).length > 0) {
      failures.push(
        `${section} is not supported by the dependency compatibility policy`,
      );
    }
  }

  const duplicateDirectDependencies = Object.keys(manifest.dependencies ?? {}).filter(
    (packageName) =>
      Object.prototype.hasOwnProperty.call(
        manifest.devDependencies ?? {},
        packageName,
      ),
  );
  for (const packageName of duplicateDirectDependencies) {
    failures.push(
      `Direct dependency ${packageName} must not be declared in both dependency sections`,
    );
  }

  if (policy.schemaVersion !== 1) {
    failures.push("Unsupported dependency policy schema version");
  }
  if (manifest.packageManager !== policy.packageManager) {
    failures.push(
      `Expected packageManager ${policy.packageManager}, found ${manifest.packageManager ?? "missing"}`,
    );
  }

  for (const [packageName, value] of Object.entries(versions)) {
    const parsed = parseExactVersion(value);
    if (policy.requireExactDirectVersions && parsed === null) {
      failures.push(
        `Direct dependency ${packageName} must use an exact version, found ${value}`,
      );
      continue;
    }
    if (parsed !== null) {
      parsedVersions.set(packageName, parsed);
      if (
        parsed.prerelease !== null &&
        !consumeException(exceptions, "prerelease", packageName, parsed.raw)
      ) {
        failures.push(
          `Prerelease dependency ${packageName}@${parsed.raw} is not covered by a current exception`,
        );
      }
    }
  }

  for (const group of policy.sameVersionGroups ?? []) {
    const groupVersions = group.map((packageName) => versions[packageName]);
    if (groupVersions.some((version) => version === undefined)) {
      failures.push(`Same-version group is missing a package: ${group.join(", ")}`);
    } else if (new Set(groupVersions).size !== 1) {
      const fullyExcepted = group.every((packageName) =>
        consumeException(
          exceptions,
          "sameVersion",
          packageName,
          versions[packageName],
        ),
      );
      if (!fullyExcepted) {
        failures.push(`Packages must use the same version: ${group.join(", ")}`);
      }
    }
  }

  for (const group of policy.sameMajorGroups ?? []) {
    const majors = group.map((packageName) => parsedVersions.get(packageName)?.major);
    if (majors.some((major) => major === undefined)) {
      failures.push(`Same-major group is missing a package: ${group.join(", ")}`);
    } else if (new Set(majors).size !== 1) {
      failures.push(`Packages must use the same major version: ${group.join(", ")}`);
    }
  }

  const parsedNodeVersion = String(nodeVersion).trim().match(/^(\d+)(?:\.\d+\.\d+)?$/);
  const nodeTypes = parsedVersions.get(policy.nodeTypesPackage);
  if (!parsedNodeVersion || !nodeTypes) {
    failures.push("Unable to compare .node-version with the Node type dependency");
  } else if (Number(parsedNodeVersion[1]) !== nodeTypes.major) {
    failures.push(
      `.node-version major ${parsedNodeVersion[1]} must match ${policy.nodeTypesPackage} major ${nodeTypes.major}`,
    );
  }

  for (const [packageName, minimumValue] of Object.entries(
    policy.minimumVersions ?? {},
  )) {
    const installed = parsedVersions.get(packageName);
    const minimum = parseExactVersion(minimumValue);
    if (!installed || !minimum) {
      failures.push(`Unable to evaluate the minimum version for ${packageName}`);
    } else if (
      compareVersions(installed, minimum) < 0 &&
      !consumeException(exceptions, "minimumVersion", packageName, installed.raw)
    ) {
      failures.push(
        `${packageName}@${installed.raw} is below the required minimum ${minimum.raw}`,
      );
    }
  }

  for (const [packageName, declaredVersion] of Object.entries(versions)) {
    const installedVersion = installedVersions.get(packageName);
    if (installedVersion === undefined) {
      failures.push(`Installed metadata is missing for direct dependency ${packageName}`);
    } else if (installedVersion !== declaredVersion) {
      failures.push(
        `Installed ${packageName}@${installedVersion} does not match manifest ${declaredVersion}`,
      );
    }
  }

  for (const packageName of policy.singleResolutionPackages ?? []) {
    const resolved = lockfileVersions.get(packageName) ?? new Set();
    const declaredVersion = versions[packageName];
    if (resolved.size !== 1 || !resolved.has(declaredVersion)) {
      failures.push(
        `Expected one ${packageName}@${declaredVersion} lockfile resolution, found ${[
          ...resolved,
        ].join(", ") || "none"}`,
      );
    }
  }

  for (const exception of exceptions.values()) {
    if (!exception.used) {
      failures.push(
        `Temporary ${exception.rule} exception for ${exception.package}@${exception.version} is stale`,
      );
    }
  }

  return failures;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Unable to read ${label}`);
  }
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function lockfileVersionsFor(lockfile, packageNames) {
  return new Map(
    packageNames.map((packageName) => {
      const versions = new Set();
      const pattern = new RegExp(
        `^\\s+resolution: "${escapedRegExp(packageName)}@npm:([^"\\\\]+)"\\s*$`,
        "gm",
      );
      for (const match of lockfile.matchAll(pattern)) versions.add(match[1]);
      return [packageName, versions];
    }),
  );
}

export function verifyWorkspace(workspace) {
  const manifest = readJson(resolve(workspace, "package.json"), "package.json");
  const policy = readJson(
    resolve(workspace, "dependency-policy.json"),
    "dependency-policy.json",
  );
  let lockfile;
  let nodeVersion;
  try {
    lockfile = readFileSync(resolve(workspace, "yarn.lock"), "utf8");
    nodeVersion = readFileSync(resolve(workspace, ".node-version"), "utf8");
  } catch {
    throw new Error("Unable to read yarn.lock or .node-version");
  }

  const versions = dependencyVersions(manifest);
  const installedVersions = new Map();
  for (const packageName of Object.keys(versions)) {
    const installedPath = resolve(
      workspace,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    if (!existsSync(installedPath)) continue;
    const installed = readJson(installedPath, `${packageName} installed metadata`);
    if (typeof installed.version === "string") {
      installedVersions.set(packageName, installed.version);
    }
  }

  const lockfileVersions = lockfileVersionsFor(
    lockfile,
    policy.singleResolutionPackages ?? [],
  );
  return evaluateDependencyPolicy({
    manifest,
    policy,
    nodeVersion,
    installedVersions,
    lockfileVersions,
  });
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);
if (scriptPath === currentPath) {
  const workspace = resolve(dirname(currentPath), "..");
  try {
    const failures = verifyWorkspace(workspace);
    if (failures.length > 0) {
      failures.forEach((failure) => console.error(`- ${failure}`));
      process.exit(1);
    }
    console.log("Dependency compatibility policy verified.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Dependency verification failed");
    process.exit(1);
  }
}
