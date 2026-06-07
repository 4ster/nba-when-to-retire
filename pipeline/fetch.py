"""Загрузка сырых данных player-season для слоя данных (build-time).

Источник (SPEC.md §2): Kaggle-датасеты NBA. Конкретные имена колонок исходного
файла зависят от датасета, поэтому загрузчик принимает ``column_map`` (исходное_имя →
имя_по_контракту) и **валидирует** наличие всех обязательных колонок, явно сообщая о
недостающих, а не «роняя» их молча.

Сырьё лежит в ``data/`` (вне поставки, см. .gitignore). Браузер этот код не исполняет.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from pipeline.logging_setup import get_logger

log = get_logger(__name__)

#: Обязательные колонки сырого атома player-season (вход для transform.normalize).
RAW_COLUMNS = (
    "player_id", "name", "season", "age", "pos", "minutes", "games",
    "PTS", "REB", "AST", "STL", "BLK", "TS_pct", "FG3_pct", "value", "active_next",
)


def load_raw(csv_path: str | Path, column_map: dict[str, str] | None = None) -> pd.DataFrame:
    """Прочитать CSV и привести к схеме :data:`RAW_COLUMNS`.

    :param csv_path: путь к исходному CSV (например ``data/players.csv``).
    :param column_map: переименование ``{исходное: контрактное}`` под конкретный датасет.
    :raises FileNotFoundError: файла нет.
    :raises ValueError: после переименования отсутствуют обязательные колонки.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"raw dataset not found: {path}")

    log.debug("fetch: reading raw CSV %s", path)
    df = pd.read_csv(path)
    log.debug("fetch: read %d rows, %d columns", len(df), df.shape[1])

    if column_map:
        df = df.rename(columns=column_map)
        log.debug("fetch: applied column_map (%d renames)", len(column_map))

    missing = [c for c in RAW_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            "raw dataset is missing required columns: "
            f"{missing}. Provide column_map to rename source columns to the §2 schema."
        )

    result = df[list(RAW_COLUMNS)].copy()
    log.debug("fetch: normalized to RAW_COLUMNS, %d rows", len(result))
    return result
