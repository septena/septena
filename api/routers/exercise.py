"""Exercise — in-memory cache of the Exercise/Log YAML files, plus all the
routes that the Exercise dashboard and session logger talk to. Unlike the
other sections this one caches aggressively: the working set is a few
hundred files and every dashboard view hits multiple routes, so a single
disk scan per request would show up as lag.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException
from starlette.requests import Request

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date, _normalize_number, _slugify
from api.paths import DATA_DIR

router = APIRouter(tags=["exercise"])

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
        # ISO timestamp of when the session was finished. Persisted in
        # frontmatter by POST /api/sessions. Stable across Obsidian edits
        # (unlike file mtime). May be missing on legacy files.
        "concluded_at": frontmatter.get("concluded_at") or "",
        # Cardio-only fields. Preserved so the session logger can pre-fill
        # them from the last cardio session.
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

    Detects:
      - new files (dir mtime changes AND file mtime is newer)
      - deleted files (dir mtime changes)
      - edited files (individual file mtime changes)
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
    # Directory mtime catches add/remove cheaply.
    if DATA_DIR.stat().st_mtime > last_loaded_ts:
        load_cache()
        return
    # Walk files for content edits. A single modified file triggers reload.
    for path in DATA_DIR.glob("*.md"):
        if path.stat().st_mtime > last_loaded_ts:
            load_cache()
            return


def fresh_cache() -> None:
    """FastAPI dependency: reload cache if vault files changed on disk."""
    _maybe_reload_cache()


@router.get("/api/exercises", dependencies=[Depends(fresh_cache)])
def get_exercises() -> List[str]:
    return list(_cache.get("exercises", []))


@router.get("/api/progression/{exercise}", dependencies=[Depends(fresh_cache)])
def get_progression(exercise: str) -> Dict[str, Any]:
    data = _cache.get("progression", {}).get(exercise, [])
    return {"exercise": exercise, "data": data}


@router.get("/api/summary", dependencies=[Depends(fresh_cache)])
def get_summary(since: str = "") -> List[Dict[str, Any]]:
    """One row per exercise: latest weight, latest date, trend, count.

    Optional `since` query param (ISO date `YYYY-MM-DD`) restricts the window:
    only entries with `date >= since` are counted, and exercises with zero
    entries in the window are omitted from the response entirely.

    Lets the dashboard render pills and the summary table in a single request
    instead of N+1 fetches against /api/progression/{exercise}.
    """
    progression: Dict[str, List[Dict[str, Any]]] = _cache.get("progression", {})
    summary: List[Dict[str, Any]] = []
    for name, points in progression.items():
        window = [p for p in points if not since or (p.get("date") or "") >= since]
        if not window:
            continue
        weighted = [p for p in window if isinstance(p.get("weight"), (int, float))]
        latest = window[-1]
        trend = "→"
        if len(weighted) >= 2:
            a, b = weighted[-2]["weight"], weighted[-1]["weight"]
            trend = "↑" if b > a else "↓" if b < a else "→"
        summary.append(
            {
                "name": name,
                "latest_weight": latest.get("weight"),
                "latest_date": latest.get("date"),
                "trend": trend,
                "count": len(window),
            }
        )
    summary.sort(key=lambda item: item["name"])
    return summary


# ── Exercise taxonomy ─────────────────────────────────────────────────────
# Derive session groups from exercise content (new schema has no session field).

CARDIO_EXERCISES = {"rowing", "elliptical", "stairs"}
MOBILITY_EXERCISES = {"surya namaskar", "pull up"}
CORE_EXERCISES = {"ab crunch", "abdominal"}
LOWER_EXERCISES = {
    "leg press", "single leg press", "leg extension", "leg curl",
    "calf press", "abduction", "adduction", "squat", "dead lift",
}

# Legacy aliases from the pre-2026-04 schema. Still appear in old files
# until Obsidian sync finishes removing them. Classified here so the
# day-grouping logic reflects what the workout actually was.
LEGACY_ALIASES: Dict[str, str] = {
    "row": "cardio",       # old name for the rowing machine
    "curl": "lower",       # old name for seated leg curl
    "diverging": "upper",  # one-off label for diverging seated row
}


def exercise_group(name: str) -> str:
    if name in CARDIO_EXERCISES:
        return "cardio"
    if name in MOBILITY_EXERCISES:
        return "mobility"
    if name in CORE_EXERCISES:
        return "core"
    if name in LOWER_EXERCISES:
        return "lower"
    if name in LEGACY_ALIASES:
        return LEGACY_ALIASES[name]
    return "upper"


def day_groups(entries_for_day: List[Dict[str, Any]]) -> set[str]:
    """Return the set of groups present on a given day, excluding `core`
    (ab crunch is a finisher, not a session type)."""
    return {
        exercise_group(e.get("exercise") or "")
        for e in entries_for_day
        if e.get("exercise")
    } - {"core"}


# ── Session logger endpoints ──────────────────────────────────────────────


@router.post("/api/sessions")
async def post_sessions(request: Request) -> Dict[str, Any]:
    """Write one .md file per entry using the NEW schema.

    Each file has a minimal frontmatter: `date`, `exercise`, and either the
    strength fields (weight/sets/reps/difficulty) OR the cardio fields
    (duration_min/distance_m/level). No `session`, `source`, `tags`, or
    `pace_unit` — those were dropped in the 2026-04-10 migration.
    """
    payload = await request.json()
    date_str = payload.get("date", "")
    time_str = payload.get("time", "")
    session_type = payload.get("session_type", "")
    concluded_at = f"{date_str}T{time_str}:00" if time_str else f"{date_str}T00:00:00"
    written: List[str] = []

    for entry in payload.get("entries", []):
        if entry.get("skipped"):
            continue  # skipped entries are not persisted in the new schema
        ex = entry.get("exercise", "unknown")
        is_cardio = ex in CARDIO_EXERCISES or ex in MOBILITY_EXERCISES
        # Optional `replace_file`: if the frontend previously saved this
        # entry and is now re-submitting an edit, overwrite that file in
        # place instead of creating a --02 sibling.
        replace_file = entry.get("replace_file")

        fm_fields: Dict[str, Any] = {
            "date": date_str,
            "exercise": ex,
            # Session-end timestamp. Written once per POST, shared across
            # all entries in the same session so a whole session collapses
            # to a single "last logged" moment regardless of which file is
            # picked up first.
            "concluded_at": concluded_at,
        }

        if is_cardio:
            if (v := entry.get("duration_min")) is not None:
                fm_fields["duration_min"] = float(v)
            if (v := entry.get("distance_m")) is not None:
                fm_fields["distance_m"] = int(v)
            if (v := entry.get("level")) is not None:
                fm_fields["level"] = int(v)
        else:
            if (v := entry.get("weight")) is not None:
                fm_fields["weight"] = float(v)
            if (v := entry.get("sets")) is not None:
                fm_fields["sets"] = int(v)
            if (v := entry.get("reps")) is not None and v != "":
                # reps is int or the literal string "AMRAP".
                try:
                    fm_fields["reps"] = int(v)
                except (TypeError, ValueError):
                    fm_fields["reps"] = str(v)
            if (diff := entry.get("difficulty", "")):
                fm_fields["difficulty"] = diff

        slug = _slugify(ex)
        if replace_file and (DATA_DIR / replace_file).exists():
            file_name = replace_file
        else:
            seq = 1
            while (DATA_DIR / f"{date_str}--{slug}--{seq:02d}.md").exists():
                seq += 1
            file_name = f"{date_str}--{slug}--{seq:02d}.md"
        path = DATA_DIR / file_name

        # Frontmatter-only by design — the body was just a duplication of
        # the frontmatter fields. Obsidian renders frontmatter natively.
        # If a note was provided, we preserve it as a single line after the
        # block so it's not lost.
        fm_block = yaml.safe_dump(fm_fields, sort_keys=False, allow_unicode=True).strip()
        content = f"---\n{fm_block}\n---\n"
        if (note := entry.get("note", "")):
            content += f"\n{note}\n"
        path.write_text(content)
        written.append(file_name)

    load_cache()
    return {"written": written, "concluded_at": concluded_at, "session_type": session_type}


@router.get("/api/sessions/last", dependencies=[Depends(fresh_cache)])
def get_last_session(type: str = "") -> Dict[str, Any]:
    entries_by_date = _cache.get("sessions_by_date", {})
    if not entries_by_date:
        return {"session_type": type, "date": "", "entries": []}
    sorted_dates = sorted(entries_by_date.keys(), reverse=True)
    for dt in sorted_dates:
        day_entries = entries_by_date[dt]
        matching = [e for e in day_entries if e.get("session", "") == type]
        if matching:
            return {"session_type": type, "date": dt, "entries": matching}
    return {"session_type": type, "date": sorted_dates[0], "entries": entries_by_date.get(sorted_dates[0], [])}


@router.get("/api/sessions/{session_date}", dependencies=[Depends(fresh_cache)])
def get_sessions(session_date: str) -> Dict[str, Any]:
    return {"date": session_date, "data": _cache.get("sessions_by_date", {}).get(session_date, [])}


@router.get("/api/stats", dependencies=[Depends(fresh_cache)])
def get_stats() -> Dict[str, Any]:
    # `last_logged_at`: the max `concluded_at` across all parsed entries.
    # Stable across Obsidian edits (unlike file mtime). Falls back to
    # file mtime only if every entry is legacy (no concluded_at in
    # frontmatter), so existing vaults keep working.
    last_logged_at: str | None = None
    entries = _cache.get("entries", [])
    stamps = [e.get("concluded_at") for e in entries if e.get("concluded_at")]
    if stamps:
        last_logged_at = max(stamps)
    elif DATA_DIR.exists():
        try:
            latest = max(
                (p.stat().st_mtime for p in DATA_DIR.glob("*.md")),
                default=None,
            )
            if latest is not None:
                last_logged_at = datetime.fromtimestamp(latest).isoformat(timespec="seconds")
        except OSError:
            pass
    return dict(
        _cache.get("stats", {}),
        last_loaded_at=_cache.get("last_loaded_at"),
        last_logged_at=last_logged_at,
    )


@router.get("/api/reload")
def reload_data() -> Dict[str, Any]:
    cache = load_cache()
    return {
        "ok": True,
        "message": "Cache reloaded",
        "stats": cache.get("stats", {}),
        "last_loaded_at": cache.get("last_loaded_at"),
    }

SESSION_META = {
    "upper": {"emoji": "💪", "label": "Upper"},
    "lower": {"emoji": "🦵", "label": "Lower"},
    "cardio": {"emoji": "🫁", "label": "Cardio"},
    "yoga": {"emoji": "🧘", "label": "Yoga"},
}


@router.get("/api/next-workout", dependencies=[Depends(fresh_cache)])
def get_next_workout() -> Dict[str, Any]:
    """Classify past days by the groups they contained, return days-since for
    each session type, and suggest the one that's been longest.

    A day counts as a real "upper day" only if it includes at least
    `MIN_STRENGTH_EXERCISES` upper-group exercises (same for lower). One
    isolated chest press finished off after a cardio session does NOT make
    it an upper day. A "cardio day" requires at least `MIN_CARDIO_MINUTES`
    of total Z2 cardio time AND no strength session — anything below the
    threshold is just warmup.

    The 30-minute floor for cardio matches the literature on Z2 mitochondrial
    biogenesis (≥30 min to move CS / fatty-acid oxidation markers; 45–60 min
    is the per-session sweet spot for biogenesis).
    """
    MIN_STRENGTH_EXERCISES = 3
    MIN_CARDIO_MINUTES = 30

    entries_by_date: Dict[str, List[Dict[str, Any]]] = _cache.get("sessions_by_date", {})
    today = date.today()
    today_str = today.isoformat()

    last_by_type: Dict[str, str | None] = {"upper": None, "lower": None, "cardio": None, "yoga": None}

    for date_str in sorted(entries_by_date.keys(), reverse=True):
        if date_str > today_str:
            continue  # ignore future-dated entries
        day_entries = entries_by_date[date_str]
        if not day_entries:
            continue

        upper_count = 0
        lower_count = 0
        cardio_minutes = 0.0
        has_mobility = False
        for e in day_entries:
            ex = e.get("exercise") or ""
            grp = exercise_group(ex)
            if grp == "upper":
                upper_count += 1
            elif grp == "lower":
                lower_count += 1
            elif grp == "cardio":
                duration = e.get("duration_min")
                if isinstance(duration, (int, float)):
                    cardio_minutes += float(duration)
            elif grp == "mobility":
                has_mobility = True

        is_upper_day = upper_count >= MIN_STRENGTH_EXERCISES
        is_lower_day = lower_count >= MIN_STRENGTH_EXERCISES
        # Real cardio session: ≥30 min Z2 AND no strength session that day.
        is_cardio_day = (
            cardio_minutes >= MIN_CARDIO_MINUTES
            and not is_upper_day
            and not is_lower_day
        )
        # Yoga day: mobility exercises (surya namaskar) and no strength.
        is_yoga_day = has_mobility and not is_upper_day and not is_lower_day

        if is_upper_day and last_by_type["upper"] is None:
            last_by_type["upper"] = date_str
        if is_lower_day and last_by_type["lower"] is None:
            last_by_type["lower"] = date_str
        if is_cardio_day and last_by_type["cardio"] is None:
            last_by_type["cardio"] = date_str
        if is_yoga_day and last_by_type["yoga"] is None:
            last_by_type["yoga"] = date_str

        if all(v is not None for v in last_by_type.values()):
            break

    def days_ago(d: str | None) -> int | None:
        return (today - date.fromisoformat(d)).days if d else None

    counts = {t: days_ago(last_by_type[t]) for t in ("upper", "lower", "cardio", "yoga")}

    # Suggestion rule: prefer strength. Pick whichever of upper/lower has
    # been longer (respecting a 2-day minimum rest from its own type). If both
    # upper and lower were trained in the last 2 days, fall back to cardio.
    MIN_REST = 2

    def available(t: str) -> bool:
        v = counts[t]
        return v is None or v >= MIN_REST

    def gap(t: str) -> float:
        v = counts[t]
        return float("inf") if v is None else float(v)

    if available("upper") and available("lower"):
        suggested_type = "upper" if gap("upper") >= gap("lower") else "lower"
    elif available("upper"):
        suggested_type = "upper"
    elif available("lower"):
        suggested_type = "lower"
    elif available("cardio"):
        suggested_type = "cardio"
    elif available("yoga"):
        suggested_type = "yoga"
    else:
        suggested_type = "yoga"

    meta = SESSION_META[suggested_type]

    return {
        "suggested": {
            "type": suggested_type,
            "emoji": meta["emoji"],
            "label": meta["label"],
        },
        "days_ago": {
            "upper": counts["upper"],
            "lower": counts["lower"],
            "cardio": counts["cardio"],
            "yoga": counts["yoga"],
        },
        "last_date": {
            "upper": last_by_type["upper"],
            "lower": last_by_type["lower"],
            "cardio": last_by_type["cardio"],
            "yoga": last_by_type["yoga"],
        },
    }


def _last_nonnull_values(points: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    """Compose a virtual "last entry" used as a prefill default.

    Strategy per field:
    - weight/sets/reps/difficulty/duration_min/distance_m: most recent non-null
      value (walking history backwards). Handles stale/legacy files that
      lack some fields without blanking out earlier prefills.
    - `level`: mode of the last 5 non-null values. Level is a machine setting
      you usually keep constant; one-off deviations shouldn't become the new
      default. If there's a tie, the most recent wins.

    Also attaches `avg_pace_m_per_min`: mean pace over the last 5 sessions
    that had both distance and duration. The UI uses this to compute a
    realistic distance prefill from a target duration.
    """
    if not points:
        return None

    # Most-recent-non-null fields (everything except level).
    recency_fields = ["weight", "sets", "reps", "difficulty", "duration_min", "distance_m"]
    out: Dict[str, Any] = {f: None for f in recency_fields}
    out["level"] = None
    source_date: str | None = None
    for p in reversed(points):
        changed = False
        for f in recency_fields:
            v = p.get(f)
            if out[f] in (None, "") and v not in (None, ""):
                out[f] = v
                changed = True
        if changed and source_date is None:
            source_date = p.get("date")
        if all(out[f] not in (None, "") for f in recency_fields):
            break
    out["date"] = source_date or (points[-1].get("date") if points else None)

    # Level: mode over last 5 non-null values, ties broken by recency.
    recent_levels: List[Any] = []
    for p in reversed(points):
        lv = p.get("level")
        if lv is not None:
            recent_levels.append(lv)
            if len(recent_levels) >= 5:
                break
    if recent_levels:
        counts = Counter(recent_levels)
        top = counts.most_common()
        best_count = top[0][1]
        # Among tied values, prefer the one seen most recently (earliest in list).
        winners = [v for v, c in top if c == best_count]
        for lv in recent_levels:
            if lv in winners:
                out["level"] = lv
                break

    # Rolling pace over last 5 valid cardio sessions.
    paces: List[float] = []
    for p in reversed(points):
        d = p.get("distance_m")
        t = p.get("duration_min")
        if isinstance(d, (int, float)) and isinstance(t, (int, float)) and t > 0:
            paces.append(float(d) / float(t))
            if len(paces) >= 5:
                break
    out["avg_pace_m_per_min"] = round(sum(paces) / len(paces), 1) if paces else None
    return out


@router.post("/api/last-entries", dependencies=[Depends(fresh_cache)])
async def post_last_entries(request: Request) -> Dict[str, Any]:
    """Return, per exercise, a composed "last known values" entry plus the
    raw last 5 entries as `history` (newest first).

    Body: {"exercises": ["chest press", "rowing", ...], "history_limit": 5}
    Response: {
      "chest press": {
        ...prefill fields...,
        "history": [ {date, weight, sets, reps, difficulty, ...}, ... ]
      },
      ...
    }
    Missing exercises return null. Prefill fields are filled by walking
    history backwards and taking the first non-null value for each field,
    so stale old-schema files can't blank out a good prefill.
    """
    payload = await request.json()
    names: List[str] = payload.get("exercises", [])
    limit = int(payload.get("history_limit", 5))
    progression = _cache.get("progression", {})
    out: Dict[str, Any] = {}
    for name in names:
        points = progression.get(name, [])
        composed = _last_nonnull_values(points)
        if composed is None:
            out[name] = None
            continue
        composed["history"] = list(reversed(points[-limit:])) if points else []
        out[name] = composed
    return out


@router.get("/api/entries", dependencies=[Depends(fresh_cache)])
def get_entries(since: Optional[str] = None) -> List[Dict[str, Any]]:
    entries = _cache.get("entries", [])
    if since:
        entries = [e for e in entries if (e.get("date") or "") >= since]
    return sorted(entries, key=lambda e: e.get("date") or "", reverse=True)


# Local to the cardio-history route — wider net than the strict taxonomy at
# the top of this module so routes like this can account for future-log
# entries with names that aren't in the session-classifier set yet.
CARDIO_HISTORY_EXERCISES = {"elliptical", "rowing", "stairs", "cycling", "running", "walking", "swimming"}
CARDIO_WEEKLY_TARGET_MIN = 150  # WHO zone-2 recommendation


@router.get("/api/cardio-history", dependencies=[Depends(fresh_cache)])
def cardio_history(days: int = 30) -> Dict[str, Any]:
    """Daily cardio minutes + rolling 7-day totals."""
    entries = _cache.get("entries", [])
    today = date.today()
    start = today - timedelta(days=days - 1)

    # Sum cardio minutes per day
    daily: Dict[str, float] = defaultdict(float)
    for e in entries:
        d = e.get("date", "")
        dur = e.get("duration_min")
        ex = (e.get("exercise") or "").lower()
        if dur and d >= start.isoformat() and ex in CARDIO_HISTORY_EXERCISES:
            daily[d] += float(dur)

    # Build output with rolling 7-day sum
    result = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        mins = round(daily.get(d, 0), 1)
        # Rolling 7-day sum: sum of this day and 6 prior
        rolling = 0.0
        for j in range(7):
            rd = (start + timedelta(days=i - j)).isoformat()
            rolling += daily.get(rd, 0)
        result.append({
            "date": d,
            "minutes": mins,
            "rolling_7d": round(rolling, 1),
        })

    return {
        "daily": result,
        "target_weekly_min": CARDIO_WEEKLY_TARGET_MIN,
    }
