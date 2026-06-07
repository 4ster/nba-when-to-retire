// Headless render-verify of the single-file index.html (skill-context: aif-verify).
// jsdom executes the app on the real embedded data with d3 injected (CDN is not
// fetched in jsdom), then asserts: zero console errors, season-range subtitle filled,
// and the "?" modal opens/closes with focus return. Run: node tools/verify_dom.mjs
import fs from "node:fs";
import { JSDOM } from "jsdom";
import * as d3 from "d3";

const html = fs.readFileSync("index.html", "utf8");
const fails = [];
const consoleErrors = [];

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// d3 грузится с CDN (SRI) — в jsdom сети нет, инжектируем npm-d3 как глобал.
window.d3 = d3;
// scrollama отсутствует — в коде это уже под guard (сцены просто не листаются скроллом).

// SVG-раскладка в jsdom не реализована: getBBox должен что-то вернуть, иначе d3-метки падают.
window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 80, height: 16 });

window.console.error = (...a) => consoleErrors.push(a.map(String).join(" "));
window.console.warn = () => {};

// Выполнить единственный app-блок (IIFE инициализируется в конце — ловит hoisting).
const appScript = [...document.querySelectorAll("script")].find(
  (s) => s.id === "app" || /initMeta/.test(s.textContent),
);
if (!appScript) {
  console.error("FAIL: app script block not found");
  process.exit(1);
}
try {
  window.eval(appScript.textContent);
} catch (err) {
  console.error("FAIL: app threw on execution:", err && err.stack ? err.stack : err);
  process.exit(1);
}

function check(name, cond) {
  if (!cond) { fails.push(name); }
}

// 1. Подзаголовок: охват сезонов подставлен и снимает двусмысленность.
const range = document.getElementById("season-range");
check("season-range filled", range && /охват/.test(range.textContent) && /\d{4}/.test(range.textContent));
check("season-range mentions count", range && /сезон/.test(range.textContent));

// 2. Модалка изначально закрыта.
const backdrop = document.getElementById("about-backdrop");
const btn = document.getElementById("about-btn");
const closeBtn = document.getElementById("about-close");
check("modal present", backdrop && btn && closeBtn);
check("modal initially closed", backdrop && backdrop.getAttribute("data-open") === "false");
const dlg = document.getElementById("about-modal");
const dlgA11y = dlg && dlg.getAttribute("role") === "dialog" &&
  dlg.getAttribute("aria-modal") === "true" &&
  dlg.getAttribute("aria-labelledby") === "about-title";
check("dialog a11y attrs", dlgA11y);
const aboutRange = document.getElementById("about-range");
check("about-range filled", aboutRange && /\d{4}/.test(aboutRange.textContent));

// 3. Открытие по клику на «?».
if (btn) {
  btn.focus();
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
check("modal opens on click", backdrop && backdrop.getAttribute("data-open") === "true");
check("aria-expanded true when open", btn && btn.getAttribute("aria-expanded") === "true");
check("focus moved into dialog", document.activeElement === closeBtn);

// 4. Esc закрывает и возвращает фокус на кнопку «?».
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("modal closes on Esc", backdrop && backdrop.getAttribute("data-open") === "false");
check("focus returns to trigger", document.activeElement === btn);

// 5. Повторное открытие + закрытие кликом по бэкдропу.
btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("modal reopens", backdrop.getAttribute("data-open") === "true");
backdrop.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("backdrop click closes", backdrop.getAttribute("data-open") === "false");

// 6. Ноль ошибок в консоли (битый CDN/SRI/runtime всплыл бы здесь).
check("zero console errors: " + JSON.stringify(consoleErrors), consoleErrors.length === 0);

if (fails.length) {
  console.error("DOM verify FAILED:\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log("DOM verify OK: subtitle range + modal a11y + zero console errors");
console.log("  season-range: " + (range ? range.textContent : "?"));
