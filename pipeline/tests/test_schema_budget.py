"""Тесты схемы контракта §2 и бюджета размера (TDD, раньше реализации T9).

Контракт:
- ``pipeline.schema`` — валидация структуры payload и бюджета размера слим-JSON
  (< :data:`schema.SIZE_BUDGET_BYTES`), с явными исключениями ``SchemaError`` / ``BudgetError``;
- ``pipeline.build.build_payload`` — сборка payload по §2 (агрегаты + meta),
  проходящего валидацию.
"""

from __future__ import annotations

import json

import pandas as pd
import pytest

from pipeline import build, schema
from pipeline.transform.normalize import ERA_MODERN, GROUP_BIG, GROUP_GUARD

# --- helpers --------------------------------------------------------------

def _valid_payload() -> dict:
    return {
        "aging_curve": [
            {
                "age": 25, "position_group": GROUP_GUARD, "era_bucket": ERA_MODERN,
                "metric": "value", "value": -2.0, "ci_low": -3.0, "ci_high": -1.0, "n": 5,
            }
        ],
        "survival": [{"age": 25, "survival": 0.9, "n": 10}],
        "skill_decline": [{"age": 25, "component": "PTS_36", "value_pct": 100.0, "n": 10}],
        "notable": [{"player_id": 1, "name": "A", "kind": "longevity",
                     "series": [{"age": 24, "value": 1.0}]}],
        "meta": {"data_through": "2023–24", "version": "0.1.0",
                 "defaults": {"value_metric": "value", "min_minutes": 1000}},
    }


def _normalized_df() -> pd.DataFrame:
    rows = []
    for pid, name, grp in [(1, "A", GROUP_GUARD), (2, "B", GROUP_BIG)]:
        base = 10.0 if pid == 1 else 12.0
        for i, age in enumerate((24, 25)):
            rows.append({
                "player_id": pid, "name": name, "age": age, "season": 2013 + age,
                "position_group": grp, "era_bucket": ERA_MODERN,
                "minutes": 2000, "games": 70,
                "PTS_36": 22.0 - 2 * i, "REB_36": 8.0 - i, "AST_36": 5.0,
                "STL_36": 1.2, "BLK_36": 0.5, "TS_pct": 0.58, "FG3_pct": 0.37,
                "value": base - 2 * i, "active_next": True,
            })
    return pd.DataFrame(rows)


# --- validate_payload -----------------------------------------------------

def test_validate_payload_accepts_valid():
    schema.validate_payload(_valid_payload())  # не бросает


def test_validate_payload_rejects_missing_top_key():
    payload = _valid_payload()
    del payload["survival"]
    with pytest.raises(schema.SchemaError):
        schema.validate_payload(payload)


def test_validate_payload_rejects_aging_cell_missing_field():
    payload = _valid_payload()
    del payload["aging_curve"][0]["ci_low"]
    with pytest.raises(schema.SchemaError):
        schema.validate_payload(payload)


def test_validate_payload_rejects_meta_missing_field():
    payload = _valid_payload()
    del payload["meta"]["data_through"]
    with pytest.raises(schema.SchemaError):
        schema.validate_payload(payload)


# --- budget ---------------------------------------------------------------

def test_validate_budget_ok_returns_size():
    raw = json.dumps(_valid_payload())
    size = schema.validate_budget(raw, budget=schema.SIZE_BUDGET_BYTES)
    assert size == len(raw.encode("utf-8"))


def test_validate_budget_exceeded_raises():
    raw = json.dumps(_valid_payload())
    with pytest.raises(schema.BudgetError):
        schema.validate_budget(raw, budget=10)  # заведомо мал


# --- build_payload --------------------------------------------------------

def test_build_payload_has_all_sections_and_meta():
    payload = build.build_payload(_normalized_df(), data_through="2023–24", version="0.1.0")
    for key in schema.REQUIRED_TOP_KEYS:
        assert key in payload
    for key in schema.REQUIRED_META_FIELDS:
        assert key in payload["meta"]


def test_build_payload_passes_validation():
    payload = build.build_payload(_normalized_df(), data_through="2023–24", version="0.1.0")
    schema.validate_payload(payload)  # сквозная проверка: сборка → валидация


def test_build_payload_aging_cells_have_required_fields():
    payload = build.build_payload(_normalized_df(), data_through="2023–24", version="0.1.0")
    assert payload["aging_curve"], "aging_curve не должен быть пустым на этих данных"
    for cell in payload["aging_curve"]:
        assert schema.REQUIRED_AGING_FIELDS <= set(cell.keys())
