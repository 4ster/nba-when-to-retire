"""Кривая «выживания» в лиге: доля активных игроков по возрасту.

Контракт — ``pipeline/tests/test_survival.py``. На основе ``active_next`` (активен ли
игрок в следующем сезоне). Колонки результата: ``age, survival, n``.
"""

from __future__ import annotations

import pandas as pd

from pipeline.logging_setup import get_logger

log = get_logger(__name__)


def survival(df: pd.DataFrame) -> pd.DataFrame:
    """Доля игроков, активных в следующем сезоне, по возрасту.

    ``survival`` — среднее булева ``active_next`` в возрастной группе; ``n`` — размер группы.
    """
    grouped = df.groupby("age")["active_next"]
    out = grouped.agg(survival="mean", n="count").reset_index()
    out["n"] = out["n"].astype(int)
    out = out.sort_values("age").reset_index(drop=True)
    log.debug("survival: %d age buckets, %d player-seasons", len(out), len(df))
    return out
