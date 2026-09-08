import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const moduleDirectory = dirname(modulePath);
const defaultContractPath = join(
  moduleDirectory,
  "nextra-search-route-order.json",
);
const searchIndexPattern = /^nextra-data-[A-Za-z0-9_-]+\.json$/;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(contents, label) {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

export function readSearchOrderContract(contractPath = defaultContractPath) {
  const contract = parseJson(
    readFileSync(resolve(contractPath), "utf8"),
    "Nextra search-order contract",
  );
  if (
    !isPlainObject(contract) ||
    contract.schemaVersion !== 1 ||
    !isPlainObject(contract.routeOrderSha256) ||
    !isPlainObject(contract.indexes)
  ) {
    throw new Error("Nextra search-order contract has an unsupported shape");
  }

  const indexes = new Map();
  for (const [fileName, routes] of Object.entries(contract.indexes)) {
    if (!searchIndexPattern.test(fileName) || !Array.isArray(routes)) {
      throw new Error("Nextra search-order contract contains an invalid index entry");
    }
    const uniqueRoutes = new Set(routes);
    if (
      routes.length === 0 ||
      uniqueRoutes.size !== routes.length ||
      routes.some((route) => typeof route !== "string" || !route.startsWith("/"))
    ) {
      throw new Error(`${fileName} has an invalid canonical route list`);
    }

    const expectedHash = contract.routeOrderSha256[fileName];
    if (
      (typeof expectedHash !== "string" ||
        !/^[0-9a-f]{64}$/i.test(expectedHash) ||
        sha256(routes.join("\n")) !== expectedHash.toLowerCase())
    ) {
      throw new Error(`${fileName} route-order checksum does not match its contract`);
    }
    indexes.set(fileName, routes);
  }
  if (indexes.size === 0) {
    throw new Error("Nextra search-order contract does not declare an index");
  }
  const checksumFiles = Object.keys(contract.routeOrderSha256).sort();
  const indexFiles = [...indexes.keys()].sort();
  if (checksumFiles.join("\n") !== indexFiles.join("\n")) {
    throw new Error(
      "Nextra search-order contract checksum files differ from its indexes",
    );
  }
  return indexes;
}

function validateRouteValue(value, route, fileName) {
  if (
    !isPlainObject(value) ||
    typeof value.title !== "string" ||
    !isPlainObject(value.data) ||
    Object.values(value.data).some((content) => typeof content !== "string")
  ) {
    throw new Error(`${fileName} contains malformed search data for ${route}`);
  }
}

export function orderNextraSearchData(data, expectedRoutes, fileName = "index") {
  if (!isPlainObject(data)) {
    throw new Error(`${fileName} must contain a JSON object`);
  }
  const actualRoutes = Object.keys(data);
  const expectedRouteSet = new Set(expectedRoutes);
  const missingRoutes = expectedRoutes.filter(
    (route) => !Object.hasOwn(data, route),
  );
  const unexpectedRoutes = actualRoutes.filter(
    (route) => !expectedRouteSet.has(route),
  );
  if (missingRoutes.length > 0 || unexpectedRoutes.length > 0) {
    throw new Error(
      `${fileName} route set differs from the canonical contract ` +
        `(missing: ${missingRoutes.length}; unexpected: ${unexpectedRoutes.length})`,
    );
  }

  for (const route of expectedRoutes) {
    validateRouteValue(data[route], route, fileName);
  }
  return Object.fromEntries(
    expectedRoutes.map((route) => [route, data[route]]),
  );
}

function createPlans(outputDirectory, contractPath) {
  const chunksDirectory = join(
    resolve(outputDirectory),
    "_next",
    "static",
    "chunks",
  );
  if (
    !existsSync(chunksDirectory) ||
    !statSync(chunksDirectory).isDirectory()
  ) {
    throw new Error("Nextra search-index output directory is missing");
  }

  const indexes = readSearchOrderContract(contractPath);
  const actualFiles = readdirSync(chunksDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && searchIndexPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const expectedFiles = [...indexes.keys()].sort();
  if (actualFiles.join("\n") !== expectedFiles.join("\n")) {
    throw new Error(
      "Generated Nextra search-index files differ from the canonical contract",
    );
  }

  return expectedFiles.map((fileName) => {
    const filePath = join(chunksDirectory, fileName);
    const original = readFileSync(filePath, "utf8");
    const parsed = parseJson(original, fileName);
    const ordered = orderNextraSearchData(
      parsed,
      indexes.get(fileName),
      fileName,
    );
    return {
      canonical: JSON.stringify(ordered),
      fileName,
      filePath,
      original,
    };
  });
}

export function verifyNextraSearchIndexes(
  outputDirectory = "out",
  contractPath = defaultContractPath,
) {
  const plans = createPlans(outputDirectory, contractPath);
  for (const plan of plans) {
    if (plan.original !== plan.canonical) {
      throw new Error(`${plan.fileName} is not in the canonical route order`);
    }
  }
  return plans.map(({ fileName }) => fileName);
}

export function normalizeNextraSearchIndexes(
  outputDirectory = "out",
  contractPath = defaultContractPath,
) {
  const plans = createPlans(outputDirectory, contractPath);
  const changedFiles = [];
  for (const plan of plans) {
    if (plan.original === plan.canonical) continue;
    const temporaryPath = join(
      dirname(plan.filePath),
      `.${basename(plan.filePath)}.${process.pid}.tmp`,
    );
    try {
      writeFileSync(temporaryPath, plan.canonical, {
        encoding: "utf8",
        flag: "wx",
      });
      renameSync(temporaryPath, plan.filePath);
      changedFiles.push(plan.fileName);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
  verifyNextraSearchIndexes(outputDirectory, contractPath);
  return changedFiles;
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  try {
    const changedFiles = normalizeNextraSearchIndexes(process.argv[2] ?? "out");
    console.log(
      `Nextra search order verified (${changedFiles.length} index file(s) rewritten).`,
    );
  } catch (error) {
    console.error(
      `Nextra search-order normalization failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    process.exit(1);
  }
}
