"""Тесты survival (TDD, раньше реализации T7).

Контракт ``pipeline.transform.survival``: доля игроков, ещё активных в следующем
сезоне (``active_next``), по возрасту. Колонки: ``age, survival, n``.
"""

from __future__ import annotations

import pandas as pd
import pytest

from pipeline.transform import survival as sv


def _row(player_id, age, active_next) -> dict:
    return {"player_id": player_id, "age": age, "active_next": active_next}


def _df(rows):
    return pd.DataFrame(rows)


def test_survival_fraction_by_age():
    df = _df([
        _row(1, 30, True),
        _row(2, 30, False),
        _row(3, 31, True),
    ])
    out = sv.survival(df).set_index("age")
    assert out.loc[30, "survival"] == pytest.approx(0.5)
    assert out.loc[30, "n"] == 2
    assert out.loc[31, "survival"] == pytest.approx(1.0)
    assert out.loc[31, "n"] == 1


def test_survival_sorted_by_age():
    df = _df([_row(1, 33, True), _row(2, 28, True), _row(3, 30, False)])
    out = sv.survival(df)
    assert out["age"].tolist() == [28, 30, 33]


def test_survival_all_inactive_is_zero():
    df = _df([_row(1, 40, False), _row(2, 40, False)])
    out = sv.survival(df).set_index("age")
    assert out.loc[40, "survival"] == pytest.approx(0.0)
    assert out.loc[40, "n"] == 2
