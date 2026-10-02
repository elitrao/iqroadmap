import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "src");
const dist = resolve(root, "dist");

const [htmlSource, defaultStateText, serverTemplate, hostingText, logo, latinFont, cyrillicFont] = await Promise.all([
  readFile(resolve(src, "index.html"), "utf8"),
  readFile(resolve(root, "data/roadmap.json"), "utf8"),
  readFile(resolve(root, "worker/server-template.js"), "utf8"),
  readFile(resolve(root, ".openai/hosting.json"), "utf8"),
  readFile(resolve(src, "assets/iq-group-logo.png")),
  readFile(resolve(src, "assets/manrope-latin.woff2")),
  readFile(resolve(src, "assets/manrope-cyrillic.woff2")),
]);

const defaultState = JSON.parse(defaultStateText);
const dataUri = (mime, buffer) => `data:${mime};base64,${buffer.toString("base64")}`;

const page = htmlSource
  .replace("__DEFAULT_ROADMAP__", JSON.stringify(defaultState))
  .replace("__INITIAL_ROADMAP__", "__SERVER_STATE__")
  .replaceAll("./assets/iq-group-logo.png", dataUri("image/png", logo))
  .replaceAll("./assets/manrope-latin.woff2", dataUri("font/woff2", latinFont))
  .replaceAll("./assets/manrope-cyrillic.woff2", dataUri("font/woff2", cyrillicFont));

const worker = serverTemplate
  .replace("__PAGE_JSON__", JSON.stringify(page))
  .replace("__STATE_JSON__", JSON.stringify(defaultState));

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(resolve(dist, "server/index.js"), worker);
await writeFile(resolve(dist, ".openai/hosting.json"), hostingText);
await cp(resolve(root, "drizzle"), resolve(dist, ".openai/drizzle"), { recursive: true });

console.log(`Built ${resolve(dist, "server/index.js")}`);
