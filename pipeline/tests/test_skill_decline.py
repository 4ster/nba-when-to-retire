"""Тесты skill_decline (TDD, раньше реализации T7).

Контракт ``pipeline.transform.skill_decline``: для каждой компоненты навыка —
кривая среднего по возрасту, нормированная к пику = 100%. Колонки:
``age, component, value_pct, n``. (US-3 — относительный порядок угасания навыков;
см. методическую оговорку в модуле.)
"""

from __future__ import annotations

import pandas as pd
import pytest

from pipeline.transform import skill_decline as sd


def _row(player_id, age, **components) -> dict:
    return {"player_id": player_id, "age": age, **components}


def _df(rows):
    return pd.DataFrame(rows)


def test_skill_decline_normalized_to_peak_100():
    df = _df([
        _row(1, 24, PTS_36=18.0),
        _row(2, 26, PTS_36=24.0),   # пик
        _row(3, 30, PTS_36=12.0),
    ])
    out = sd.skill_decline(df, ["PTS_36"]).set_index("age")
    assert out.loc[26, "value_pct"] == pytest.approx(100.0)
    assert out.loc[24, "value_pct"] == pytest.approx(75.0)   # 18/24*100
    assert out.loc[30, "value_pct"] == pytest.approx(50.0)   # 12/24*100


def test_skill_decline_averages_within_age():
    df = _df([
        _row(1, 25, PTS_36=10.0),
        _row(2, 25, PTS_36=30.0),   # среднее на 25 = 20 (пик)
        _row(3, 27, PTS_36=10.0),   # 10/20*100 = 50
    ])
    out = sd.skill_decline(df, ["PTS_36"]).set_index("age")
    assert out.loc[25, "value_pct"] == pytest.approx(100.0)
    assert out.loc[25, "n"] == 2
    assert out.loc[27, "value_pct"] == pytest.approx(50.0)


def test_skill_decline_multiple_components_each_peaks_at_100():
    df = _df([
        _row(1, 24, PTS_36=10.0, BLK_36=2.0),
        _row(2, 28, PTS_36=20.0, BLK_36=1.0),
    ])
    out = sd.skill_decline(df, ["PTS_36", "BLK_36"])
    pts = out[out["component"] == "PTS_36"].set_index("age")
    blk = out[out["component"] == "BLK_36"].set_index("age")
    assert pts.loc[28, "value_pct"] == pytest.approx(100.0)   # PTS пик в 28
    assert blk.loc[24, "value_pct"] == pytest.approx(100.0)   # BLK пик в 24
    assert blk.loc[28, "value_pct"] == pytest.approx(50.0)
