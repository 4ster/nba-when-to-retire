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


def test_notable_skips_players_with_all_nan_value():
    # Игрок только из эпохи без BPM (value=NaN) не должен ни попадать в выборку,
    # ни ронять idxmax (регрессия реального датасета drgilermo до 1974).
    rows = _career(1, "Modern", {24: 5, 25: 6, 26: 4})
    rows += [{"player_id": 2, "name": "OldTimer", "age": a, "value": float("nan")}
             for a in (30, 31, 32)]
    recs = nb.notable(pd.DataFrame(rows), longevity=2, early_fade=2)
    ids = [r["player_id"] for r in recs]
    assert 2 not in ids
    assert 1 in ids


def test_notable_excludes_right_censored_from_early_fade():
    # «Ещё активный» (последний сезон = максимуму данных) не должен попадать в early_fade,
    # даже если пик молодой — это артефакт конца датасета (регрессия Kyrie/Drummond).
    def career(pid, name, start, end, peak):
        return [
            {"player_id": pid, "name": name, "age": 22 + (s - start), "season": s,
             "value": 9.0 if s == peak else 3.0}
            for s in range(start, end + 1)
        ]
    rows = []
    rows += career(1, "Faded", 2000, 2003, 2000)        # пик молодой, последний сезон 2003 < max
    rows += career(2, "StillActive", 2014, 2017, 2014)  # пик молодой, но активен до max=2017
    df = pd.DataFrame(rows)
    recs = nb.notable(df, longevity=0, early_fade=2)
    fade_ids = [r["player_id"] for r in recs if r["kind"] == "early_fade"]
    assert 1 in fade_ids        # реально угасший
    assert 2 not in fade_ids    # ещё активный — исключён


def test_notable_no_duplicate_players_across_categories():
    recs = nb.notable(_df(), longevity=2, early_fade=2)
    ids = [r["player_id"] for r in recs]
    assert len(ids) == len(set(ids))   # без дубликатов
