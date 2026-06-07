// Headless render-verify of the single-file index.html (skill-context: aif-verify) — v2.
// jsdom executes the app on the real embedded data with d3 injected (vendored d3 in the file
// is not run by jsdom; npm-d3 stands in), then asserts the art-direction contract:
//   strict offline (no external src/href), dark theme default, inline d3/scrollama + Oswald
//   @font-face, no --mono token, 7 unique data-signatures, a single persistent <svg> canvas
//   that morphs across every scene (US-1…US-7 + the two wow-morphs) with zero console errors
//   and zero console.assert failures, plus the "?" modal a11y and the season-range subtitle.
// Run: node tools/verify_dom.mjs
import fs from "node:fs";
import { JSDOM } from "jsdom";
import * as d3 from "d3";

const html = fs.readFileSync("index.html", "utf8");
const fails = [];
const consoleErrors = [];
const assertFails = [];

// ── Static (text-level) gates: strict offline + inline vendoring ──
if (/<script[^>]*\bsrc=/i.test(html)) { fails.push("external <script src> present (strict offline violated)"); }
if (/<link[^>]*\bhref=/i.test(html)) { fails.push("external <link href> present (strict offline violated)"); }
if (/--mono\b/.test(html)) { fails.push("--mono token still present (must be removed)"); }

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// d3 вендорится инлайн в файле, но jsdom его не исполняет (outside-only) — даём npm-d3 как глобал.
window.d3 = d3;
// scrollama в jsdom отсутствует — в коде это под guard (сцены гоняем тест-сеймом __nbaScene).
window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 80, height: 16 });

window.console.error = (...a) => consoleErrors.push(a.map(String).join(" "));
window.console.warn = () => {};
// console.assert-сверки чисел заголовков с агрегатами слим-JSON — должны проходить.
window.console.assert = (cond, ...m) => { if (!cond) { assertFails.push(m.map(String).join(" ")); } };

function check(name, cond) { if (!cond) { fails.push(name); } }

// ── Дом-гейты до запуска: тема, сигнатуры, инлайн-вендоры ──
check("data-theme dark by default",
  document.documentElement.getAttribute("data-theme") === "dark");

const d3node = document.getElementById("vendor-d3");
const scnode = document.getElementById("vendor-scrollama");
check("d3 inlined (vendor-d3 non-placeholder)", d3node && d3node.textContent.length > 50000);
check("scrollama inlined (vendor-scrollama non-placeholder)", scnode && scnode.textContent.length > 1000);
const fontStyle = document.getElementById("font-faces");
check("Oswald @font-face inlined",
  fontStyle && /@font-face/.test(fontStyle.textContent) && /Oswald/.test(fontStyle.textContent) &&
  /base64/.test(fontStyle.textContent));

const SIG = ["us1-mountain", "us2-split", "us3-board", "us4-film", "us5-spotlight", "us6-cliff", "us7-clipboard"];
const sigs = [...document.querySelectorAll(".step")].map((s) => s.getAttribute("data-signature"));
check("7 scene signatures present", sigs.length === 7);
check("signatures match DESIGN set & order: " + sigs.join(","), SIG.every((s, i) => sigs[i] === s));
check("signatures unique", new Set(sigs).size === sigs.length);

// ── Запуск приложения (IIFE инициализируется в конце — ловит hoisting) ──
const appScript = [...document.querySelectorAll("script")].find(
  (s) => s.id === "app" || /initEngine/.test(s.textContent),
);
if (!appScript) { console.error("FAIL: app script block not found"); process.exit(1); }
try {
  window.eval(appScript.textContent);
} catch (err) {
  console.error("FAIL: app threw on execution:", err && err.stack ? err.stack : err);
  process.exit(1);
}

// 1. Подзаголовок: охват сезонов подставлен и снимает двусмысленность.
const range = document.getElementById("season-range");
check("season-range filled", range && /охват/.test(range.textContent) && /\d{4}/.test(range.textContent));
check("season-range mentions count", range && /сезон/.test(range.textContent));

// 2. Сверка чисел заголовков с агрегатами (заполняются reconcile()).
const num = (id) => (document.getElementById(id) || {}).textContent;
check("hl-peak numeric", /^\d{2}$/.test(num("hl-peak") || ""));
check("hl-div numeric", /^\d{2}$/.test(num("hl-div") || ""));
check("hl-med numeric", /^\d{2}$/.test(num("hl-med") || ""));
check("hl-first/last filled", (num("hl-first") || "").length > 0 && (num("hl-last") || "").length > 0);
// Джерси-номер US-1 = возраст пика (то же число, что в заголовке).
const jersey = document.querySelector("#chart text.jersey");
check("jersey number == peak headline", jersey && jersey.textContent === num("hl-peak"));

// 3. Один персистентный sticky-канвас: <svg id="chart"> существует и единственный.
const chartEl = document.getElementById("chart");
check("single persistent svg canvas", chartEl && chartEl.tagName.toLowerCase() === "svg" &&
  document.querySelectorAll("#chart").length === 1);

// 4. Прогон всех сцен через тест-сейм + оба «вау»-морфа; канвас не пересоздаётся.
check("scene test seam exposed", typeof window.__nbaScene === "function");
if (typeof window.__nbaScene === "function") {
  const order = ["us1", "us2", "us3", "us4", "us5", "us6", "us7", "us6", "us5", "us1"];
  for (const s of order) { window.__nbaScene(s); }
  check("svg canvas persisted across scenes (same node)", document.getElementById("chart") === chartEl);
  // Сцена-специфичные сигнатурные артефакты (после прохода видны в персистентных слоях).
  window.__nbaScene("us3");
  check("US-3 small multiples rendered", document.querySelectorAll("#chart g.mm").length >= 1);
  window.__nbaScene("us5"); window.__nbaScene("us6");
  check("US-6 histogram bars rendered", document.querySelectorAll("#chart rect.rb").length >= 1);
  check("US-6 fall dots rendered", document.querySelectorAll("#chart circle.fd").length >= 1);
  window.__nbaScene("us7");
  check("US-7 board controls shown", document.getElementById("board").getAttribute("data-on") === "true");
  window.__nbaScene("us1");
}

// 5. Тема: переключение перекрашивает активную сцену без ошибок.
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  themeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("theme toggled to light", document.documentElement.getAttribute("data-theme") === "light");
  themeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("theme toggled back to dark", document.documentElement.getAttribute("data-theme") === "dark");
}

// 6. Модалка «?»: a11y, открытие/закрытие, возврат фокуса.
const backdrop = document.getElementById("about-backdrop");
const btn = document.getElementById("about-btn");
const closeBtn = document.getElementById("about-close");
check("modal present", backdrop && btn && closeBtn);
check("modal initially closed", backdrop && backdrop.getAttribute("data-open") === "false");
const dlg = document.getElementById("about-modal");
check("dialog a11y attrs", dlg && dlg.getAttribute("role") === "dialog" &&
  dlg.getAttribute("aria-modal") === "true" && dlg.getAttribute("aria-labelledby") === "about-title");
check("about-range filled", /\d{4}/.test((document.getElementById("about-range") || {}).textContent || ""));
if (btn) { btn.focus(); btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
check("modal opens on click", backdrop && backdrop.getAttribute("data-open") === "true");
check("aria-expanded true when open", btn && btn.getAttribute("aria-expanded") === "true");
check("focus moved into dialog", document.activeElement === closeBtn);
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("modal closes on Esc", backdrop && backdrop.getAttribute("data-open") === "false");
check("focus returns to trigger", document.activeElement === btn);
btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("modal reopens", backdrop.getAttribute("data-open") === "true");
backdrop.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("backdrop click closes", backdrop.getAttribute("data-open") === "false");

// 7. Дать асинхронным d3-переходам отыграть, затем свести ошибки/сверки.
await new Promise((r) => setTimeout(r, 1500));
check("zero console errors: " + JSON.stringify(consoleErrors), consoleErrors.length === 0);
check("zero console.assert failures: " + JSON.stringify(assertFails), assertFails.length === 0);

if (fails.length) {
  console.error("DOM verify FAILED:\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log("DOM verify OK: offline+dark+signatures, 7 scenes morph on one canvas, modal a11y, 0 errors");
console.log("  season-range: " + (range ? range.textContent : "?"));
console.log("  peak/divergence/median: " + num("hl-peak") + " / " + num("hl-div") + " / " + num("hl-med"));
