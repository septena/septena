"""Shared YAML-frontmatter helpers. Every section log/config is a markdown
file with a `---\n...\n---\n` header; these helpers parse and normalise it.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict

import yaml

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*", re.DOTALL)


def _normalize_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return text


def _normalize_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_frontmatter(raw: str) -> Dict[str, Any]:
    match = FRONTMATTER_RE.match(raw)
    if not match:
        raise ValueError("No YAML frontmatter found")
    data = yaml.safe_load(match.group(1))
    if not isinstance(data, dict):
        raise ValueError("Frontmatter did not parse to a mapping")
    return data


def _slugify(name: str) -> str:
    return name.replace(" ", "-")
