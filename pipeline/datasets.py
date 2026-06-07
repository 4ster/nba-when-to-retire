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


# sumitrodatta/nba-aba-baa-stats → Advanced.csv + Player Totals.csv (join по season+player_id).
# Имя исходной колонки → имя по контракту §2; player_id здесь родной (строковый), не синтезируется.
_SUMITRO_ADV_MAP = {
    "player": "name", "team": "tm",
    "g": "games", "mp": "minutes",
    "ts_percent": "TS_pct", "bpm": "value",
}
_SUMITRO_TOT_MAP = {
    "pts": "PTS", "trb": "REB", "ast": "AST", "stl": "STL", "blk": "BLK",
    "x3p_percent": "FG3_pct",
}


def _is_multi_team(team: object) -> bool:
    """Строка сводного сезона обменянного игрока: ``2TM``/``3TM``/…/``5TM``."""
    return isinstance(team, str) and len(team) > 2 and team[0].isdigit() and team.endswith("TM")


def _dedup_traded(df: pd.DataFrame, team_col: str) -> pd.DataFrame:
    """Оставить одну строку на (season, player_id): сводную ``NTM`` важнее частичных по командам."""
    df = df.copy()
    df["_multi_priority"] = (~df[team_col].map(_is_multi_team)).astype(int)  # 0 для NTM → выше
    return (
        df.sort_values(["season", "player_id", "_multi_priority"])
        .drop_duplicates(subset=["season", "player_id"], keep="first")
        .drop(columns="_multi_priority")
    )


def load_sumitrodatta(data_dir: str | Path) -> pd.DataFrame:
    """Загрузить sumitrodatta (каталог с CSV) → атомы player-season по §2.

    Склейка ``Advanced.csv`` (bpm→value, ts_percent, амплуа/минуты/возраст) и
    ``Player Totals.csv`` (pts/trb/ast/stl/blk, x3p_percent) по ключу (season, player_id).
    Шаги: фильтр лиги (только NBA), дедуп обменянных (сводная строка ``NTM``),
    отбрасывание строк без season/age/minutes, вывод ``active_next`` по следующему сезону.
    BPM до 1974 отсутствует — такие строки сохраняются с ``value = NaN`` (не «роняем»).
    """
    base = Path(data_dir)
    adv_path = base / "Advanced.csv"
    tot_path = base / "Player Totals.csv"
    for p in (adv_path, tot_path):
        if not p.exists():
            raise FileNotFoundError(f"sumitrodatta file not found: {p}")

    adv = pd.read_csv(adv_path)
    tot = pd.read_csv(tot_path)
    log.debug("sumitrodatta: read Advanced=%d, Player Totals=%d rows", len(adv), len(tot))

    # Только NBA (история «Игроки NBA»; ABA/BAA отбрасываем).
    adv = adv[adv["lg"] == "NBA"].copy()
    tot = tot[tot["lg"] == "NBA"].copy()
    log.debug("sumitrodatta: %d Advanced rows after NBA filter", len(adv))

    # Дедуп обменянных в обоих файлах по одному правилу, затем join.
    adv = _dedup_traded(adv, "team")
    tot = _dedup_traded(tot, "team")
    log.debug("sumitrodatta: %d Advanced, %d Totals rows after traded-dedup", len(adv), len(tot))

    adv = adv.rename(columns=_SUMITRO_ADV_MAP)
    tot = tot.rename(columns=_SUMITRO_TOT_MAP)

    merged = adv.merge(
        tot[["season", "player_id", *(_SUMITRO_TOT_MAP.values())]],
        on=["season", "player_id"], how="left",
    )
    log.debug("sumitrodatta: %d rows after Advanced⋈Totals join", len(merged))

    # Базовые поля обязательны; bpm (value) намеренно НЕ требуем — до 1974 его нет.
    merged = merged.dropna(subset=["season", "name", "age", "minutes"]).copy()
    merged["season"] = merged["season"].astype(int)
    merged["age"] = merged["age"].astype(int)
    log.debug("sumitrodatta: %d rows after dropna(season/name/age/minutes)", len(merged))

    # active_next: присутствует ли (player_id, season+1) в наборе.
    present = set(zip(merged["player_id"], merged["season"], strict=True))
    merged["active_next"] = [
        (pid, season + 1) in present
        for pid, season in zip(merged["player_id"], merged["season"], strict=True)
    ]
    log.debug(
        "sumitrodatta: active_next доля=%.3f, NaN value доля=%.3f",
        merged["active_next"].mean(), merged["value"].isna().mean(),
    )

    result = merged[list(RAW_COLUMNS)].reset_index(drop=True)
    log.debug("sumitrodatta: %d player-season атомов, сезоны %d–%d",
              len(result), int(result["season"].min()), int(result["season"].max()))
    return result


#: Реестр адаптеров датасетов для build.
DATASET_LOADERS = {"drgilermo": load_drgilermo, "sumitrodatta": load_sumitrodatta}
