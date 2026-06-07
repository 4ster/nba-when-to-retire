---
archived: 2026-06-07
---
# План: свежий датасет + пояснения в UI (диапазон, модалка методологии)

**Ветка:** `master`  (git включён; создание веток выключено — работаем в текущей ветке)
**Дата создания:** 2026-06-07
**Источники истины:** [SPEC.md](../../SPEC.md), [RULES.md](../../RULES.md), [ARCHITECTURE.md](../ARCHITECTURE.md)

## Settings

- **Testing:** yes — TDD; тесты адаптера раньше реализации, обязательны грязные кейсы данных.
- **Logging:** verbose — DEBUG в адаптере/пайплайне, уровень через `LOG_LEVEL`.
- **Docs:** yes — обязательный чекпоинт документации по завершении (`/aif-docs`).

## Roadmap Linkage

- **Milestone:** none
- **Rationale:** Roadmap-артефакт не создан.

## Контекст и мотивация

Текущий датасет `drgilermo/nba-players-stats` заканчивается сезоном 2016–17, а подпись
«данные по сезон 2016–17» читается как «только один сезон». Цель: перейти на актуальный
поддерживаемый датасет **`sumitrodatta/nba-aba-baa-stats`** (1947–настоящее, есть BPM/Advanced),
сделать дату данных динамической, явно показать охват сезонов и добавить модалку с описанием
датасета и методологии.

## Ключевые ограничения

- Контракт §2 и методика (дельта-метод, per-36, survivorship, censoring) не меняются.
- Один self-contained `index.html`, один JS-блок, без рантайм-fetch; данные встроены.
- Доступность модалки: focus-trap, Esc, aria, prefers-reduced-motion, theme-aware (RULES).
- skill-context: тест-задачи парсеров обязаны покрывать грязные кейсы данных.

---

## Tasks

### Фаза 1 — Данные / бэкенд / автоматизация
- [x] **D1.** Изучить и зафиксировать схему `sumitrodatta` (download + осмотр файлов/колонок). → Источники `Advanced.csv`+`Player Totals.csv` join по (season,player_id); lg='NBA' → 1950–2026; родной строковый player_id; обменянные = строка `NTM`; bpm NaN ~12.7% (до 1974). Маппинг в описании D3.
- [x] **D2.** Тесты адаптера `load_sumitrodatta` (TDD) — грязные кейсы (амплуа, NaN BPM, TOT-дубли, player_id, active_next, частичное покрытие) — *blocked by D1*.
- [x] **D3.** Реализация `load_sumitrodatta` в `pipeline/datasets.py` + регистрация в `DATASET_LOADERS` — *blocked by D1, D2*.
- [x] **D4.** Автоматизация: `task download` на новый слаг; динамический `DATA_THROUGH` + `season_min/max` в `meta` (`build.py`) — *blocked by D3*.
- [x] **D5.** Пересборка `data/aging.json` на новом датасете + встраивание в `index.html`; бюджет < 300 КБ — *blocked by D4*. → 37 КБ, сезоны 1952–2026, data_through=2025–26; долгожители LeBron/Vince Carter. Попутно исправлены 2 краша на реальных данных (NaN-амплуа в position_group, строковый player_id в notable).

### Фаза 2 — Интерфейс
- [x] **D6.** Подзаголовок: убрать двусмысленность — показать диапазон сезонов из `meta` — *blocked by D5*. → «данные по сезон 2025–26 · охват 1951–52 … 2025–26 (75 сезонов)».
- [x] **D7.** Кнопка «?» рядом с темой → модалка (датасет + методология) с a11y — *blocked by D6*. → role=dialog/aria-modal, focus-trap, Esc/бэкдроп закрывают, возврат фокуса, theme-aware, без эмодзи.
- [x] **D8.** Гейт приёмки: тесты + ruff + check_html + браузерная проверка модалки/диапазона; бюджет — *blocked by D6, D7*. → 76 тестов, ruff, check_html, `tools/verify_dom.mjs` (jsdom) — всё зелёное, 37 КБ. Добавлены `task verify` и `package.json`.

---

## Контрольные точки (git включён, ветка `master`)

| После | Проверка | Коммит |
|-------|----------|--------|
| D3 | `task test` зелёные (адаптер) | `feat(data): sumitrodatta dataset adapter` |
| D5 | `task build` на новом датасете, бюджет | `feat(data): refresh data to sumitrodatta (1947–present)` |
| D7 | браузер: модалка/диапазон | `feat(ui): season-range subtitle + methodology modal` |
| **D8** | `task ci` + Playwright + a11y | `test(ui): acceptance gate for data refresh + modal` |

## Следующий шаг

`/aif-implement` — начнёт с D1 (schema), затем по графу зависимостей. Фронт (D6–D8)
разблокируется после пересборки на новом датасете (D5).
