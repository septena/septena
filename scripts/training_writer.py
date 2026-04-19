#!/usr/bin/env python3
"""
Writer: append a structured training-session file from free-text input lines.
Free-text input → $SETLIST_VAULT/Exercise/Log/YYYY-MM-DD--{exercise}--NN.md

Usage:
    python3 training_writer.py "2026-04-09"
      # Reads lines from stdin, parses each, writes one .md per exercise

    echo "Chest press @27.5kg 3x12 [hard]" | python3 training_writer.py "2026-04-09"

    python3 training_writer.py "2026-04-09" << 'EOF'
    Elliptical 10 min, lvl 7
    Rowing 10 min, 2005m
    Chest press @27.5kg 3x12 [hard]
    Triceps extension @38.5kg 3x12 [hard]
    EOF
"""

import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

TRAINING_DIR = Path.home() / "Documents" / "obsidian" / "Bases" / "Exercise" / "Log"

# ─── Patterns ────────────────────────────────────────────────────────────────

STRENGTH_PAT = re.compile(
    r"^(?P<name>[^[@]+?)\s*"
    r"(?:@\s*(?P<weight>[\d.]+)\s*kg)?\s*"
    r"(?P<sets>\d+)\s*[×xX]\s*(?P<reps>[\d]+|[A-Za-z]+)\s*"
    r"(?:\[(?P<diff>[\w]+)\])?",
    re.IGNORECASE,
)

STRENGTH_PAT2 = re.compile(
    r"^(?P<name>[^[@]+?)\s*"
    r"(?P<sets>\d+)\s*[×xX]\s*(?P<reps>[\d]+|[A-Za-z]+)\s*"
    r"(?:@\s*(?P<weight>[\d.]+)\s*kg)?\s*"
    r"(?:\[(?P<diff>[\w]+)\])?",
    re.IGNORECASE,
)

ELL_PAT = re.compile(
    r"^(?:Elliptical|Ellipt)\s+"
    r"(?P<min>[\d.]+)\s*min\s*"
    r"(?:(?P<dist>[\d.]+)\s*km\s*)?"
    r"(?:lvl?\s*(?P<lvl>[\d.]+))?",
    re.IGNORECASE,
)

ROW_PAT = re.compile(
    r"^(?:Row|Rowing)\s+"
    r"(?P<min>[\d.]+)\s*min\s*"
    r"(?:,\s*"
    r"(?:(?P<distkm>[\d.]+)\s*km\s*(?:lvl?\s*(?P<lvl1>[\d.]+))?(?:\s*\([^)]+\))?)?"
    r"|"
    r"(?:(?P<pace>[\d.]+)\s*m\s*(?:lvl?\s*(?P<lvl2>[\d.]+))?(?:\s*\([^)]+\))?)?"
    r")?",
    re.IGNORECASE,
)

YOGA_PAT = re.compile(r"^(?:Surya|Surya Namaskar|Yoga)\s*(?:Namaskar)?\s*(?:(?P<min>[\d.]+)\s*min)?.*", re.IGNORECASE)

BW_PAT = re.compile(
    r"^(?P<name>Pull-ups|Pullup|Pullup?s?)\s+"
    r"(?P<reps>[\d]+)\s*[×xX]\s*(?P<repmode>AMRAP|[\d]+)\s*"
    r"(?:\((?P<note>[^)]+)\))?",
    re.IGNORECASE,
)

SKIP_PAT = re.compile(r"^(?P<name>[^[—-]+)\s*[-—]\s*(?:skip|skipped|no|off)\s*(?:\((?P<reason>[^)]+)\))?", re.IGNORECASE)

EXERCISE_ALIASES = {
    "chest press": "chest press",
    "triceps extension": "triceps extension",
    "shoulder press": "shoulder press",
    "ab crunch": "ab crunch",
    "abdominal": "abdominal",
    "diverging": "diverging",
    "lat pull": "lat pull",
    "leg press": "leg press",
    "leg extension": "leg extension",
    "calf press": "calf press",
    "curl": "curl",
    "adduction": "adduction",
    "abduction": "abduction",
    "diverging seated row": "diverging",
    "seated row": "diverging",
    "pull-ups": "pull-ups",
    "pullup": "pull-ups",
    "pull-ups": "pull-ups",
    "pullups": "pull-ups",
}


def normalise(name: str) -> str:
    n = name.strip().lower()
    return EXERCISE_ALIASES.get(n, n)


def parse_line(line: str) -> Optional[dict]:
    """Parse a single input line. Return a dict or None if unrecognised."""
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("-"):
        return None

    # ── Skip marker ──────────────────────────────────────────────────────
    sm = SKIP_PAT.match(line)
    if sm:
        return {
            "exercise": normalise(sm.group("name").strip()),
            "session": "skip",
            "weight": None,
            "sets": None,
            "reps": "",
            "difficulty": "",
            "duration": None,
            "pace": None,
            "note": sm.group("reason") or "",
        }

    # ── Elliptical ─────────────────────────────────────────────────────────
    # Formats: "Elliptical 10 min, lvl 7"  or  "Elliptical 30 min, 2.89 km lvl 4"  or  "Elliptical 10 min, 1.03 km lvl 7"
    em = re.match(r"^(?:Elliptical|Ellipt)\s+(?P<min>[\d.]+)\s*min\s*,?\s*(?P<rest>.*)$", line, re.IGNORECASE)
    if em:
        minn = float(em.group("min"))
        rest = em.group("rest")
        distkm_m = re.search(r"([\d.]+)\s*km", rest)
        distm_m = re.search(r"([\d.]+)\s*m(?:\s+lvl|\s*$|,)", rest)
        lvl_m = re.search(r"lvl\s*([\d.]+)", rest)
        if distm_m:
            weight = round(float(distm_m.group(1)) / minn, 1)  # m/min pace
        elif distkm_m:
            weight = round(float(distkm_m.group(1)) * 1000 / minn, 1)  # km → m / min
        else:
            weight = float(lvl_m.group(1)) if lvl_m else 0.0
        return {
            "exercise": "elliptical",
            "session": "cardio",
            "weight": weight,
            "sets": 1,
            "reps": "1",
            "difficulty": "",
            "duration": f"{minn:.0f}min",
            "pace": distm_m and f"{weight} m/min" or None,
            "note": "",
        }

    # ── Rowing ─────────────────────────────────────────────────────────────
    # Formats: "Rowing 10 min, 2005m"  or  "Rowing 15 min, 3480 m lvl 1"  or  "Rowing 10 min, 2.89 km lvl 4"
    rm = re.match(r"^(?:Row|Rowing)\s+(?P<min>[\d.]+)\s*min\s*,?\s*(?P<rest>.*)$", line, re.IGNORECASE)
    if rm:
        minn = float(rm.group("min"))
        rest = rm.group("rest")
        distkm_m = re.search(r"([\d.]+)\s*km", rest)
        distm_m = re.search(r"([\d.]+)\s*m(?:\s+lvl|\s*$|,)", rest)
        lv_m = re.search(r"lvl\s*([\d.]+)", rest)
        weight = 0.0
        if distm_m:
            weight = round(float(distm_m.group(1)) / minn, 1)  # m/min pace
        elif distkm_m:
            weight = round(float(distkm_m.group(1)) * 1000 / minn, 1)  # km → m / min
        elif lv_m:
            weight = float(lv_m.group(1))
        return {
            "exercise": "row",
            "session": "cardio",
            "weight": weight,
            "sets": 1,
            "reps": "1",
            "difficulty": "",
            "duration": f"{minn:.0f}min",
            "pace": distm_m and f"{weight} m/min" or None,
            "note": "",
        }

    # ── Yoga ───────────────────────────────────────────────────────────────
    ym = YOGA_PAT.match(line)
    if ym:
        minn = ym.group("min")
        return {
            "exercise": "surya namaskar",
            "session": "yoga",
            "weight": None,
            "sets": 1,
            "reps": "1",
            "difficulty": "",
            "duration": f"{minn}min" if minn else "",
            "pace": None,
            "note": "",
        }

    # ── Bodyweight ─────────────────────────────────────────────────────────
    bm = BW_PAT.match(line)
    if bm:
        reps = bm.group("reps")
        repmode = bm.group("repmode")
        note = bm.group("note") or ""
        return {
            "exercise": normalise(bm.group("name")),
            "session": "gym",
            "weight": None,
            "sets": int(reps),
            "reps": repmode,
            "difficulty": "",
            "duration": None,
            "pace": None,
            "note": note,
        }

    # ── Strength (@ weight kg × reps) ─────────────────────────────────────
    sm = STRENGTH_PAT.match(line)
    if sm:
        return {
            "exercise": normalise(sm.group("name").strip()),
            "session": "gym",
            "weight": float(sm.group("weight")) if sm.group("weight") else None,
            "sets": int(sm.group("sets")),
            "reps": sm.group("reps"),
            "difficulty": sm.group("diff") or "",
            "duration": None,
            "pace": None,
            "note": "",
        }

    # ── Strength (sets × reps @ weight kg) ────────────────────────────────
    sm2 = STRENGTH_PAT2.match(line)
    if sm2:
        return {
            "exercise": normalise(sm2.group("name").strip()),
            "session": "gym",
            "weight": float(sm2.group("weight")) if sm2.group("weight") else None,
            "sets": int(sm2.group("sets")),
            "reps": sm2.group("reps"),
            "difficulty": sm2.group("diff") or "",
            "duration": None,
            "pace": None,
            "note": "",
        }

    return None


def next_seq(date: str, exercise: str) -> int:
    existing = list(TRAINING_DIR.glob(f"{date}--{exercise}--*.md"))
    return len(existing) + 1


def write_entry(date: str, data: dict) -> str:
    ex = data["exercise"]
    n = next_seq(date, ex)
    slug = f"{date}--{ex}--{n:02d}.md"
    path = TRAINING_DIR / slug

    difficulty_line = f"difficulty: {data['difficulty']}" if data["difficulty"] else ""
    if difficulty_line:
        difficulty_line += "\n"

    content = f"""---
date: "{date}"
session: "{data['session']}"
exercise: "{ex}"
weight: {data['weight'] if data['weight'] is not None else ""}
sets: {data['sets'] if data['sets'] is not None else ""}
reps: "{data['reps']}"
{difficulty_line}tags:
  - training-session
---

# {ex.title()} — {date}

- Session: {data['session']}
- Sets: {data['sets'] or '—'}
- Reps: {data['reps'] or '—'}
- Weight: {data['weight'] or '—'}
"""
    body = []
    if data.get("duration"):
        body.append(f"- Duration: {data['duration']}")
    if data.get("pace"):
        body.append(f"- Pace: {data['pace']}")
    if data.get("note"):
        body.append(f"- Note: {data['note']}")

    if body:
        content += "\n".join(body) + "\n"

    path.write_text(content)
    return slug


def process_date(date_str: str, lines: list) -> list:
    """Parse lines and write one file per recognised exercise entry."""
    results = []
    for line in lines:
        parsed = parse_line(line)
        if not parsed:
            continue
        slug = write_entry(date_str, parsed)
        results.append(slug)
    return results


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: training_writer.py YYYY-MM-DD  (reads stdin)")
        sys.exit(1)

    date_str = sys.argv[1]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        print("ERROR: date must be YYYY-MM-DD")
        sys.exit(1)

    lines = [l.rstrip() for l in sys.stdin if l.strip()]
    results = process_date(date_str, lines)

    if results:
        print(f"Wrote {len(results)} entries for {date_str}:")
        for slug in results:
            print(f"  + {slug}")
    else:
        print(f"No entries written for {date_str} — no recognised lines.")
