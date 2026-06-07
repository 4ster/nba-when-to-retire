// Гейт сборки index.html (RULES.md §«Сборка и валидация»):
//   1) ровно один JS-блок <script id="app">;
//   2) отсутствие null-байтов;
//   3) валидный синтаксис JS (через vm.Script — компиляция без выполнения).
// Кроссплатформенно, без внешних зависимостей. Запуск: node tools/check_html.mjs [index.html]
import fs from "node:fs";
import vm from "node:vm";

const NUL = String.fromCharCode(0);
const file = process.argv[2] ?? "index.html";

let html;
try {
  html = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error(`FAIL: не удалось прочитать ${file}: ${e.message}`);
  process.exit(1);
}

const appOpenTags = html.match(/<script[^>]*\bid="app"/g) ?? [];
if (appOpenTags.length !== 1) {
  console.error(`FAIL: ожидался ровно один <script id="app">, найдено ${appOpenTags.length}`);
  process.exit(1);
}

const m = html.match(/<script[^>]*\bid="app"[^>]*>([\s\S]*?)<\/script>/);
if (!m) {
  console.error('FAIL: не найден блок <script id="app">…</script>');
  process.exit(1);
}
const code = m[1];

if (code.includes(NUL)) {
  console.error("FAIL: null-байты в JS-блоке");
  process.exit(1);
}

try {
  new vm.Script(code, { filename: "app.inline.js" });
} catch (e) {
  console.error(`FAIL: синтаксическая ошибка JS-блока: ${e.message}`);
  process.exit(1);
}

console.log("OK: один app-блок, null-байтов нет, синтаксис JS валиден");
