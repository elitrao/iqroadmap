import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workerSource = await readFile(resolve(import.meta.dirname, "../dist/server/index.js"), "utf8");
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);
let storedRow = null;

const DB = {
  prepare(sql) {
    let bindings = [];
    return {
      bind(...values) { bindings = values; return this; },
      async first() {
        if (sql.startsWith("SELECT")) return storedRow;
        return null;
      },
      async run() {
        if (sql.startsWith("INSERT")) storedRow = { data: bindings[0], updated_at: bindings[1] };
        return { success: true };
      },
    };
  },
};

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value != null) headers.set(key, value);
  }
  headers.set("oai-authenticated-user-email", "owner@example.test");
  const request = new Request(`http://127.0.0.1:4173${req.url}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
  const response = await workerModule.default.fetch(request, { DB, ADMIN_EMAIL: "owner@example.test" }, {});
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(4173, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:4173"));
