import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = await realpath(resolve(workspace, "out"));
const host = "127.0.0.1";
const port = 4173;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);

const isInsideOutput = (candidate) => {
  const pathFromRoot = relative(outputRoot, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
  );
};

const findFile = async (pathname) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }

  if (decodedPath.includes("\0")) {
    return { status: 400 };
  }
  // Treat both URL separator styles consistently on Windows and POSIX. A
  // decoded backslash is never needed by the exported routes and could be a
  // traversal separator on Windows while remaining an ordinary byte on Linux.
  if (decodedPath.includes("\\")) {
    return { status: 403 };
  }

  const requestPath = decodedPath.replace(/^[\\/]+/, "");
  let candidate = resolve(outputRoot, requestPath);
  if (!isInsideOutput(candidate)) {
    return { status: 403 };
  }

  try {
    const metadata = await stat(candidate);
    if (metadata.isDirectory()) {
      candidate = join(candidate, "index.html");
    }

    const canonicalPath = await realpath(candidate);
    if (!isInsideOutput(canonicalPath) || !(await stat(canonicalPath)).isFile()) {
      return { status: 403 };
    }
    return { status: 200, path: canonicalPath };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      return { status: 500 };
    }
  }

  return { status: 404, path: join(outputRoot, "404.html") };
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }

  const result = await findFile(pathname);
  if (!result.path) {
    response.writeHead(result.status);
    response.end();
    return;
  }

  try {
    const body = await readFile(result.path);
    response.writeHead(result.status, {
      "Cache-Control": "no-store",
      "Content-Length": body.byteLength,
      "Content-Type":
        contentTypes.get(extname(result.path).toLowerCase()) ??
        "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end();
  }
});

server.listen(port, host, () => {
  console.log(`Static test server listening on http://${host}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
