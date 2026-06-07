"""Отбор именованных карьер (notable) как индивидуальных рядов.

Контракт — ``pipeline/tests/test_notable.py``. Две категории:
- ``longevity`` — долгожители (больше всего сезонов);
- ``early_fade`` — рано угасшие (самый молодой возраст пика ``value``), среди игроков
  с достаточным числом сезонов и не попавших в долгожители.

Возвращает список записей ``{player_id, name, kind, series:[{age, value}, ...]}``
(ряд отсортирован по возрасту). Без дубликатов игроков между категориями.
"""

from __future__ import annotations

import pandas as pd

from pipeline.logging_setup import get_logger

log = get_logger(__name__)

#: Минимум сезонов, чтобы игрок мог считаться «рано угасшим».
MIN_SEASONS_FADE = 3


def _career_stats(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pid, g in df.groupby("player_id"):
        g_sorted = g.sort_values("age")
        peak_age = int(g_sorted.loc[g_sorted["value"].idxmax(), "age"])
        rows.append({
            "player_id": int(pid),
            "name": str(g_sorted["name"].iloc[0]),
            "n_seasons": int(len(g_sorted)),
            "peak_age": peak_age,
        })
    return pd.DataFrame(rows)


def _series(df: pd.DataFrame, player_id: int) -> list[dict]:
    g = df[df["player_id"] == player_id].sort_values("age")
    return [
        {"age": int(a), "value": float(v)}
        for a, v in zip(g["age"], g["value"], strict=True)
    ]


def _record(stats: pd.DataFrame, df: pd.DataFrame, player_id: int, kind: str) -> dict:
    name = stats.loc[stats["player_id"] == player_id, "name"].iloc[0]
    return {
        "player_id": int(player_id),
        "name": name,
        "kind": kind,
        "series": _series(df, player_id),
    }


def notable(
    df: pd.DataFrame,
    longevity: int = 2,
    early_fade: int = 2,
    min_seasons_fade: int = MIN_SEASONS_FADE,
) -> list[dict]:
    """Отобрать долгожителей и рано угасших как индивидуальные ряды."""
    stats = _career_stats(df)

    long_ids = (
        stats.sort_values(["n_seasons", "player_id"], ascending=[False, True])
        .head(longevity)["player_id"].tolist()
    )
    selected = set(long_ids)

    fade_pool = stats[
        (stats["n_seasons"] >= min_seasons_fade) & (~stats["player_id"].isin(selected))
    ]
    fade_ids = (
        fade_pool.sort_values(["peak_age", "player_id"], ascending=[True, True])
        .head(early_fade)["player_id"].tolist()
    )

    records = [_record(stats, df, pid, "longevity") for pid in long_ids]
    records += [_record(stats, df, pid, "early_fade") for pid in fade_ids]
    log.debug("notable: %d longevity, %d early_fade", len(long_ids), len(fade_ids))
    return records
