"use strict";
/* ============================================================================
 * Карьеры игроков НБА — классический BI-дашборд (один экран).
 * Архитектура: state → snap() (один источник истины §17) → render*().
 * История: ряд 1 — модель старения (средние траектории),
 *          ряд 2 — реальные карьеры (распределения и имена).
 * ========================================================================== */

/* ===== Данные и словари ===== */
const DATA = JSON.parse(document.getElementById("seed-data").textContent);

const POS = ["guard", "wing", "big"];
const POS_RU = { guard: "Защитники", wing: "Форварды", big: "Большие" };
const POS_ONE = { guard: "защитники", wing: "форварды", big: "большие" };
const POS_HINT = {
  guard: "Разыгрывающие и атакующие защитники (PG, SG)",
  wing: "Лёгкие форварды (SF)",
  big: "Тяжёлые форварды и центровые (PF, C)",
};
const POS_COLOR = { guard: "var(--g)", wing: "var(--w)", big: "var(--b)" };
const ERAS = ["≤1989", "1990–2009", "2010+"];
const ERA_RU = { "≤1989": "до 1990", "1990–2009": "1990–2009", "2010+": "2010+" };
const SKILLS = ["PTS_36", "REB_36", "AST_36", "STL_36", "BLK_36", "FG3_pct", "TS_pct"];
const SKILL_RU = {
  PTS_36: "Очки", REB_36: "Подборы", AST_36: "Передачи", STL_36: "Перехваты",
  BLK_36: "Блоки", FG3_pct: "3-очковый", TS_pct: "Точность броска",
};
const SKILL_SHORT = { ...SKILL_RU, TS_pct: "Точность" }; // подписи строк в графике
const STATUSES = ["all", "active", "retired"];
const STATUS_RU = { all: "Все", active: "Играют", retired: "Завершили" };
const LONGEVITY_BASE = 15; // базовый порог «долгожителя», сезонов
const RESERVE_BASE = 33;   // базовый возраст «запаса ценности»
const RISK_AGE = 30;      // начало зоны контрактного риска (спад ×3)
const FADE_PCT = 85;      // навык «отцвёл», когда ниже этой доли пика

const AI_MODE = "hints"; // подача AI-выводов: значки на карточках (выбор пользователя)

const ruName = (p) => p.name_ru || p.name;
const ruSurname = (p) => ruName(p).split(" ").pop();

/* ===== Состояние ===== */
const state = {
  pos: "all",        // фильтр амплуа (панель и кросс-клики синхронизированы)
  era: "all",        // фильтр эпохи
  metric: "value",   // метрика возрастной кривой
  exitBin: null,     // кросс-фильтр: возраст ухода (бин гистограммы / ячейка таблицы)
  status: "all",     // статус карьеры: все / играют / завершили
  focusPlayer: null, // подсветка игрока: строка таблицы ↔ точка scatter
  wiLong: LONGEVITY_BASE, // «что если»: порог долгожителя (слайдер в KPI-карточке)
  wiAge: RESERVE_BASE,    // «что если»: возраст оценки запаса (слайдер в заголовке баров)
};

/* ===== Форматирование (§15, §17.1) ===== */
const fmtInt = (v) => Math.round(v).toLocaleString("ru-RU");
const fmt1 = (v) => v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = (v) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v));
const declN = (n, one, two, many) => {
  const a = n % 10, b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return two;
  return many;
};
const yearsWord = (n) => declN(n, "год", "года", "лет");
const seasonsWord = (n) => declN(n, "сезон", "сезона", "сезонов");
const playersWord = (n) => declN(n, "игрок", "игрока", "игроков");
const careersWord = (n) => declN(n, "карьера", "карьеры", "карьер");

/* ===== Агрегация: один источник истины (§17) ===== */
function wAvg(rows) {
  let s = 0, n = 0;
  for (const r of rows) { s += r.value * r.n; n += r.n; }
  return n ? { v: s / n, n } : null;
}

// Кумулятивная кривая ценности из дельт год-к-году (дельта-метод пайплайна).
function cumCurve(rows) {
  const byAge = new Map();
  for (const r of rows) {
    const a = byAge.get(r.age) || { s: 0, n: 0 };
    a.s += r.value * r.n; a.n += r.n;
    byAge.set(r.age, a);
  }
  const ages = [...byAge.keys()].sort((x, y) => x - y);
  const nMax = Math.max(...ages.map((a) => byAge.get(a).n), 1);
  const minN = Math.max(8, Math.round(nMax * 0.04));
  const pts = [];
  let acc = 0;
  for (const a of ages) {
    const { s, n } = byAge.get(a);
    if (n < minN) { if (pts.length) break; else continue; }
    acc += s / n;
    pts.push({ age: a, v: acc, d: s / n, n });
  }
  return pts;
}

function agingRows(pos, era) {
  return DATA.aging_curve.filter(
    (r) => r.metric === "value" && (pos === "all" || r.position_group === pos) && (era === "all" || r.era_bucket === era)
  );
}
function exitRows(pos, era) {
  return DATA.exit_age.filter(
    (r) => (pos === "all" || r.position_group === pos) && (era === "all" || r.era_bucket === era)
  );
}
function peaksRows(pos, era) {
  return DATA.player_peaks.filter(
    (p) => (pos === "all" || p.position_group === pos) && (era === "all" || p.era_bucket === era)
  );
}

function weightedMedian(pairs) {
  const total = pairs.reduce((s, p) => s + p.n, 0);
  if (!total) return null;
  let acc = 0;
  for (const p of pairs) { acc += p.n; if (acc >= total / 2) return p.x; }
  return pairs.length ? pairs[pairs.length - 1].x : null;
}
function weightedQuantile(pairs, q) {
  const total = pairs.reduce((s, p) => s + p.n, 0);
  if (!total) return null;
  let acc = 0;
  for (const p of pairs) { acc += p.n; if (acc >= total * q) return p.x; }
  return pairs[pairs.length - 1].x;
}

function skillCurve(component) {
  return DATA.skill_decline
    .filter((r) => r.component === component && r.n >= 30)
    .sort((a, b) => a.age - b.age)
    .map((r) => ({ age: r.age, v: r.value_pct, n: r.n }));
}

function snap() {
  const { pos, era } = state;
  const rows = agingRows(pos, era);

  // Кривая ценности (или навыковая, если выбрана метрика-навык)
  const curve = state.metric === "value" ? cumCurve(rows) : skillCurve(state.metric);
  const peakPt = curve.length ? curve.reduce((m, p) => (p.v > m.v ? p : m)) : null;

  // Кривые по амплуа (для бара и KPI-сравнения) — фильтр эпохи применяется
  const posCurves = {};
  for (const p of POS) posCurves[p] = cumCurve(agingRows(p, era));

  // Запас ценности к 33: значение кривой в 33 как доля от пика
  const reserve = POS.map((p) => {
    const c = posCurves[p];
    if (!c.length) return { pos: p, pct: null };
    const peak = c.reduce((m, q) => (q.v > m.v ? q : m));
    const at = c.filter((q) => q.age <= state.wiAge).pop();
    if (!at || peak.v <= 0) return { pos: p, pct: null };
    return { pos: p, pct: Math.max(0, (at.v / peak.v) * 100), peakAge: peak.age, atAge: at.age };
  }).filter((r) => r.pct != null).sort((a, b) => b.pct - a.pct);

  // Навыки: расцвет = от возраста пика до падения ниже FADE_PCT% пика
  const skills = SKILLS.map((c) => {
    const sc = skillCurve(c);
    if (!sc.length) return null;
    const on = sc.reduce((m, p) => (p.v > m.v ? p : m));
    const fadePt = sc.find((p) => p.age > on.age && p.v < FADE_PCT);
    const at33 = sc.filter((p) => p.age <= 33).pop();
    return {
      c, onset: on.age,
      fade: fadePt ? fadePt.age : null,
      last: sc[sc.length - 1].age,
      at33: at33 ? at33.v : null,
      craft: on.age >= 30, // мастерство vs атлетизм
    };
  }).filter(Boolean).sort((a, b) => a.onset - b.onset || a.c.localeCompare(b.c));

  // Уход: гистограмма + квартили (не зависят от кросс-фильтров по карьерам)
  const ex = exitRows(pos, era);
  const histMap = new Map();
  for (const r of ex) histMap.set(r.age, (histMap.get(r.age) || 0) + r.n);
  const hist = [...histMap.entries()].map(([age, n]) => ({ age, n })).sort((a, b) => a.age - b.age);
  const pairs = hist.map((h) => ({ x: h.age, n: h.n }));
  const medianExit = weightedMedian(pairs);
  const q25 = weightedQuantile(pairs, 0.25), q75 = weightedQuantile(pairs, 0.75);
  // медианы ухода по амплуа (для KPI-сравнения, фильтр эпохи применяется)
  const posMedianExit = {};
  for (const p of POS) {
    const m = new Map();
    for (const r of exitRows(p, era)) m.set(r.age, (m.get(r.age) || 0) + r.n);
    posMedianExit[p] = weightedMedian([...m.entries()].map(([x, n]) => ({ x, n })).sort((a, b) => a.x - b.x));
  }
  const exitsTotal = hist.reduce((s, h) => s + h.n, 0);

  // Пики карьер: peaksAll — срез панельных фильтров (стабильные оси §10.4),
  // peaks — дополнительно сужен кросс-фильтрами (бин ухода / только действующие)
  const peaksAll = peaksRows(pos, era);
  let peaks = peaksAll;
  if (state.exitBin != null) peaks = peaks.filter((q) => q.exit_age === state.exitBin);
  if (state.status === "active") peaks = peaks.filter((q) => q.exit_age == null);
  if (state.status === "retired") peaks = peaks.filter((q) => q.exit_age != null);
  const longevity = peaks.filter((q) => q.seasons >= state.wiLong);
  const active = peaks.filter((q) => q.exit_age == null);

  // Темпы: плато 26–29 vs спад 30–35 (средняя дельта BPM/год)
  const plateau = wAvg(rows.filter((r) => r.age >= 26 && r.age <= 29));
  const late = wAvg(rows.filter((r) => r.age >= RISK_AGE && r.age <= 35));

  return {
    curve, peakPt, posCurves, reserve, skills,
    hist, medianExit, posMedianExit, q25, q75, exitsTotal,
    peaks, peaksAll, longevity, active, plateau, late,
  };
}

/* ===== SVG-хелперы ===== */
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
function freshSvg(boxId) {
  const box = document.getElementById(boxId);
  box.innerHTML = "";
  const w = box.clientWidth, h = box.clientHeight;
  const svg = svgEl("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` }, box);
  return { svg, w, h };
}
function linScale(d0, d1, r0, r1) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  return (x) => r0 + (x - d0) * k;
}
// Монотонная кубическая интерполяция (Фрич–Карлсон): плавно и через все точки (§5.10)
function monotonePathD(xs, ys) {
  const n = xs.length;
  if (n < 3) return xs.map((px, i) => `${i ? "L" : "M"}${px.toFixed(1)},${ys[i].toFixed(1)}`).join("");
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(xs[i + 1] - xs[i]); m.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])); }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    d += `C${(xs[i] + h / 3).toFixed(1)},${(ys[i] + (t[i] * h) / 3).toFixed(1)} ` +
         `${(xs[i + 1] - h / 3).toFixed(1)},${(ys[i + 1] - (t[i + 1] * h) / 3).toFixed(1)} ` +
         `${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return d;
}
function pill(svg, cx, topY, text, color) {
  const g = svgEl("g", {}, svg);
  const t = svgEl("text", { x: cx, y: topY, "text-anchor": "middle", class: "num" }, g);
  t.textContent = text;
  t.style.fill = color;
  const bb = t.getBBox();
  const r = svgEl("rect", {
    x: bb.x - 7, y: bb.y - 4, width: bb.width + 14, height: bb.height + 8,
    rx: (bb.height + 8) / 2,
  }, g);
  r.style.fill = "var(--surface2)";
  r.style.stroke = color;
  r.style.strokeWidth = "0.5";
  g.appendChild(t);
  return g;
}
function noData(boxId, msg) {
  const box = document.getElementById(boxId);
  box.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;text-align:center;padding:0 16px">${msg}</div>`;
}

/* ===== Тултип ===== */
const tip = document.getElementById("tip");
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.style.display = "block";
  moveTip(ev);
}
function moveTip(ev) {
  const pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  const r = tip.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideTip() { tip.style.display = "none"; }

/* ===== KPI-карточки (§6): 4 штуки, границы согласованы с сеткой тела ===== */
function kpiCard({ name, value, unit, lead, risk, inds }) {
  const indHtml = (inds || []).map(
    (i) => `<div class="kpi-ind"><span class="lbl">${i.lbl}</span><span class="val ${i.cls || ""}">${i.val}</span></div>`
  ).join("");
  return `<div class="kpi ${lead ? "lead" : ""}${risk ? "risk" : ""}">
    <div class="kpi-main"><span class="kpi-name">${name}</span>
      <span class="kpi-value">${value}${unit ? `<span class="unit">${unit}</span>` : ""}</span></div>
    <div class="kpi-side">${indHtml}</div>
  </div>`;
}

function renderKPI(S) {
  const el = document.getElementById("kpis");
  const cards = [];

  // 1. Пик ценности (всегда по метрике value)
  const valueCurve = state.metric === "value" ? S.curve : cumCurve(agingRows(state.pos, state.era));
  const vPeak = valueCurve.length ? valueCurve.reduce((m, p) => (p.v > m.v ? p : m)) : null;
  let peakInds;
  if (state.pos === "all") {
    peakInds = POS.map((p) => {
      const c = S.posCurves[p];
      const pk = c.length ? c.reduce((m, q) => (q.v > m.v ? q : m)).age : "—";
      return { lbl: POS_RU[p], val: String(pk) };
    });
  } else {
    const allPeak = cumCurve(agingRows("all", state.era));
    const apk = allPeak.length ? allPeak.reduce((m, q) => (q.v > m.v ? q : m)).age : "—";
    peakInds = [{ lbl: "вся выборка", val: String(apk) }];
  }
  cards.push(kpiCard({
    name: "Пик ценности", lead: true,
    value: vPeak ? String(vPeak.age) : "—", unit: vPeak ? yearsWord(vPeak.age) : "",
    inds: peakInds,
  }));

  // 2. Медиана ухода (фильтруется амплуа/эпохой; сравнение — по амплуа)
  const exitInds = state.pos === "all"
    ? POS.map((p) => ({ lbl: POS_RU[p], val: S.posMedianExit[p] != null ? String(S.posMedianExit[p]) : "—" }))
    : [
        { lbl: "четверть уже к", val: S.q25 != null ? String(S.q25) : "—" },
        { lbl: "три четверти к", val: S.q75 != null ? String(S.q75) : "—" },
      ];
  cards.push(kpiCard({
    name: "Медиана ухода",
    value: S.medianExit != null ? String(S.medianExit) : "—",
    unit: S.medianExit != null ? yearsWord(S.medianExit) : "",
    inds: exitInds,
  }));

  // 3. Спад после 30 — зона контрактного риска (связан с подложкой на кривой)
  const lateV = S.late ? S.late.v : null;
  const ratio = S.late && S.plateau && S.plateau.v < 0 ? S.late.v / S.plateau.v : null;
  // суммарная потеря 30→35 в абсолюте — отвечает на «много это или мало»
  const v29 = valueCurve.find((q) => q.age === 29), v35 = valueCurve.find((q) => q.age === 35);
  const drop = v29 && v35 ? v35.v - v29.v : null;
  cards.push(kpiCard({
    name: "Спад после 30", risk: true,
    value: lateV != null ? signed(lateV, fmt2) : "—",
    unit: "BPM/год",
    inds: [
      { lbl: "плато", val: S.plateau ? signed(S.plateau.v, fmt2) : "—" },
      { lbl: "к плато", val: ratio ? "×" + fmt1(ratio) : "—", cls: "bad" },
      { lbl: "за 6 лет", val: drop != null ? signed(drop, fmt1) : "—", cls: "bad" },
    ],
  }));

  // 4. Долгожители (порог управляется карточкой «Что если»)
  const longScen = state.wiLong !== LONGEVITY_BASE;
  const top = S.longevity.slice().sort((a, b) => b.seasons - a.seasons)[0];
  cards.push(kpiCard({
    name: `Долгожители ${state.wiLong}+ ${seasonsWord(state.wiLong)}${longScen ? ' <span class="scen-tag">· сценарий</span>' : ""}`,
    value: fmtInt(S.longevity.length), unit: "",
    inds: [
      { lbl: "доля", val: S.peaks.length ? fmt1((S.longevity.length / S.peaks.length) * 100) + "%" : "—", cls: "accent" },
      longScen
        ? { lbl: `база ${LONGEVITY_BASE}+`, val: fmtInt(S.peaks.filter((q) => q.seasons >= LONGEVITY_BASE).length) }
        : { lbl: "рекорд", val: top ? String(top.seasons) : "—" },
    ],
  }));

  // 5. Карьер в анализе
  const medSeasons = (() => {
    const ss = S.peaks.map((q) => q.seasons).sort((a, b) => a - b);
    return ss.length ? ss[Math.floor(ss.length / 2)] : null;
  })();
  cards.push(kpiCard({
    name: "Карьер в анализе",
    value: fmtInt(S.peaks.length), unit: "",
    inds: [
      { lbl: "действующих", val: fmtInt(S.active.length), cls: "good" },
      { lbl: "медиана сезонов", val: medSeasons != null ? String(medSeasons) : "—" },
    ],
  }));

  // 6. Карточка сценария «Что если» (§20): слайдер + число, валидация в buildWhatIf
  const scen = longScen || state.wiAge !== RESERVE_BASE;
  cards.push(`<div class="kpi wi-card" title="Сценарий «что если»: пороги пересчитывают карточки «Долгожители» и «Запас ценности». Данные не меняются.">
    <div class="wi-head"><span class="kpi-name">Что если</span>
      <button id="wi-reset" class="wi-reset ${scen ? "show" : ""}" title="Сбросить сценарий к базовым 15 сезонам и 33 годам" aria-label="Сбросить сценарий">↺</button>
    </div>
    <div class="wi-row" title="Сколько сезонов (от 1000 минут) должна продлиться карьера, чтобы считаться длинной. Пересчитывает карточку «Долгожители». База — 15.">
      <span class="wi-lbl">долгожитель от</span>
      <input type="range" id="wi-long" min="10" max="20" step="1" value="${state.wiLong}" aria-label="Порог карьеры-долгожителя, сезонов">
      <input class="wi-input ${longScen ? "scen" : ""}" id="wi-long-num" inputmode="numeric" maxlength="2" value="${state.wiLong}" aria-label="Порог долгожителя числом (от 10 до 20)" title="От 10 до 20 сезонов">
      <span class="wi-unit">${seasonsWord(state.wiLong)}</span></div>
    <div class="wi-row" title="Возраст, на котором оцениваем остаток пиковой формы. Пересчитывает график «Запас ценности». База — 33.">
      <span class="wi-lbl">запас ценности к</span>
      <input type="range" id="wi-age" min="30" max="36" step="1" value="${state.wiAge}" aria-label="Возраст оценки запаса ценности">
      <input class="wi-input ${state.wiAge !== RESERVE_BASE ? "scen" : ""}" id="wi-age-num" inputmode="numeric" maxlength="2" value="${state.wiAge}" aria-label="Возраст оценки числом (от 30 до 36)" title="От 30 до 36 лет">
      <span class="wi-unit">${declN(state.wiAge, "году", "годам", "годам")}</span></div>
  </div>`);

  el.innerHTML = cards.join("");
  const longCard = [...el.children].find((c) => /Долгожители/.test(c.textContent));
  if (longCard) longCard.id = "kpi-long"; // адресат свечения слайдера порога
}

/* ===== Линия: кривая ценности / навыка, с зоной контрактного риска ===== */
function renderLine(S) {
  const title = document.getElementById("title-line");
  const isValue = state.metric === "value";
  const scoped = !isValue && (state.pos !== "all" || state.era !== "all");
  title.innerHTML = isValue
    ? "Кривая ценности по возрасту, накопленный BPM"
    : `${SKILL_RU[state.metric]} по возрасту, % от пика` +
      (scoped ? ' <span class="scope-note" title="Навыковые кривые агрегированы по всей выборке и не зависят от фильтров амплуа и эпохи">вся выборка</span>' : "");

  if (!S.curve.length) return noData("ch-line", "Нет данных в выбранном фильтре");
  const { svg, w, h } = freshSvg("ch-line");
  const m = { t: 36, r: 30, b: 26, l: 30 };
  const pts = S.curve;
  const x = linScale(pts[0].age, pts[pts.length - 1].age, m.l, w - m.r);
  let vMin = Math.min(...pts.map((p) => p.v)), vMax = Math.max(...pts.map((p) => p.v));
  if (isValue) vMin = Math.min(vMin, 0);
  const padV = (vMax - vMin) * 0.18 || 1;
  const y = linScale(vMin - padV * 0.4, vMax + padV, h - m.b, m.t);

  // Зона контрактного риска: после 30 спад втрое круче плато (KPI «Спад после 30»)
  if (isValue && pts[pts.length - 1].age > RISK_AGE && pts[0].age < RISK_AGE) {
    const zx = x(RISK_AGE);
    const zone = svgEl("rect", { x: zx, y: m.t - 14, width: w - m.r - zx, height: h - m.b - m.t + 14, rx: 6 }, svg);
    zone.style.fill = "var(--bad-soft)";
    const zl = svgEl("line", { x1: zx, x2: zx, y1: m.t - 14, y2: h - m.b, "stroke-dasharray": "4 4" }, svg);
    zl.style.stroke = "var(--bad)";
    zl.style.opacity = 0.45;
    const zt = svgEl("text", { x: w - m.r - 14, y: m.t + 6, "text-anchor": "end" }, svg);
    zt.textContent = "зона контрактного риска";
    zt.style.fill = "var(--bad)";
    zt.style.fontSize = "10.5px";
  }

  // Плавная кривая (монотонная — проходит через все точки)
  const d = monotonePathD(pts.map((p) => x(p.age)), pts.map((p) => y(p.v)));
  const path = svgEl("path", { d, fill: "none", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round", pathLength: 1, class: "anim-draw" }, svg);
  path.style.stroke = "var(--acc)";

  // Точки, метки данных (через одну) и возраст под опорными точками — без осей
  const lastIdx = pts.length - 1;
  pts.forEach((p, i) => {
    const c = svgEl("circle", { cx: x(p.age), cy: y(p.v), r: 3 }, svg);
    c.style.fill = "var(--acc)";
    c.addEventListener("mousemove", (ev) => {
      const val = isValue ? `<b>${signed(p.v, fmt1)}</b> BPM к уровню 19 лет` : `<b>${fmt1(p.v)}%</b> от пика`;
      const scaleHint = isValue
        ? `<br><span class="t-muted">для сравнения: +5 BPM — разрыв между средним игроком и уровнем всех звёзд</span>`
        : "";
      showTip(`<span class="t-muted">${p.age} ${yearsWord(p.age)}</span><br>${val}<br><span class="t-muted">${fmtInt(p.n)} ${declN(p.n, "наблюдение", "наблюдения", "наблюдений")}</span>${scaleHint}`, ev);
    });
    c.addEventListener("mouseleave", hideTip);

    const isPeak = S.peakPt && p.age === S.peakPt.age;
    if ((i % 2 === 0 || i === lastIdx) && !isPeak) {
      const anchor = i === 0 ? "start" : i === lastIdx ? "end" : "middle";
      const dx = anchor === "start" ? -3 : anchor === "end" ? 4 : 0;
      const t = svgEl("text", { x: x(p.age) + dx, y: y(p.v) - 9, "text-anchor": anchor, class: "dim num" }, svg);
      t.textContent = isValue ? signed(p.v, fmt1) : fmtInt(p.v) + "%";
    }
    if (p.age % 5 === 0) {
      const t = svgEl("text", { x: x(p.age), y: h - 6, "text-anchor": "middle", class: "axis num" }, svg);
      t.textContent = p.age;
    }
  });

  // Пик — pill всегда сверху (§5.3)
  if (S.peakPt) {
    const px = Math.min(Math.max(x(S.peakPt.age), m.l + 36), w - m.r - 36);
    pill(svg, px, Math.max(y(S.peakPt.v) - 18, 12), `пик · ${S.peakPt.age} ${yearsWord(S.peakPt.age)}`, "var(--acc)");
  }
}

/* ===== Бары: запас ценности к 33 по амплуа ===== */
function renderBars(S) {
  document.getElementById("title-bars").innerHTML =
    `Запас ценности к ${state.wiAge} ${declN(state.wiAge, "году", "годам", "годам")}, % от пика амплуа` +
    (state.wiAge !== RESERVE_BASE ? ' <span class="scen-tag">· сценарий</span>' : "");
  if (!S.reserve.length) return noData("ch-bars", "Нет данных в выбранном фильтре");
  const { svg, w, h } = freshSvg("ch-bars");
  const m = { t: 10, r: 52, b: 6, l: 84 };
  const rowH = (h - m.t - m.b) / S.reserve.length;
  const barH = Math.min(34, rowH * 0.5);
  const x = linScale(0, Math.max(...S.reserve.map((r) => r.pct)) * 1.12, m.l, w - m.r);

  S.reserve.forEach((r, i) => {
    const cy = m.t + rowH * i + rowH / 2;
    const muted = state.pos !== "all" && state.pos !== r.pos;
    const g = svgEl("g", { opacity: muted ? 0.35 : 1 }, svg);
    const name = svgEl("text", { x: m.l - 10, y: cy + 4, "text-anchor": "end" }, g);
    name.textContent = POS_RU[r.pos];
    const rect = svgEl("rect", { x: m.l, y: cy - barH / 2, width: Math.max(2, x(r.pct) - m.l), height: barH, rx: 4, class: "anim-bar-x" }, g);
    rect.style.fill = POS_COLOR[r.pos];
    const v = svgEl("text", { x: x(r.pct) + 8, y: cy + 4, class: "num" }, g);
    v.textContent = fmtInt(r.pct) + "%";
    g.style.cursor = "pointer";
    g.addEventListener("mousemove", (ev) => showTip(
      `<b>${POS_RU[r.pos]}</b> <span class="t-muted">· ${POS_HINT[r.pos]}</span><br>` +
      (r.pct > 0
        ? `к ${r.atAge} ${declN(r.atAge, "году", "годам", "годам")} остаётся <b>${fmtInt(r.pct)}%</b> пиковой ценности`
        : `к ${r.atAge} ${declN(r.atAge, "году", "годам", "годам")} накопленная ценность опускается до уровня 19-летнего игрока — запаса <b>не остаётся</b>`) +
      (state.wiAge !== RESERVE_BASE ? `<br><span class="t-muted">сценарий: возраст оценки ${state.wiAge} (база ${RESERVE_BASE})</span>` : "") +
      `<br><span class="t-muted">пик амплуа — ${r.peakAge} ${yearsWord(r.peakAge)} · клик — фильтр по амплуа</span>`, ev));
    g.addEventListener("mouseleave", hideTip);
    g.addEventListener("click", () => { hideTip(); togglePos(r.pos); });
  });
}

/* ===== Диапазоны «расцвет навыка»: от пика до спада ниже 85% ===== */
function renderSkills(S) {
  const lg = document.getElementById("lg-skills");
  lg.innerHTML =
    `<span class="li"><span class="sw" style="background:var(--neu)"></span>атлетизм</span>` +
    `<span class="li"><span class="sw" style="background:var(--good)"></span>мастерство</span>`;
  if (!S.skills.length) return noData("ch-skills", "Нет данных");
  const { svg, w, h } = freshSvg("ch-skills");
  const m = { t: 8, r: 46, b: 6, l: 112 };
  const rowH = (h - m.t - m.b) / S.skills.length;
  const aMin = 17, aMax = 41;
  const x = linScale(aMin, aMax, m.l, w - m.r);
  const barH = 9;

  S.skills.forEach((s, i) => {
    const cy = m.t + rowH * i + rowH / 2;
    const col = s.craft ? "var(--good)" : "var(--neu)";
    const endAge = s.fade != null ? s.fade : s.last;
    const open = s.fade == null; // спад ниже 85% не наступил в данных
    const skillPicked = state.metric !== "value";
    const isActive = state.metric === s.c;
    const g = svgEl("g", { opacity: skillPicked && !isActive ? 0.35 : 1 }, svg);

    const name = svgEl("text", { x: m.l - 34, y: cy + 4, "text-anchor": "end", class: "dim" }, g);
    name.textContent = SKILL_SHORT[s.c];

    const startLbl = svgEl("text", { x: x(s.onset) - 6, y: cy + 4, "text-anchor": "end", class: "num" }, g);
    startLbl.textContent = s.onset;

    const bar = svgEl("rect", {
      x: x(s.onset), y: cy - barH / 2,
      width: Math.max(6, x(endAge) - x(s.onset)), height: barH,
      rx: barH / 2, class: "anim-bar-x",
    }, g);
    bar.style.fill = col;
    if (open) bar.style.opacity = 0.85;

    const endLbl = svgEl("text", { x: x(endAge) + 6, y: cy + 4, class: "num dim" }, g);
    endLbl.textContent = open ? `${endAge}+` : endAge;

    bar.style.cursor = "pointer";
    bar.addEventListener("mousemove", (ev) => showTip(
      `<b>${SKILL_RU[s.c]}</b><br>пик в <b>${s.onset} ${yearsWord(s.onset)}</b>, ` +
      (open
        ? `к ${endAge} ${declN(endAge, "году", "годам", "годам")} всё ещё выше 85% пика`
        : `ниже 85% пика — с <b>${endAge} ${declN(endAge, "года", "лет", "лет")}</b>`) +
      (s.at33 != null ? `<br><span class="t-muted">к 33 годам — ${fmtInt(s.at33)}% от пика</span>` : "") +
      `<br><span class="t-muted">клик — показать кривую навыка слева</span>`, ev));
    bar.addEventListener("mouseleave", hideTip);
    bar.addEventListener("click", () => { hideTip(); toggleMetric(s.c); });
  });
}

/* ===== Гистограмма: возраст завершения карьеры ===== */
function renderHist(S) {
  if (!S.hist.length) return noData("ch-hist", "Нет данных в выбранном фильтре");
  const { svg, w, h } = freshSvg("ch-hist");
  const m = { t: 46, r: 8, b: 20, l: 8 }; // верх зарезервирован под pill медианы (§5.3)
  const ages = S.hist.map((d) => d.age);
  const a0 = Math.min(...ages), a1 = Math.max(...ages);
  const slot = (w - m.l - m.r) / (a1 - a0 + 1);
  const barW = Math.max(3, slot - 3);
  const nMax = Math.max(...S.hist.map((d) => d.n));
  const y = linScale(0, nMax, h - m.b, m.t);
  const xc = (age) => m.l + slot * (age - a0) + slot / 2;
  const top = S.hist.reduce((mx, d) => (d.n > mx.n ? d : mx));

  for (const d of S.hist) {
    const bh = (h - m.b) - y(d.n);
    const sel = state.exitBin === d.age;
    const baseFill = sel ? "var(--acc)" : "var(--neu)";
    const r = svgEl("rect", { x: xc(d.age) - barW / 2, y: y(d.n), width: barW, height: Math.max(1, bh), rx: 2, class: "anim-bar-y" }, svg);
    r.style.fill = baseFill;
    r.style.opacity = state.exitBin != null && !sel ? 0.4 : 1;
    r.style.cursor = "pointer";
    r.addEventListener("mousemove", (ev) => {
      r.style.fill = "var(--acc)";
      showTip(`<span class="t-muted">уход в ${d.age} ${declN(d.age, "год", "года", "лет")}</span><br><b>${fmtInt(d.n)}</b> ${playersWord(d.n)} · ${fmt1((d.n / S.exitsTotal) * 100)}% ушедших<br><span class="t-muted">клик — карьеры с этим возрастом ухода</span>`, ev);
    });
    r.addEventListener("mouseleave", () => { r.style.fill = baseFill; hideTip(); });
    r.addEventListener("click", () => { hideTip(); toggleExitBin(d.age); });

    // Метки данных: каждый третий бар, максимум и выбранный бин (§5.1)
    const labelled = sel || d.age === top.age || (d.age - a0) % 3 === 0;
    if (labelled && d.n > 0) {
      const tl = svgEl("text", { x: xc(d.age), y: y(d.n) - 5, "text-anchor": "middle", class: "dim num" }, svg);
      tl.textContent = fmtInt(d.n);
      tl.style.fontSize = "10px";
      if (sel) tl.style.fill = "var(--acc)";
    }
    // Возраст под каждым пятым баром — подпись категории, без осевых линий
    if (d.age % 5 === 0) {
      const t = svgEl("text", { x: xc(d.age), y: h - 4, "text-anchor": "middle", class: "axis num" }, svg);
      t.textContent = d.age;
    }
  }

  // Медиана — линия + pill сверху (§5.3)
  if (S.medianExit != null) {
    const mx = xc(S.medianExit);
    const ln = svgEl("line", { x1: mx, x2: mx, y1: m.t - 4, y2: h - m.b, "stroke-dasharray": "4 4", "stroke-width": 1.5 }, svg);
    ln.style.stroke = "var(--acc)";
    pill(svg, Math.min(Math.max(mx, m.l + 54), w - m.r - 54), 18, `медиана · ${S.medianExit} ${yearsWord(S.medianExit)}`, "var(--acc)");
  }
}

/* ===== Scatter: пики карьер — серый фон + цветной топ, имена звёзд ===== */
function renderScatter(S) {
  // Легенда амплуа (HTML, кликабельная)
  const lg = document.getElementById("lg-scatter");
  lg.innerHTML = POS.map((p) => {
    const off = state.pos !== "all" && state.pos !== p;
    return `<span class="li clickable ${off ? "off" : ""}" data-pos="${p}" title="${POS_HINT[p]} · клик — фильтр"><span class="sw" style="background:${POS_COLOR[p]}"></span>${POS_RU[p]}</span>`;
  }).join("") + `<span class="li" style="margin-left:auto" title="Топ-30 пиков среза выделены цветом амплуа, остальные карьеры — серым">цвет — топ-30 пиков</span>`;
  for (const li of lg.querySelectorAll(".li.clickable")) {
    li.addEventListener("click", () => togglePos(li.dataset.pos));
  }

  if (!S.peaks.length) {
    return noData("ch-scatter", state.exitBin != null
      ? `Нет карьер с уходом в ${state.exitBin} ${declN(state.exitBin, "год", "года", "лет")} в этом срезе`
      : "Нет данных в выбранном фильтре");
  }
  const { svg, w, h } = freshSvg("ch-scatter");
  const m = { t: 10, r: 16, b: 20, l: 30 };
  const dom = S.peaksAll.length ? S.peaksAll : S.peaks; // стабильные оси при кросс-фильтре (§10.4)
  const xs = dom.map((p) => p.peak_age), ys = dom.map((p) => p.peak_value);
  const x = linScale(Math.min(...xs) - 0.6, Math.max(...xs) + 0.6, m.l, w - m.r);
  const y = linScale(Math.min(...ys) - 0.8, Math.max(...ys) + 1.2, h - m.b, m.t);

  // Текстовые отметки уровней BPM — без линий и тиков (§5.1)
  for (const v of [0, 5, 10]) {
    if (v < Math.min(...ys) || v > Math.max(...ys)) continue;
    const t = svgEl("text", { x: m.l - 6, y: y(v) + 3.5, "text-anchor": "end", class: "axis num" }, svg);
    t.textContent = v;
  }
  for (const a of [22, 26, 30, 34]) {
    if (a < Math.min(...xs) || a > Math.max(...xs)) continue;
    const t = svgEl("text", { x: x(a), y: h - 4, "text-anchor": "middle", class: "axis num" }, svg);
    t.textContent = a;
  }

  const jx = (p) => x(p.peak_age) + Math.sin(p.name.length * 7 + p.peak_value * 13) * Math.min(Math.abs(x(1) - x(0)) * 0.34, 7);
  const topSet = new Set(S.peaks.slice().sort((a, b) => b.peak_value - a.peak_value).slice(0, 30).map((p) => p.id));

  const focusOn = state.focusPlayer != null && S.peaks.some((q) => q.id === state.focusPlayer);
  let focusPt = null;
  for (const p of S.peaks) {
    const isTop = topSet.has(p.id);
    const isFocus = state.focusPlayer === p.id;
    const c = svgEl("circle", { cx: jx(p), cy: y(p.peak_value), r: isTop ? 3.1 : 2.2 }, svg);
    c.style.fill = isTop ? POS_COLOR[p.position_group] : "var(--faint)";
    c.style.opacity = focusOn && !isFocus ? 0.18 : isTop ? 0.95 : 0.5; // фокус приглушает остальных
    c.style.cursor = "pointer";
    if (state.focusPlayer === p.id) focusPt = { px: jx(p), py: y(p.peak_value), p };
    c.addEventListener("mousemove", (ev) => showTip(
      `<b>${ruName(p)}</b> <span class="t-muted">· ${POS_ONE[p.position_group]}</span><br>` +
      `пик в <b>${p.peak_age} ${declN(p.peak_age, "год", "года", "лет")}</b> · <b>${fmt1(p.peak_value)}</b> BPM<br>` +
      `<span class="t-muted">${p.seasons} ${seasonsWord(p.seasons)}${p.exit_age ? ` · ушёл в ${p.exit_age}` : " · играет"} · клик — подсветить в таблице</span>`, ev));
    c.addEventListener("mouseleave", hideTip);
    c.addEventListener("click", () => { hideTip(); toggleFocus(p.id); });
  }

  // Подсветка игрока из таблицы: кольцо + плашка с именем поверх затемнённого поля (§5.3)
  if (focusPt) {
    const ring = svgEl("circle", { cx: focusPt.px, cy: focusPt.py, r: 7, fill: "none", "stroke-width": 2 }, svg);
    ring.style.stroke = "var(--acc)";
    pill(svg,
      Math.min(Math.max(focusPt.px, m.l + 60), w - m.r - 60),
      Math.max(focusPt.py - 18, 14),
      ruName(focusPt.p), "var(--acc)");
  }

  // Имена звёзд: топ-5 пиков + топ-2 долгожителей, с разведением коллизий
  const byValue = S.peaks.slice().sort((a, b) => b.peak_value - a.peak_value);
  const named = byValue.slice(0, 5);
  for (const p of S.peaks.slice().sort((a, b) => b.seasons - a.seasons).slice(0, 2)) {
    if (!named.includes(p)) named.push(p);
  }
  const placed = [];
  for (const p of named) {
    if (focusOn) break; // при фокусе подписи звёзд не рисуем — поле затемнено
    if (state.focusPlayer === p.id) continue;
    const tx = Math.min(Math.max(jx(p), m.l + 34), w - m.r - 44);
    const ty0 = y(p.peak_value);
    let ty = null;
    for (const dy of [-8, -20, 16, 28, -32]) {
      const cand = ty0 + dy;
      if (cand < 11 || cand > h - m.b - 4) continue;
      if (!placed.some((q) => Math.abs(q.x - tx) < 78 && Math.abs(q.y - cand) < 12)) { ty = cand; break; }
    }
    if (ty == null) continue;
    placed.push({ x: tx, y: ty });
    const t = svgEl("text", { x: tx, y: ty, "text-anchor": "middle", class: "dim" }, svg);
    t.textContent = ruSurname(p);
  }
}

/* ===== Таблица: заметные карьеры, ячейки-фильтры (§12) ===== */
function renderTable(S) {
  const suffix = state.status === "active" ? " · играют"
    : state.status === "retired" ? " · завершили"
    : state.exitBin != null ? ` · уход в ${state.exitBin}` : "";
  document.getElementById("title-table").textContent = "Заметные карьеры" + suffix;
  const rows = S.peaks.slice().sort((a, b) => b.peak_value - a.peak_value).slice(0, 14);
  const wrap = document.getElementById("tbl-wrap");
  if (!rows.length) { wrap.innerHTML = '<div style="color:var(--muted);padding:16px 4px">Нет данных в выбранном фильтре</div>'; return; }
  wrap.innerHTML = `<table>
    <colgroup><col style="width:38%"><col style="width:14%"><col style="width:16%"><col style="width:14%"><col style="width:18%"></colgroup>
    <thead><tr>
      <th>Игрок</th><th>Пик, лет</th><th>Пик, BPM <span style="color:var(--acc)">▼</span></th><th>Сезонов</th><th>Уход</th>
    </tr></thead>
    <tbody>${rows.map((p) => `<tr data-id="${p.id}" class="${state.focusPlayer === p.id ? "focused" : ""}">
      <td title="${p.name}"><span class="posdot" style="background:${POS_COLOR[p.position_group]}"></span><span class="clk ${state.focusPlayer === p.id ? "on" : ""}" data-act="focus">${ruName(p)}</span></td>
      <td>${p.peak_age}</td><td>${fmt1(p.peak_value)}</td><td>${p.seasons}</td>
      <td>${p.exit_age != null
        ? `<span class="clk ${state.exitBin === p.exit_age ? "on" : ""}" data-act="exit" data-age="${p.exit_age}" title="Клик — карьеры с уходом в ${p.exit_age}">${p.exit_age}</span>`
        : `<span class="clk ${state.status === "active" ? "on" : ""}" data-act="active" style="color:var(--good)" title="Клик — только действующие игроки">играет</span>`}</td>
    </tr>`).join("")}</tbody>
  </table>`;

  wrap.querySelectorAll(".clk").forEach((el) => {
    el.addEventListener("click", () => {
      const act = el.dataset.act;
      if (act === "focus") toggleFocus(el.closest("tr").dataset.id);
      else if (act === "exit") toggleExitBin(+el.dataset.age);
      else if (act === "active") setStatus(state.status === "active" ? "all" : "active");
    });
  });
}

/* ===== Кросс-фильтрация (§10): клик = фильтр, повторный клик = снятие ===== */
function togglePos(p) {
  state.pos = state.pos === p ? "all" : p;
  syncSeg(document.getElementById("seg-pos"), state.pos);
  update();
}
function toggleExitBin(age) {
  state.exitBin = state.exitBin === age ? null : age;
  if (state.exitBin != null && state.status === "active") state.status = "all";
  syncSeg(document.getElementById("seg-status"), state.status);
  update();
}
function setStatus(v) {
  state.status = v;
  if (v === "active") state.exitBin = null;
  syncSeg(document.getElementById("seg-status"), state.status);
  update();
}
function toggleFocus(id) {
  state.focusPlayer = state.focusPlayer === id ? null : id;
  update();
}
function toggleMetric(c) {
  setMetric(state.metric === c ? "value" : c);
}

/* ===== Фильтры (§9) ===== */
function buildFilters() {
  const segPos = document.getElementById("seg-pos");
  segPos.innerHTML = ['<button data-v="all" class="on">Все</button>']
    .concat(POS.map((p) => `<button data-v="${p}" title="${POS_HINT[p]}">${POS_RU[p]}</button>`)).join("");
  const segEra = document.getElementById("seg-era");
  segEra.innerHTML = ['<button data-v="all" class="on">Все</button>']
    .concat(ERAS.map((e) => `<button data-v="${e}">${ERA_RU[e]}</button>`)).join("");
  const segStatus = document.getElementById("seg-status");
  segStatus.innerHTML = STATUSES.map(
    (v) => `<button data-v="${v}" class="${v === "all" ? "on" : ""}">${STATUS_RU[v]}</button>`
  ).join("");

  segPos.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.pos = b.dataset.v; syncSeg(segPos, state.pos); update();
  });
  segEra.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.era = b.dataset.v; syncSeg(segEra, state.era); update();
  });
  segStatus.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    setStatus(b.dataset.v);
  });
  buildMetricDD();
  document.getElementById("btn-reset").addEventListener("click", resetFilters);
}

/* Кастомный выпадающий список метрики — в стиле системы (§9) */
const METRIC_OPTIONS = () => [["value", "Ценность (BPM)"]].concat(SKILLS.map((s) => [s, SKILL_RU[s]]));
function buildMetricDD() {
  const btn = document.getElementById("dd-metric-btn");
  const list = document.getElementById("dd-metric-list");
  list.innerHTML = METRIC_OPTIONS().map(
    ([v, lbl]) => `<li role="option" data-v="${v}" class="${v === state.metric ? "on" : ""}">${lbl}</li>`
  ).join("");
  const closeDD = () => { list.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    list.hidden = !list.hidden;
    btn.setAttribute("aria-expanded", String(!list.hidden));
  });
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li"); if (!li) return;
    closeDD();
    setMetric(li.dataset.v);
  });
  document.addEventListener("click", closeDD);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDD(); });
}
function setMetric(v) {
  state.metric = v;
  const opts = METRIC_OPTIONS();
  document.getElementById("dd-metric-label").textContent = (opts.find(([k]) => k === v) || opts[0])[1];
  for (const li of document.getElementById("dd-metric-list").children) {
    li.classList.toggle("on", li.dataset.v === v);
  }
  update();
}
function syncSeg(seg, v) {
  for (const b of seg.querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === v);
}
function resetFilters() {
  state.pos = "all"; state.era = "all";
  state.exitBin = null; state.status = "all"; state.focusPlayer = null;
  syncSeg(document.getElementById("seg-pos"), "all");
  syncSeg(document.getElementById("seg-era"), "all");
  syncSeg(document.getElementById("seg-status"), "all");
  setMetric("value"); // вызывает update()
}
function syncReset() {
  const def = state.pos === "all" && state.era === "all" && state.metric === "value"
    && state.exitBin == null && state.status === "all" && state.focusPlayer == null;
  document.getElementById("btn-reset").disabled = def;
}

/* ===== Экспорт CSV: текущий срез карьер ===== */
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportCSV(S) {
  const head = "Игрок;Игрок (ориг.);Амплуа;Эпоха пика;Возраст пика;Пик BPM;Сезонов;Возраст ухода";
  const lines = S.peaks.map((q) => [
    ruName(q), q.name, POS_RU[q.position_group], q.era_bucket, q.peak_age,
    String(q.peak_value).replace(".", ","), q.seasons, q.exit_age != null ? q.exit_age : "играет",
  ].join(";"));
  const blob = new Blob(["\uFEFF" + [head, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, "nba-careers.csv");
}

/* ===== Модал «Данные и методика» ===== */
function buildHelp() {
  const back = document.getElementById("help");
  const open = () => { back.hidden = false; };
  const close = () => { back.hidden = true; };
  document.getElementById("btn-help").addEventListener("click", open);
  document.getElementById("help-close").addEventListener("click", close);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !back.hidden) close(); });
}

/* ===== Тема (§7.2) ===== */
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* file:// без хранилища */ } }
function initTheme() {
  const saved = storageGet("nba-dash-theme");
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  syncThemeBtn();
  document.getElementById("btn-theme").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    storageSet("nba-dash-theme", next);
    syncThemeBtn();
  });
}
function syncThemeBtn() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  document.getElementById("ico-sun").style.display = dark ? "" : "none";
  document.getElementById("ico-moon").style.display = dark ? "none" : "";
  const btn = document.getElementById("btn-theme");
  btn.title = dark ? "Светлая тема" : "Тёмная тема";
  btn.setAttribute("aria-label", btn.title);
}

/* ===== AI-выводы: готовые формулировки, подставляются числа текущего среза ===== */
function buildInsights(S) {
  const valueCurve = state.metric === "value" ? S.curve : cumCurve(agingRows(state.pos, state.era));
  const vPeak = valueCurve.length ? valueCurve.reduce((m, q) => (q.v > m.v ? q : m)) : null;
  const ratio = S.late && S.plateau && S.plateau.v < 0 ? S.late.v / S.plateau.v : null;
  const lead = S.reserve[0], tail = S.reserve[S.reserve.length - 1];
  const first = S.skills[0];

  let main = "";
  if (state.exitBin != null && S.peaks.length) {
    const n = S.peaks.length;
    const avgPk = S.peaks.reduce((a, q) => a + q.peak_value, 0) / n;
    const early = S.medianExit != null && state.exitBin < S.medianExit;
    main = `Ушедшие в ${state.exitBin}: ${fmtInt(n)} ${careersWord(n)} со средним пиком <b>${fmt1(avgPk)}</b> BPM. ` +
      (early ? "Ранний уход — почти всегда невысокий пик: команда теряет немного."
             : "Поздний уход — привилегия игроков с высоким пиком: посредственные карьеры до этого возраста не доживают.");
  } else if (state.metric !== "value" && first) {
    const sk = S.skills.find((q) => q.c === state.metric);
    if (sk) {
      main = `${SKILL_RU[sk.c]}: максимум в <b>${sk.onset}</b> ${declN(sk.onset, "год", "года", "лет")}` +
        (sk.at33 != null ? `, к 33 годам — <b>${fmtInt(sk.at33)}%</b> пика. ` : ". ") +
        (sk.craft ? "Мастерство почти не стареет: это умение ветеран сохраняет до конца карьеры."
                  : "Навык опирается на атлетизм и уходит первым — закладывайте это в длину контракта.");
    }
  } else if (state.pos !== "all" || state.era !== "all") {
    const who = state.pos !== "all" ? POS_RU[state.pos] : "Все амплуа";
    const eraTxt = state.era !== "all" ? ` в эпохе «${ERA_RU[state.era]}»` : "";
    const mine = S.reserve.find((r) => state.pos === "all" || r.pos === state.pos);
    main = `${who}${eraTxt}: пик в <b>${vPeak ? vPeak.age : "—"}</b>, медиана ухода <b>${S.medianExit != null ? S.medianExit : "—"}</b>.` +
      (mine && lead ? (mine.pos === lead.pos
        ? ` Лучший запас к ${state.wiAge}: <b>${fmtInt(mine.pct)}%</b> пика — теряют ценность медленнее остальных амплуа.`
        : ` Запас к ${state.wiAge} — <b>${fmtInt(mine.pct)}%</b> пика против ${fmtInt(lead.pct)}% у лидера (${POS_ONE[lead.pos]}).`) : "");
  } else {
    main = `Окно пиковой формы короткое: рост до <b>${vPeak ? vPeak.age : 25}</b>, после ${RISK_AGE} спад ` +
      (ratio ? `в <b>${fmt1(ratio)}</b> раза быстрее плато` : "заметно быстрее плато") +
      ` — а половина карьер уже завершена к <b>${S.medianExit != null ? S.medianExit : "—"}</b>. ` +
      `Контракт правее пунктира оплачивает спад; исключения редки — ${LONGEVITY_BASE}+ сезонов выдерживают ${fmt1((S.longevity.length / Math.max(S.peaks.length, 1)) * 100)}% игроков.`;
  }

  const perChart = {
    line: (() => {
      if (state.metric !== "value") {
        const sk = S.skills.find((q) => q.c === state.metric);
        if (!sk) return "";
        const plateau = sk.fade != null ? sk.fade - sk.onset : sk.last - sk.onset;
        const fadeTxt = sk.fade != null
          ? `ниже 85% пика опускается с <b>${sk.fade}</b> ${declN(sk.fade, "года", "лет", "лет")}`
          : `держится выше 85% пика как минимум до <b>${sk.last}</b>`;
        const tail = sk.craft
          ? "Поздний пик — признак тренируемого навыка: ветеран его сохраняет, на нём строится возрастная роль."
          : plateau <= 3
            ? "Короткое плато: атлетический навык уходит резко — в длинный контракт его не закладывают."
            : "Пик ранний, но плато длинное: снижение мягкое, навык переживает атлетизм.";
        return `${SKILL_RU[sk.c]}: пик в <b>${sk.onset}</b> ${declN(sk.onset, "год", "года", "лет")}, ${fadeTxt}` +
          (sk.at33 != null ? `, к 33 годам — <b>${fmtInt(sk.at33)}%</b> пика` : "") + `. ${tail}`;
      }
      return S.late && ratio
        ? `После ${RISK_AGE} лет средний игрок теряет <b>${fmt2(Math.abs(S.late.v))}</b> BPM за сезон — в ${fmt1(ratio)} раза быстрее, чем на плато 26–29. Каждый сезон контракта правее пунктира стоит дороже, чем приносит.`
        : "";
    })(),
    bars: lead && tail && lead.pos !== tail.pos
      ? `${POS_RU[lead.pos]} теряют ценность с возрастом медленнее всех: к ${state.wiAge} ${declN(state.wiAge, "году", "годам", "годам")} сохраняют <b>${fmtInt(lead.pct)}%</b> пиковой ценности против <b>${fmtInt(tail.pct)}%</b> у ${POS_ONE[tail.pos]}. Длинный контракт с ${POS_ONE[lead.pos] === "большие" ? "большим" : POS_ONE[lead.pos] === "защитники" ? "защитником" : "форвардом"} обесценивается медленнее.`
      : "",
    skills: first
      ? `Первым гаснет атлетизм: ${SKILL_RU[first.c].toLowerCase()} — уже с <b>${first.onset}</b> ${declN(first.onset, "года", "лет", "лет")}. Бросок и передачи держатся после 35: стареющий игрок смещается к роли снайпера и плеймейкера.`
      : "",
    scatter: (() => {
      if (!S.peaks.length) return "";
      const ages = S.peaks.map((q) => q.peak_age).sort((a, b) => a - b);
      const q1 = ages[Math.floor(ages.length * 0.25)], q3 = ages[Math.floor(ages.length * 0.75)];
      const late = S.peaks.filter((q) => q.peak_age >= 31).length;
      return `Половина пиков приходится на <b>${q1}–${q3}</b> ${declN(q3, "год", "года", "лет")}. Пик в 31+ — редкость: ${fmtInt(late)} из ${fmtInt(S.peaks.length)} карьер, почти все — суперзвёзды.`;
    })(),
    hist: S.medianExit != null
      ? `Половина игроков уходит к <b>${S.medianExit}</b> ${declN(S.medianExit, "году", "годам", "годам")}, четверть — уже к ${S.q25}. Дольше всех держатся те, кто успел набрать высокий пик до 27.`
      : "",
  };
  return { main, perChart };
}

/* Полоса-вывод под KPI (вариант 1) */
function renderInsightStrip(ins) {
  let el = document.getElementById("ai-strip");
  if (!el) {
    document.getElementById("kpis").insertAdjacentHTML("afterend",
      `<section class="ai-strip" id="ai-strip" title="Выводы сгенерированы ИИ заранее по агрегатам пайплайна и подставляются под текущий фильтр; обращений к сети нет"><span class="ai-badge">Вывод</span><span id="ai-strip-text"></span></section>`);
    el = document.getElementById("ai-strip");
  }
  document.getElementById("ai-strip-text").innerHTML = ins.main;
}

/* Вкладка «Выводы» в карточке таблицы (вариант 2) */
let aiTab = "table";
function renderInsightCard(ins, S) {
  const h2 = document.getElementById("title-table");
  if (!document.getElementById("ai-tabs")) {
    h2.insertAdjacentHTML("afterend",
      `<div class="ai-tabs" id="ai-tabs">
        <button data-tab="table" class="${aiTab === "table" ? "on" : ""}">Карьеры</button>
        <button data-tab="ai" class="${aiTab === "ai" ? "on" : ""}" title="Выводы сгенерированы ИИ заранее по агрегатам пайплайна; обращений к сети нет">✦ Выводы</button>
      </div>`);
    document.getElementById("ai-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      aiTab = b.dataset.tab;
      for (const x of document.querySelectorAll("#ai-tabs button")) x.classList.toggle("on", x.dataset.tab === aiTab);
      update();
    });
  }
  if (aiTab === "ai") {
    document.getElementById("tbl-wrap").innerHTML =
      `<ul class="ai-list">` +
      [ins.main, ins.perChart.bars, ins.perChart.skills, ins.perChart.scatter]
        .filter(Boolean).map((t) => `<li>${t}</li>`).join("") +
      `</ul>`;
  }
}

/* Значки-подсказки в заголовках карточек (вариант 3) */
function renderInsightHints(ins) {
  const map = { "card-line": "line", "card-bars": "bars", "card-skills": "skills", "card-scatter": "scatter", "card-hist": "hist" };
  for (const [cardId, key] of Object.entries(map)) {
    const h2 = document.querySelector(`#${cardId} h2`);
    if (!h2 || !ins.perChart[key]) continue;
    let icon = h2.querySelector(".ai-hint");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "ai-hint";
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M11 3l1.7 5 5 1.7-5 1.7-1.7 5-1.7-5-5-1.7 5-1.7zM19.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></svg>';
      icon.setAttribute("aria-label", "Вывод по графику");
      icon.setAttribute("role", "img");
      h2.appendChild(icon);
      icon.addEventListener("mousemove", (ev) => showTip(icon.dataset.text, ev));
      icon.addEventListener("mouseleave", hideTip);
    }
    icon.dataset.text = ins.perChart[key];
  }
}

function renderInsights(S) {
  if (AI_MODE === "none") return;
  const ins = buildInsights(S);
  if (AI_MODE === "strip") renderInsightStrip(ins);
  if (AI_MODE === "card") renderInsightCard(ins, S);
  if (AI_MODE === "hints") renderInsightHints(ins);
}

/* ===== «Что если» (§20.3): слайдер input — локально, change — пересчёт;
 * числовой ввод валидируется: не-числа отбрасываются, значение зажимается в границы ===== */
const WI_PARAMS = {
  "wi-long": { key: "wiLong", min: 10, max: 20, base: LONGEVITY_BASE, numId: "wi-long-num", glow: "kpi-long" },
  "wi-age": { key: "wiAge", min: 30, max: 36, base: RESERVE_BASE, numId: "wi-age-num", glow: "card-bars" },
};
// Мягкое свечение карточки-адресата: показывает, на что влияет слайдер
function wiPulse(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("wi-glow");
  void el.offsetWidth; // перезапуск анимации
  el.classList.add("wi-glow");
}
function clampWi(raw, p, fallback) {
  const n = parseInt(String(raw).replace(/[^\d−-]/g, ""), 10);
  if (Number.isNaN(n)) return fallback;            // не число — вернуть как было
  return Math.min(p.max, Math.max(p.min, n));      // зажать в осмысленные границы
}
function buildWhatIf() {
  const kpis = document.getElementById("kpis");
  kpis.addEventListener("input", (e) => {
    const p = WI_PARAMS[e.target.id];
    if (!p) return; // слайдер тянут: число рядом обновляем без пересчёта (§20.3)
    document.getElementById(p.numId).value = e.target.value;
    wiPulse(p.glow); // свечение адресата уже во время движения
  });
  kpis.addEventListener("change", (e) => {
    const pSlider = WI_PARAMS[e.target.id];
    if (pSlider) {
      state[pSlider.key] = +e.target.value;
      update();
      wiPulse(pSlider.glow);
      return;
    }
    const numEntry = Object.values(WI_PARAMS).find((q) => q.numId === e.target.id);
    if (numEntry) {
      state[numEntry.key] = clampWi(e.target.value, numEntry, state[numEntry.key]);
      update(); // перерисовка вернёт в поле валидное значение
      wiPulse(numEntry.glow);
    }
  });
  kpis.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && Object.values(WI_PARAMS).some((q) => q.numId === e.target.id)) e.target.blur();
  });
  kpis.addEventListener("click", (e) => {
    if (e.target.id !== "wi-reset" && !e.target.closest("#wi-reset")) return;
    state.wiLong = LONGEVITY_BASE;
    state.wiAge = RESERVE_BASE;
    update();
    wiPulse("kpi-long");
    wiPulse("card-bars");
  });
}

/* ===== Главный цикл ===== */
function update() {
  syncReset();
  const S = snap();
  renderKPI(S);
  renderLine(S);
  renderBars(S);
  renderSkills(S);
  renderHist(S);
  renderScatter(S);
  renderTable(S);
  renderInsights(S);
}

let resizeT = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(update, 120);
});

/* ===== Самопроверка против эталона пайплайна (§17) ===== */
function selfTest() {
  const S0 = snap(); // дефолтное состояние
  const peak = S0.curve.reduce((m, p) => (p.v > m.v ? p : m));
  console.assert(peak.age === 25, "эталон: пик ценности 25, получено " + peak.age);
  console.assert(S0.medianExit === 29, "эталон: медиана ухода 29, получено " + S0.medianExit);
  console.assert(S0.peaks.length === 1305, "эталон: 1305 карьер, получено " + S0.peaks.length);
  console.assert(S0.longevity.length === 75, "эталон: 75 долгожителей (15+), получено " + S0.longevity.length);
  console.assert(S0.skills[0].c === "BLK_36" && S0.skills[0].onset === 19,
    "эталон: первыми гаснут блоки (19), получено " + S0.skills[0].c + " " + S0.skills[0].onset);
  console.assert(S0.reserve[0].pos === "big", "эталон: лучший запас к 33 у больших");
  console.assert(Math.round(S0.late.v * 100) === -40, "эталон: спад 30–35 = −0,40, получено " + S0.late.v);
}

/* ===== Старт ===== */
document.addEventListener("DOMContentLoaded", () => {
  try {
    const meta = DATA.meta || {};
    document.getElementById("hdr-sub").textContent =
      `сезоны ${meta.season_min}–${meta.season_max} от ${fmtInt((meta.defaults || {}).min_minutes || 1000)} минут на площадке`;
    initTheme();
    buildFilters();
    buildWhatIf();
    buildHelp();
    document.getElementById("btn-csv").addEventListener("click", () => exportCSV(snap()));
    update();
    selfTest();
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("beforeend",
      `<div style="position:fixed;bottom:12px;left:12px;background:#C24343;color:#fff;padding:8px 12px;border-radius:8px;font:12px sans-serif">Ошибка инициализации: ${String(e.message || e)}</div>`);
  }
});
