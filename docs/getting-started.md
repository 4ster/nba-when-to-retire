[Назад к README](../README.md) · [Data Pipeline →](data-pipeline.md)

# Getting Started

Как развернуть окружение, собрать дашборд из данных и открыть его в браузере.

## Требования

| Инструмент | Зачем | Проверка |
|------------|-------|----------|
| Python 3 | офлайн-пайплайн данных (pandas) | `python --version` |
| Node.js | `node --check` валидация JS-блока, проверка бюджета | `node --version` |
| [Task](https://taskfile.dev) | запуск целей сборки (`Taskfile.yml`) | `task --version` |

Установка Task: см. [taskfile.dev/installation](https://taskfile.dev/installation/).

## Установка

```bash
task install      # ставит зависимости из pipeline/requirements.txt
```

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
| `task install` | зависимости пайплайна |
| `task test` | тесты пайплайна (pytest) |
| `task data` | пайплайн → `data/aging.json` + проверка бюджета |
| `task build` | полная сборка: тесты → данные → встраивание → валидация |
| `task check` | `node --check` JS-блока + проверка null-байтов |
| `task lint` | линт Python (ruff, если установлен) |
| `task open` | открыть `index.html` |
| `task clean` | удалить производные артефакты |
| `task ci` | полный прогон для проверки |

## Проверка, что всё работает

После `task build` ожидается:

- создан `data/aging.json` (вывод `task budget`: `OK: слим-JSON … Б`);
- `task check` печатает `OK> синтаксис JS-блока валиден, null-байтов нет`;
- `task open` показывает дашборд со сценами и переключателем темы.

## Текущий статус

Файлы `pipeline/` и `index.html` создаются по фазам из `SPEC.md`. До их появления
цели сборки описывают целевой рабочий процесс; начните с Фазы 1 (пайплайн данных).

## See Also

- [Data Pipeline](data-pipeline.md) — контракт данных и методика агрегации
- [Архитектура](../.ai-factory/ARCHITECTURE.md) — границы слоёв и правила зависимостей
