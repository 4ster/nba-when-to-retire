"""Агрегаты для классического дашборда: возраст ухода и пики карьер.

Контракт — ``pipeline/tests/test_exit_peaks.py``. Два агрегата:

- ``exit_age`` — распределение возраста последнего квалифицированного сезона
  (минуты ≥ порога нормализации) по амплуа и эпохе ухода. Активные игроки
  (последний сезон == максимальный сезон датасета) исключаются — их карьера
  не завершена, возраст ухода неизвестен (цензурирование справа).
- ``player_peaks`` — по одному ряду на игрока с ≥ ``min_seasons`` сезонами
  с непустым ``value``: возраст и величина пика ценности, амплуа/эпоха пика,
  длина карьеры в сезонах, возраст ухода (None для активных).

Методика ценности (дельта-метод, per-36) не затрагивается: модуль только
агрегирует уже нормализованные player-season строки.
"""

from __future__ import annotations

import pandas as pd

from pipeline.logging_setup import get_logger
from pipeline.transform.ru_names import ru_name

log = get_logger(__name__)

#: Минимум сезонов с непустым value, чтобы пик карьеры был осмысленным.
MIN_SEASONS_PEAKS = 4


def exit_age(df: pd.DataFrame) -> pd.DataFrame:
    """Распределение возраста ухода: ``age, position_group, era_bucket, n``.

    Возраст ухода — возраст последнего квалифицированного сезона игрока;
    эпоха/амплуа берутся из той же последней строки. Игроки, чей последний
    сезон совпадает с последним сезоном датасета, считаются активными
    и в распределение не входят.
    """
    if df.empty:
        return pd.DataFrame(columns=["age", "position_group", "era_bucket", "n"])
    season_max = int(df["season"].max())
    last = df.sort_values(["age", "season"]).groupby("player_id").tail(1)
    retired = last[last["season"] < season_max]
    out = (
        retired.groupby(["age", "position_group", "era_bucket"])
        .size()
        .reset_index(name="n")
        .sort_values(["age", "position_group", "era_bucket"])
        .reset_index(drop=True)
    )
    out["age"] = out["age"].astype(int)
    out["n"] = out["n"].astype(int)
    log.debug("exit_age: %d cells, %d retired players", len(out), int(out["n"].sum()))
    return out


def player_peaks(df: pd.DataFrame, min_seasons: int = MIN_SEASONS_PEAKS) -> list[dict]:
    """Пики карьер для scatter: список dict по одному на игрока.

    Поля: ``id, name, peak_age, peak_value, position_group, era_bucket,
    seasons, exit_age`` (``exit_age`` = None для активных игроков).
    """
    if df.empty:
        return []
    season_max = int(df["season"].max())
    rows: list[dict] = []
    for pid, g in df[df["value"].notna()].groupby("player_id"):
        if len(g) < min_seasons:
            continue
        peak = g.loc[g["value"].idxmax()]
        last = g.sort_values(["age", "season"]).iloc[-1]
        retired = int(last["season"]) < season_max
        nm = str(g["name"].iloc[0])
        rows.append({
            "id": pid if isinstance(pid, str) else int(pid),
            "name": nm,
            "name_ru": ru_name(nm),
            "peak_age": int(peak["age"]),
            "peak_value": round(float(peak["value"]), 1),
            "position_group": str(peak["position_group"]),
            "era_bucket": str(peak["era_bucket"]),
            "seasons": int(len(g)),
            "exit_age": int(last["age"]) if retired else None,
        })
    rows.sort(key=lambda r: (-r["peak_value"], r["id"]))
    log.debug("player_peaks: %d players (min_seasons=%d)", len(rows), min_seasons)
    return rows
