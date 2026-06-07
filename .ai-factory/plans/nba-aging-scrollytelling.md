# План: дашборд «Игроки NBA: когда пора на пенсию?» (Фазы 1 + 2)

**Ветка:** `master`  (git включён; создание веток выключено — работаем в текущей ветке)
**Дата создания:** 2026-06-07
**Источники истины:** [SPEC.md](../../SPEC.md), [RULES.md](../../RULES.md), [ARCHITECTURE.md](../ARCHITECTURE.md)

## Settings

- **Testing:** yes — TDD обязателен (RULES.md «Процесс»); тесты пайплайна раньше реализации.
- **Logging:** verbose — DEBUG-логи в Python-пайплайне, уровень через `LOG_LEVEL`.
- **Docs:** yes — обязательный чекпоинт документации по завершении (через `/aif-docs`).

## Roadmap Linkage

- **Milestone:** none
- **Rationale:** Roadmap-артефакт не создан; линковка пропущена.

## Ключевые ограничения (из SPEC.md / RULES.md)

- Один self-contained `index.html`, без сборщика/сервера, данные инлайн; **нет рантайм-fetch**.
- Агрегация офлайн (Python/pandas); браузер потребляет только слим-JSON < 300 КБ.
- Достоверность: дельта-метод, скоростные метрики (per-36), контроль survivorship bias, показ неопределённости (коридор, `n`) и оговорок.
- Жанр: скроллителлинг (sticky-графика, одна мысль на сцену), **не** BI-сетка.
- Дата-виз: минимум не-данных, прямые подписи, единицы в заголовках, ≤ 2 шрифтов, theme-aware семантический цвет.
- Дефолты §7 (PROMPT.md): `value = BPM`; эпохи ≤1989 / 1990–2009 / 2010+; порог сезона ≥ 1000 минут.
- **Граница фаз:** Фаза 2 не стартует, пока тесты пайплайна не зелёные.

---

## Tasks

### Фаза 0 — Каркас
- [x] **T1.** Каркас пайплайна и зависимости — `pipeline/` структура, `requirements.txt`, `logging_setup.py` (LOG_LEVEL), конфиг pytest/ruff, `.gitignore`.

### Фаза 1 — Пайплайн данных (Python, TDD)
- [x] **T2.** Тесты: загрузка и нормализация (`tests/test_normalize.py`) — per-36, фильтр ≥1000 мин, бакеты амплуа/эпох.
- [x] **T3.** Реализация загрузки и нормализации (`fetch.py`, `transform/normalize.py`) — *blocked by T2*.
- [x] **T4.** Тесты: дельта-метод и `aging_curve` (`tests/test_aging_curve.py`) — год-к-году, коридор, `n`, survivorship.
- [x] **T5.** Реализация `aging_curve` дельта-методом (`transform/aging.py`) — *blocked by T4, T3*.
- [x] **T6.** Тесты: `survival`, `skill_decline`, `notable` — *(`tests/test_survival.py`, `test_skill_decline.py`, `test_notable.py`)*.
- [x] **T7.** Реализация `survival` / `skill_decline` / `notable` (`transform/*.py`) — *blocked by T6, T3*.
- [x] **T8.** Тесты: схема контракта §2 и бюджет < 300 КБ (`tests/test_schema_budget.py`).
- [x] **T9.** Реализация `schema.py` + `build.py` → `data/aging.json` (метаданные: дата данных, версия, дефолты §7) — *blocked by T8, T5, T7*.
  - 🚦 **ГЕЙТ ФАЗЫ 1:** после T9 все тесты пайплайна зелёные — только тогда Фаза 2.

### Фаза 2 — index.html (scrollytelling)
- [x] **T10.** Встраивание JSON `embed.py` → `<script id="seed-data">` — *blocked by T9, T11*.
- [x] **T11.** Каркас `index.html` — темы (data-theme, токены), CDN с фикс. версиями, один `<script id="app">`, `JSON.parse` в try/catch, prefers-reduced-motion, дата данных — *blocked by T9*.
- [x] **T12.** Сцены US-1 (средняя кривая) + US-2 (по амплуа) — *blocked by T11*.
- [x] **T13.** Сцены US-3 (порядок угасания) + US-4 (эпохи) — *blocked by T11*.
- [x] **T14.** Сцены US-5 (выбросы) + US-6 (обрыв) — *blocked by T11*.
- [x] **T15.** Сцена US-7: песочница (фильтры, стабильная палитра, сброс) — *blocked by T12, T13, T14*.
- [x] **T16.** Гейт приёмки: дата-виз/сборка/доступность + браузерная проверка (Playwright) — *blocked by T15*. *(статика + jsdom-рантайм пройдены; пиксельная/интерактивная проверка Playwright — после активации MCP)*

---

## Контрольные точки

> Git включён (ветка `master`). Чекпоинты — реальные коммиты после зелёной самопроверки
> (`task ci` / `task check`). Сообщения — в стиле Conventional Commits.

| После | Проверка | Условный коммит |
|-------|----------|-----------------|
| T1 | `task test` (пусто, зелёно) | `chore: scaffold data pipeline` |
| T3 | `task test` | `feat(pipeline): data load + per-36 normalization` |
| T5 | `task test` | `feat(pipeline): aging curve via delta method` |
| T7 | `task test` | `feat(pipeline): survival, skill_decline, notable` |
| **T9** | `task build`-данные зелёные → **гейт Фазы 1** | `feat(pipeline): schema validation, budget, slim JSON` |
| T11 | `task check` | `feat(ui): index.html skeleton, theming, seed embed` |
| T14 | браузер-проверка сцен | `feat(ui): scenes US-1…US-6` |
| **T16** | `task ci` + Playwright + чек-листы | `feat(ui): sandbox US-7 + acceptance gate` |

## Следующий шаг

`/aif-implement` — начнёт с T1 и пойдёт по зависимостям. Фронт (Фаза 2) разблокируется
только после зелёного гейта Фазы 1 (T9). По завершении — обязательный чекпоинт документации.
