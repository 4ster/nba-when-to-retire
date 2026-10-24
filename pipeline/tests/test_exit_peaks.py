"""Тесты exit_age / player_peaks (агрегаты классического дашборда).

Контракт ``pipeline.transform.exit_peaks``:
- exit_age: возраст последнего сезона по амплуа/эпохе, активные исключены;
- player_peaks: пик value на игрока, фильтр по числу сезонов, exit_age=None у активных.
"""

from __future__ import annotations

import pandas as pd

from pipeline.transform import exit_peaks as ep


def _row(pid, name, season, age, pos, era, value):
    return {
        "player_id": pid, "name": name, "season": season, "age": age,
        "position_group": pos, "era_bucket": era, "value": value,
    }


def _df(rows):
    return pd.DataFrame(rows)


def _career(pid, name, pos, era, start_season, start_age, values):
    return [
        _row(pid, name, start_season + i, start_age + i, pos, era, v)
        for i, v in enumerate(values)
    ]


def test_exit_age_excludes_active_players():
    df = _df(
        _career(1, "Retired Guy", "guard", "2010+", 2015, 25, [1.0, 2.0, 1.5])
        + _career(2, "Active Guy", "big", "2010+", 2020, 24, [1.0, 2.0, 3.0])
    )
    # max season = 2022 (Active Guy) → он активен, Retired Guy ушёл в 27
    out = ep.exit_age(df)
    assert out["n"].sum() == 1
    cell = out.iloc[0]
    assert (cell["age"], cell["position_group"], cell["era_bucket"]) == (27, "guard", "2010+")


def test_exit_age_groups_by_pos_and_era():
    df = _df(
        _career(1, "A", "guard", "1990–2009", 2000, 28, [1.0, 1.0])
        + _career(2, "B", "guard", "1990–2009", 2000, 28, [1.0, 1.0])
        + _career(3, "C", "wing", "2010+", 2010, 28, [1.0, 1.0])
        + _career(4, "Active", "big", "2010+", 2024, 30, [1.0])
    )
    out = ep.exit_age(df).set_index(["age", "position_group", "era_bucket"])
    assert out.loc[(29, "guard", "1990–2009"), "n"] == 2
    assert out.loc[(29, "wing", "2010+"), "n"] == 1
    assert out["n"].sum() == 3


def test_player_peaks_min_seasons_and_peak():
    df = _df(
        _career(1, "Star", "wing", "2010+", 2014, 22, [1.0, 3.0, 5.5, 2.0])
        + _career(2, "Short", "guard", "2010+", 2016, 22, [9.0, 9.0])
        + _career(3, "Active", "big", "2010+", 2019, 22, [1.0, 2.0, 4.0, 3.0])
    )
    peaks = {p["id"]: p for p in ep.player_peaks(df, min_seasons=4)}
    assert 2 not in peaks  # короткая карьера отсечена
    star = peaks[1]
    assert (star["peak_age"], star["peak_value"]) == (24, 5.5)
    assert star["name_ru"]  # русское написание присутствует
    assert star["seasons"] == 4
    assert star["exit_age"] == 25  # последний сезон 2017 < max(2022)
    assert peaks[3]["exit_age"] is None  # активен


def test_player_peaks_skips_nan_values():
    df = _df(
        _career(1, "Oldtimer", "big", "≤1989", 1960, 22, [None, None, None, None])
        + _career(2, "Ok", "guard", "2010+", 2015, 22, [1.0, 2.0, 3.0, 1.0, 1.0])
    )
    peaks = ep.player_peaks(df, min_seasons=4)
    assert [p["id"] for p in peaks] == [2]


def test_empty_inputs():
    empty = pd.DataFrame(columns=["player_id", "name", "season", "age",
                                  "position_group", "era_bucket", "value"])
    assert ep.exit_age(empty).empty
    assert ep.player_peaks(empty) == []
