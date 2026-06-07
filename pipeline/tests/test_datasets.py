"""Тесты адаптера датасета drgilermo (load_drgilermo).

Проверяют дедуп обменянных игроков (TOT), синтез player_id из имени и вывод
active_next по присутствию в следующем сезоне.
"""

from __future__ import annotations

import pandas as pd

from pipeline.datasets import load_drgilermo
from pipeline.fetch import RAW_COLUMNS


def _src_row(player, year, tm, **over) -> dict:
    row = {
        "Year": year, "Player": player, "Pos": "PG", "Age": 25, "Tm": tm,
        "G": 70, "MP": 2000, "PTS": 1000, "TRB": 300, "AST": 400,
        "STL": 80, "BLK": 20, "TS%": 0.58, "3P%": 0.37, "BPM": 3.0,
    }
    row.update(over)
    return row


def _write(tmp_path, rows) -> str:
    p = tmp_path / "Seasons_Stats.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    return str(p)


def test_load_drgilermo_dedups_traded_to_tot(tmp_path):
    csv = _write(tmp_path, [
        _src_row("Traded Guy", 2000, "TOT", PTS=1000),
        _src_row("Traded Guy", 2000, "AAA", PTS=400),
        _src_row("Traded Guy", 2000, "BBB", PTS=600),
    ])
    out = load_drgilermo(csv)
    rows = out[out["name"] == "Traded Guy"]
    assert len(rows) == 1                       # одна строка на сезон
    assert rows.iloc[0]["PTS"] == 1000          # это итоговая TOT-строка


def test_load_drgilermo_active_next(tmp_path):
    csv = _write(tmp_path, [
        _src_row("Solo", 2000, "AAA"),
        _src_row("Solo", 2001, "AAA"),          # есть сезон 2001 → 2000 active
    ])
    out = load_drgilermo(csv).set_index("season")
    assert bool(out.loc[2000, "active_next"]) is True
    assert bool(out.loc[2001, "active_next"]) is False  # нет 2002


def test_load_drgilermo_synthesizes_stable_player_id(tmp_path):
    csv = _write(tmp_path, [
        _src_row("Alice", 2000, "AAA"),
        _src_row("Alice", 2001, "AAA"),
        _src_row("Bob", 2000, "BBB"),
    ])
    out = load_drgilermo(csv)
    alice = out[out["name"] == "Alice"]["player_id"].unique()
    bob = out[out["name"] == "Bob"]["player_id"].unique()
    assert len(alice) == 1 and len(bob) == 1    # один id на имя
    assert alice[0] != bob[0]                    # разные имена → разные id


def test_load_drgilermo_returns_contract_columns(tmp_path):
    csv = _write(tmp_path, [_src_row("X", 2000, "AAA")])
    out = load_drgilermo(csv)
    assert list(out.columns) == list(RAW_COLUMNS)
    assert out.iloc[0]["value"] == 3.0          # value = BPM
    assert out.iloc[0]["REB"] == 300            # REB = TRB
