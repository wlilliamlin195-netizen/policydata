import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { projectRoot } from "./lib.mjs";

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    const target = path.resolve(projectRoot, relativePath);
    if (target !== projectRoot && !target.startsWith(`${projectRoot}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const fileStat = await stat(target);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(target)) || "application/octet-stream",
      "Cache-Control": path.extname(target) === ".json" ? "no-store" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Policy Delta 已启动：http://${host}:${port}`);
});
