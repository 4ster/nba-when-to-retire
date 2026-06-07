# AGENTS.md

> Структурная карта проекта для AI-агентов и новых разработчиков.
> Поддерживается в актуальном состоянии при значимых изменениях структуры.
> Раздел «Документация» ведёт `/aif-docs`.

## Обзор проекта

Single-file HTML scrollytelling «Игроки NBA: когда пора на пенсию?» — вертикальный
нарратив о возрастных кривых игроков NBA. Полное описание — `SPEC.md` (источник истины).

## Технологический стек

- **Язык (build-time):** Python + pandas — офлайн-пайплайн агрегации данных
- **Язык (runtime):** HTML + JavaScript (один self-contained файл)
- **Визуализация:** d3 (шкалы, кривые), Canvas/SVG; scrollama / IntersectionObserver
- **Тесты:** pytest (TDD для пайплайна)
- **БД:** нет — данные предвычислены и встроены инлайн (слим-JSON < 300 КБ)
- **Git:** включён; базовая ветка `master`, remote `origin` (создание веток в `/aif-plan` выключено — работаем в текущей ветке)

## Структура проекта

```
insba_dashboard_contest/
├── SPEC.md              # Источник истины: конституция, контракт данных, сцены
├── RULES.md             # Enforceable-аксиомы (гейт /aif-verify, /aif-review)
├── PROMPT.md            # Постановка задачи, фазы, дефолты §7
├── pyproject.toml       # конфиг pytest + ruff
├── index.html           # единственный артефакт рантайма (каркас: темы, seed, сцены, модалка)
├── package.json         # Node-инструменты сборки/проверки (jsdom, d3) — devDependencies
├── tools/               # build-утилиты: check_html.mjs (гейт JS-блока), verify_dom.mjs (jsdom)
├── pipeline/            # офлайн-пайплайн данных на Python (build-time)
│   ├── logging_setup.py # настройка логирования (LOG_LEVEL)
│   ├── fetch.py         # загрузка сырого CSV + валидация колонок
│   ├── datasets.py      # адаптеры датасетов (sumitrodatta, drgilermo) → контракт §2
│   ├── schema.py        # валидация контракта §2 + бюджет
│   ├── build.py         # оркестратор → слим-JSON (CLI)
│   ├── embed.py         # встраивание слим-JSON в index.html
│   ├── requirements.txt # зависимости пайплайна
│   ├── transform/       # normalize, aging, survival, skill_decline, notable
│   └── tests/           # тесты пайплайна (pytest), пишутся раньше реализации
├── references/          # Внешние референсы (дизайн-примеры)
└── .ai-factory/         # Контекст AI Factory (config, rules, architecture)
```

## Ключевые точки входа

| Файл | Назначение |
|------|------------|
| `SPEC.md` | Спецификация-источник истины; код порождается из неё |
| `RULES.md` | Жёсткие правила (формат, достоверность данных, дата-виз, сборка) |
| `PROMPT.md` | План работ: Фаза 1 (пайплайн) → Фаза 2 (HTML), дефолты открытых вопросов §7 |
| `index.html` | Итоговый дашборд (создаётся в Фазе 2) |
| `pipeline/` | Скрипты агрегации → слим-JSON по контракту `SPEC.md` §2 (Фаза 1) |

## Команды (Taskfile)

Автоматизация сборки — `Taskfile.yml` (запуск: `task <цель>`, список: `task`).

| Команда | Назначение |
|---------|------------|
| `task install` | Зависимости пайплайна (`pipeline/requirements.txt`) + Node-инструментов (`npm install`) |
| `task download` | Скачать датасет sumitrodatta/nba-aba-baa-stats в `data/sumitro` (kaggle CLI + токен) |
| `task test` | Тесты пайплайна (pytest) — TDD-гейт перед фронтом |
| `task data` | Прогнать пайплайн → слим-JSON `data/aging.json` (+ проверка бюджета) |
| `task build` | Полная сборка: тесты → данные → встраивание JSON в `index.html` → валидация |
| `task check` | `node --check` JS-блока (`id="app"`) + проверка null-байтов |
| `task verify` | Браузерная проверка (jsdom): подзаголовок-диапазон + модалка/a11y + 0 ошибок |
| `task open` | Открыть `index.html` в браузере |
| `task clean` | Удалить производные артефакты |
| `task ci` | Полный прогон (`build` + `verify`) |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| README | README.md | Лендинг проекта |
| Getting Started | `docs/getting-started.md` | Требования, установка, сборка, запуск |
| Data Pipeline | `docs/data-pipeline.md` | Контракт данных, методика, достоверность |

## Файлы AI-контекста

| Файл | Назначение |
|------|------------|
| AGENTS.md | Структурная карта проекта (этот файл) |
| SPEC.md | Описание проекта — источник истины (`paths.description`) |
| RULES.md | Проектные аксиомы (`paths.rules_file`) |
| .ai-factory/ARCHITECTURE.md | Архитектурные правила (генерируется `/aif-architecture`) |
| .ai-factory/rules/base.md | Базовые конвенции кодовой базы |
| .ai-factory/config.yaml | Конфигурация AI Factory (язык, пути, git) |

## Установленные навыки

| Навык | Назначение |
|-------|------------|
| insba-html-dashboard | Методика ремесла дата-виз (§5/§7/§8/§21 критериев приёмки) |
| scrollytelling | Sticky-нарратив, прогрессивные раскрытия, скролл-анимации |
| d3-visualization | d3-графики, шкалы, кривые, интерактив |
| pandas-pro | Операции pandas: агрегация, очистка, трансформации |

## Правила для агентов

- Декомпозируй составные shell-команды — не объединяй шаги через `&&`.
  - Неверно: `node --check index.js && echo ok`
  - Верно: сначала `node --check index.js`, затем отдельной командой `echo ok`
- Источник истины — `SPEC.md`; при расхождении кода и spec правится не spec, а код
  (либо spec осознанно обновляется с ревью нарратива).
- Проверяй изменения против `RULES.md` — это read-only гейт `/aif-verify` и `/aif-review`.
