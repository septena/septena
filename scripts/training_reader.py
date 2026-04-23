#!/usr/bin/env python3
"""
Shared reader for structured training-session files.
Replaces free-text parsing in exercise-tracker.py and gym bot.

Reads: ~/Documents/septena-data/Exercise/Log/YYYY-MM-DD--{exercise}--NN.md
Returns: structured data ready for emoji grid, API, or dashboard.
"""

from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Tuple

TRAINING_DIR = Path.home() / "Documents" / "septena-data" / "Exercise" / "Log"

EXERCISE_TYPES = {
    "row": "cardio",
    "elliptical": "cardio",
    "surya namaskar": "yoga",
    "surya": "yoga",
    "pull-ups": "gym",
    "pullups": "gym",
}


class SessionEntry(NamedTuple):
    exercise: str
    date: str
    session: str
    weight: Optional[float]
    sets: Optional[int]
    reps: str
    difficulty: str


def all_entries() -> List[SessionEntry]:
    """Load all structured training-session files."""
    entries = []
    if not TRAINING_DIR.exists():
        return entries
    for fyle in sorted(TRAINING_DIR.glob("*.md")):
        frontmatter, _ = split_frontmatter(fyle.read_text())
        entries.append(parse_frontmatter(frontmatter, fyle.stem))
    return entries


def split_frontmatter(text: str) -> Tuple[str, str]:
    """Split YAML frontmatter from markdown body."""
    if not text.startswith("---"):
        return "", text
    # Split on the closing --- that ends the frontmatter block
    parts = text[3:].split("\n---\n", 2)
    if len(parts) < 2:
        return "", text
    return parts[0], parts[1]


def parse_frontmatter(fm: str, stem: str) -> SessionEntry:
    """Parse a frontmatter block into a SessionEntry."""
    lines = fm.strip().splitlines()
    fields = {}
    for line in lines:
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        fields[key.strip()] = val.strip().strip('"').strip("'")

    # Derive exercise from filename stem: YYYY-MM-DD--{exercise}--NN
    parts = stem.replace("--", "|").split("|")
    exercise = parts[1] if len(parts) >= 2 else fields.get("exercise", "unknown")

    return SessionEntry(
        exercise=exercise,
        date=fields.get("date", ""),
        session=fields.get("session", ""),
        weight=float(fields["weight"]) if fields.get("weight") else None,
        sets=int(fields["sets"]) if fields.get("sets") else None,
        reps=fields.get("reps", ""),
        difficulty=fields.get("difficulty", ""),
    )


def dates_with_exercise(days: int = 7, today: Optional[date] = None) -> Dict[date, str]:
    """
    Return a dict {date: category} for the last `days` days.
    category: 'gym' | 'yoga' | 'cardio' | 'rest' | 'not_done'
    """
    if today is None:
        today = date.today()

    entries = all_entries()
    # Index by date string (YYYY-MM-DD)
    entry_map: Dict[str, List[SessionEntry]] = {}
    for e in entries:
        entry_map.setdefault(e.date, []).append(e)

    result: Dict[date, str] = {}
    for i in range(days):
        d = today - timedelta(days=i)
        d_str = d.isoformat()
        day_entries = entry_map.get(d_str, [])

        if not day_entries:
            result[d] = "not_done"
        elif all(e.session in ("skip", "rest", "-") for e in day_entries):
            result[d] = "rest"
        elif any("yoga" in EXERCISE_TYPES.get(e.exercise.lower(), "") or
                 "surya" in e.exercise.lower()
                 for e in day_entries):
            result[d] = "yoga"
        else:
            result[d] = "gym"

    return result


def generate_emoji_grid(days: int = 7, today: Optional[date] = None) -> str:
    """Generate the 7-day emoji grid string."""
    if today is None:
        today = date.today()

    EMOJI = {"gym": "🏋️", "yoga": "🧘", "cardio": "🚴", "rest": "🌴", "not_done": "☀️"}
    DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    calendar = dates_with_exercise(days, today)
    labels = []
    emojis = []
    count = 0
    for d in sorted(calendar.keys(), reverse=True):
        labels.append(DAY_LABELS[(d.weekday() + 1) % 7])
        cat = calendar[d]
        emojis.append(EMOJI.get(cat, "⚪"))
        if cat not in ("not_done", "rest"):
            count += 1

    labels_str = "  ".join(labels)
    emojis_str = "  ".join(emojis)
    return (f"🏋️ Last {days} days: {count}/{days}\n"
            f"{labels_str}\n"
            f"{emojis_str}")


if __name__ == "__main__":
    import argparse
    from datetime import datetime

    parser = argparse.ArgumentParser(description="Training session reader")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--date", help="Override today (YYYY-MM-DD)")
    args = parser.parse_args()

    today = date.today()
    if args.date:
        today = datetime.strptime(args.date, "%Y-%m-%d").date()

    print(generate_emoji_grid(args.days, today))
