"""Тесты загрузки и нормализации (TDD, раньше реализации T3).

Задают контракт модуля ``pipeline.transform.normalize``:
- per-36 нормализация скоростных метрик;
- фильтр порога включения сезона (минуты ≥ MIN_MINUTES);
- маппинг амплуа (position_group) и эпох (era_bucket, границы ≤1989 / 1990–2009 / 2010+);
- явная обработка пропусков (NaN не «роняются молча»).
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
import pytest

from pipeline.transform import normalize as nz


def _raw_row(**overrides) -> dict:
    """Сырой атом player-season с разумными дефолтами; перекрывается kwargs."""
    row = {
        "player_id": 1,
        "name": "Test Player",
        "season": 2015,
        "age": 27,
        "pos": "PG",
        "minutes": 2000,
        "games": 70,
        "PTS": 1000,
        "REB": 300,
        "AST": 400,
        "STL": 80,
        "BLK": 20,
        "TS_pct": 0.58,
        "FG3_pct": 0.37,
        "value": 4.2,
        "active_next": True,
    }
    row.update(overrides)
    return row


def _raw_df(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


# --- per-36 ---------------------------------------------------------------

def test_to_per36_basic():
    # 360 очков за 720 минут → 18.0 на 36 минут
    assert nz.to_per36(360, 720) == pytest.approx(18.0)


def test_to_per36_rejects_nonpositive_minutes():
    with pytest.raises(ValueError):
        nz.to_per36(100, 0)
    with pytest.raises(ValueError):
        nz.to_per36(100, -5)


def test_normalize_computes_per36_columns():
    df = nz.normalize(_raw_df([_raw_row(minutes=2000, PTS=1000, REB=500)]))
    # 1000 / 2000 * 36 = 18.0 ; 500 / 2000 * 36 = 9.0
    assert df.iloc[0]["PTS_36"] == pytest.approx(18.0)
    assert df.iloc[0]["REB_36"] == pytest.approx(9.0)
    for col in ("PTS_36", "REB_36", "AST_36", "STL_36", "BLK_36"):
        assert col in df.columns


# --- порог минут ----------------------------------------------------------

def test_normalize_filters_below_min_minutes():
    df = nz.normalize(
        _raw_df([
            _raw_row(player_id=1, minutes=nz.MIN_MINUTES - 1),    # отбрасывается
            _raw_row(player_id=2, minutes=nz.MIN_MINUTES),        # граница включительно
            _raw_row(player_id=3, minutes=nz.MIN_MINUTES + 500),  # остаётся
        ])
    )
    assert sorted(df["player_id"].tolist()) == [2, 3]


def test_normalize_logs_counts_before_and_after_filter(caplog):
    with caplog.at_level(logging.DEBUG, logger="pipeline.transform.normalize"):
        nz.normalize(
            _raw_df([
                _raw_row(player_id=1, minutes=500),
                _raw_row(player_id=2, minutes=1500),
            ])
        )
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "2" in text and "1" in text  # до фильтра 2, после 1


# --- амплуа ---------------------------------------------------------------

@pytest.mark.parametrize(
    "pos,expected",
    [
        ("PG", nz.GROUP_GUARD),
        ("SG", nz.GROUP_GUARD),
        ("SF", nz.GROUP_WING),
        ("PF", nz.GROUP_BIG),
        ("C", nz.GROUP_BIG),
    ],
)
def test_position_group_mapping(pos, expected):
    assert nz.position_group(pos) == expected


@pytest.mark.parametrize(
    "pos,expected",
    [
        ("G", nz.GROUP_GUARD),
        ("F", nz.GROUP_WING),
        ("C", nz.GROUP_BIG),
        ("G-F", nz.GROUP_GUARD),     # первый токен → G
        ("PG-SG", nz.GROUP_GUARD),
        ("F-C", nz.GROUP_WING),      # первый токен → F
        ("pg", nz.GROUP_GUARD),      # регистр
    ],
)
def test_position_group_handles_combined_and_short_codes(pos, expected):
    assert nz.position_group(pos) == expected


@pytest.mark.parametrize("pos", ["", "X", "???", None])
def test_position_group_falls_back_instead_of_raising(pos):
    # Нераспознанное амплуа не роняет билд — возвращает группу по умолчанию.
    assert nz.position_group(pos) == nz._POSITION_FALLBACK


def test_normalize_adds_position_group_column():
    df = nz.normalize(_raw_df([_raw_row(pos="C")]))
    assert df.iloc[0]["position_group"] == nz.GROUP_BIG


# --- эпохи ----------------------------------------------------------------

@pytest.mark.parametrize(
    "season,expected",
    [
        (1980, nz.ERA_PRE),
        (1989, nz.ERA_PRE),
        (1990, nz.ERA_MID),
        (2009, nz.ERA_MID),
        (2010, nz.ERA_MODERN),
        (2024, nz.ERA_MODERN),
    ],
)
def test_era_bucket_boundaries(season, expected):
    assert nz.era_bucket(season) == expected


# --- пропуски -------------------------------------------------------------

def test_normalize_keeps_rows_with_missing_stat_without_silent_drop():
    # У игрока нет данных по FG3_pct (NaN), но минут достаточно — строку НЕ выкидываем молча.
    df = nz.normalize(_raw_df([_raw_row(player_id=7, minutes=1500, FG3_pct=np.nan)]))
    assert 7 in df["player_id"].tolist()
    assert pd.isna(df.iloc[0]["FG3_pct"])
