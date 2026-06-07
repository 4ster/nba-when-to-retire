// Headless render-verify of the single-file index.html (skill-context: aif-verify) — v3.
// jsdom executes the app on real embedded data with npm-d3 injected, then asserts the v3
// art-direction contract: strict offline, dark default, inline d3/scrollama + Oswald, no --mono,
// 7 unique data-signatures, ONE persistent canvas with NO axes and direct data labels, a distinct
// chart type per scene (line / slope / lollipop / era-overlay / dumbbell / histogram / interactive),
// scene navigation, US-7 filters above the canvas, analytical voice (no banned lexicon), the "?"
// modal a11y, a scannable subtitle, size budgets, and zero console errors / assert failures.
// Run: node tools/verify_dom.mjs
import fs from "node:fs";
import { JSDOM } from "jsdom";
import * as d3 from "d3";

const html = fs.readFileSync("index.html", "utf8");
const fails = [];
const consoleErrors = [];
const assertFails = [];

// ── Static gates ──
if (/<script[^>]*\bsrc=/i.test(html)) { fails.push("external <script src> present (offline violated)"); }
if (/<link[^>]*\bhref=/i.test(html)) { fails.push("external <link href> present (offline violated)"); }
if (/--mono\b/.test(html)) { fails.push("--mono token still present"); }
if (!/overflow-x:\s*clip/.test(html)) { fails.push("no overflow-x:clip guard (360px overflow risk)"); }
if (!/name="viewport"/.test(html)) { fails.push("viewport meta missing (responsive)"); }

// Budgets (DESIGN §2 / RULES «Сборка»).
function nodeInner(tag, id) {
  const m = html.match(new RegExp("<" + tag + "\\b[^>]*\\bid=\"" + id + "\"[^>]*>([\\s\\S]*?)</" + tag + ">"));
  return m ? m[1] : "";
}
const B = (s) => Buffer.byteLength(s, "utf8");
const vendor = B(nodeInner("script", "vendor-d3")) + B(nodeInner("script", "vendor-scrollama"));
const fonts = B(nodeInner("style", "font-faces"));
const design = fonts + B(nodeInner("style", "app-css"));
const seed = B(nodeInner("script", "seed-data"));
if (vendor > 350000) { fails.push("vendor budget: " + vendor + " > 350000"); }
if (fonts > 90000) { fails.push("fonts budget: " + fonts + " > 90000"); }
if (design > 150000) { fails.push("design budget: " + design + " > 150000"); }
if (seed > 300000) { fails.push("slim-JSON budget: " + seed + " > 300000"); }

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
window.d3 = d3;
window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 80, height: 16 });
window.console.error = (...a) => consoleErrors.push(a.map(String).join(" "));
window.console.warn = () => {};
window.console.assert = (cond, ...m) => { if (!cond) { assertFails.push(m.map(String).join(" ")); } };

function check(name, cond) { if (!cond) { fails.push(name); } }

check("data-theme dark by default", document.documentElement.getAttribute("data-theme") === "dark");
const d3node = document.getElementById("vendor-d3");
const scnode = document.getElementById("vendor-scrollama");
check("d3 inlined", d3node && d3node.textContent.length > 50000);
check("scrollama inlined", scnode && scnode.textContent.length > 1000);
const fontStyle = document.getElementById("font-faces");
check("Oswald @font-face inlined", fontStyle && /@font-face/.test(fontStyle.textContent) && /Oswald/.test(fontStyle.textContent) && /base64/.test(fontStyle.textContent));

const SIG = ["us1-mountain", "us2-split", "us3-board", "us4-film", "us5-spotlight", "us6-cliff", "us7-clipboard"];
const sigs = [...document.querySelectorAll(".step")].map((s) => s.getAttribute("data-signature"));
check("7 scene signatures, ordered", sigs.length === 7 && SIG.every((s, i) => sigs[i] === s));
check("signatures unique", new Set(sigs).size === sigs.length);

// kicker «СЦЕНА N» must be gone from scene cards.
const stepsText = (document.querySelector(".steps") || {}).textContent || "";
check("no «СЦЕНА N» kicker", !/СЦЕНА\s*\d/i.test(stepsText));

// US-7 filters board is positioned ABOVE the canvas in DOM order (static markup).
const board = document.getElementById("board");
const chart = document.getElementById("chart");
check("board (filters) before canvas in DOM",
  board && chart && (board.compareDocumentPosition(chart) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0);

// Analytical voice: no banned lexicon in narrative surface (intro/steps/outro/nav/headlines).
const VOICE_SURFACE = ["intro", "steps", "outro"].map((c) => (document.querySelector("." + c) || {}).textContent || "").join(" ")
  + " " + ((document.getElementById("scene-nav") || {}).textContent || "");
const BANNED = ["угасан", "умир", "гаснут", "потолок", "помойк", "вспышк", "элеги", "прощается", "величи", "переизобрет"];
const hits = BANNED.filter((w) => VOICE_SURFACE.toLowerCase().includes(w));
check("analytical voice (no banned lexicon): " + JSON.stringify(hits), hits.length === 0);

// ── Run app ──
const appScript = [...document.querySelectorAll("script")].find((s) => s.id === "app" || /initEngine/.test(s.textContent));
if (!appScript) { console.error("FAIL: app script block not found"); process.exit(1); }
try { window.eval(appScript.textContent); } catch (err) { console.error("FAIL: app threw:", err && err.stack ? err.stack : err); process.exit(1); }

// Runtime-built UI: scene nav dots + scannable subtitle.
check("scene nav has 7 dots", document.querySelectorAll("#scene-dots .dot").length === 7);
const acc = document.getElementById("season-accent");
check("subtitle accent scannable", acc && /по сезон/.test(acc.textContent));

// Headline numbers reconciled with aggregates.
const num = (id) => (document.getElementById(id) || {}).textContent;
check("hl-peak numeric", /^\d{2}$/.test(num("hl-peak") || ""));
check("hl-div numeric", /^\d{2}$/.test(num("hl-div") || ""));
check("hl-med numeric", /^\d{2}$/.test(num("hl-med") || ""));
check("hl span min<max", parseInt(num("hl-fade"), 10) < parseInt(num("hl-long"), 10));

// One persistent svg canvas; NO axes.
check("single persistent svg canvas", chart && chart.tagName.toLowerCase() === "svg" && document.querySelectorAll("#chart").length === 1);
check("no axis layer (labels-not-axes)", document.querySelectorAll("#chart .L-axis").length === 0);

// Exercise scenes; assert the distinct chart-type element per scene + direct labels.
check("scene test seam exposed", typeof window.__nbaScene === "function");
if (typeof window.__nbaScene === "function") {
  window.__nbaScene("us1");
  check("US-1 line + direct labels", document.querySelectorAll("#chart path.curve").length >= 1 && document.querySelectorAll("#chart text.endlbl, #chart text.an").length >= 1);
  window.__nbaScene("us2");
  check("US-2 slope (≥3 segments)", document.querySelectorAll("#chart path.curve").length >= 3);
  window.__nbaScene("us3");
  check("US-3 lollipop", document.querySelectorAll("#chart circle.lolli").length >= 1);
  window.__nbaScene("us4");
  check("US-4 era overlay + gap band", document.querySelectorAll("#chart path.curve").length >= 3 && document.querySelectorAll("#chart path.gap").length >= 1);
  window.__nbaScene("us5");
  check("US-5 dumbbell", document.querySelectorAll("#chart line.db").length >= 1);
  window.__nbaScene("us6");
  check("US-6 histogram", document.querySelectorAll("#chart rect.rb").length >= 1);
  check("US-6 has median flag", document.querySelectorAll("#chart line.med").length >= 1);
  window.__nbaScene("us7");
  check("US-7 board shown above canvas", board.getAttribute("data-on") === "true");
  check("US-7 selection vs ghost labeled", document.querySelectorAll("#chart text.endlbl").length >= 1);
  check("canvas persisted (same node)", document.getElementById("chart") === chart);
  window.__nbaScene("us1");
}

// Theme toggle recolours without errors.
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  themeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("theme → light", document.documentElement.getAttribute("data-theme") === "light");
  themeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("theme → dark", document.documentElement.getAttribute("data-theme") === "dark");
}

// Modal a11y.
const backdrop = document.getElementById("about-backdrop");
const btn = document.getElementById("about-btn");
const closeBtn = document.getElementById("about-close");
check("modal present", backdrop && btn && closeBtn);
check("modal initially closed", backdrop && backdrop.getAttribute("data-open") === "false");
const dlg = document.getElementById("about-modal");
check("dialog a11y attrs", dlg && dlg.getAttribute("role") === "dialog" && dlg.getAttribute("aria-modal") === "true" && dlg.getAttribute("aria-labelledby") === "about-title");
check("about-range filled", /\d{4}/.test((document.getElementById("about-range") || {}).textContent || ""));
if (btn) { btn.focus(); btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
check("modal opens", backdrop && backdrop.getAttribute("data-open") === "true");
check("focus into dialog", document.activeElement === closeBtn);
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("Esc closes", backdrop && backdrop.getAttribute("data-open") === "false");
check("focus returns to trigger", document.activeElement === btn);
btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
backdrop.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("backdrop click closes", backdrop.getAttribute("data-open") === "false");

await new Promise((r) => setTimeout(r, 1500));
check("zero console errors: " + JSON.stringify(consoleErrors), consoleErrors.length === 0);
check("zero console.assert failures: " + JSON.stringify(assertFails), assertFails.length === 0);

if (fails.length) {
  console.error("DOM verify FAILED:\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log("DOM verify OK (v3): offline+dark, 7 chart types on one axis-free canvas, nav, filters-top, voice, budgets, modal a11y, 0 errors");
console.log("  vendor " + (vendor / 1024 | 0) + "KB · fonts " + (fonts / 1024 | 0) + "KB · design " + (design / 1024 | 0) + "KB · seed " + (seed / 1024 | 0) + "KB");
console.log("  peak/divergence/median/span: " + num("hl-peak") + " / " + num("hl-div") + " / " + num("hl-med") + " / " + num("hl-fade") + "–" + num("hl-long"));
