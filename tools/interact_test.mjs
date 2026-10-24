import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
const html = fs.readFileSync("dashboard.html", "utf8");
const errors = [], asserts = [];
const vc = new VirtualConsole();
vc.on("error", (...a) => errors.push(a.join(" ")));
vc.on("assert", (ok, ...a) => { if (!ok) asserts.push(a.join(" ")); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/", virtualConsole: vc });
const { window } = dom;
Object.defineProperty(window.Element.prototype, "clientWidth", { get() { return 600; } });
Object.defineProperty(window.Element.prototype, "clientHeight", { get() { return 300; } });
window.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: 60, height: 12 }; };
await new Promise((r) => setTimeout(r, 100));
const d = window.document;
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

// прогон всех комбинаций фильтров: ловим краевые вырождения
const posBtns = [...d.querySelectorAll("#seg-pos button")];
const eraBtns = [...d.querySelectorAll("#seg-era button")];
let combos = 0;
for (const pb of posBtns) for (const eb of eraBtns) {
  click(pb); click(eb); combos++;
  const kv = [...d.querySelectorAll(".kpi-value")].map((e) => e.textContent.trim());
  if (kv.some((v) => !v)) errors.push(`пустой KPI при ${pb.dataset.v}/${eb.dataset.v}`);
}
// метрики (кастомный дропдаун)
for (const li of [...d.querySelectorAll("#dd-metric-list li")]) {
  click(li); combos++;
}
// статусы
for (const b of [...d.querySelectorAll("#seg-status button")]) {
  click(b); combos++;
}
// сброс
click(d.getElementById("btn-reset"));
if (d.getElementById("btn-reset").disabled !== true) errors.push("сброс не вернул disabled");
// тема
click(d.getElementById("btn-theme"));
if (d.documentElement.getAttribute("data-theme") !== "light") errors.push("тема не переключилась");
click(d.getElementById("btn-theme"));

console.log(`комбинаций прогнано: ${combos}`);
if (asserts.length) console.log("ASSERT FAIL:", asserts.join(" | "));
if (errors.length) { console.error("FAIL:", errors.join(" | ")); process.exit(1); }
console.log("OK: интерактив без ошибок на всех комбинациях фильтров");
