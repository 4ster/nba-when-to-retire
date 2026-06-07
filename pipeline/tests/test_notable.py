"""Тесты notable (TDD, раньше реализации T7).

Контракт ``pipeline.transform.notable``: отбор именованных карьер как индивидуальных
рядов — долгожители (больше всего сезонов) и рано угасшие (самый молодой пик value).
Возвращает список записей ``{player_id, name, kind, series:[{age, value}, ...]}``;
без дубликатов между категориями.
"""

from __future__ import annotations

import pandas as pd

from pipeline.transform import notable as nb


def _career(player_id, name, ages_values: dict[int, float]) -> list[dict]:
    return [
        {"player_id": player_id, "name": name, "age": age, "value": val}
        for age, val in ages_values.items()
    ]


def _df():
    rows: list[dict] = []
    rows += _career(1, "Long Career", {22: 3, 23: 5, 24: 7, 25: 9, 26: 8, 27: 6, 28: 4, 29: 2})
    rows += _career(2, "Early Fade", {23: 9, 24: 5, 25: 2})        # пик в 23
    rows += _career(3, "Late Peak", {27: 4, 28: 6, 29: 9, 30: 7})  # 4 сезона, пик в 29
    rows += _career(4, "Short", {24: 5, 25: 6})                    # 2 сезона
    return pd.DataFrame(rows)


def _ids(records, kind):
    return [r["player_id"] for r in records if r["kind"] == "longevity" or kind == "all"]


def test_notable_longevity_picks_longest_careers():
    recs = nb.notable(_df(), longevity=1, early_fade=0)
    assert len(recs) == 1
    assert recs[0]["kind"] == "longevity"
    assert recs[0]["player_id"] == 1   # 8 сезонов


def test_notable_longevity_top_two():
    recs = nb.notable(_df(), longevity=2, early_fade=0)
    ids = sorted(r["player_id"] for r in recs)
    assert ids == [1, 3]   # 8 и 4 сезона


def test_notable_early_fade_picks_youngest_peak():
    recs = nb.notable(_df(), longevity=0, early_fade=1)
    assert len(recs) == 1
    assert recs[0]["kind"] == "early_fade"
    assert recs[0]["player_id"] == 2   # пик в 23 — самый молодой


def test_notable_record_series_sorted_with_age_and_value():
    rec = nb.notable(_df(), longevity=1, early_fade=0)[0]
    ages = [pt["age"] for pt in rec["series"]]
    assert ages == sorted(ages)
    assert {"age", "value"} <= set(rec["series"][0].keys())


def test_notable_no_duplicate_players_across_categories():
    recs = nb.notable(_df(), longevity=2, early_fade=2)
    ids = [r["player_id"] for r in recs]
    assert len(ids) == len(set(ids))   # без дубликатов
