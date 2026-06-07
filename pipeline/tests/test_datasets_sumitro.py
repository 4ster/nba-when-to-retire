"""Тесты адаптера датасета sumitrodatta (load_sumitrodatta).

Источник — каталог с `Advanced.csv` (bpm, ts_percent, амплуа/минуты) и
`Player Totals.csv` (pts/trb/ast/stl/blk, x3p_percent), join по (season, player_id).
Проверяют: склейку двух файлов, фильтр лиги (NBA), дедуп обменянных (строка `NTM`),
сохранение родного строкового player_id, вывод active_next, NaN-устойчивость bpm,
отбрасывание строк без season/age/minutes и схему RAW_COLUMNS.
"""

from __future__ import annotations

import math

import pandas as pd

from pipeline.datasets import load_sumitrodatta
from pipeline.fetch import RAW_COLUMNS


def _adv_row(player, player_id, season, team, **over) -> dict:
    row = {
        "season": season, "lg": "NBA", "player": player, "player_id": player_id,
        "age": 25.0, "team": team, "pos": "PG", "g": 70, "mp": 2000.0,
        "ts_percent": 0.58, "bpm": 3.0,
    }
    row.update(over)
    return row


def _tot_row(player, player_id, season, team, **over) -> dict:
    row = {
        "season": season, "lg": "NBA", "player": player, "player_id": player_id,
        "age": 25.0, "team": team, "pos": "PG", "g": 70, "mp": 2000.0,
        "pts": 1000, "trb": 300, "ast": 400, "stl": 80, "blk": 20,
        "x3p_percent": 0.37,
    }
    row.update(over)
    return row


def _write(tmp_path, adv_rows, tot_rows) -> str:
    pd.DataFrame(adv_rows).to_csv(tmp_path / "Advanced.csv", index=False)
    pd.DataFrame(tot_rows).to_csv(tmp_path / "Player Totals.csv", index=False)
    return str(tmp_path)


def test_returns_contract_columns(tmp_path):
    d = _write(
        tmp_path,
        [_adv_row("Alice", "alice01", 2000, "AAA")],
        [_tot_row("Alice", "alice01", 2000, "AAA")],
    )
    out = load_sumitrodatta(d)
    assert list(out.columns) == list(RAW_COLUMNS)
    row = out.iloc[0]
    assert row["value"] == 3.0          # value = bpm (Advanced)
    assert row["REB"] == 300            # REB = trb (Player Totals)
    assert row["PTS"] == 1000
    assert row["TS_pct"] == 0.58
    assert row["FG3_pct"] == 0.37


def test_joins_advanced_and_totals(tmp_path):
    # bpm/ts из Advanced, pts/trb из Totals — для одного игрока-сезона.
    d = _write(
        tmp_path,
        [_adv_row("Bob", "bob01", 2010, "BBB", bpm=5.5, ts_percent=0.6)],
        [_tot_row("Bob", "bob01", 2010, "BBB", pts=1500, trb=500)],
    )
    out = load_sumitrodatta(d).iloc[0]
    assert out["value"] == 5.5
    assert out["TS_pct"] == 0.6
    assert out["PTS"] == 1500
    assert out["REB"] == 500


def test_filters_to_nba_only(tmp_path):
    # ABA/BAA-строки должны отбрасываться (история «Игроки NBA»).
    d = _write(
        tmp_path,
        [
            _adv_row("Nba Guy", "nba01", 1975, "AAA", lg="NBA"),
            _adv_row("Aba Guy", "aba01", 1975, "BBB", lg="ABA"),
            _adv_row("Baa Guy", "baa01", 1948, "CCC", lg="BAA"),
        ],
        [
            _tot_row("Nba Guy", "nba01", 1975, "AAA", lg="NBA"),
            _tot_row("Aba Guy", "aba01", 1975, "BBB", lg="ABA"),
            _tot_row("Baa Guy", "baa01", 1948, "CCC", lg="BAA"),
        ],
    )
    out = load_sumitrodatta(d)
    assert set(out["name"]) == {"Nba Guy"}


def test_dedups_traded_to_combined_row(tmp_path):
    # Обменянный игрок: строка 2TM суммирует сезон, частичные по командам — отбросить.
    d = _write(
        tmp_path,
        [
            _adv_row("Traded", "trad01", 2005, "2TM", bpm=4.0),
            _adv_row("Traded", "trad01", 2005, "AAA", bpm=2.0),
            _adv_row("Traded", "trad01", 2005, "BBB", bpm=6.0),
        ],
        [
            _tot_row("Traded", "trad01", 2005, "2TM", pts=1200),
            _tot_row("Traded", "trad01", 2005, "AAA", pts=400),
            _tot_row("Traded", "trad01", 2005, "BBB", pts=800),
        ],
    )
    out = load_sumitrodatta(d)
    rows = out[out["name"] == "Traded"]
    assert len(rows) == 1
    assert rows.iloc[0]["value"] == 4.0     # комбинированная строка 2TM
    assert rows.iloc[0]["PTS"] == 1200


def test_preserves_native_player_id(tmp_path):
    # player_id у sumitrodatta — родной строковый код, factorize не нужен.
    d = _write(
        tmp_path,
        [_adv_row("Carol", "carolxx01", 2000, "AAA")],
        [_tot_row("Carol", "carolxx01", 2000, "AAA")],
    )
    out = load_sumitrodatta(d)
    assert out.iloc[0]["player_id"] == "carolxx01"


def test_active_next(tmp_path):
    d = _write(
        tmp_path,
        [
            _adv_row("Solo", "solo01", 2000, "AAA"),
            _adv_row("Solo", "solo01", 2001, "AAA"),
        ],
        [
            _tot_row("Solo", "solo01", 2000, "AAA"),
            _tot_row("Solo", "solo01", 2001, "AAA"),
        ],
    )
    out = load_sumitrodatta(d).set_index("season")
    assert bool(out.loc[2000, "active_next"]) is True
    assert bool(out.loc[2001, "active_next"]) is False


def test_keeps_rows_with_nan_bpm(tmp_path):
    # До 1974 BPM отсутствует — строка сохраняется, value = NaN (не «роняем»).
    d = _write(
        tmp_path,
        [_adv_row("Old Timer", "old01", 1960, "AAA", bpm=float("nan"))],
        [_tot_row("Old Timer", "old01", 1960, "AAA")],
    )
    out = load_sumitrodatta(d)
    assert len(out) == 1
    assert math.isnan(out.iloc[0]["value"])


def test_drops_rows_missing_core_fields(tmp_path):
    # Строки без season/age/minutes не должны попадать в атомы.
    d = _write(
        tmp_path,
        [
            _adv_row("Good", "good01", 2000, "AAA"),
            _adv_row("NoAge", "noage01", 2000, "AAA", age=float("nan")),
            _adv_row("NoMin", "nomin01", 2000, "AAA", mp=float("nan")),
        ],
        [
            _tot_row("Good", "good01", 2000, "AAA"),
            _tot_row("NoAge", "noage01", 2000, "AAA", age=float("nan")),
            _tot_row("NoMin", "nomin01", 2000, "AAA", mp=float("nan")),
        ],
    )
    out = load_sumitrodatta(d)
    assert set(out["name"]) == {"Good"}


def test_season_and_age_are_integers(tmp_path):
    d = _write(
        tmp_path,
        [_adv_row("Z", "z01", 2003, "AAA", age=29.0)],
        [_tot_row("Z", "z01", 2003, "AAA", age=29.0)],
    )
    out = load_sumitrodatta(d).iloc[0]
    assert out["season"] == 2003 and isinstance(int(out["season"]), int)
    assert out["age"] == 29
