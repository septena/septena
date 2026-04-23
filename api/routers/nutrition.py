"""Nutrition — self-contained: its own directory, its own parser, its own
router. No caching yet — the working set is tiny (one file per meal,
~30/month) and a fresh disk scan takes <5ms.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.cache import parse_dir_cached
from api.io import atomic_write_text
from api.parsing import _extract_frontmatter, _normalize_date, _normalize_number
from api.paths import MACROS_CONFIG_PATH, NUTRITION_DIR

# Neutral fallback targets — shown when the user hasn't created a
# macros-config.yaml in their vault. Roughly adult daily-value ranges.
DEFAULT_MACROS = {
    "protein": {"min": 100, "max": 150, "unit": "g"},
    "fat":     {"min": 50,  "max": 80,  "unit": "g"},
    "carbs":   {"min": 200, "max": 300, "unit": "g"},
    "kcal":    {"min": 2000, "max": 2500, "unit": ""},
    "fasting": {"min": 14, "max": 16},
}

router = APIRouter(prefix="/api/nutrition", tags=["nutrition"])


def _load_macros_config() -> Dict[str, Dict[str, Any]]:
    """Merge user macros-config.yaml over shipped defaults. Missing file
    or malformed YAML both fall back silently to defaults."""
    if not MACROS_CONFIG_PATH.exists():
        return DEFAULT_MACROS
    try:
        raw = yaml.safe_load(MACROS_CONFIG_PATH.read_text(encoding="utf-8")) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("macros-config.yaml unreadable, using defaults: %s", exc)
        return DEFAULT_MACROS
    user = (raw.get("targets") or {}) if isinstance(raw, dict) else {}
    merged = {k: {**v} for k, v in DEFAULT_MACROS.items()}
    for key, override in user.items():
        if key in merged and isinstance(override, dict):
            merged[key].update({k: v for k, v in override.items() if k in ("min", "max", "unit")})
    return merged


def _parse_nutrition_entry(path: Path) -> Dict[str, Any] | None:
    try:
        raw = path.read_text(encoding="utf-8")
        fm = _extract_frontmatter(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Skipping malformed nutrition file %s: %s", path.name, exc)
        return None

    date_val = _normalize_date(fm.get("date"))
    if not date_val:
        logger.warning("Skipping nutrition file without date: %s", path.name)
        return None

    foods = fm.get("foods") or []
    if not isinstance(foods, list):
        foods = [str(foods)]

    foods_list = [str(f) for f in foods]
    if not foods_list:
        logger.warning("Skipping nutrition file without foods: %s", path.name)
        return None

    return {
        "date": date_val,
        "time": str(fm.get("time") or ""),
        # meal | supplement | snack
        "type": "meal",
        "emoji": str(fm.get("emoji") or ""),
        "protein_g": _normalize_number(fm.get("protein_g")) or 0,
        "fat_g": _normalize_number(fm.get("fat_g")) or 0,
        "carbs_g": _normalize_number(fm.get("carbs_g")) or 0,
        "fiber_g": _normalize_number(fm.get("fiber_g")) or 0,
        "kcal": _normalize_number(fm.get("kcal")) or 0,
        "foods": foods_list,
        "file": path.name,
    }


def _load_nutrition_entries() -> List[Dict[str, Any]]:
    """Chronological list of meals. Cached per-file by mtime so repeat
    calls (stats + entries) don't re-parse unchanged YAML."""
    out = parse_dir_cached(NUTRITION_DIR, "*.md", _parse_nutrition_entry)
    # Chronological: date asc, then time asc. Frontend reverses for display.
    out.sort(key=lambda e: (e["date"], e["time"]))
    return out


@router.get("/macros-config")
def nutrition_macros_config() -> Dict[str, Dict[str, Any]]:
    """Daily macro targets (ranges). User overrides in
    Nutrition/macros-config.yaml layer over shipped defaults."""
    return _load_macros_config()


@router.get("/entries")
def nutrition_entries(since: Optional[str] = None) -> List[Dict[str, Any]]:
    entries = _load_nutrition_entries()
    if since:
        entries = [e for e in entries if e["date"] >= since]
    return entries


@router.get("/events")
def nutrition_events(date: str) -> Dict[str, List[Dict[str, Any]]]:
    """Universal event contract — see api/events.py:SectionEvent."""
    entries = [e for e in _load_nutrition_entries() if e["date"] == date]
    events: List[Dict[str, Any]] = []
    for e in entries:
        foods = e.get("foods") or []
        label = foods[0] if foods else "meal"
        sublabel = ", ".join(foods[1:3]) if len(foods) > 1 else None
        events.append({
            "section": "nutrition",
            "date": e["date"],
            "time": e.get("time") or None,
            "label": label,
            "sublabel": sublabel,
            "icon": e.get("emoji") or None,
            "id": e.get("file"),
        })
    return {"events": events}


def _time_to_hours(t: str) -> float | None:
    """Parse 'HH:MM' → float hours. Returns None on bad input."""
    if not t or len(t) < 4 or ":" not in t:
        return None
    try:
        hh, mm = t.split(":", 1)
        return int(hh) + int(mm) / 60.0
    except (ValueError, TypeError):
        return None


def _fasting_windows(entries: List[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
    """For each day, compute the fast from the last eating event the prior
    day to the first eating event today. Supplements are excluded — taking
    a vitamin doesn't break a fast. Snacks and meals both count.

    A computed window is only kept if it plausibly anchors to a real
    end-of-day meal (prev day) and a real start-of-day meal (today). If
    either side looks like a logging gap (e.g. prev day's "last" meal was
    at 11:00 because dinner was never logged), the result is discarded.
    This keeps the chart honest: no data is better than misleading 32h
    "fasts" caused by skipped entries.
    """
    EATING = {"meal", "snack"}

    # Heuristic thresholds for what counts as a plausible meal anchor.
    # Prev day's last meal should be after mid-afternoon (dinner-ish).
    # Today's first meal should be before mid-afternoon (breakfast/lunch).
    # And the total window can't exceed a realistic OMAD-style fast.
    MIN_PREV_LAST_HOUR = 15.0   # prev day's last logged meal must be ≥15:00
    MAX_FIRST_HOUR = 15.0       # today's first logged meal must be ≤15:00
    MAX_FAST_HOURS = 20.0       # hard cap — anything above is a logging gap

    # Collect parseable times per day, sorted ascending.
    by_day: Dict[str, List[float]] = defaultdict(list)
    by_day_raw: Dict[str, List[str]] = defaultdict(list)
    for e in entries:
        if e.get("type") not in EATING:
            continue
        h = _time_to_hours(e.get("time") or "")
        if h is None:
            continue
        by_day[e["date"]].append(h)
        by_day_raw[e["date"]].append(e["time"])
    for d in by_day:
        pairs = sorted(zip(by_day[d], by_day_raw[d]))
        by_day[d] = [p[0] for p in pairs]
        by_day_raw[d] = [p[1] for p in pairs]

    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        prev_d = (today - timedelta(days=offset + 1)).isoformat()
        prev_times = by_day.get(prev_d, [])
        curr_times = by_day.get(d, [])

        entry: Dict[str, Any] = {
            "date": d,
            "hours": None,
            "last_meal": None,
            "first_meal": None,
            "note": None,  # "gap" when we suppressed an implausible value
        }

        if not prev_times or not curr_times:
            out.append(entry)
            continue

        last_prev_h = prev_times[-1]
        first_curr_h = curr_times[0]
        hours = round((24 - last_prev_h) + first_curr_h, 1)

        # Reject implausible windows — almost always caused by missing log
        # entries, not actual extreme fasts.
        if (
            last_prev_h < MIN_PREV_LAST_HOUR
            or first_curr_h > MAX_FIRST_HOUR
            or hours > MAX_FAST_HOURS
        ):
            entry["note"] = "gap"
            out.append(entry)
            continue

        entry["hours"] = hours
        entry["last_meal"] = by_day_raw[prev_d][-1]
        entry["first_meal"] = by_day_raw[d][0]
        out.append(entry)

    return out


@router.get("/stats")
def nutrition_stats(days: int = 30, end: str | None = None) -> Dict[str, Any]:
    """Daily protein totals + fasting windows over the last N days. Missing
    days are included (null for fasting, 0g for protein) so the frontend
    charts have a continuous x-axis."""
    entries = _load_nutrition_entries()
    if not entries:
        return {
            "daily": [], "fasting": [],
            "total_g": 0, "total_fat": 0, "total_carbs": 0, "total_kcal": 0,
            "avg_g": 0, "avg_fat": 0, "avg_carbs": 0, "avg_kcal": 0,
            "avg_fast_h": 0,
            "today_latest_meal": None, "today_meal_count": 0,
            "yesterday_last_meal": None,
        }

    # Sum protein, fat, carbs, kcal per date.
    by_date_protein: Dict[str, float] = defaultdict(float)
    by_date_fat: Dict[str, float] = defaultdict(float)
    by_date_carbs: Dict[str, float] = defaultdict(float)
    by_date_kcal: Dict[str, float] = defaultdict(float)
    by_date_fiber: Dict[str, float] = defaultdict(float)
    for e in entries:
        by_date_protein[e["date"]] += e["protein_g"] or 0
        by_date_fat[e["date"]] += e["fat_g"] or 0
        by_date_carbs[e["date"]] += e.get("carbs_g") or 0
        by_date_kcal[e["date"]] += e["kcal"] or 0
        by_date_fiber[e["date"]] += e.get("fiber_g") or 0

    # Build continuous window ending at `end` (default today), going back `days` days.
    today = date.fromisoformat(end) if end else date.today()
    daily: List[Dict[str, Any]] = []
    running_total = 0.0
    running_count = 0
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        protein = round(by_date_protein.get(d, 0), 1)
        fat = round(by_date_fat.get(d, 0), 1)
        carbs = round(by_date_carbs.get(d, 0), 1)
        fiber = round(by_date_fiber.get(d, 0), 1)
        kcal = round(by_date_kcal.get(d, 0))
        daily.append({"date": d, "protein_g": protein, "fat_g": fat, "carbs_g": carbs, "fiber_g": fiber, "kcal": kcal})
        if protein > 0:
            running_total += protein
            running_count += 1

    avg_g = round(running_total / running_count, 1) if running_count else 0

    # Fasting windows — needs +1 day of lookback so the first bar can use
    # the prior day's last meal.
    fasting = _fasting_windows(entries, days)
    fast_vals = [f["hours"] for f in fasting if f["hours"] is not None]
    avg_fast_h = round(sum(fast_vals) / len(fast_vals), 1) if fast_vals else 0

    # Live fasting-state inputs. The frontend needs three things to decide
    # whether the user is "currently fasting" vs. in a fed window: how many
    # eating events today, today's latest eating-event time, and yesterday's
    # last eating-event time. Supplements would be excluded via the EATING
    # set below — but note _parse_nutrition_entry currently forces
    # type="meal" on every file, so in practice all entries count. When
    # that parser is fixed, this filter becomes meaningful automatically.
    EATING = {"meal", "snack"}
    today_iso = today.isoformat()
    yesterday_iso = (today - timedelta(days=1)).isoformat()
    today_meal_times = sorted(
        e["time"] for e in entries
        if e["date"] == today_iso and e.get("type") in EATING and e.get("time")
    )
    yesterday_meal_times = sorted(
        e["time"] for e in entries
        if e["date"] == yesterday_iso and e.get("type") in EATING and e.get("time")
    )
    today_latest_meal = today_meal_times[-1] if today_meal_times else None
    today_meal_count = len(today_meal_times)
    yesterday_last_meal = yesterday_meal_times[-1] if yesterday_meal_times else None

    return {
        "daily": daily,
        "fasting": fasting,
        "total_g": round(sum(by_date_protein.values()), 1),
        "total_fat": round(sum(by_date_fat.values()), 1),
        "total_carbs": round(sum(by_date_carbs.values()), 1),
        "total_kcal": round(sum(by_date_kcal.values())),
        "avg_g": avg_g,
        "avg_fat": round(sum(v for v in by_date_fat.values() if v > 0) / max(1, sum(1 for v in by_date_fat.values() if v > 0)), 1),
        "avg_carbs": round(sum(v for v in by_date_carbs.values() if v > 0) / max(1, sum(1 for v in by_date_carbs.values() if v > 0)), 1),
        "avg_kcal": round(sum(v for v in by_date_kcal.values() if v > 0) / max(1, sum(1 for v in by_date_kcal.values() if v > 0))),
        "avg_fast_h": avg_fast_h,
        "today_latest_meal": today_latest_meal,
        "today_meal_count": today_meal_count,
        "yesterday_last_meal": yesterday_last_meal,
    }


@router.post("/sessions")
async def nutrition_post(request: Request) -> Dict[str, Any]:
    """Write one YAML file per meal entry.

    Filename pattern: {date}--{HHMM}--NN.md
    NN is auto-incremented when two entries share the same minute.
    """
    payload = await request.json()
    date_str = _normalize_date(payload.get("date")) or date.today().isoformat()
    time_str = str(payload.get("time") or "").strip()
    if not time_str or ":" not in time_str:
        raise HTTPException(status_code=400, detail="time (HH:MM) is required")

    foods_raw = payload.get("foods") or []
    if isinstance(foods_raw, str):
        foods = [line.strip() for line in foods_raw.splitlines() if line.strip()]
    else:
        foods = [str(f).strip() for f in foods_raw if str(f).strip()]
    if not foods:
        raise HTTPException(status_code=400, detail="foods is required (non-empty)")

    protein_g = _normalize_number(payload.get("protein_g")) or 0
    fat_g = _normalize_number(payload.get("fat_g")) or 0
    carbs_g = _normalize_number(payload.get("carbs_g")) or 0
    fiber_g = _normalize_number(payload.get("fiber_g")) or 0
    kcal = _normalize_number(payload.get("kcal")) or 0
    emoji = str(payload.get("emoji") or "").strip()

    NUTRITION_DIR.mkdir(parents=True, exist_ok=True)

    hhmm = time_str.replace(":", "")[:4]
    idx = 1
    while True:
        fname = f"{date_str}--{hhmm}--{idx:02d}.md"
        fpath = NUTRITION_DIR / fname
        if not fpath.exists():
            break
        idx += 1

    fm: Dict[str, Any] = {
        "date": date_str,
        "time": time_str,
        "emoji": emoji,
        "protein_g": int(protein_g) if protein_g == int(protein_g) else protein_g,
        "fat_g": int(fat_g) if fat_g == int(fat_g) else fat_g,
        "carbs_g": int(carbs_g) if carbs_g == int(carbs_g) else carbs_g,
        "fiber_g": int(fiber_g) if fiber_g == int(fiber_g) else fiber_g,
        "kcal": int(kcal) if kcal == int(kcal) else kcal,
        "foods": foods,
        "section": "nutrition",
    }
    body = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n"
    atomic_write_text(fpath, body)
    logger.info("Wrote nutrition entry %s", fname)
    return {"ok": True, "file": fname}


@router.put("/sessions")
async def nutrition_put(request: Request) -> Dict[str, Any]:
    """Update an existing nutrition entry by filename."""
    payload = await request.json()
    file_name = str(payload.get("file") or "").strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="file is required")
    fpath = NUTRITION_DIR / file_name
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Entry not found")

    foods_raw = payload.get("foods") or []
    if isinstance(foods_raw, str):
        foods = [line.strip() for line in foods_raw.splitlines() if line.strip()]
    else:
        foods = [str(f).strip() for f in foods_raw if str(f).strip()]
    if not foods:
        raise HTTPException(status_code=400, detail="foods is required (non-empty)")

    fm: Dict[str, Any] = {
        "date": str(payload.get("date") or "").strip() or fpath.stem.split("--")[0],
        "time": str(payload.get("time") or "").strip(),
        "emoji": str(payload.get("emoji") or "").strip(),
        "protein_g": _normalize_number(payload.get("protein_g")) or 0,
        "fat_g": _normalize_number(payload.get("fat_g")) or 0,
        "carbs_g": _normalize_number(payload.get("carbs_g")) or 0,
        "fiber_g": _normalize_number(payload.get("fiber_g")) or 0,
        "kcal": _normalize_number(payload.get("kcal")) or 0,
        "foods": foods,
        "section": "nutrition",
    }

    for k in ["protein_g", "fat_g", "carbs_g", "fiber_g", "kcal"]:
        v = fm[k]
        fm[k] = int(v) if v == int(v) else v

    body = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n"
    atomic_write_text(fpath, body)
    logger.info("Updated nutrition entry %s", file_name)
    return {"ok": True, "file": file_name}


@router.delete("/sessions")
async def nutrition_delete(request: Request) -> Dict[str, Any]:
    """Delete a nutrition entry by filename."""
    body = await request.json()
    file_name = str(body.get("file") or "").strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="file is required")
    fpath = NUTRITION_DIR / file_name
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Entry not found")
    fpath.unlink()
    logger.info("Deleted nutrition entry %s", file_name)
    return {"ok": True}
