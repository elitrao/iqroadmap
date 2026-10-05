const ROADMAPS = {
  analyst: {
    id: 1,
    durableName: "global",
    apiPath: "/api/roadmap",
    pagePaths: ["/", "/index.html"],
    page: __ANALYST_PAGE_JSON__,
    defaultState: __ANALYST_STATE_JSON__,
  },
  trainer: {
    id: 2,
    durableName: "trainer",
    apiPath: "/api/roadmap/trainer",
    pagePaths: ["/trainer", "/trainer/"],
    page: __TRAINER_PAGE_JSON__,
    defaultState: __TRAINER_STATE_JSON__,
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function currentEmail(request) {
  return (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
}

function canEdit(request, env) {
  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const editorKey = String(env.EDITOR_KEY || "").trim();
  const providedKey = String(request.headers.get("x-roadmap-editor-key") || "").trim();
  const emailMatches = Boolean(adminEmail && currentEmail(request) === adminEmail);
  const keyMatches = Boolean(editorKey && providedKey && providedKey === editorKey);
  return emailMatches || keyMatches;
}

function cleanText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function validateState(input, defaultState = {}) {
  if (!input || typeof input !== "object") throw new Error("Некорректный формат дорожной карты");
  const baseDate = cleanText(input.baseDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) throw new Error("Некорректная дата начала");
  if (!Array.isArray(input.releases) || input.releases.length < 1 || input.releases.length > 40) {
    throw new Error("Должно быть от 1 до 40 этапов");
  }

  const ids = new Set();
  const releases = input.releases.map((release, index) => {
    if (!release || typeof release !== "object") throw new Error(`Некорректный этап ${index + 1}`);
    const id = cleanText(release.id, 80) || `release-${index + 1}`;
    if (ids.has(id)) throw new Error("Идентификаторы этапов должны быть уникальными");
    ids.add(id);
    const startWeek = Number(release.startWeek);
    const duration = Number(release.duration);
    const startDate = cleanText(release.startDate, 10);
    const durationDays = Number(release.durationDays || duration * 5);
    if (!Number.isInteger(startWeek) || startWeek < 1 || startWeek > 52) throw new Error("Неделя начала должна быть от 1 до 52");
    if (!Number.isInteger(duration) || duration < 1 || duration > 12) throw new Error("Длительность должна быть от 1 до 12 недель");
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("Некорректная точная дата этапа");
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 60) throw new Error("Длительность должна быть от 1 до 60 рабочих дней");
    const items = Array.isArray(release.items)
      ? release.items.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 10)
      : [];
    const fallbackTeam = id === "new-user-journey" ? "product" : "development";
    const sharedTaskIds = new Set();
    const sharedTasks = Array.isArray(release.sharedTasks)
      ? release.sharedTasks.map((task, taskIndex) => {
        const source = typeof task === "string" ? { title: task } : task;
        if (!source || typeof source !== "object") return null;
        const title = cleanText(source.title || source.name, 160);
        if (!title) return null;
        const taskId = cleanText(source.id, 80) || `shared-${taskIndex + 1}`;
        if (sharedTaskIds.has(taskId)) throw new Error("Идентификаторы общих задач должны быть уникальными внутри этапа");
        sharedTaskIds.add(taskId);
        const taskStartDate = cleanText(source.startDate, 10);
        const taskEndDate = cleanText(source.endDate, 10);
        const taskStartWeek = Number(source.startWeek || startWeek);
        const taskDurationDays = Number(source.durationDays || Math.max(1, Math.ceil(durationDays / 2)));
        const taskDuration = Number(source.duration || Math.max(1, Math.ceil(taskDurationDays / 5)));
        const taskItems = Array.isArray(source.items)
          ? source.items.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 10)
          : [];
        if (taskStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskStartDate)) throw new Error("Некорректная дата общей задачи");
        if (taskEndDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskEndDate)) throw new Error("Некорректная дата окончания общей задачи");
        if (!Number.isInteger(taskStartWeek) || taskStartWeek < 1 || taskStartWeek > 52) throw new Error("Неделя общей задачи должна быть от 1 до 52");
        if (!Number.isInteger(taskDurationDays) || taskDurationDays < 1 || taskDurationDays > 60) throw new Error("Срок общей задачи должен быть от 1 до 60 рабочих дней");
        if (!Number.isInteger(taskDuration) || taskDuration < 1 || taskDuration > 12) throw new Error("Длительность общей задачи должна быть от 1 до 12 недель");
        return {
          id: taskId,
          title,
          startDate: taskStartDate,
          endDate: taskEndDate,
          startWeek: taskStartWeek,
          durationDays: taskDurationDays,
          duration: taskDuration,
          team: ["product", "development"].includes(source.team) ? source.team : fallbackTeam,
          status: cleanText(source.status, 30) || "Запланировано",
          tone: ["", "released", "focus", "parallel", "next"].includes(source.tone) ? source.tone : "",
          badge: cleanText(source.badge, 24),
          itemState: cleanText(source.itemState, 24),
          items: taskItems,
        };
      }).filter(Boolean).slice(0, 12)
      : [];
    return {
      id,
      version: cleanText(release.version, 50) || "Новый этап",
      rowLabel: cleanText(release.rowLabel, 24),
      name: cleanText(release.name, 100) || "Без названия",
      team: ["product", "development"].includes(release.team) ? release.team : fallbackTeam,
      startWeek,
      duration,
      startDate,
      durationDays,
      status: cleanText(release.status, 30) || "Запланировано",
      tone: ["", "released", "focus", "parallel", "next"].includes(release.tone) ? release.tone : "",
      badge: cleanText(release.badge, 24),
      itemState: cleanText(release.itemState, 24),
      items,
      sharedTasks,
    };
  });
  const milestoneIds = new Set();
  const milestones = Array.isArray(input.milestones)
    ? input.milestones.slice(0, 40).map((milestone, index) => {
        if (!milestone || typeof milestone !== "object") throw new Error(`Некорректный майлстоун ${index + 1}`);
        const id = cleanText(milestone.id, 80) || `milestone-${index + 1}`;
        if (milestoneIds.has(id)) throw new Error("Идентификаторы майлстоунов должны быть уникальными");
        milestoneIds.add(id);
        const week = Number(milestone.week);
        const date = cleanText(milestone.date, 10);
        if (!Number.isInteger(week) || week < 1 || week > 52) throw new Error("Неделя майлстоуна должна быть от 1 до 52");
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Некорректная дата майлстоуна");
        return {
          id,
          label: cleanText(milestone.label, 60) || "Майлстоун",
          week,
          date,
        };
      })
    : [];
  const fallbackMeta = defaultState.meta && typeof defaultState.meta === "object" ? defaultState.meta : {};
  const inputMeta = input.meta && typeof input.meta === "object" ? input.meta : {};
  const meta = {
    eyebrow: cleanText(inputMeta.eyebrow, 80) || cleanText(fallbackMeta.eyebrow, 80),
    heroTitle: cleanText(inputMeta.heroTitle, 160)
      || [cleanText(inputMeta.heroPrefix, 80), cleanText(inputMeta.heroVersion, 80)].filter(Boolean).join(" ")
      || cleanText(fallbackMeta.heroTitle, 160)
      || [cleanText(fallbackMeta.heroPrefix, 80), cleanText(fallbackMeta.heroVersion, 80)].filter(Boolean).join(" "),
    introCopy: cleanText(inputMeta.introCopy, 500) || cleanText(fallbackMeta.introCopy, 500),
    baseValue: cleanText(inputMeta.baseValue, 100) || cleanText(fallbackMeta.baseValue, 100),
    nowValue: cleanText(inputMeta.nowValue, 100) || cleanText(fallbackMeta.nowValue, 100),
    rhythmValue: cleanText(inputMeta.rhythmValue, 60) || cleanText(fallbackMeta.rhythmValue, 60),
    footnote: cleanText(inputMeta.footnote, 500) || cleanText(fallbackMeta.footnote, 500),
  };
  return { baseDate, meta, releases, milestones };
}

export class RoadmapStore {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    if (request.method === "GET") {
      return json((await this.storage.get("roadmap")) || { state: null, updatedAt: null });
    }
    if (request.method === "PUT") {
      const record = await request.json();
      await this.storage.put("roadmap", record);
      return json({ ok: true });
    }
    return new Response("Method not allowed", { status: 405 });
  }
}

async function loadState(env, roadmap) {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT data, updated_at FROM roadmap_state WHERE id = ?").bind(roadmap.id).first();
    if (!row) return { state: roadmap.defaultState, updatedAt: null, persistent: true };
    try {
      return { state: validateState(JSON.parse(row.data), roadmap.defaultState), updatedAt: row.updated_at, persistent: true };
    } catch {
      return { state: roadmap.defaultState, updatedAt: row.updated_at, persistent: true };
    }
  }
  if (env.ROADMAP_STORE) {
    const response = await env.ROADMAP_STORE.getByName(roadmap.durableName).fetch("https://roadmap.internal/state");
    const record = await response.json();
    if (!record.state) return { state: roadmap.defaultState, updatedAt: null, persistent: true };
    try {
      return { state: validateState(record.state, roadmap.defaultState), updatedAt: record.updatedAt || null, persistent: true };
    } catch {
      return { state: roadmap.defaultState, updatedAt: record.updatedAt || null, persistent: true };
    }
  }
  return { state: roadmap.defaultState, updatedAt: null, persistent: false };
}

function serializeStateForHtml(state) {
  return JSON.stringify(state)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPage(page, state) {
  const meta = state.meta || {};
  return page
    .replace("__SERVER_STATE__", serializeStateForHtml(state))
    .replaceAll("__SERVER_META_EYEBROW__", escapeHtml(meta.eyebrow))
    .replaceAll("__SERVER_META_HERO_TITLE__", escapeHtml(meta.heroTitle))
    .replaceAll("__SERVER_META_INTRO_COPY__", escapeHtml(meta.introCopy))
    .replaceAll("__SERVER_META_BASE_VALUE__", escapeHtml(meta.baseValue))
    .replaceAll("__SERVER_META_NOW_VALUE__", escapeHtml(meta.nowValue))
    .replaceAll("__SERVER_META_RHYTHM_VALUE__", escapeHtml(meta.rhythmValue))
    .replaceAll("__SERVER_META_FOOTNOTE__", escapeHtml(meta.footnote));
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);
    const roadmap = Object.values(ROADMAPS).find((entry) => entry.apiPath === url.pathname);

    if (roadmap && request.method === "GET") {
      try {
        const current = await loadState(env, roadmap);
        return json({ ...current, canEdit: canEdit(request, env) });
      } catch (error) {
        console.error("roadmap_load_failed", error);
        return json({ state: roadmap.defaultState, updatedAt: null, persistent: false, canEdit: canEdit(request, env), error: "Хранилище временно недоступно" }, 503);
      }
    }

    if (roadmap && request.method === "PUT") {
      if (!canEdit(request, env)) return json({ error: "Редактирование доступно только владельцу сайта" }, 403);
      if (!env.DB && !env.ROADMAP_STORE) return json({ error: "Общее хранилище временно недоступно" }, 503);
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 128000) return json({ error: "Дорожная карта слишком большая" }, 413);
      try {
        const state = validateState(await request.json(), roadmap.defaultState);
        const updatedAt = new Date().toISOString();
        if (env.DB) {
          await env.DB.prepare(
            "INSERT INTO roadmap_state (id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by"
          ).bind(roadmap.id, JSON.stringify(state), updatedAt, currentEmail(request)).run();
        } else {
          const response = await env.ROADMAP_STORE.getByName(roadmap.durableName).fetch("https://roadmap.internal/state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ state, updatedAt }),
          });
          if (!response.ok) throw new Error("Не удалось сохранить общий план");
        }
        return json({ ok: true, state, updatedAt, canEdit: true, persistent: true });
      } catch (error) {
        console.error("roadmap_save_failed", error);
        return json({ error: error instanceof Error ? error.message : "Не удалось сохранить изменения" }, 400);
      }
    }

    const pageRoadmap = Object.values(ROADMAPS).find((entry) => entry.pagePaths.includes(url.pathname));
    if (pageRoadmap && request.method === "GET") {
      let initialState = pageRoadmap.defaultState;
      try {
        initialState = (await loadState(env, pageRoadmap)).state;
      } catch (error) {
        console.error("roadmap_initial_render_failed", error);
      }
      const page = renderPage(pageRoadmap.page, initialState);
      return new Response(page, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
          "content-security-policy": "default-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
          "x-content-type-options": "nosniff",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
