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
state.releases[0].items = ["Тест сохранения состава этапа"];
state.releases[0].team = "product";
state.milestones = [{ id: "sprint-end", label: "Конец спринта", week: 2 }];
const scenario = state.releases.find((release) => release.id === "release-muqw1ge8");
scenario.items = ["Тест сохранения состава сценария"];
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
assert.deepEqual(JSON.parse(storedRow.data).releases[0].items, ["Тест сохранения состава этапа"]);
assert.equal(JSON.parse(storedRow.data).releases[0].team, "product");
assert.deepEqual(JSON.parse(storedRow.data).milestones, [{ id: "sprint-end", label: "Конец спринта", week: 2 }]);
assert.deepEqual(JSON.parse(storedRow.data).releases.find((release) => release.id === "release-muqw1ge8").items, ["Тест сохранения состава сценария"]);

const savedState = JSON.parse(storedRow.data);
savedState.releases[0].name = "Серверный рендер без мигания";
storedRow.data = JSON.stringify(savedState);
const hydratedPage = await module.default.fetch(new Request("https://example.test/"), env, {});
assert.match(await hydratedPage.text(), /Серверный рендер без мигания/);

const deletionState = structuredClone(savedState);
const removedRelease = deletionState.releases.pop();
const deletion = await module.default.fetch(new Request("https://example.test/api/roadmap", {
  method: "PUT",
  headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.test" },
  body: JSON.stringify(deletionState),
}), env, {});
assert.equal(deletion.status, 200);
assert.equal(JSON.parse(storedRow.data).releases.some((release) => release.id === removedRelease.id), false);
const syncedViewer = await module.default.fetch(new Request("https://example.test/api/roadmap"), env, {});
assert.equal((await syncedViewer.json()).state.releases.length, deletionState.releases.length);

const durableValues = new Map();
const durableInstance = new module.RoadmapStore({
  storage: {
    async get(key) { return durableValues.get(key); },
    async put(key, value) { durableValues.set(key, value); },
  },
});
const durableEnv = {
  ROADMAP_STORE: {
    getByName() {
      return { fetch(input, init) { return durableInstance.fetch(new Request(input, init)); } };
    },
  },
  EDITOR_KEY: "test-editor-key",
};
const durableInitial = await module.default.fetch(new Request("https://example.test/api/roadmap"), durableEnv, {});
assert.equal(durableInitial.status, 200);
assert.equal((await durableInitial.json()).state.releases.length, state.releases.length);
const durableSaved = await module.default.fetch(new Request("https://example.test/api/roadmap", {
  method: "PUT",
  headers: { "content-type": "application/json", "x-roadmap-editor-key": "test-editor-key" },
  body: JSON.stringify(state),
}), durableEnv, {});
assert.equal(durableSaved.status, 200);
const durableReloaded = await module.default.fetch(new Request("https://example.test/api/roadmap"), durableEnv, {});
assert.equal((await durableReloaded.json()).state.releases[0].team, "product");

console.log("Worker, editor, shared persistence, server rendering and owner-only authorization validated");
