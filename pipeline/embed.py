"""Встраивание слим-JSON в index.html (build-time, RULES.md §«Сборка»).

Вставляет содержимое ``data/aging.json`` в узел
``<script id="seed-data" type="application/json">…</script>`` (идемпотентно — заменяет
существующее содержимое), стрипует null-байты и не трогает остальной HTML.

CLI: ``python -m pipeline.embed --data data/aging.json --html index.html``.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pipeline.logging_setup import get_logger

log = get_logger(__name__)

_NUL = chr(0)

# Узел seed-data в index.html. Группы: открывающий тег / содержимое / закрывающий тег.
_SEED_RE = re.compile(
    r'(<script id="seed-data" type="application/json">)([\s\S]*?)(</script>)'
)


def _json_safe_for_script(text: str) -> str:
    """Экранировать ``</`` → ``<\\/``, чтобы строка не закрыла <script> раньше времени.

    ``\\/`` — валидный JSON-эскейп, так что JSON.parse в браузере не пострадает.
    """
    return text.replace("</", "<\\/")


def embed(data_path: str | Path, html_path: str | Path) -> Path:
    """Встроить JSON из ``data_path`` в seed-узел ``html_path``. Возвращает путь HTML."""
    data_file = Path(data_path)
    html_file = Path(html_path)

    raw = data_file.read_text(encoding="utf-8")
    raw = raw.replace(_NUL, "")            # strip null-байтов из данных
    json.loads(raw)                         # ранний отказ при невалидном JSON
    payload_text = _json_safe_for_script(raw)
    log.debug("embed: data %s (%d bytes)", data_file, len(raw.encode("utf-8")))

    html = html_file.read_text(encoding="utf-8")
    if not _SEED_RE.search(html):
        raise ValueError(
            f'{html_file}: не найден узел <script id="seed-data" type="application/json">'
        )

    # Функция-замена, чтобы backslash в JSON не интерпретировался как backreference.
    new_html, count = _SEED_RE.subn(
        lambda m: m.group(1) + payload_text + m.group(3), html
    )
    new_html = new_html.replace(_NUL, "")  # strip null-байтов из итогового HTML

    html_file.write_text(new_html, encoding="utf-8")
    log.info("embed: updated %d seed-data node(s) in %s", count, html_file)
    return html_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Встроить слим-JSON в index.html")
    parser.add_argument("--data", default="data/aging.json", help="путь к слим-JSON")
    parser.add_argument("--html", default="index.html", help="целевой HTML")
    args = parser.parse_args(argv)

    embed(args.data, args.html)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
