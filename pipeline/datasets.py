"""Адаптеры конкретных датасетов → сырые player-season атомы (контракт §2).

Сырые датасеты не дают всех полей контракта напрямую: `player_id` синтезируется из
имени, `active_next` выводится по присутствию игрока в следующем сезоне, `value` берётся
из выбранной метрики ценности (BPM, SPEC.md §7). Результат — DataFrame со столбцами
:data:`pipeline.fetch.RAW_COLUMNS`, готовый для :func:`pipeline.transform.normalize.normalize`.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from pipeline.fetch import RAW_COLUMNS
from pipeline.logging_setup import get_logger

log = get_logger(__name__)

# drgilermo/nba-players-stats → Seasons_Stats.csv: исходное имя → имя по контракту.
_DRGILERMO_MAP = {
    "Year": "season", "Player": "name", "Pos": "pos", "Age": "age",
    "G": "games", "MP": "minutes",
    "PTS": "PTS", "TRB": "REB", "AST": "AST", "STL": "STL", "BLK": "BLK",
    "TS%": "TS_pct", "3P%": "FG3_pct", "BPM": "value",
}


def load_drgilermo(csv_path: str | Path) -> pd.DataFrame:
    """Загрузить Seasons_Stats.csv (drgilermo) → атомы player-season по §2.

    Шаги: дедуп обменянных игроков (строка ``Tm == "TOT"`` важнее частичных),
    синтез ``player_id`` из имени, вывод ``active_next`` по следующему сезону.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"dataset not found: {path}")

    df = pd.read_csv(path)
    log.debug("drgilermo: read %d rows", len(df))

    df = df.dropna(subset=["Year", "Player", "Age"]).copy()
    df["Year"] = df["Year"].astype(int)
    df["Age"] = df["Age"].astype(int)

    # Обменянные за сезон: оставить итоговую строку TOT, отбросить частичные по командам.
    df["_tot_priority"] = (df["Tm"] != "TOT").astype(int)  # 0 для TOT (выше приоритет)
    df = (
        df.sort_values(["Player", "Year", "_tot_priority"])
        .drop_duplicates(subset=["Player", "Year"], keep="first")
        .drop(columns="_tot_priority")
    )
    log.debug("drgilermo: %d rows after TOT-dedup", len(df))

    out = df.rename(columns=_DRGILERMO_MAP)
    out["player_id"] = pd.factorize(out["name"])[0]  # стабильный id из имени

    # active_next: есть ли (player_id, season+1) в наборе.
    present = set(zip(out["player_id"], out["season"], strict=True))
    out["active_next"] = [
        (pid, season + 1) in present
        for pid, season in zip(out["player_id"], out["season"], strict=True)
    ]
    log.debug("drgilermo: active_next доля=%.3f", out["active_next"].mean())

    result = out[list(RAW_COLUMNS)].reset_index(drop=True)
    log.debug("drgilermo: %d player-season атомов, сезоны %d–%d",
              len(result), int(result["season"].min()), int(result["season"].max()))
    return result


#: Реестр адаптеров датасетов для build.
DATASET_LOADERS = {"drgilermo": load_drgilermo}
