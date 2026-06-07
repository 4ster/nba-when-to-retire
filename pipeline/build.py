"""Оркестратор слоя данных: сырьё → агрегаты → слим-JSON по контракту §2.

Поток (см. .ai-factory/ARCHITECTURE.md):
``fetch.load_raw`` → ``transform.normalize`` → агрегаты (aging/survival/skill/notable)
→ ``build_payload`` → ``serialize`` → валидация схемы и бюджета → запись ``data/aging.json``.

CLI: ``python -m pipeline.build --data data/players.csv --out data/aging.json
--data-through "2023–24"``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from pipeline import __version__, schema
from pipeline.datasets import DATASET_LOADERS
from pipeline.fetch import load_raw
from pipeline.logging_setup import get_logger
from pipeline.transform import normalize as nz
from pipeline.transform.aging import aging_curve
from pipeline.transform.notable import notable
from pipeline.transform.skill_decline import skill_decline
from pipeline.transform.survival import survival

log = get_logger(__name__)

#: Метрики ценности для aging_curve (SPEC.md §7: по умолчанию BPM как ``value``).
DEFAULT_METRICS = ("value",)

#: Компоненты навыка для skill_decline (US-3: атлетизм/подбор/защита vs бросок/штрафные/пас).
DEFAULT_SKILL_COMPONENTS = ("PTS_36", "REB_36", "AST_36", "STL_36", "BLK_36", "FG3_pct", "TS_pct")


def season_label(season: int) -> str:
    """Год окончания сезона → метка диапазона, напр. ``2026`` → ``"2025–26"`` (en-dash)."""
    return f"{season - 1}–{season % 100:02d}"


def _records(df: pd.DataFrame, round_cols: dict[str, int] | None = None) -> list[dict]:
    """DataFrame → список dict с нативными JSON-типами (через round-trip to_json)."""
    out = df.copy()
    for col, ndigits in (round_cols or {}).items():
        if col in out.columns:
            out[col] = out[col].round(ndigits)
    return json.loads(out.to_json(orient="records"))


def build_payload(
    df: pd.DataFrame,
    *,
    data_through: str | None = None,
    version: str = __version__,
    metrics: tuple[str, ...] = DEFAULT_METRICS,
    skill_components: tuple[str, ...] = DEFAULT_SKILL_COMPONENTS,
) -> dict:
    """Собрать payload по контракту §2 из нормализованного DataFrame.

    ``data_through`` и диапазон сезонов выводятся из данных. Если ``data_through``
    не задан явно — берётся метка последнего сезона (:func:`season_label`),
    чтобы подпись в UI не «отставала» от датасета.
    """
    log.debug("build_payload: %d normalized rows", len(df))

    if not df.empty:
        season_min = int(df["season"].min())
        season_max = int(df["season"].max())
    else:
        season_min = season_max = None
    if data_through is None:
        data_through = season_label(season_max) if season_max is not None else "n/a"
    log.debug("build_payload: seasons %s–%s, data_through=%s",
              season_min, season_max, data_through)

    aging = aging_curve(df, list(metrics))
    surv = survival(df)
    skill = skill_decline(df, [c for c in skill_components if c in df.columns])

    payload = {
        "aging_curve": _records(aging, {"value": 4, "ci_low": 4, "ci_high": 4}),
        "survival": _records(surv, {"survival": 4}),
        "skill_decline": _records(skill, {"value_pct": 2}),
        "notable": notable(df),
        "meta": {
            "data_through": data_through,
            "season_min": season_min,
            "season_max": season_max,
            "version": version,
            "defaults": {
                "value_metric": "value",
                "min_minutes": nz.MIN_MINUTES,
                "eras": [nz.ERA_PRE, nz.ERA_MID, nz.ERA_MODERN],
            },
        },
    }
    log.debug(
        "build_payload: aging=%d, survival=%d, skill=%d, notable=%d cells",
        len(payload["aging_curve"]), len(payload["survival"]),
        len(payload["skill_decline"]), len(payload["notable"]),
    )
    return payload


def serialize(payload: dict) -> str:
    """Сериализовать payload компактно (UTF-8, без ASCII-эскейпов — меньше байт)."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def build(
    csv_path: str | Path,
    out_path: str | Path,
    *,
    data_through: str | None = None,
    version: str = __version__,
    column_map: dict[str, str] | None = None,
    dataset: str | None = None,
) -> Path:
    """Полный прогон: CSV → слим-JSON на диск. Возвращает путь записи.

    :param dataset: имя адаптера из :data:`pipeline.datasets.DATASET_LOADERS`
                    (например ``"drgilermo"``); если не задан — generic ``fetch.load_raw``.
    """
    log.info("build: start (data=%s, out=%s, dataset=%s)", csv_path, out_path, dataset)
    if dataset:
        if dataset not in DATASET_LOADERS:
            raise ValueError(f"unknown dataset {dataset!r}; known: {sorted(DATASET_LOADERS)}")
        raw = DATASET_LOADERS[dataset](csv_path)
    else:
        raw = load_raw(csv_path, column_map=column_map)
    normalized = nz.normalize(raw)
    payload = build_payload(normalized, data_through=data_through, version=version)

    raw_json = serialize(payload)
    schema.validate_payload(payload)
    schema.validate_budget(raw_json)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(raw_json, encoding="utf-8")
    log.info("build: wrote %s", out)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Сборка слим-JSON по контракту §2")
    parser.add_argument("--data", required=True, help="путь к сырому CSV-датасету")
    parser.add_argument("--out", default="data/aging.json", help="путь для слим-JSON")
    parser.add_argument("--data-through", default=None,
                        help='метка данных, напр. "2025–26"; по умолчанию выводится из данных')
    parser.add_argument("--dataset", default=None, help="адаптер датасета (например drgilermo)")
    parser.add_argument("--version", default=__version__)
    args = parser.parse_args(argv)

    build(args.data, args.out, data_through=args.data_through, version=args.version,
          dataset=args.dataset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
