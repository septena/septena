"""Chores — recurring tasks with per-chore cadence_days. Source of truth:
  Bases/Chores/Definitions/*.md     (one note per chore, user-edited)
  Bases/Chores/Log/*.md             (per-event log: complete | defer)

The "current due date" is derived by replaying the event log in order.
A chore with no events is due today. A `complete` event sets due =
event.date + cadence_days. A `defer` event sets due = new_due_date.
The latest-in-time event wins.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.cache import parse_dir_cached
from api.io import atomic_write_text
from api.parsing import FRONTMATTER_RE, _extract_frontmatter, _normalize_date, _slugify
from api.paths import CHORES_DEFS_DIR, CHORES_LOG_DIR

router = APIRouter(prefix="/api/chores", tags=["chores"])


def _parse_chore_definition(p: Path) -> Dict[str, Any] | None:
    try:
        raw = p.read_text(encoding="utf-8")
        fm = _extract_frontmatter(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("chore definition %s failed to parse: %s", p.name, exc)
        return None
    cid = str(fm.get("id") or "").strip()
    name = str(fm.get("name") or "").strip()
    try:
        cadence = int(fm.get("cadence_days") or 0)
    except (TypeError, ValueError):
        cadence = 0
    if not cid or not name or cadence <= 0:
        logger.warning("chore definition %s missing id/name/cadence_days", p.name)
        return None
    return {
        "id": cid,
        "name": name,
        "cadence_days": cadence,
        "emoji": str(fm.get("emoji") or "").strip() or "🧽",
    }


def _load_chore_definitions() -> List[Dict[str, Any]]:
    """Return all chore definitions from Definitions/*.md. Cached by mtime."""
    return parse_dir_cached(CHORES_DEFS_DIR, "*.md", _parse_chore_definition)


def _parse_chore_event(p: Path) -> Dict[str, Any] | None:
    try:
        fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("chore event %s failed to parse: %s", p.name, exc)
        return None
    fm["date"] = _normalize_date(fm.get("date"))
    if fm.get("new_due_date"):
        fm["new_due_date"] = _normalize_date(fm.get("new_due_date"))
    fm["_file"] = p.name
    return fm


def _load_chore_events() -> List[Dict[str, Any]]:
    """Load every event in Log/ with date/new_due_date normalised. Cached by mtime."""
    return parse_dir_cached(CHORES_LOG_DIR, "*.md", _parse_chore_event)


def _derive_chore_state(chore: Dict[str, Any], events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Replay events in chronological order to compute current due_date,
    last_completed, and days_overdue. Chores with no events default to due
    today (they were added now and need to be done)."""
    cadence = chore["cadence_days"]
    today = date.today()
    due_date = today.isoformat()
    last_completed: Optional[str] = None
    last_completed_time: Optional[str] = None

    # Sort chronologically; ties broken by filename so same-day defers
    # apply in write order (01 before 02).
    sorted_events = sorted(events, key=lambda e: (e.get("date") or "", e.get("_file", "")))
    for ev in sorted_events:
        action = ev.get("action")
        ev_date_str = ev.get("date")
        if not ev_date_str:
            continue
        if action == "complete":
            try:
                ev_date = date.fromisoformat(ev_date_str)
            except ValueError:
                continue
            due_date = (ev_date + timedelta(days=cadence)).isoformat()
            last_completed = ev_date_str
            last_completed_time = str(ev.get("time") or "") or None
        elif action == "defer":
            new_due = ev.get("new_due_date")
            if new_due:
                due_date = new_due

    try:
        due = date.fromisoformat(due_date)
        days_overdue = (today - due).days
    except ValueError:
        days_overdue = 0

    return {
        "due_date": due_date,
        "last_completed": last_completed,
        "last_completed_time": last_completed_time,
        "days_overdue": days_overdue,
    }


def _chore_event_path(day: str, chore_id: str, action: str) -> Path:
    """Completion is once-per-day-per-chore (idempotent overwrite).
    Defers are counted so multiple defers per day coexist."""
    if action == "complete":
        return CHORES_LOG_DIR / f"{day}--{chore_id}--complete.md"
    n = 1
    while True:
        p = CHORES_LOG_DIR / f"{day}--{chore_id}--defer--{n:02d}.md"
        if not p.exists():
            return p
        n += 1


def _write_chore_event(
    day: str,
    chore: Dict[str, Any],
    action: str,
    new_due_date: Optional[str] = None,
    reason: Optional[str] = None,
    note: Optional[str] = None,
    time: Optional[str] = None,
) -> Path:
    CHORES_LOG_DIR.mkdir(parents=True, exist_ok=True)
    event: Dict[str, Any] = {
        "date": date.fromisoformat(day),
    }
    if time:
        event["time"] = time
    event.update({
        "id": f"chore-{day}-{chore['id']}-{action}",
        "section": "chores",
        "chore_id": chore["id"],
        "chore_name": chore["name"],
        "action": action,
    })
    if action == "defer" and new_due_date:
        event["new_due_date"] = date.fromisoformat(new_due_date)
    if reason:
        event["reason"] = reason
    if note:
        event["note"] = note

    # Preserve `time` across idempotent re-writes (completion for a given
    # day+chore overwrites the same file — without this, re-tapping the same
    # chore twice in a session would overwrite the original timestamp).
    path = _chore_event_path(day, chore["id"], action)
    if action == "complete" and "time" not in event and path.exists():
        try:
            prior = _extract_frontmatter(path.read_text(encoding="utf-8"))
            if prior.get("time"):
                event["time"] = str(prior["time"])
        except Exception:  # noqa: BLE001
            pass
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    atomic_write_text(path, body)
    return path


def _compute_defer_target(current_due_date: str, mode: str) -> str:
    """mode='day' pushes forward by one day (never backwards past today).
    mode='weekend' jumps to next Saturday; if today is already Sat/Sun, it
    skips to the following Saturday per the product spec."""
    today = date.today()
    if mode == "day":
        try:
            base = date.fromisoformat(current_due_date)
        except ValueError:
            base = today
        if base < today:
            base = today
        return (base + timedelta(days=1)).isoformat()
    if mode == "weekend":
        wd = today.weekday()  # Mon=0 .. Sun=6
        if wd == 5:           # Saturday → next Saturday
            offset = 7
        elif wd == 6:         # Sunday → upcoming Saturday (6 days away)
            offset = 6
        else:                 # Mon–Fri → this week's Saturday
            offset = 5 - wd
        return (today + timedelta(days=offset)).isoformat()
    raise HTTPException(status_code=400, detail=f"invalid defer mode: {mode}")


@router.get("/list")
def chores_list() -> Dict[str, Any]:
    """All chores with current state, sorted most-overdue first."""
    defs = _load_chore_definitions()
    events_by_chore: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for ev in _load_chore_events():
        cid = str(ev.get("chore_id") or "")
        if cid:
            events_by_chore[cid].append(ev)

    out: List[Dict[str, Any]] = []
    for c in defs:
        state = _derive_chore_state(c, events_by_chore.get(c["id"], []))
        out.append({**c, **state})
    out.sort(key=lambda x: (-x["days_overdue"], x["due_date"]))
    return {"chores": out, "total": len(out), "today": date.today().isoformat()}


@router.post("/complete")
async def chores_complete(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    chore_id = str(payload.get("chore_id") or "").strip()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    note = payload.get("note")
    if not chore_id:
        raise HTTPException(status_code=400, detail="chore_id is required")
    defs_by_id = {c["id"]: c for c in _load_chore_definitions()}
    if chore_id not in defs_by_id:
        raise HTTPException(status_code=404, detail=f"unknown chore: {chore_id}")
    # Stamp wall-clock only when completing a chore on today's date. Time-
    # travelled completions (via ?date=) stay time-less. Client may pass
    # explicit `time` (HH:MM) to override.
    client_time = str(payload.get("time") or "").strip() or None
    today_iso = date.today().isoformat()
    time_val = client_time or (datetime.now().strftime("%H:%M") if day == today_iso else None)
    _write_chore_event(day, defs_by_id[chore_id], "complete", note=note, time=time_val)
    return {"ok": True, "date": day, "chore_id": chore_id, "action": "complete"}


@router.post("/defer")
async def chores_defer(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    chore_id = str(payload.get("chore_id") or "").strip()
    mode = str(payload.get("mode") or "").strip().lower()
    if not chore_id:
        raise HTTPException(status_code=400, detail="chore_id is required")
    if mode not in ("day", "weekend"):
        raise HTTPException(status_code=400, detail="mode must be 'day' or 'weekend'")
    defs_by_id = {c["id"]: c for c in _load_chore_definitions()}
    if chore_id not in defs_by_id:
        raise HTTPException(status_code=404, detail=f"unknown chore: {chore_id}")

    events_for_chore = [
        e for e in _load_chore_events()
        if str(e.get("chore_id") or "") == chore_id
    ]
    current_state = _derive_chore_state(defs_by_id[chore_id], events_for_chore)
    today = date.today().isoformat()
    new_due = _compute_defer_target(current_state["due_date"], mode)

    _write_chore_event(today, defs_by_id[chore_id], "defer", new_due_date=new_due, reason=mode)
    return {
        "ok": True,
        "date": today,
        "chore_id": chore_id,
        "action": "defer",
        "mode": mode,
        "new_due_date": new_due,
    }


@router.put("/definitions/{chore_id}")
async def chores_update_definition(chore_id: str, request: Request) -> Dict[str, Any]:
    """Update an existing chore definition. Body accepts any of: name,
    cadence_days, emoji. The id and section are preserved — to rename the
    id, delete and recreate (log entries reference the old id)."""
    payload = await request.json()
    path = CHORES_DEFS_DIR / f"{chore_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"unknown chore: {chore_id}")

    raw = path.read_text(encoding="utf-8")
    try:
        fm = _extract_frontmatter(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"definition failed to parse: {exc}")

    if "name" in payload:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        fm["name"] = name
    if "cadence_days" in payload:
        try:
            cadence = int(payload.get("cadence_days") or 0)
        except (TypeError, ValueError):
            cadence = 0
        if cadence <= 0:
            raise HTTPException(status_code=400, detail="cadence_days must be a positive integer")
        fm["cadence_days"] = cadence
    if "emoji" in payload:
        emoji = str(payload.get("emoji") or "").strip()
        fm["emoji"] = emoji or "🧽"

    m = FRONTMATTER_RE.match(raw)
    existing_body = raw[m.end():].strip() if m else ""

    ordered = {
        "id": chore_id,
        "name": str(fm.get("name") or ""),
        "cadence_days": int(fm.get("cadence_days") or 0),
        "emoji": str(fm.get("emoji") or "🧽"),
        "section": "chores",
    }
    out = "---\n" + yaml.safe_dump(ordered, sort_keys=False, allow_unicode=True) + "---\n"
    if existing_body:
        out += "\n" + existing_body + "\n"
    atomic_write_text(path, out)
    return {"ok": True, **ordered}


@router.post("/definitions")
async def chores_create_definition(request: Request) -> Dict[str, Any]:
    """Create a new chore by writing a note to Chores/Definitions/.
    Body: {name, cadence_days, emoji?, id?}. If id is omitted it's slugified
    from name. Fails with 409 if the id is already taken."""
    payload = await request.json()
    name = str(payload.get("name") or "").strip()
    try:
        cadence = int(payload.get("cadence_days") or 0)
    except (TypeError, ValueError):
        cadence = 0
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if cadence <= 0:
        raise HTTPException(status_code=400, detail="cadence_days must be a positive integer")

    raw_id = str(payload.get("id") or "").strip() or _slugify(name)
    chore_id = raw_id.lower()
    if not chore_id or not re.match(r"^[a-z0-9][a-z0-9_-]*$", chore_id):
        raise HTTPException(status_code=400, detail="invalid id — use lowercase letters, numbers, dashes")

    emoji = str(payload.get("emoji") or "").strip() or "🧽"

    CHORES_DEFS_DIR.mkdir(parents=True, exist_ok=True)
    path = CHORES_DEFS_DIR / f"{chore_id}.md"
    if path.exists():
        raise HTTPException(status_code=409, detail=f"chore already exists: {chore_id}")

    frontmatter = {
        "id": chore_id,
        "name": name,
        "cadence_days": cadence,
        "emoji": emoji,
        "section": "chores",
    }
    body = "---\n" + yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True) + "---\n"
    atomic_write_text(path, body)

    return {"ok": True, "id": chore_id, "name": name, "cadence_days": cadence}


@router.delete("/definitions/{chore_id}")
def chores_delete_definition(chore_id: str) -> Dict[str, Any]:
    """Delete the chore definition file. Historical log events that reference
    the id are left intact — they surface as orphans, but no longer as chores."""
    path = CHORES_DEFS_DIR / f"{chore_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"unknown chore: {chore_id}")
    path.unlink()
    return {"ok": True, "id": chore_id}


@router.get("/history")
def chores_history(days: int = 30) -> Dict[str, Any]:
    """Daily completion counts for the last N days."""
    total = len(_load_chore_definitions())
    completions_by_day: Dict[str, int] = defaultdict(int)
    for ev in _load_chore_events():
        if ev.get("action") == "complete" and ev.get("date"):
            completions_by_day[ev["date"]] += 1
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        out.append({"date": d, "completed": completions_by_day.get(d, 0), "total": total})
    return {"daily": out, "total": total}
