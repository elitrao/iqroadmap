import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const filename = resolve(import.meta.dirname, "../dist/server/index.js");
const source = await readFile(filename, "utf8");
const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
assert.equal(typeof module.default?.fetch, "function");
const response = await module.default.fetch(new Request("https://example.test/"), {}, {});
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /text\/html/);
assert.match(await response.text(), /Конструктор roadmap/);

let storedRow = null;
const DB = {
  prepare(sql) {
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      async first() { return sql.startsWith("SELECT") ? storedRow : null; },
      async run() { storedRow = { data: values[0], updated_at: values[1] }; return { success: true }; },
    };
  },
};
const env = { DB, ADMIN_EMAIL: "owner@example.test" };
const viewer = await module.default.fetch(new Request("https://example.test/api/roadmap"), env, {});
assert.equal(viewer.status, 200);
assert.equal((await viewer.json()).canEdit, false);

const state = JSON.parse(await readFile(resolve(import.meta.dirname, "../data/roadmap.json"), "utf8"));
const denied = await module.default.fetch(new Request("https://example.test/api/roadmap", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(state),
}), env, {});
assert.equal(denied.status, 403);

const saved = await module.default.fetch(new Request("https://example.test/api/roadmap", {
  method: "PUT",
  headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.test" },
  body: JSON.stringify(state),
}), env, {});
assert.equal(saved.status, 200);
assert.ok(storedRow?.data);
console.log("Worker, editor, D1 persistence and owner-only authorization validated");
