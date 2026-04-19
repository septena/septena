"""Habits — a fixed configurable checklist. Source of truth:
  Bases/Habits/habits-config.yaml       (the habit set, user-edited)
  Bases/Habits/Log/YYYY-MM-DD--{id}--01.md  (one file per completion)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date, _slugify
from api.paths import HABITS_CONFIG_PATH, HABITS_DIR
from api.routers.settings import load_day_phases

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _phase_ids() -> tuple[str, ...]:
    """Current set of valid habit bucket ids, sourced from settings."""
    return tuple(p["id"] for p in load_day_phases())


def _load_habits_config() -> List[Dict[str, Any]]:
    """Return the full ordered list of habits from habits-config.yaml."""
    if not HABITS_CONFIG_PATH.exists():
        return []
    try:
        raw = HABITS_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("habits-config.yaml failed to parse: %s", exc)
        return []

    habits = data.get("habits") or []
    phases = _phase_ids()
    fallback = phases[0] if phases else "morning"
    out: List[Dict[str, Any]] = []
    for h in habits:
        if not isinstance(h, dict):
            continue
        hid = str(h.get("id") or "").strip()
        name = str(h.get("name") or "").strip()
        bucket = str(h.get("bucket") or fallback).strip().lower()
        if not hid or not name:
            continue
        if bucket not in phases:
            bucket = fallback
        out.append({"id": hid, "name": name, "bucket": bucket})
    return out


def _habit_event_file(day: str, habit_id: str) -> Path:
    # Habits are once-per-day-per-id, so NN is always 01 — kept for filename
    # consistency with timed sections (cannabis/caffeine/exercise/nutrition).
    return HABITS_DIR / f"{day}--{habit_id}--01.md"


def _load_habit_events(day: str) -> List[Dict[str, Any]]:
    """Glob all habit-completion events for a given day."""
    if not HABITS_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for p in sorted(HABITS_DIR.glob(f"{day}--*.md")):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("habit event %s failed to parse: %s", p.name, exc)
            continue
        if fm:
            out.append(fm)
    return out


def _write_habit_event(
    day: str,
    habit: Dict[str, Any],
    note: Optional[str],
    time: Optional[str] = None,
) -> None:
    HABITS_DIR.mkdir(parents=True, exist_ok=True)
    hid = habit["id"]
    # Pass a real date() so YAML dumps it bare (Obsidian Bases needs an
    # un-quoted value to recognise it as a date for filtering).
    event: Dict[str, Any] = {
        "date": date.fromisoformat(day),
    }
    if time:
        event["time"] = time
    event.update({
        "id": f"habit-{day}-{hid}",
        "section": "habits",
        "habit_id": hid,
        "habit_name": habit["name"],
        "bucket": habit["bucket"],
        "note": (note or None),
    })
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    _habit_event_file(day, hid).write_text(body, encoding="utf-8")


def _delete_habit_event(day: str, habit_id: str) -> None:
    p = _habit_event_file(day, habit_id)
    if p.exists():
        p.unlink()


@router.get("/config")
def habits_config() -> Dict[str, Any]:
    """Return habits grouped by bucket, preserving config order within each."""
    habits = _load_habits_config()
    phases = _phase_ids()
    grouped: Dict[str, List[Dict[str, Any]]] = {b: [] for b in phases}
    for h in habits:
        grouped.setdefault(h["bucket"], []).append(h)
    return {"buckets": list(phases), "grouped": grouped, "total": len(habits)}


@router.get("/day/{day}")
def habits_day(day: str) -> Dict[str, Any]:
    """Merge config + today's events so the frontend gets a single flat list
    ready to render. Each habit carries `done: bool`."""
    habits = _load_habits_config()
    events_by_id = {str(e.get("habit_id", "")): e for e in _load_habit_events(day)}

    phases = _phase_ids()
    grouped: Dict[str, List[Dict[str, Any]]] = {b: [] for b in phases}
    done_count = 0
    for h in habits:
        ev = events_by_id.get(h["id"])
        done = ev is not None
        if done:
            done_count += 1
        grouped.setdefault(h["bucket"], []).append({
            **h,
            "done": done,
            "note": (str(ev.get("note") or "") if ev else ""),
            "time": (str(ev.get("time") or "") if ev else "") or None,
        })

    total = len(habits)
    return {
        "date": day,
        "buckets": list(phases),
        "grouped": grouped,
        "done_count": done_count,
        "total": total,
        "percent": round(100 * done_count / total) if total else 0,
    }


@router.post("/toggle")
async def habits_toggle(request: Request) -> Dict[str, Any]:
    """Body: {date, habit_id, done}. Idempotent — `done:true` writes a
    per-habit event file, `done:false` removes it. A pre-existing note (from
    hand-editing the file) is preserved across re-toggles."""
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    habit_id = str(payload.get("habit_id") or "").strip()
    done = bool(payload.get("done"))
    if not habit_id:
        raise HTTPException(status_code=400, detail="habit_id is required")

    config_by_id = {h["id"]: h for h in _load_habits_config()}
    if habit_id not in config_by_id:
        raise HTTPException(status_code=404, detail=f"unknown habit: {habit_id}")

    if done:
        existing = _habit_event_file(day, habit_id)
        note = None
        prior_time = None
        if existing.exists():
            try:
                fm = _extract_frontmatter(existing.read_text(encoding="utf-8"))
                note = fm.get("note")
                prior_time = fm.get("time")
            except Exception:  # noqa: BLE001
                pass
        # Stamp time only when logging a completion *on today's date*. Time-
        # travelled toggles (day != today via ?date=) stay time-less so the
        # wall-clock moment doesn't pollute historical entries. Client may
        # pass an explicit `time` (HH:MM) to override.
        client_time = str(payload.get("time") or "").strip() or None
        today_iso = date.today().isoformat()
        if client_time:
            time_val = client_time
        elif prior_time:
            time_val = str(prior_time)
        elif day == today_iso:
            time_val = datetime.now().strftime("%H:%M")
        else:
            time_val = None
        _write_habit_event(day, config_by_id[habit_id], note, time=time_val)
    else:
        _delete_habit_event(day, habit_id)

    completed = [str(e.get("habit_id", "")) for e in _load_habit_events(day)]
    return {"ok": True, "date": day, "habit_id": habit_id, "done": done, "completed": completed}


@router.post("/new")
async def habits_new(request: Request) -> Dict[str, Any]:
    """Body: {name, bucket}. Appends a new habit to habits-config.yaml
    with an auto-generated kebab-case id. Idempotent: skips if an identical
    name already exists in the same bucket."""
    payload = await request.json()
    name = str(payload.get("name") or "").strip()
    phases = _phase_ids()
    fallback = phases[0] if phases else "morning"
    bucket = str(payload.get("bucket") or fallback).strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if bucket not in phases:
        raise HTTPException(status_code=400, detail=f"bucket must be one of {phases}")

    # Generate id from name
    new_id = _slugify(name)
    if not new_id:
        raise HTTPException(status_code=400, detail="could not derive a valid id from name")

    # Load existing config
    HABITS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if HABITS_CONFIG_PATH.exists():
        try:
            raw = HABITS_CONFIG_PATH.read_text(encoding="utf-8")
            data = yaml.safe_load(raw) or {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("habits-config.yaml failed to parse on write: %s", exc)
            data = {}
    else:
        data = {}

    habits: List[Dict[str, Any]] = data.get("habits") or []

    # Idempotent: skip if same name already exists in same bucket
    for h in habits:
        if str(h.get("name", "")).strip() == name and str(h.get("bucket", "")).strip() == bucket:
            return {"ok": True, "id": h["id"], "name": name, "bucket": bucket, "skipped": True}

    habits.append({"id": new_id, "name": name, "bucket": bucket})
    data["habits"] = habits

    # Preserve the header comment
    header = "# Setlist habits config — fixed daily checklist.\n"
    "# Edit this file directly to add/remove/reorder habits. The UI reads but\n"
    "# never writes this file. `id` must be unique and kebab-case (used as the\n"
    "# key in daily log files). `bucket` is morning | afternoon | evening.\n"
    HABITS_CONFIG_PATH.write_text(
        header + yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    return {"ok": True, "id": new_id, "name": name, "bucket": bucket}


@router.put("/update")
async def habits_update(request: Request) -> Dict[str, Any]:
    """Body: {id, name, bucket}. Updates the habit with the given id.
    Name and bucket are both optional — only non-empty values are applied."""
    payload = await request.json()
    habit_id = str(payload.get("id") or "").strip()
    name = str(payload.get("name") or "").strip()
    bucket = str(payload.get("bucket") or "").strip().lower()

    if not habit_id:
        raise HTTPException(status_code=400, detail="id is required")
    phases = _phase_ids()
    if bucket and bucket not in phases:
        raise HTTPException(status_code=400, detail=f"bucket must be one of {phases}")

    if not HABITS_CONFIG_PATH.exists():
        raise HTTPException(status_code=404, detail="habits-config.yaml not found")

    try:
        raw = HABITS_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("habits-config.yaml failed to parse on update: %s", exc)
        raise HTTPException(status_code=500, detail="failed to parse config")

    habits: List[Dict[str, Any]] = data.get("habits") or []
    found = False
    for h in habits:
        if str(h.get("id", "")) == habit_id:
            found = True
            if name:
                h["name"] = name
            if bucket:
                h["bucket"] = bucket
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"habit not found: {habit_id}")

    data["habits"] = habits
    header = "# Setlist habits config — fixed daily checklist.\n"
    "# Edit this file directly to add/remove/reorder habits. The UI reads but\n"
    "# never writes this file. `id` must be unique and kebab-case (used as the\n"
    "# key in daily log files). `bucket` is morning | afternoon | evening.\n"
    HABITS_CONFIG_PATH.write_text(
        header + yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    return {"ok": True}


@router.delete("/delete/{habit_id}")
def habits_delete(habit_id: str) -> Dict[str, Any]:
    """Remove a habit from habits-config.yaml. Historical day-log files that
    reference the id are left intact — they surface as orphans when the day
    is re-read, but no longer as habits."""
    if not HABITS_CONFIG_PATH.exists():
        raise HTTPException(status_code=404, detail="habits-config.yaml not found")
    try:
        raw = HABITS_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("habits-config.yaml failed to parse on delete: %s", exc)
        raise HTTPException(status_code=500, detail="failed to parse config")

    habits: List[Dict[str, Any]] = data.get("habits") or []
    before = len(habits)
    habits = [h for h in habits if str(h.get("id", "")) != habit_id]
    if len(habits) == before:
        raise HTTPException(status_code=404, detail=f"habit not found: {habit_id}")

    data["habits"] = habits
    header = "# Setlist habits config — fixed daily checklist.\n"
    HABITS_CONFIG_PATH.write_text(
        header + yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    return {"ok": True, "id": habit_id}


@router.get("/history")
def habits_history(days: int = 30) -> Dict[str, Any]:
    """Daily completion % for the last N days. Missing days → 0%."""
    total = len(_load_habits_config())
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        done = len(_load_habit_events(d))
        pct = round(100 * done / total) if total else 0
        out.append({"date": d, "done": done, "total": total, "percent": pct})
    return {"daily": out, "total": total}
