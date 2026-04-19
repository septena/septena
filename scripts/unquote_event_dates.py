#!/usr/bin/env python3
"""One-shot fix: rewrite event YAML frontmatter so `date` is a bare YAML
date (e.g. `date: 2026-04-17`) instead of a quoted string (`'2026-04-17'`).

Obsidian Bases recognises bare values as real date objects and lets you
filter with `dateAfter`, `<`, `>`, etc. Quoted strings are treated as text
and never match date filters.

Idempotent — skips files already in the right shape. Touches only the
frontmatter `date` field; time/created_at stay as-is.
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

import yaml

BASES = Path.home() / "Documents/obsidian/Bases"
SECTIONS = ("Exercise", "Nutrition", "Habits", "Supplements", "Cannabis", "Caffeine")

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*", re.DOTALL)
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def rewrite(path: Path) -> bool:
    raw = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(raw)
    if not m:
        return False
    fm = yaml.safe_load(m.group(1))
    if not isinstance(fm, dict):
        return False

    d = fm.get("date")
    if isinstance(d, date):
        return False  # already a real date, nothing to do
    if not (isinstance(d, str) and ISO_DATE.match(d)):
        return False

    fm["date"] = date.fromisoformat(d)
    body = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n"
    rest = raw[m.end():]
    path.write_text(body + rest, encoding="utf-8")
    return True


def main() -> int:
    total = 0
    for section in SECTIONS:
        log = BASES / section / "Log"
        if not log.exists():
            continue
        count = 0
        for p in sorted(log.glob("*.md")):
            # Skip rollback backups created by flatten_daily_logs.py.
            if p.name.endswith(".md.old"):
                continue
            if rewrite(p):
                count += 1
        print(f"{section:<13} {count} files rewritten")
        total += count
    print(f"\nTotal: {total} files rewritten.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
