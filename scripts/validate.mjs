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
const analystHtml = await response.text();
assert.match(analystHtml, /Конструктор roadmap/);
assert.match(analystHtml, /id="todayLayer"/);
assert.match(analystHtml, /function renderTodayMarker\(\)/);
const trainerPage = await module.default.fetch(new Request("https://example.test/trainer"), {}, {});
assert.equal(trainerPage.status, 200);
const trainerHtml = await trainerPage.text();
assert.match(trainerHtml, /AI Тренер/);
assert.match(trainerHtml, /product-trainer/);
assert.match(trainerHtml, /id="todayLayer"/);
assert.doesNotMatch(trainerHtml, />Майлстоуны</);

const storedRows = new Map();
const DB = {
  prepare(sql) {
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      async first() { return sql.startsWith("SELECT") ? storedRows.get(values[0]) || null : null; },
      async run() {
        if (sql.startsWith("INSERT")) storedRows.set(values[0], { data: values[1], updated_at: values[2] });
        return { success: true };
      },
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
state.releases[0].startDate = "2026-10-06";
state.releases[0].durationDays = 8;
state.meta.heroTitle = "Редактируемый заголовок";
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
assert.ok(storedRows.get(1)?.data);
assert.deepEqual(JSON.parse(storedRows.get(1).data).releases[0].items, ["Тест сохранения состава этапа"]);
assert.equal(JSON.parse(storedRows.get(1).data).releases[0].team, "product");
assert.equal(JSON.parse(storedRows.get(1).data).releases[0].startDate, "2026-10-06");
assert.equal(JSON.parse(storedRows.get(1).data).releases[0].durationDays, 8);
assert.equal(JSON.parse(storedRows.get(1).data).meta.heroTitle, "Редактируемый заголовок");
assert.deepEqual(JSON.parse(storedRows.get(1).data).milestones, [{ id: "sprint-end", label: "Конец спринта", week: 2, date: "" }]);
assert.deepEqual(JSON.parse(storedRows.get(1).data).releases.find((release) => release.id === "release-muqw1ge8").items, ["Тест сохранения состава сценария"]);

const savedState = JSON.parse(storedRows.get(1).data);
savedState.releases[0].name = "Серверный рендер без мигания";
storedRows.get(1).data = JSON.stringify(savedState);
const hydratedPage = await module.default.fetch(new Request("https://example.test/"), env, {});
const hydratedHtml = await hydratedPage.text();
assert.match(hydratedHtml, /Серверный рендер без мигания/);
assert.match(hydratedHtml, /Редактируемый заголовок/);

const deletionState = structuredClone(savedState);
const removedRelease = deletionState.releases.pop();
const deletion = await module.default.fetch(new Request("https://example.test/api/roadmap", {
  method: "PUT",
  headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.test" },
  body: JSON.stringify(deletionState),
}), env, {});
assert.equal(deletion.status, 200);
assert.equal(JSON.parse(storedRows.get(1).data).releases.some((release) => release.id === removedRelease.id), false);
const syncedViewer = await module.default.fetch(new Request("https://example.test/api/roadmap"), env, {});
assert.equal((await syncedViewer.json()).state.releases.length, deletionState.releases.length);

const trainerState = JSON.parse(await readFile(resolve(import.meta.dirname, "../data/trainer-roadmap.json"), "utf8"));
trainerState.releases[0].name = "Независимый план тренера";
const savedTrainer = await module.default.fetch(new Request("https://example.test/api/roadmap/trainer", {
  method: "PUT",
  headers: { "content-type": "application/json", "oai-authenticated-user-email": "owner@example.test" },
  body: JSON.stringify(trainerState),
}), env, {});
assert.equal(savedTrainer.status, 200);
assert.equal(JSON.parse(storedRows.get(2).data).releases[0].name, "Независимый план тренера");
assert.notEqual(JSON.parse(storedRows.get(1).data).releases[0].name, "Независимый план тренера");

const durableInstances = new Map();
function durableInstance(name) {
  if (!durableInstances.has(name)) {
    const values = new Map();
    durableInstances.set(name, new module.RoadmapStore({
      storage: {
        async get(key) { return values.get(key); },
        async put(key, value) { values.set(key, value); },
      },
    }));
  }
  return durableInstances.get(name);
}
const durableEnv = {
  ROADMAP_STORE: {
    getByName(name) {
      return { fetch(input, init) { return durableInstance(name).fetch(new Request(input, init)); } };
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
const durableTrainerInitial = await module.default.fetch(new Request("https://example.test/api/roadmap/trainer"), durableEnv, {});
assert.equal((await durableTrainerInitial.json()).state.releases[0].id, "trainer-scenarios");

console.log("Two roadmap pages, editor, isolated persistence, server rendering and owner-only authorization validated");
