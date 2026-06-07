"""Единая настройка логирования пайплайна.

Уровень берётся из переменной окружения ``LOG_LEVEL`` (по умолчанию ``DEBUG`` —
verbose-режим разработки, см. .ai-factory/plans). Логи идут в stderr, чтобы stdout
оставался чистым для данных/пайпов.

Использование:

    from pipeline.logging_setup import configure_logging, get_logger

    configure_logging()            # один раз в точке входа (build.py / embed.py)
    log = get_logger(__name__)
    log.debug("...")
"""

from __future__ import annotations

import logging
import os
import sys

_DEFAULT_LEVEL = "DEBUG"
_LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)s | %(message)s"
_DATE_FORMAT = "%H:%M:%S"

_configured = False


def _resolve_level() -> int:
    """Прочитать LOG_LEVEL и вернуть числовой уровень logging.

    Неизвестное значение → DEBUG (с предупреждением после настройки).
    """
    raw = os.getenv("LOG_LEVEL", _DEFAULT_LEVEL).strip().upper()
    level = logging.getLevelName(raw)
    if isinstance(level, int):
        return level
    return logging.DEBUG


def configure_logging(*, force: bool = False) -> None:
    """Настроить корневой логгер один раз за процесс.

    :param force: пересоздать настройку, даже если она уже выполнена
                  (полезно в тестах).
    """
    global _configured
    if _configured and not force:
        return

    raw = os.getenv("LOG_LEVEL", _DEFAULT_LEVEL).strip().upper()
    level = _resolve_level()

    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    _configured = True

    log = logging.getLogger(__name__)
    log.debug("logging initialized at %s", logging.getLevelName(level))
    if logging.getLevelName(raw) != level and raw != _DEFAULT_LEVEL:
        log.warning("unknown LOG_LEVEL=%r, fell back to %s", raw, logging.getLevelName(level))


def get_logger(name: str) -> logging.Logger:
    """Вернуть логгер с гарантированной настройкой корня."""
    configure_logging()
    return logging.getLogger(name)
