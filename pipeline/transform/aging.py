"""Кривая старения дельта-методом (aging_curve).

Контракт зафиксирован тестами ``pipeline/tests/test_aging_curve.py``.

**Дельта-метод** (см. SPEC.md §0.3, RULES.md «Достоверность»): изменение метрики
считается год-к-году по ОДНОМУ игроку (``value(age) - value(age-1)`` для
последовательных сезонов), а не сравнением разных игроков на срезе возраста. Это
контролирует survivorship bias — слабые игроки, рано ушедшие из лиги, не завышают
средние на старших возрастах.

``aging_curve`` агрегирует дельты по ``(age × position_group × era_bucket × metric)``:
среднее, доверительный коридор (нормальное приближение) и ``n``. Кривую уровня фронт
восстанавливает кумулятивной суммой средних дельт.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.logging_setup import get_logger

log = get_logger(__name__)

#: Z-значение для 95% доверительного коридора (нормальное приближение).
Z95 = 1.96

_CELL_KEYS = ["age", "position_group", "era_bucket"]


def player_deltas(df: pd.DataFrame, metric: str) -> pd.DataFrame:
    """Дельты метрики год-к-году по игроку для последовательных возрастов.

    Возвращает строки ``[player_id, age, position_group, era_bucket, delta]``,
    где ``delta = metric(age) - metric(age-1)``; атрибуты берутся из текущего сезона.
    Несоседние возрасты (пропуск сезона) дельту не дают.
    """
    ordered = df.sort_values(["player_id", "age"]).copy()
    grp = ordered.groupby("player_id", sort=False)
    prev_age = grp["age"].shift(1)
    prev_val = grp[metric].shift(1)

    ordered["delta"] = ordered[metric] - prev_val
    consecutive = (ordered["age"] - prev_age) == 1

    result = ordered.loc[
        consecutive, ["player_id", *_CELL_KEYS[1:], "age", "delta"]
    ].reset_index(drop=True)
    # упорядочить колонки предсказуемо
    result = result[["player_id", "age", "position_group", "era_bucket", "delta"]]
    log.debug("player_deltas[%s]: %d deltas from %d rows", metric, len(result), len(df))
    return result


def aging_curve(df: pd.DataFrame, metrics: list[str]) -> pd.DataFrame:
    """Агрегировать дельты в кривые старения по метрикам.

    Колонки результата: ``age, position_group, era_bucket, metric, value, ci_low, ci_high, n``.
    ``value`` — среднее дельт (изменение в этом возрасте); ``n`` — число дельт;
    коридор — ``mean ± Z95 · se`` (при ``n < 2`` коридор схлопывается в ``value``).
    """
    frames: list[pd.DataFrame] = []

    for metric in metrics:
        deltas = player_deltas(df, metric).dropna(subset=["delta"])
        if deltas.empty:
            log.warning("aging_curve[%s]: no deltas, skipping metric", metric)
            continue

        agg = deltas.groupby(_CELL_KEYS, sort=True)["delta"].agg(
            ["mean", "count", "std"]
        ).reset_index()
        agg = agg.rename(columns={"mean": "value", "count": "n", "std": "_sd"})

        # se=0 при n<2 (std=NaN) → коридор схлопывается в value, без NaN-арифметики.
        se = (agg["_sd"] / np.sqrt(agg["n"])).fillna(0.0)
        agg["ci_low"] = agg["value"] - Z95 * se
        agg["ci_high"] = agg["value"] + Z95 * se
        agg["metric"] = metric
        agg["n"] = agg["n"].astype(int)

        frames.append(
            agg[["age", "position_group", "era_bucket", "metric",
                 "value", "ci_low", "ci_high", "n"]]
        )
        log.debug("aging_curve[%s]: %d cells", metric, len(agg))

    if not frames:
        return pd.DataFrame(
            columns=["age", "position_group", "era_bucket", "metric",
                     "value", "ci_low", "ci_high", "n"]
        )
    return pd.concat(frames, ignore_index=True)
