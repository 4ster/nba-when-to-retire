import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
const html = fs.readFileSync("dashboard.html", "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("error", (...a) => errors.push(a.join(" ")));
vc.on("assert", (ok, ...a) => { if (!ok) errors.push("assert: " + a.join(" ")); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/", virtualConsole: vc });
const { window } = dom;
Object.defineProperty(window.Element.prototype, "clientWidth", { get() { return 600; } });
Object.defineProperty(window.Element.prototype, "clientHeight", { get() { return 300; } });
window.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: 60, height: 12 }; };
await new Promise((r) => setTimeout(r, 100));
const d = window.document;
const fails = [];
const check = (n, ok) => { console.log((ok ? "  ok  " : "  FAIL") + " · " + n); if (!ok) fails.push(n); };
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

check("AI-текст не пуст (дефолт)", d.getElementById("ai-text").textContent.trim().length > 20);
// сценарий: порог долгожителя 18
const wl = d.getElementById("wi-long");
wl.value = "18"; fire(wl, "input"); fire(wl, "change");
const kpi4 = [...d.querySelectorAll(".kpi")].find((k) => /Долгожители/.test(k.textContent));
check("KPI-4 показывает сценарий 18+", /18\+/.test(kpi4.textContent) && /сценарий/.test(kpi4.textContent));
check("KPI-4 показывает базу", /база \(15\+\)/.test(kpi4.textContent));
check("wi-reset активен", d.getElementById("wi-reset").disabled === false);
// сценарий: запас к 35
const wa = d.getElementById("wi-age");
wa.value = "35"; fire(wa, "input"); fire(wa, "change");
check("заголовок баров — сценарный возраст", /к 35/.test(d.getElementById("title-bars").textContent));
// сброс сценария
click(d.getElementById("wi-reset"));
check("сброс сценария возвращает базу", /15\+/.test([...d.querySelectorAll(".kpi")].find((k) => /Долгожители/.test(k.textContent)).textContent) && /к 33/.test(d.getElementById("title-bars").textContent));
check("кнопка сброса фильтров не зависит от сценария", d.getElementById("btn-reset").disabled === true);
// AI-текст при фильтрах
click([...d.querySelectorAll("#seg-pos button")].find((b) => b.dataset.v === "big"));
check("AI-текст при фильтре амплуа", /Биги/.test(d.getElementById("ai-text").textContent));
click([...d.querySelectorAll("#ch-hist svg rect")][3]);
check("AI-текст при кросс-фильтре бина", /Уход в|Карьер с уходом/.test(d.getElementById("ai-text").textContent));
click(d.getElementById("btn-reset"));
if (errors.length) { fails.push("errors"); console.log("ERRORS:", errors.join(" | ")); }
process.exit(fails.length ? 1 : 0);
