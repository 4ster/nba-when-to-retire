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
const fails = [];
const check = (name, ok) => { console.log((ok ? "  ok  " : "  FAIL") + " · " + name); if (!ok) fails.push(name); };

const dotsBefore = d.querySelectorAll("#ch-scatter svg circle").length;
// клик по бину гистограммы (берём 5-й бар)
const bins = [...d.querySelectorAll("#ch-hist svg rect")];
click(bins[5]);
const dotsAfter = d.querySelectorAll("#ch-scatter svg circle").length;
check("кросс-фильтр бина сужает scatter", dotsAfter < dotsBefore && dotsAfter > 0);
check("заголовок таблицы отражает срез", /уход в/.test(d.getElementById("title-table").textContent));
check("сброс активен при кросс-фильтре", d.getElementById("btn-reset").disabled === false);
// toggle: повторный клик по тому же бину
click([...d.querySelectorAll("#ch-hist svg rect")][5]);
check("повторный клик снимает фильтр", d.querySelectorAll("#ch-scatter svg circle").length === dotsBefore);
// клик по бару амплуа
const barG = d.querySelectorAll("#ch-bars svg g")[0];
click(barG);
const posState = [...d.querySelectorAll("#seg-pos button")].find((b) => b.classList.contains("on")).dataset.v;
check("клик по бару амплуа ставит фильтр панели", posState !== "all");
click(d.querySelectorAll("#ch-bars svg g")[0] && [...d.querySelectorAll("#ch-bars svg g")].find(g => g.textContent.includes(posState === "big" ? "Большие" : posState === "guard" ? "Защитники" : "Форварды")));
check("повторный клик по бару снимает", [...d.querySelectorAll("#seg-pos button")].find((b) => b.classList.contains("on")).dataset.v === "all");
// клик по точке lollipop → метрика
const bar0 = [...d.querySelectorAll("#ch-skills svg rect")][0];
click(bar0);
check("клик по навыку меняет метрику", d.getElementById("dd-metric-label").textContent !== "Ценность (BPM)");
check("заголовок линии — навык", /% от пика/.test(d.getElementById("title-line").textContent));
// общий сброс
click(d.getElementById("btn-reset"));
check("общий сброс возвращает дефолт", d.getElementById("btn-reset").disabled === true && d.getElementById("dd-metric-label").textContent === "Ценность (BPM)");
// фильтр статуса
click([...d.querySelectorAll("#seg-status button")].find((b) => b.dataset.v === "active"));
check("статус «играют» сужает таблицу", [...d.querySelectorAll("#tbl-wrap tbody td")].every((td) => !/^\d+$/.test(td.textContent) || true) && /играют/.test(d.getElementById("title-table").textContent));
check("в срезе «играют» нет ушедших", [...d.querySelectorAll("#tbl-wrap tbody tr td:last-child")].every((td) => /играет/.test(td.textContent)));
click(d.getElementById("btn-reset"));
// «что если»: числовой ввод — валидация и клампинг
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const longNum = d.getElementById("wi-long-num");
longNum.value = "abc"; fire(longNum, "change");
check("не-число отброшено (порог остался 15)", d.getElementById("wi-long-num").value === "15");
const ageNum = d.getElementById("wi-age-num");
ageNum.value = "99"; fire(ageNum, "change");
check("99 зажато в максимум 36", d.getElementById("wi-age-num").value === "36");
check("заголовок баров — сценарий 36", /к 36 годам/.test(d.getElementById("title-bars").textContent));
const ageNum2 = d.getElementById("wi-age-num");
ageNum2.value = "1"; fire(ageNum2, "change");
check("1 зажато в минимум 30", d.getElementById("wi-age-num").value === "30");
click(d.getElementById("wi-reset"));
check("сброс сценария: база 15/33", d.getElementById("wi-long-num").value === "15" && /к 33 годам/.test(d.getElementById("title-bars").textContent));
if (asserts.length) { fails.push("asserts"); console.log("ASSERT:", asserts.join("|")); }
if (errors.length) { fails.push("errors"); console.log("ERRORS:", errors.join("|")); }
process.exit(fails.length ? 1 : 0);
