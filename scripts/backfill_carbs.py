#!/usr/bin/env python3
"""Backfill `carbs_g` on existing nutrition session YAML files.

Strategy
--------
carbs ≈ (kcal - 4*protein - 9*fat) / 4, clamped to ≥ 0.

This is the Atwater identity. It under-estimates for meals containing
alcohol (7 kcal/g) and slightly over-estimates fibre-heavy meals, but on
real-food entries it lands within ~5g of reality. Good enough for a
one-shot backfill; users can edit any outlier from the nutrition
dashboard afterwards.

Safety
------
- Only touches files that don't already have a `carbs_g:` line.
- Insertion is a single regex replace that appends `carbs_g: <int>`
  immediately after the existing `fat_g:` line, preserving original
  formatting and key order. We do NOT round-trip through yaml.safe_dump
  because that would rewrite the whole file and lose any hand-edits.
- Dry-run by default; pass --apply to actually write.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

NUTRITION_DIR = Path.home() / "Documents/obsidian/Bases/Nutrition/Log"

NUM_RE = re.compile(r"^(\w+):\s*([\d.]+)\s*$", re.MULTILINE)
CARBS_RE = re.compile(r"^carbs_g:", re.MULTILINE)
FAT_LINE_RE = re.compile(r"^(fat_g:[^\n]*)$", re.MULTILINE)


def parse_num(text: str, key: str) -> float:
    for m in NUM_RE.finditer(text):
        if m.group(1) == key:
            try:
                return float(m.group(2))
            except ValueError:
                return 0.0
    return 0.0


def estimate_carbs(protein: float, fat: float, kcal: float) -> int:
    est = (kcal - 4 * protein - 9 * fat) / 4
    return max(0, round(est))


def backfill_file(path: Path, apply: bool) -> tuple[str, int | None]:
    text = path.read_text(encoding="utf-8")
    if CARBS_RE.search(text):
        return "has-carbs", None
    protein = parse_num(text, "protein_g")
    fat = parse_num(text, "fat_g")
    kcal = parse_num(text, "kcal")
    if kcal == 0 and protein == 0 and fat == 0:
        return "no-macros", None
    carbs = estimate_carbs(protein, fat, kcal)
    new_text, n = FAT_LINE_RE.subn(lambda m: f"{m.group(1)}\ncarbs_g: {carbs}", text, count=1)
    if n == 0:
        return "no-fat-line", None
    if apply:
        path.write_text(new_text, encoding="utf-8")
    return "ok", carbs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="actually write files")
    ap.add_argument(
        "--dir",
        default=str(NUTRITION_DIR),
        help=f"nutrition directory (default: {NUTRITION_DIR})",
    )
    args = ap.parse_args()

    directory = Path(args.dir).expanduser()
    if not directory.exists():
        print(f"ERROR: {directory} does not exist", file=sys.stderr)
        return 1

    files = sorted(directory.glob("*.md"))
    counts = {"ok": 0, "has-carbs": 0, "no-fat-line": 0, "no-macros": 0}

    for p in files:
        status, carbs = backfill_file(p, apply=args.apply)
        counts[status] += 1
        if status == "ok":
            print(f"  {p.name} → carbs_g: {carbs}")
        elif status == "no-fat-line":
            print(f"  {p.name} → SKIPPED (no fat_g line)")

    mode = "APPLIED" if args.apply else "DRY-RUN"
    print(f"\n[{mode}] {counts['ok']} updated, {counts['has-carbs']} already had carbs_g, "
          f"{counts['no-fat-line']} missing fat_g, {counts['no-macros']} empty macros.")
    if not args.apply and counts["ok"]:
        print("Re-run with --apply to write changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
