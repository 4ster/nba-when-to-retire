"""Нормализация атомов player-season для слоя данных.

Контракт зафиксирован тестами ``pipeline/tests/test_normalize.py``:
- per-36 нормализация скоростных метрик;
- фильтр порога включения сезона (минуты ≥ :data:`MIN_MINUTES`);
- маппинг амплуа (:func:`position_group`) и эпох (:func:`era_bucket`);
- пропуски (NaN) сохраняются, строки не «роняются молча».

См. SPEC.md §2 (контракт данных) и §7 (дефолты: порог ≥ 1000 минут, эпохи).
"""

from __future__ import annotations

import pandas as pd

from pipeline.logging_setup import get_logger

log = get_logger(__name__)

#: Порог включения сезона в минутах (SPEC.md §7, фильтр шума).
MIN_MINUTES = 1000

#: Группы амплуа.
GROUP_GUARD = "guard"
GROUP_WING = "wing"
GROUP_BIG = "big"

_POSITION_MAP = {
    "PG": GROUP_GUARD,
    "SG": GROUP_GUARD,
    "SF": GROUP_WING,
    "PF": GROUP_BIG,
    "C": GROUP_BIG,
}

#: Бакеты эпох (границы SPEC.md §7).
ERA_PRE = "≤1989"
ERA_MID = "1990–2009"
ERA_MODERN = "2010+"

#: Скоростные метрики: сырой total → колонка per-36.
_PER36_SOURCES = {
    "PTS": "PTS_36",
    "REB": "REB_36",
    "AST": "AST_36",
    "STL": "STL_36",
    "BLK": "BLK_36",
}

#: Колонки итогового атома (после нормализации), порядок по SPEC.md §2.
_OUTPUT_COLUMNS = [
    "player_id", "name", "age", "season", "era_bucket", "position_group",
    "minutes", "games",
    "PTS_36", "REB_36", "AST_36", "STL_36", "BLK_36", "TS_pct", "FG3_pct",
    "value", "active_next",
]


def to_per36(value: float, minutes: float) -> float:
    """Привести суммарную метрику к значению на 36 минут.

    :raises ValueError: если ``minutes`` не положительны (явный отказ, не «тихий» NaN).
    """
    if minutes <= 0:
        raise ValueError(f"minutes must be positive, got {minutes!r}")
    return value / minutes * 36.0


def position_group(pos: str) -> str:
    """Свернуть амплуа (PG/SG/SF/PF/C) в группу guard/wing/big."""
    key = (pos or "").strip().upper()
    if key not in _POSITION_MAP:
        raise ValueError(f"unknown position {pos!r}")
    return _POSITION_MAP[key]


def era_bucket(season: int) -> str:
    """Сопоставить сезону (год окончания) бакет эпохи."""
    if season <= 1989:
        return ERA_PRE
    if season <= 2009:
        return ERA_MID
    return ERA_MODERN


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Нормализовать сырые player-season атомы в схему контракта §2.

    Шаги: фильтр минут ≥ :data:`MIN_MINUTES` → per-36 → бакеты амплуа/эпох.
    Пропуски в метриках сохраняются (NaN в per-36), строки не выкидываются молча.
    """
    n_before = len(df)
    log.debug("normalize: %d rows before min-minutes filter", n_before)

    kept = df[df["minutes"] >= MIN_MINUTES].copy()
    n_after = len(kept)
    log.debug(
        "normalize: %d rows after min-minutes filter (>= %d min); dropped %d",
        n_after, MIN_MINUTES, n_before - n_after,
    )

    if kept.empty:
        log.warning("normalize: no rows left after min-minutes filter")
        return kept.reindex(columns=_OUTPUT_COLUMNS)

    for src, dst in _PER36_SOURCES.items():
        # minutes > 0 гарантировано фильтром выше; NaN в src → NaN в dst (не теряем строку).
        kept[dst] = kept[src] / kept["minutes"] * 36.0

    kept["position_group"] = kept["pos"].map(position_group)
    kept["era_bucket"] = kept["season"].map(era_bucket)

    log.debug(
        "normalize: position groups=%s, eras=%s",
        kept["position_group"].value_counts().to_dict(),
        kept["era_bucket"].value_counts().to_dict(),
    )

    return kept.reindex(columns=_OUTPUT_COLUMNS)
