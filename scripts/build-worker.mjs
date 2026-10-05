import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "src");
const dist = resolve(root, "dist");

const [htmlSource, analystStateText, trainerStateText, serverTemplate, hostingText, logo, iqMarkWhite, iqMarkAccent, latinFont, cyrillicFont, horizon] = await Promise.all([
  readFile(resolve(src, "index.html"), "utf8"),
  readFile(resolve(root, "data/roadmap.json"), "utf8"),
  readFile(resolve(root, "data/trainer-roadmap.json"), "utf8"),
  readFile(resolve(root, "worker/server-template.js"), "utf8"),
  readFile(resolve(root, ".openai/hosting.json"), "utf8"),
  readFile(resolve(src, "assets/iq-group-logo.png")),
  readFile(resolve(src, "assets/iq-mark-white.png")),
  readFile(resolve(src, "assets/iq-mark-accent-mask.png")),
  readFile(resolve(src, "assets/manrope-latin.woff2")),
  readFile(resolve(src, "assets/manrope-cyrillic.woff2")),
  readFile(resolve(src, "assets/roadmap-horizon.jpg")),
]);

const analystState = JSON.parse(analystStateText);
const trainerState = JSON.parse(trainerStateText);
const dataUri = (mime, buffer) => `data:${mime};base64,${buffer.toString("base64")}`;

const sharedAssets = (source) => source
  .replaceAll("./assets/iq-group-logo.png", dataUri("image/png", logo))
  .replaceAll("./assets/iq-mark-white.png", dataUri("image/png", iqMarkWhite))
  .replaceAll("./assets/iq-mark-accent-mask.png", dataUri("image/png", iqMarkAccent))
  .replaceAll("./assets/manrope-latin.woff2", dataUri("font/woff2", latinFont))
  .replaceAll("./assets/manrope-cyrillic.woff2", dataUri("font/woff2", cyrillicFont))
  .replaceAll("./assets/roadmap-horizon.jpg", dataUri("image/jpeg", horizon));

function buildPage(defaultState, config) {
  return sharedAssets(htmlSource)
    .replace("__DEFAULT_ROADMAP__", JSON.stringify(defaultState))
    .replace("__INITIAL_ROADMAP__", "__SERVER_STATE__")
    .replace("__ROADMAP_CONFIG__", JSON.stringify({ apiPath: config.apiPath, broadcastName: config.broadcastName }))
    .replaceAll("__PAGE_DESCRIPTION__", config.description)
    .replaceAll("__PAGE_TITLE__", config.title)
    .replaceAll("__BODY_CLASS__", config.bodyClass)
    .replaceAll("__FAVICON_COLOR__", config.faviconColor)
    .replaceAll("__PRODUCT_NAME__", config.productName)
    .replaceAll("__ANALYST_CURRENT__", config.key === "analyst" ? 'aria-current="page"' : "")
    .replaceAll("__TRAINER_CURRENT__", config.key === "trainer" ? 'aria-current="page"' : "")
    .replaceAll("__EYEBROW__", "__SERVER_META_EYEBROW__")
    .replaceAll("__HERO_TITLE__", "__SERVER_META_HERO_TITLE__")
    .replaceAll("__INTRO_COPY__", "__SERVER_META_INTRO_COPY__")
    .replaceAll("__BASE_VALUE__", "__SERVER_META_BASE_VALUE__")
    .replaceAll("__NOW_VALUE__", "__SERVER_META_NOW_VALUE__")
    .replaceAll("__RHYTHM_VALUE__", "__SERVER_META_RHYTHM_VALUE__")
    .replaceAll("__FOOTNOTE__", "__SERVER_META_FOOTNOTE__");
}

const analystPage = buildPage(analystState, {
  key: "analyst",
  apiPath: "/api/roadmap",
  broadcastName: "ai-analyst-roadmap-updates",
  bodyClass: "product-analyst",
  faviconColor: "F08438",
  productName: "AI Аналитик",
  title: "AI Аналитик · Дорожная карта 1.4",
  description: "Дорожная карта AI Аналитика: выпущенная 1.4, технический долг и следующие релизы",
  eyebrow: "План релизов · 1.4",
  introCopy: "Версия 1.4 уже выпущена. Следующий цикл посвящён техническому долгу и параллельной проработке нового пользовательского пути — затем начинается 1.4.1.",
  baseValue: "1.4 выпущена",
  nowValue: "Технический долг",
  footnote: "1.4 показана как завершённый цикл; каждый следующий этап занимает 10 рабочих дней. 31 декабря и 1–11 января не учитываются.",
});

const trainerPage = buildPage(trainerState, {
  key: "trainer",
  apiPath: "/api/roadmap/trainer",
  broadcastName: "ai-trainer-roadmap-updates",
  bodyClass: "product-trainer",
  faviconColor: "7679FF",
  productName: "AI Тренер",
  title: "AI Тренер · Дорожная карта",
  description: "Отдельная дорожная карта продукта AI Тренер",
  eyebrow: "План развития · AI Тренер",
  introCopy: "Отдельный план AI Тренера: от сценариев тренировок до первого запуска. Этапы, сроки и состав работ редактируются независимо от AI Аналитика.",
  baseValue: "План сформирован",
  nowValue: "Сценарии тренировок",
  footnote: "Каждый этап занимает 10 рабочих дней. 31 декабря и 1–11 января не учитываются.",
});

const worker = serverTemplate
  .replace("__ANALYST_PAGE_JSON__", JSON.stringify(analystPage))
  .replace("__TRAINER_PAGE_JSON__", JSON.stringify(trainerPage))
  .replace("__ANALYST_STATE_JSON__", JSON.stringify(analystState))
  .replace("__TRAINER_STATE_JSON__", JSON.stringify(trainerState));

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(resolve(dist, "server/index.js"), worker);
await writeFile(resolve(dist, ".openai/hosting.json"), hostingText);
await cp(resolve(root, "drizzle"), resolve(dist, ".openai/drizzle"), { recursive: true });

console.log(`Built ${resolve(dist, "server/index.js")}`);
