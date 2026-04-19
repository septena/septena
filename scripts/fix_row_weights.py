#!/usr/bin/env python3
"""
Fix rowing weight values: distance in the log is already in meters,
so pace = meters / minutes. Previously multiplied by 1000 erroneously,
producing values like 200500 instead of 200.5.
"""

import re
from pathlib import Path

TRAINING_DIR = Path.home() / "Documents" / "obsidian" / "Bases" / "Exercise" / "Log"

fixed = 0
for fyle in sorted(TRAINING_DIR.glob("*--row--*.md")):
    text = fyle.read_text()
    m = re.search(r"^weight:\s*([\d.]+)$", text, re.MULTILINE)
    if not m:
        continue
    weight = float(m[1])
    if weight > 1000:
        # stored as meters/min (wrong), divide to get correct m/min pace
        fixed_weight = round(weight / 1000, 1)
        text = re.sub(
            r"^weight:\s*[\d.]+$",
            f"weight: {fixed_weight}",
            text,
            flags=re.MULTILINE,
        )
        # ensure pace_unit is set
        if "pace_unit:" not in text:
            text = text.replace(
                'source: "backfill"',
                'pace_unit: "m/min"\nsource: "backfill"',
            )
        fyle.write_text(text)
        print(f"Fixed: {fyle.name}  {weight} → {fixed_weight}")
        fixed += 1
    elif "pace_unit:" not in text:
        # already correct, ensure pace_unit is set
        text = text.replace(
            'source: "backfill"',
            'pace_unit: "m/min"\nsource: "backfill"',
        )
        fyle.write_text(text)
        print(f" pace_unit added: {fyle.name}")

print(f"\nFixed {fixed} row files.")
