// Inline-вендоринг строгого офлайна (RULES.md §«Сборка», DESIGN.md §2): встраивает
// d3, scrollama и шрифт Oswald (base64-woff2) в index.html. Идемпотентно — заменяет
// только внутренность узлов-плейсхолдеров, остальной HTML не трогает (как pipeline/embed.py).
//
// Источники:
//   d3        v7.9.0  — node_modules/d3/dist/d3.min.js (npm-зависимость)
//   scrollama v3.2.0  — tools/vendor/scrollama.min.js (cdn.jsdelivr.net, закоммичен)
//   Oswald    v57     — tools/vendor/oswald-{latin,cyrillic}.woff2 (fonts.gstatic.com, сабсет)
//
// Запуск: node tools/inline_assets.mjs [index.html]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = process.argv[2] ?? path.join(ROOT, "index.html");

const D3_PATH = path.join(ROOT, "node_modules", "d3", "dist", "d3.min.js");
const SCROLLAMA_PATH = path.join(ROOT, "tools", "vendor", "scrollama.min.js");
const OSWALD_LATIN = path.join(ROOT, "tools", "vendor", "oswald-latin.woff2");
const OSWALD_CYRILLIC = path.join(ROOT, "tools", "vendor", "oswald-cyrillic.woff2");

const VENDOR_BUDGET = 350_000; // байт, RULES.md §«Сборка»
const FONT_BUDGET = 90_000;    // байт base64, DESIGN §1.2

function read(p) {
  try {
    return fs.readFileSync(p);
  } catch (e) {
    console.error(`FAIL: не удалось прочитать ${p}: ${e.message}`);
    process.exit(1);
  }
}

// Заменить внутренность узла <tag id="ID" ...>…</tag> на body (идемпотентно).
function replaceNodeInner(html, tag, id, body) {
  const re = new RegExp(`(<${tag}\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</${tag}>)`);
  if (!re.test(html)) {
    console.error(`FAIL: не найден узел <${tag} id="${id}">`);
    process.exit(1);
  }
  return html.replace(re, (_m, open, _inner, close) => open + body + close);
}

// Шрифт: один @font-face на сабсет, диапазон весов 500 600 (Oswald — вариативный, один
// файл на оба веса). unicode-range — как у Google Fonts (latin + cyrillic).
function fontFaceCss() {
  const latin = read(OSWALD_LATIN).toString("base64");
  const cyr = read(OSWALD_CYRILLIC).toString("base64");
  const totalB64 = latin.length + cyr.length;
  if (totalB64 > FONT_BUDGET) {
    console.error(`FAIL: шрифты ${totalB64} B base64 > бюджет ${FONT_BUDGET} B`);
    process.exit(1);
  }
  const face = (b64, range) =>
    `@font-face{font-family:"Oswald";font-style:normal;font-weight:500 600;` +
    `src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
  const css =
    face(latin, "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD") +
    face(cyr, "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116");
  return { css, totalB64 };
}

let html = fs.readFileSync(htmlPath, "utf8");

// 1. d3 (комментарий с версией/источником уже в HTML над узлом).
const d3code = read(D3_PATH).toString("utf8");
html = replaceNodeInner(html, "script", "vendor-d3", d3code);

// 2. scrollama.
const scrollama = read(SCROLLAMA_PATH).toString("utf8");
html = replaceNodeInner(html, "script", "vendor-scrollama", scrollama);

const vendorBytes = Buffer.byteLength(d3code, "utf8") + Buffer.byteLength(scrollama, "utf8");
if (vendorBytes > VENDOR_BUDGET) {
  console.error(`FAIL: вендор ${vendorBytes} B > бюджет ${VENDOR_BUDGET} B`);
  process.exit(1);
}

// 3. Шрифты.
const { css: fontCss, totalB64 } = fontFaceCss();
html = replaceNodeInner(html, "style", "font-faces", fontCss);

fs.writeFileSync(htmlPath, html.replace(/\0/g, ""), "utf8");
console.log(
  `OK: inline d3 (${(Buffer.byteLength(d3code)/1024|0)} KB) + scrollama (${(Buffer.byteLength(scrollama)/1024|0)} KB) ` +
  `= вендор ${(vendorBytes/1024)|0} KB (бюджет ${(VENDOR_BUDGET/1024)|0} KB); ` +
  `шрифты base64 ${(totalB64/1024)|0} KB (бюджет ${(FONT_BUDGET/1024)|0} KB)`
);
