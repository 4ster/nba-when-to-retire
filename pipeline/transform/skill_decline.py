"""Кривые угасания навыков, нормированные к пику = 100%.

Контракт — ``pipeline/tests/test_skill_decline.py``. Для каждой компоненты навыка
(``PTS_36``, ``REB_36``, …) считается среднее по возрасту и нормируется к пику (max)
= 100%. Колонки: ``age, component, value_pct, n``.

Методическая оговорка (RULES.md, гейт T16): эти кривые — **срезовые** средние по
возрасту; они показывают относительный ПОРЯДОК и ТАЙМИНГ угасания навыков (US-3), где
важна нормированная форма, а не абсолютный уровень. Headline-кривая ценности (US-1,
метрика ``value``) строится строго дельта-методом в :mod:`pipeline.transform.aging`.
"""

from __future__ import annotations

import pandas as pd

from pipeline.logging_setup import get_logger

log = get_logger(__name__)


def skill_decline(df: pd.DataFrame, components: list[str]) -> pd.DataFrame:
    """Нормированные к пику кривые по компонентам навыка.

    Для каждой компоненты: среднее по возрасту → деление на пик (max) → ×100.
    """
    frames: list[pd.DataFrame] = []

    for component in components:
        by_age = df.groupby("age")[component].agg(mean="mean", n="count").reset_index()
        peak = by_age["mean"].max()
        if not peak or pd.isna(peak):
            log.warning("skill_decline[%s]: non-positive/NaN peak, skipping", component)
            continue

        by_age["value_pct"] = by_age["mean"] / peak * 100.0
        by_age["component"] = component
        by_age["n"] = by_age["n"].astype(int)
        frames.append(by_age[["age", "component", "value_pct", "n"]])
        log.debug("skill_decline[%s]: %d ages, peak=%.3f", component, len(by_age), peak)

    if not frames:
        return pd.DataFrame(columns=["age", "component", "value_pct", "n"])
    return pd.concat(frames, ignore_index=True).sort_values(
        ["component", "age"]
    ).reset_index(drop=True)
