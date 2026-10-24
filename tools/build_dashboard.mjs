// Сборка классического дашборда (dashboard.html) из dashboard_src/ — строгий офлайн (§21).
// Вставляет: Oswald base64 → <style id="font-faces">, style.css → <style id="styles">,
// data/aging.json → <script id="seed-data">, main.js → <script id="app">.
// Идемпотентно: плейсхолдеры — содержимое узлов, сами узлы не трогаем.
// Запуск: node tools/build_dashboard.mjs [out=dashboard.html]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "dashboard_src");
const OUT = process.argv[2] ?? path.join(ROOT, "dashboard.html");

const read = (p) => fs.readFileSync(p);
const stripNul = (s) => s.split("\x00").join("");

const tpl = stripNul(read(path.join(SRC, "template.html")).toString("utf8"));
const css = stripNul(read(path.join(SRC, "style.css")).toString("utf8"));
const js = stripNul(read(path.join(SRC, "main.js")).toString("utf8"));
const data = stripNul(read(path.join(ROOT, "data", "aging.json")).toString("utf8"));

// Валидация JS до вставки — ловим обрыв/синтаксис сразу (§21).
new vm.Script(js, { filename: "main.js" });
JSON.parse(data);

// Oswald (вариативный, 500–600) — как в tools/inline_assets.mjs.
const face = (b64, range) =>
  `@font-face{font-family:"Oswald";font-style:normal;font-weight:500 600;` +
  `src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
const fontCss =
  face(read(path.join(ROOT, "tools", "vendor", "oswald-latin.woff2")).toString("base64"),
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD") +
  face(read(path.join(ROOT, "tools", "vendor", "oswald-cyrillic.woff2")).toString("base64"),
    "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116");

function replaceNodeInner(html, tag, id, body) {
  const re = new RegExp(`(<${tag}\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</${tag}>)`);
  if (!re.test(html)) throw new Error(`не найден узел <${tag} id="${id}">`);
  return html.replace(re, (_m, open, _inner, close) => open + body + close);
}

let html = tpl;
html = replaceNodeInner(html, "style", "font-faces", fontCss);
html = replaceNodeInner(html, "style", "styles", css);
html = replaceNodeInner(html, "script", "seed-data", data);
html = replaceNodeInner(html, "script", "app", "\n" + js + "\n");

// Гейты: нет внешних ссылок, нет null-байтов.
if (/<script[^>]+src=|<link[^>]+href=|url\(\s*https?:/i.test(html)) {
  console.error("FAIL: найдены внешние src/link/url() — строгий офлайн нарушен");
  process.exit(1);
}
if (html.includes("\x00")) {
  console.error("FAIL: null-байты в сборке");
  process.exit(1);
}

fs.writeFileSync(OUT, html);
console.log(`OK: ${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(0)} КБ`);
