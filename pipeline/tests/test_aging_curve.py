"""Тесты дельта-метода и aging_curve (TDD, раньше реализации T5).

Контракт ``pipeline.transform.aging``:
- ``player_deltas`` — изменения метрики год-к-году по ОДНОМУ игроку, только
  для последовательных возрастов;
- ``aging_curve`` — по (age × position_group × era_bucket × metric): среднее дельт,
  доверительный коридор (нормальное приближение, :data:`aging.Z95`) и ``n``;
- контроль survivorship bias: дельта-метод не равен наивному срезовому среднему.
"""

from __future__ import annotations

import math

import pandas as pd
import pytest

from pipeline.transform import aging
from pipeline.transform.normalize import ERA_MODERN, GROUP_GUARD


def _row(player_id, age, value, *, group=GROUP_GUARD, era=ERA_MODERN, **metrics) -> dict:
    row = {
        "player_id": player_id,
        "age": age,
        "season": 2000 + age,
        "position_group": group,
        "era_bucket": era,
        "value": value,
    }
    row.update(metrics)
    return row


def _df(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


# --- player_deltas --------------------------------------------------------

def test_player_deltas_only_consecutive_ages():
    df = _df([
        _row(1, 24, 1.0),
        _row(1, 25, 2.0),   # consecutive → delta at 25 = +1.0
        _row(1, 27, 5.0),   # gap 25→27 → no delta
    ])
    deltas = aging.player_deltas(df, "value")
    assert deltas["age"].tolist() == [25]
    assert deltas.iloc[0]["delta"] == pytest.approx(1.0)


def test_player_deltas_carries_group_and_era_from_current_season():
    df = _df([
        _row(1, 24, 1.0, group=GROUP_GUARD, era=ERA_MODERN),
        _row(1, 25, 2.0, group=GROUP_GUARD, era=ERA_MODERN),
    ])
    deltas = aging.player_deltas(df, "value")
    assert deltas.iloc[0]["position_group"] == GROUP_GUARD
    assert deltas.iloc[0]["era_bucket"] == ERA_MODERN


# --- aging_curve ----------------------------------------------------------

def _cell(curve: pd.DataFrame, age, metric="value"):
    sub = curve[(curve["age"] == age) & (curve["metric"] == metric)]
    assert len(sub) == 1, f"expected exactly one cell for age={age}, got {len(sub)}"
    return sub.iloc[0]


def test_aging_curve_mean_delta_and_n():
    df = _df([
        _row(1, 24, 10.0), _row(1, 25, 8.0),    # delta -2
        _row(2, 24, 12.0), _row(2, 25, 6.0),    # delta -6
    ])
    curve = aging.aging_curve(df, ["value"])
    cell = _cell(curve, 25)
    assert cell["value"] == pytest.approx(-4.0)   # среднее (-2, -6)
    assert cell["n"] == 2


def test_aging_curve_confidence_interval_normal_approx():
    deltas = [-2.0, -6.0]
    df = _df([
        _row(1, 24, 10.0), _row(1, 25, 8.0),
        _row(2, 24, 12.0), _row(2, 25, 6.0),
    ])
    curve = aging.aging_curve(df, ["value"])
    cell = _cell(curve, 25)

    mean = sum(deltas) / len(deltas)
    var = sum((d - mean) ** 2 for d in deltas) / (len(deltas) - 1)  # ddof=1
    se = math.sqrt(var) / math.sqrt(len(deltas))
    assert cell["ci_low"] == pytest.approx(mean - aging.Z95 * se)
    assert cell["ci_high"] == pytest.approx(mean + aging.Z95 * se)


def test_aging_curve_single_observation_degenerate_ci():
    df = _df([_row(1, 24, 10.0), _row(1, 25, 7.0)])  # один дельта = -3
    cell = _cell(aging.aging_curve(df, ["value"]), 25)
    assert cell["n"] == 1
    assert cell["ci_low"] == pytest.approx(cell["value"])
    assert cell["ci_high"] == pytest.approx(cell["value"])


def test_delta_method_controls_survivorship_bias():
    # Возраст 30: три игрока (сильный/средний/слабый). К 31 слабый уходит из лиги.
    # Все, кто остался, падают на 4. Наивный срез занижает спад; дельта-метод — нет.
    df = _df([
        _row(1, 30, 10.0), _row(1, 31, 6.0),    # сильный: delta -4
        _row(2, 30, 6.0),  _row(2, 31, 2.0),    # средний: delta -4
        _row(3, 30, 2.0),                        # слабый: ушёл (нет сезона 31)
    ])
    curve = aging.aging_curve(df, ["value"])
    delta31 = _cell(curve, 31)["value"]

    naive30 = (10.0 + 6.0 + 2.0) / 3      # = 6.0
    naive31 = (6.0 + 2.0) / 2             # = 4.0 (слабого нет)
    naive_decline = naive31 - naive30     # = -2.0 (занижено)

    assert delta31 == pytest.approx(-4.0)            # истинный спад
    assert delta31 != pytest.approx(naive_decline)   # дельта-метод ≠ наивный срез


def test_aging_curve_separates_groups_and_eras():
    df = _df([
        _row(1, 24, 10.0, group=GROUP_GUARD), _row(1, 25, 8.0, group=GROUP_GUARD),
        _row(2, 24, 10.0, group="big"),       _row(2, 25, 4.0, group="big"),
    ])
    curve = aging.aging_curve(df, ["value"])
    guard = curve[(curve["age"] == 25) & (curve["position_group"] == GROUP_GUARD)].iloc[0]
    big = curve[(curve["age"] == 25) & (curve["position_group"] == "big")].iloc[0]
    assert guard["value"] == pytest.approx(-2.0)
    assert big["value"] == pytest.approx(-6.0)
