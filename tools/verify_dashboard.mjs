// Смоук-проверка dashboard.html в jsdom: 0 console.error, проваленных assert нет,
// KPI/диаграммы/таблица отрисованы. Запуск: node tools/verify_dashboard.mjs [file]
import fs from "node:fs";
import { JSDOM } from "jsdom";

const file = process.argv[2] ?? "dashboard.html";
const html = fs.readFileSync(file, "utf8");

const errors = [], asserts = [];
const vc = new (await import("jsdom")).VirtualConsole();
vc.on("error", (...a) => errors.push(a.join(" ")));
vc.on("assert", (ok, ...a) => { if (!ok) asserts.push(a.join(" ")); });
vc.on("jsdomError", (e) => { if (!/not implemented/i.test(String(e))) errors.push(String(e)); });

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/", virtualConsole: vc });
const { window } = dom;
// полифиллы под jsdom: layout и SVG-метрики
Object.defineProperty(window.Element.prototype, "clientWidth", { get() { return 600; } });
Object.defineProperty(window.Element.prototype, "clientHeight", { get() { return 300; } });
window.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: 60, height: 12 }; };

window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));

const d = window.document;
const checks = [
  ["6 KPI-карточек (5 + сценарий)", d.querySelectorAll(".kpi").length === 6],
  ["KPI-значения не пустые", [...d.querySelectorAll(".kpi-value")].every((e) => e.textContent.trim().length > 0)],
  ["линия отрисована", !!d.querySelector("#ch-line svg path")],
  ["бары амплуа (3)", d.querySelectorAll("#ch-bars svg rect").length === 3],
  ["диапазоны навыков (7 полос)", d.querySelectorAll("#ch-skills svg rect").length === 7],
  ["гистограмма ухода (бары)", d.querySelectorAll("#ch-hist svg rect").length >= 20],
  ["scatter (>1000 точек)", d.querySelectorAll("#ch-scatter svg circle").length > 1000],
  ["ряды-секции (2)", d.querySelectorAll(".row-label").length === 2],
  ["модал методики есть", !!d.getElementById("help")],
  ["значки выводов на карточках (5)", d.querySelectorAll(".ai-hint").length === 5],
  ["карточка «Что если» с контролами", !!d.getElementById("wi-long") && !!d.getElementById("wi-age-num")],
  ["таблица (14 строк)", d.querySelectorAll("#tbl-wrap tbody tr").length === 14],
  ["кнопка сброса disabled в дефолте", d.getElementById("btn-reset").disabled === true],
  ["подзаголовок с диапазоном сезонов", /1952–2026/.test(d.getElementById("hdr-sub").textContent)],
];
let fail = 0;
for (const [name, ok] of checks) { console.log((ok ? "  ok  " : "  FAIL") + " · " + name); if (!ok) fail++; }
if (asserts.length) { fail++; console.log("  FAIL · console.assert: " + asserts.join(" | ")); }
if (errors.length) { fail++; console.log("  FAIL · console.error: " + errors.join(" | ")); }
if (fail) { console.error(`FAIL: ${fail} проблем(ы)`); process.exit(1); }
console.log("OK: смоук-проверка dashboard.html пройдена");
