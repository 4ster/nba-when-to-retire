[Назад к README](../README.md) · [Data Pipeline →](data-pipeline.md)

# Getting Started

Как развернуть окружение, собрать дашборд из данных и открыть его в браузере.

## Требования

| Инструмент | Зачем | Проверка |
|------------|-------|----------|
| Python 3 | офлайн-пайплайн данных (pandas) | `python --version` |
| Node.js | валидация JS-блока, проверка бюджета, браузерная проверка (jsdom + d3) | `node --version` |
| [Task](https://taskfile.dev) | запуск целей сборки (`Taskfile.yml`) | `task --version` |

Установка Task: см. [taskfile.dev/installation](https://taskfile.dev/installation/).

## Установка

```bash
task install      # pip install -r pipeline/requirements.txt + npm install (jsdom, d3)
```

Python-зависимости — из `pipeline/requirements.txt`; Node-инструменты (jsdom, d3 для
`task verify`) — из `package.json` (ставятся в gitignore-`node_modules`).

## Сборка

`task build` выполняет полный цикл в правильном порядке (граница фаз — TDD):

```bash
task build
```

Что происходит по шагам:

1. **`task test`** — тесты пайплайна (pytest). Если красные — сборка останавливается.
2. **`task data`** — Python-пайплайн считает агрегаты и пишет `data/aging.json`,
   затем проверяется бюджет размера (< 300 КБ).
3. **встраивание** — `pipeline/embed.py` вставляет JSON в `index.html` как
   `<script id="seed-data" type="application/json">`.
4. **`task check`** — извлекает JS-блок (`<script id="app">`), запускает
   `node --check` и проверяет отсутствие null-байтов.

Отдельные шаги доступны как самостоятельные цели — см. таблицу ниже.

## Открыть дашборд

```bash
task open         # открывает index.html в браузере по умолчанию
```

`index.html` самодостаточен — его также можно просто открыть двойным кликом.

## Цели Taskfile

| Команда | Назначение |
|---------|------------|
| `task` | список целей |
| `task install` | зависимости пайплайна (pip) и инструментов (npm: jsdom, d3) |
| `task download` | скачать датасет sumitrodatta/nba-aba-baa-stats в `data/sumitro` (kaggle CLI + токен) |
| `task test` | тесты пайплайна (pytest) |
| `task data` | пайплайн → `data/aging.json` + проверка бюджета |
| `task build` | полная сборка: тесты → данные → встраивание → валидация |
| `task check` | `node --check` JS-блока + проверка null-байтов |
| `task verify` | браузерная проверка (jsdom): подзаголовок-диапазон + модалка/a11y + 0 ошибок |
| `task lint` | линт Python (ruff, если установлен) |
| `task open` | открыть `index.html` |
| `task clean` | удалить производные артефакты |
| `task ci` | полный прогон для проверки (`build` + `verify`) |

## Проверка, что всё работает

После `task build` ожидается:

- создан `data/aging.json` (вывод `task budget`: `OK: слим-JSON … Б`);
- `task check` печатает `OK> синтаксис JS-блока валиден, null-байтов нет`;
- `task open` показывает дашборд со сценами и переключателем темы.

## Данные

Источник — Kaggle `sumitrodatta/nba-aba-baa-stats` (Basketball-Reference, CC0). `task download`
скачивает его в `data/sumitro` (нужны kaggle CLI и токен `~/.kaggle/access_token`). Адаптер
`load_sumitrodatta` (`pipeline/datasets.py`) приводит датасет к контракту §2: фильтр лиги
(только NBA), склейка `Advanced.csv` + `Player Totals.csv`, дедуп обменянных игроков
(сводная строка `2TM/3TM/…`), родной строковый `player_id`, вывод `active_next` по следующему
сезону, `value`=BPM. Продвинутые метрики (BPM) доступны с сезона 1973–74, поэтому кривая
ценности охватывает 1974+; общий охват — сезоны NBA 1951–52 … 2025–26 (по сезон 2025–26).
Метка данных и диапазон сезонов выводятся из датасета (не хардкод).

`index.html` в репозитории уже содержит собранные данные — для просмотра достаточно `task open`.

Подробнее о контракте и методике — [Data Pipeline](data-pipeline.md).

## Текущий статус

Пайплайн и `index.html` собраны на реальных данных и проверены (76 тестов; `check_html`
и `task verify` — jsdom-рантайм всех сцен, подзаголовок-диапазон и доступность модалки —
зелёные).

## See Also

- [Data Pipeline](data-pipeline.md) — контракт данных и методика агрегации
- [Архитектура](../.ai-factory/ARCHITECTURE.md) — границы слоёв и правила зависимостей
