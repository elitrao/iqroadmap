import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runtimeDirectory = resolve(root, ".sites-runtime");
const workerSource = await readFile(resolve(root, "dist/server/index.js"), "utf8");
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);
await mkdir(runtimeDirectory, { recursive: true });

const roadmapFiles = new Map([
  [1, { stateFile: resolve(runtimeDirectory, "local-roadmap-state.json"), defaultFile: resolve(root, "data/roadmap.json") }],
  [2, { stateFile: resolve(runtimeDirectory, "local-trainer-roadmap-state.json"), defaultFile: resolve(root, "data/trainer-roadmap.json") }],
]);
const storedRows = new Map();

for (const [id, files] of roadmapFiles) {
  try {
    const saved = JSON.parse(await readFile(files.stateFile, "utf8"));
    storedRows.set(id, { data: JSON.stringify(saved.state), updated_at: saved.updatedAt || null });
  } catch {
    const initialState = JSON.parse(await readFile(files.defaultFile, "utf8"));
    storedRows.set(id, { data: JSON.stringify(initialState), updated_at: null });
    await writeFile(files.stateFile, JSON.stringify({ state: initialState, updatedAt: null }, null, 2));
  }
}

async function persistStoredRow(id) {
  const storedRow = storedRows.get(id);
  await writeFile(roadmapFiles.get(id).stateFile, JSON.stringify({
    state: JSON.parse(storedRow.data),
    updatedAt: storedRow.updated_at,
  }, null, 2));
}

const DB = {
  prepare(sql) {
    let bindings = [];
    return {
      bind(...values) { bindings = values; return this; },
      async first() {
        if (sql.startsWith("SELECT")) return storedRows.get(bindings[0]) || null;
        return null;
      },
      async run() {
        if (sql.startsWith("INSERT")) {
          const [id, data, updatedAt] = bindings;
          storedRows.set(id, { data, updated_at: updatedAt });
          await persistStoredRow(id);
        }
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
