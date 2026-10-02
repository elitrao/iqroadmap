const PAGE = __PAGE_JSON__;
const DEFAULT_STATE = __STATE_JSON__;

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
  return Boolean(adminEmail && currentEmail(request) === adminEmail);
}

function cleanText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function validateState(input) {
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
    if (!Number.isInteger(startWeek) || startWeek < 1 || startWeek > 52) throw new Error("Неделя начала должна быть от 1 до 52");
    if (!Number.isInteger(duration) || duration < 1 || duration > 12) throw new Error("Длительность должна быть от 1 до 12 недель");
    const items = Array.isArray(release.items)
      ? release.items.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 10)
      : [];
    return {
      id,
      version: cleanText(release.version, 50) || "Новый этап",
      rowLabel: cleanText(release.rowLabel, 24),
      name: cleanText(release.name, 100) || "Без названия",
      startWeek,
      duration,
      status: cleanText(release.status, 30) || "Запланировано",
      tone: ["", "released", "focus", "parallel", "next"].includes(release.tone) ? release.tone : "",
      badge: cleanText(release.badge, 24),
      itemState: cleanText(release.itemState, 24),
      items,
    };
  });
  return { baseDate, releases };
}

async function loadState(env) {
  if (!env.DB) return { state: DEFAULT_STATE, updatedAt: null, persistent: false };
  const row = await env.DB.prepare("SELECT data, updated_at FROM roadmap_state WHERE id = 1").first();
  if (!row) return { state: DEFAULT_STATE, updatedAt: null, persistent: true };
  try {
    return { state: validateState(JSON.parse(row.data)), updatedAt: row.updated_at, persistent: true };
  } catch {
    return { state: DEFAULT_STATE, updatedAt: row.updated_at, persistent: true };
  }
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);

    if (url.pathname === "/api/roadmap" && request.method === "GET") {
      try {
        const current = await loadState(env);
        return json({ ...current, canEdit: canEdit(request, env) });
      } catch (error) {
        console.error("roadmap_load_failed", error);
        return json({ state: DEFAULT_STATE, updatedAt: null, persistent: false, canEdit: canEdit(request, env), error: "Хранилище временно недоступно" }, 503);
      }
    }

    if (url.pathname === "/api/roadmap" && request.method === "PUT") {
      if (!canEdit(request, env)) return json({ error: "Редактирование доступно только владельцу сайта" }, 403);
      if (!env.DB) return json({ error: "Общее хранилище временно недоступно" }, 503);
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 128000) return json({ error: "Дорожная карта слишком большая" }, 413);
      try {
        const state = validateState(await request.json());
        const updatedAt = new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO roadmap_state (id, data, updated_at, updated_by) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by"
        ).bind(JSON.stringify(state), updatedAt, currentEmail(request)).run();
        return json({ ok: true, state, updatedAt, canEdit: true, persistent: true });
      } catch (error) {
        console.error("roadmap_save_failed", error);
        return json({ error: error instanceof Error ? error.message : "Не удалось сохранить изменения" }, 400);
      }
    }

    if ((url.pathname === "/" || url.pathname === "/index.html") && request.method === "GET") {
      return new Response(PAGE, {
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
