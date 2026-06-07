"""Валидация контракта данных §2 и бюджета размера слим-JSON.

Явные исключения вместо «тихого» искажения: при нарушении структуры — :class:`SchemaError`,
при превышении бюджета — :class:`BudgetError`. См. SPEC.md §2 и RULES.md (бюджет < 300 КБ).
"""

from __future__ import annotations

from pipeline.logging_setup import get_logger

log = get_logger(__name__)

#: Бюджет размера сериализованного слим-JSON в байтах (RULES.md).
SIZE_BUDGET_BYTES = 300_000

REQUIRED_TOP_KEYS = frozenset({"aging_curve", "survival", "skill_decline", "notable", "meta"})
REQUIRED_AGING_FIELDS = frozenset(
    {"age", "position_group", "era_bucket", "metric", "value", "ci_low", "ci_high", "n"}
)
REQUIRED_META_FIELDS = frozenset({"data_through", "version", "defaults"})


class SchemaError(ValueError):
    """Payload не соответствует контракту §2."""


class BudgetError(ValueError):
    """Сериализованный слим-JSON превышает бюджет размера."""


def validate_payload(payload: dict) -> None:
    """Проверить структуру payload по контракту §2. Бросает :class:`SchemaError`."""
    missing_top = REQUIRED_TOP_KEYS - payload.keys()
    if missing_top:
        raise SchemaError(f"payload: missing top-level keys {sorted(missing_top)}")

    for i, cell in enumerate(payload["aging_curve"]):
        missing = REQUIRED_AGING_FIELDS - cell.keys()
        if missing:
            raise SchemaError(f"aging_curve[{i}]: missing fields {sorted(missing)}")

    missing_meta = REQUIRED_META_FIELDS - payload["meta"].keys()
    if missing_meta:
        raise SchemaError(f"meta: missing fields {sorted(missing_meta)}")

    log.debug(
        "validate_payload: ok (aging=%d, survival=%d, skill=%d, notable=%d)",
        len(payload["aging_curve"]), len(payload["survival"]),
        len(payload["skill_decline"]), len(payload["notable"]),
    )


def validate_budget(raw_json: str, budget: int = SIZE_BUDGET_BYTES) -> int:
    """Проверить размер сериализованного JSON. Бросает :class:`BudgetError`.

    :return: размер в байтах (UTF-8).
    """
    size = len(raw_json.encode("utf-8"))
    log.info("slim-JSON size: %d bytes (budget %d)", size, budget)
    if size > budget:
        raise BudgetError(f"slim-JSON is {size} bytes, exceeds budget {budget}")
    return size
