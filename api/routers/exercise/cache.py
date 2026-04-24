"""In-memory cache of Training/Log YAML files.

Unlike other sections, training caches aggressively: the working set is a
few hundred files and every dashboard view hits multiple routes, so a
single disk scan per request would show up as lag.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date, _normalize_number
from api.paths import DATA_DIR

_cache_lock = Lock()
_cache: Dict[str, Any] = {
    "entries": [],
    "exercises": [],
    "progression": {},
    "sessions_by_date": {},
    "stats": {
        "total_sessions": 0,
        "total_entries": 0,
        "date_range": {"start": None, "end": None},
        "exercises_count": 0,
    },
    "last_loaded_at": None,
}


def _parse_entry(path: Path) -> Dict[str, Any] | None:
    try:
        raw = path.read_text(encoding="utf-8")
        frontmatter = _extract_frontmatter(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Skipping malformed file %s: %s", path.name, exc)
        return None

    entry = {
        "date": _normalize_date(frontmatter.get("date")),
        "session": frontmatter.get("session") or "",
        "exercise": frontmatter.get("exercise") or "",
        "weight": _normalize_number(frontmatter.get("weight")),
        "sets": frontmatter.get("sets"),
        "reps": frontmatter.get("reps"),
        "difficulty": frontmatter.get("difficulty") or "",
        "source": frontmatter.get("source") or "",
        "file": path.name,
        "concluded_at": frontmatter.get("concluded_at") or "",
        "logged_at": frontmatter.get("logged_at") or "",
        "duration_min": _normalize_number(frontmatter.get("duration_min")),
        "distance_m": _normalize_number(frontmatter.get("distance_m")),
        "level": _normalize_number(frontmatter.get("level")),
        "pace_unit": frontmatter.get("pace_unit") or "",
    }

    if not entry["date"] or not entry["exercise"]:
        logger.warning("Skipping incomplete file %s: missing date or exercise", path.name)
        return None

    return entry


def load_cache() -> Dict[str, Any]:
    entries: List[Dict[str, Any]] = []
    scanned = 0
    skipped = 0
    if DATA_DIR.exists():
        for path in sorted(DATA_DIR.glob("*.md")):
            scanned += 1
            entry = _parse_entry(path)
            if entry:
                entries.append(entry)
            else:
                skipped += 1
    else:
        logger.warning("Training data directory does not exist: %s", DATA_DIR)

    entries.sort(key=lambda item: (item.get("date") or "", item.get("exercise") or ""))

    exercises = sorted({entry["exercise"] for entry in entries if entry.get("exercise")})

    progression: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    sessions_by_date: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for entry in entries:
        sessions_by_date[entry["date"]].append(entry)
        progression[entry["exercise"]].append(
            {
                "date": entry["date"],
                "weight": entry["weight"],
                "difficulty": entry["difficulty"],
                "sets": entry["sets"],
                "reps": entry["reps"],
                "duration_min": entry["duration_min"],
                "distance_m": entry["distance_m"],
                "level": entry["level"],
            }
        )

    dates = [entry["date"] for entry in entries if entry.get("date")]
    unique_sessions = {entry["date"] for entry in entries if entry.get("date")}

    cache = {
        "entries": entries,
        "exercises": exercises,
        "progression": dict(progression),
        "sessions_by_date": {k: sorted(v, key=lambda item: item.get("exercise") or "") for k, v in sessions_by_date.items()},
        "stats": {
            "total_sessions": len(unique_sessions),
            "total_entries": len(entries),
            "date_range": {
                "start": min(dates) if dates else None,
                "end": max(dates) if dates else None,
            },
            "exercises_count": len(exercises),
        },
        "last_loaded_at": datetime.now().isoformat(timespec="seconds"),
    }

    with _cache_lock:
        _cache.clear()
        _cache.update(cache)

    logger.info(
        "Loaded %d entries from %d files (%d skipped) — %d exercises, date range %s..%s",
        len(entries),
        scanned,
        skipped,
        len(exercises),
        cache["stats"]["date_range"]["start"],
        cache["stats"]["date_range"]["end"],
    )

    return cache


def _maybe_reload_cache() -> None:
    """Reload cache if any .md file under DATA_DIR was modified or added
    since the cache was last loaded. Cheap enough to call on every read
    request (~10ms for 500 files on a local SSD).
    """
    if not DATA_DIR.exists():
        return
    last_loaded = _cache.get("last_loaded_at")
    if not last_loaded:
        load_cache()
        return
    try:
        last_loaded_ts = datetime.fromisoformat(last_loaded).timestamp()
    except (TypeError, ValueError):
        load_cache()
        return
    if DATA_DIR.stat().st_mtime > last_loaded_ts:
        load_cache()
        return
    for path in DATA_DIR.glob("*.md"):
        if path.stat().st_mtime > last_loaded_ts:
            load_cache()
            return


def fresh_cache() -> None:
    """FastAPI dependency: reload cache if vault files changed on disk."""
    _maybe_reload_cache()
