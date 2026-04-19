#!/usr/bin/env python3
"""One-shot migration: remove `name` from nutrition entries, make foods[0]
the canonical title, unify filenames to {date}--{HHMM}--NN.md.

Decision tree for `name`:
  - generic label (breakfast/lunch/dinner/snack/meal) → drop
  - name as substring of foods[0] (case-insensitive) → drop
  - otherwise → prepend name as a new foods entry

Also drops the legacy `target_g` field and deletes the stray `Dinner.md`
template that carries no data.

Usage:
    python3 scripts/migrate_nutrition_drop_name.py            # dry run
    python3 scripts/migrate_nutrition_drop_name.py --apply    # write
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

NUTRITION_DIR = Path.home() / "Documents/obsidian/Bases/Nutrition/Log"

GENERIC_NAMES = {"breakfast", "lunch", "dinner", "snack", "meal"}

# Preferred key order in rewritten frontmatter. Anything unknown goes at
# the end in insertion order.
KEY_ORDER = [
    "date",
    "time",
    "type",
    "emoji",
    "protein_g",
    "fat_g",
    "carbs_g",
    "kcal",
    "foods",
    "note",
    "section",
]


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        raise ValueError("missing frontmatter")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError("unterminated frontmatter")
    fm_raw = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")
    fm = yaml.safe_load(fm_raw) or {}
    if not isinstance(fm, dict):
        raise ValueError(f"frontmatter is not a mapping: {type(fm)}")
    return fm, body


def decide_name(name: str, foods: list[str]) -> tuple[str | None, list[str]]:
    """Return (action, new_foods). action is 'drop' or 'prepend'."""
    name_norm = name.strip().lower()
    if not name_norm:
        return "drop", foods
    if name_norm in GENERIC_NAMES:
        return "drop", foods
    if foods and name_norm in foods[0].strip().lower():
        return "drop", foods
    return "prepend", [name.strip(), *foods]


def format_frontmatter(fm: dict[str, Any]) -> str:
    ordered: dict[str, Any] = {}
    for k in KEY_ORDER:
        if k in fm:
            ordered[k] = fm[k]
    for k, v in fm.items():
        if k not in ordered:
            ordered[k] = v
    # default_flow_style=False keeps lists as block-style. sort_keys=False
    # preserves our chosen order. allow_unicode=True keeps emoji + ï.
    dumped = yaml.safe_dump(
        ordered,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    return f"---\n{dumped}---\n"


def new_filename(date_str: str, time_str: str, seq: int) -> str:
    hhmm = time_str.replace(":", "")
    if len(hhmm) != 4 or not hhmm.isdigit():
        raise ValueError(f"bad time {time_str!r}")
    return f"{date_str}--{hhmm}--{seq:02d}.md"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not NUTRITION_DIR.exists():
        print(f"no directory: {NUTRITION_DIR}", file=sys.stderr)
        return 1

    all_paths = sorted(NUTRITION_DIR.glob("*.md"))
    planned_renames: dict[Path, Path] = {}
    planned_rewrites: dict[Path, str] = {}
    planned_deletes: list[Path] = []

    # Pass 1: parse, decide renames + content rewrites.
    by_key: dict[tuple[str, str], list[Path]] = {}
    parsed: dict[Path, tuple[dict[str, Any], str]] = {}

    for p in all_paths:
        text = p.read_text(encoding="utf-8")
        try:
            fm, body = split_frontmatter(text)
        except ValueError as e:
            print(f"[skip] {p.name}: {e}", file=sys.stderr)
            continue

        # Stray template: no real data. Delete it.
        is_empty_template = (
            not fm.get("name") and not fm.get("foods") and not fm.get("protein_g")
            and not fm.get("kcal")
        )
        # Handle Dinner.md specifically — empty template with everything null.
        non_empty_scalars = any(
            v not in (None, "", 0, 0.0, []) and v is not False
            for k, v in fm.items()
            if k not in {"date", "time", "section", "name"}
        )
        if is_empty_template or not non_empty_scalars:
            planned_deletes.append(p)
            continue

        parsed[p] = (fm, body)
        date_str = str(fm.get("date") or "").strip()
        time_str = str(fm.get("time") or "").strip()
        if not date_str or not time_str:
            print(f"[error] {p.name}: missing date or time", file=sys.stderr)
            return 2
        by_key.setdefault((date_str, time_str), []).append(p)

    # Pass 2: assign new filenames with NN suffix for collisions.
    for (date_str, time_str), paths in by_key.items():
        # Deterministic seq by original filename.
        for i, p in enumerate(sorted(paths, key=lambda x: x.name), start=1):
            new_name = new_filename(date_str, time_str, i)
            planned_renames[p] = NUTRITION_DIR / new_name

    # Pass 3: rewrite frontmatter.
    for p, (fm, body) in parsed.items():
        name = str(fm.get("name") or "")
        foods = fm.get("foods") or []
        if not isinstance(foods, list):
            foods = [str(foods)]
        foods = [str(f) for f in foods]

        _action, new_foods = decide_name(name, foods)
        fm.pop("name", None)
        fm.pop("target_g", None)
        fm["foods"] = new_foods
        # Guarantee section is set — loader expects it.
        fm["section"] = "nutrition"

        planned_rewrites[p] = format_frontmatter(fm) + body

    # Report.
    print(f"files parsed: {len(parsed)}")
    print(f"files to delete: {len(planned_deletes)}")
    for p in planned_deletes:
        print(f"  DEL {p.name}")

    renames_changed = {p: dst for p, dst in planned_renames.items() if p.name != dst.name}
    print(f"files to rename: {len(renames_changed)}")
    for p, dst in renames_changed.items():
        print(f"  MV  {p.name} → {dst.name}")

    print(f"files to rewrite content: {len(planned_rewrites)}")

    if not args.apply:
        print("\n(dry run — pass --apply to write)")
        return 0

    # Execute. Deletes first, then rewrites to temp path under new name.
    for p in planned_deletes:
        p.unlink()

    # Rewrite + rename atomically: write content to new path, unlink old.
    for p, new_text in planned_rewrites.items():
        dst = planned_renames[p]
        dst.write_text(new_text, encoding="utf-8")
        if dst != p:
            p.unlink()

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
