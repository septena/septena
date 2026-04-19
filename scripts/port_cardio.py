#!/usr/bin/env python3
"""
Port rowing & elliptical entries from training-log.md to structured frontmatter files.
Reads: ~/Documents/obsidian/Health/training-log.md
Writes: ~/Documents/obsidian/Bases/Exercise/Log/YYYY-MM-DD--{row,elliptical}--NN.md
"""

import re
from datetime import datetime
from pathlib import Path
from typing import Optional

LOG = Path.home() / "Documents" / "obsidian" / "Health" / "training-log.md"
OUT_DIR = Path.home() / "Documents" / "obsidian" / "Bases" / "Exercise" / "Log"

MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4,
    "May": 5, "Jun": 6, "Jul": 7, "Aug": 8,
    "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

# Patterns
ROW_PAT = re.compile(
    r"Rowing\s+(?P<min>\d+)\s*min[,.]?\s*(?:(?P<dist>[\d.]+)\s*m)?.*?(?:lvl\s*(?P<lvl>\d+))?",
    re.IGNORECASE,
)
ELL_PAT = re.compile(
    r"Elliptical\s+(?P<min>\d+)\s*min[,.]?\s*(?:(?P<dist>[\d.]+)\s*km)?.*?lvl\s*(?P<lvl>\d+)",
    re.IGNORECASE,
)


def parse_date(header: str) -> Optional[str]:
    m = re.search(r"(\d+)\s+(\w+)\s+(\d{4})", header)
    if not m:
        return None
    day, mon, year = int(m[1]), MONTH_MAP.get(m[2][:3].title()), int(m[3])
    if not mon:
        return None
    return f"{year}-{mon:02d}-{day:02d}"


def existing_count(exercise: str, date: str) -> int:
    return len(list(OUT_DIR.glob(f"{date}--{exercise}--*.md")))


def write_entry(date: str, exercise: str, weight: float, session: str = "cardio",
                difficulty: str = "", sets: int = 1, reps: str = "1") -> None:
    n = existing_count(exercise, date) + 1
    slug = f"{date}--{exercise}--{n:02d}.md"
    path = OUT_DIR / slug
    difficulty_line = f"difficulty: {difficulty}" if difficulty else ""
    content = f"""---
date: {date}
session: "{session}"
exercise: "{exercise}"
weight: {weight}
sets: {sets}
reps: "{reps}"
{difficulty_line}
source: "backfill"
tags:
  - training-session
  - cardio
---

# {exercise.title()} — {date}

- Session: {session}
- Source: backfill (from training-log.md)
"""
    path.write_text(content.strip() + "\n")
    print(f"  Wrote: {slug}  ({weight})")


def process() -> None:
    text = LOG.read_text()
    current_date = None

    for line in text.splitlines():
        line = line.rstrip()
        if re.match(r"^## ", line):
            current_date = parse_date(line)
        elif current_date:
            rm = ROW_PAT.search(line)
            if rm:
                minutes = int(rm["min"])
                dist_m = float(rm["dist"]) * 1000 if rm["dist"] else None
                lvl = int(rm["lvl"]) if rm["lvl"] else None
                # prefer pace from distance/time; fall back to level
                if dist_m and minutes:
                    weight = round(dist_m / minutes, 1)
                elif lvl:
                    weight = float(lvl)
                else:
                    weight = 0.0
                write_entry(
                    date=current_date,
                    exercise="row",
                    weight=weight,
                    session="cardio",
                    difficulty="",
                )

            em = ELL_PAT.search(line)
            if em:
                minutes = int(em["min"])
                lvl = int(em["lvl"])
                write_entry(
                    date=current_date,
                    exercise="elliptical",
                    weight=float(lvl),
                    session="cardio",
                    difficulty="",
                )


if __name__ == "__main__":
    if not OUT_DIR.exists():
        print(f"ERROR: directory not found: {OUT_DIR}")
        exit(1)
    print(f"Reading: {LOG}")
    print(f"Writing to: {OUT_DIR}\n")
    process()
    print("\nDone.")
