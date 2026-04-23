"""Gut — per-event logging of bowel movements with Bristol scale, blood
level, and an editable discomfort window. Discomfort is a pair of
timestamps (start/end); duration is derived. Entries can be edited later
to mark when discomfort ended.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.io import atomic_write_text
from api.parsing import _extract_frontmatter, _normalize_date
from api.paths import GUT_CONFIG_PATH, GUT_DIR

router = APIRouter(prefix="/api/gut", tags=["gut"])


def _load_gut_config() -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "bristol": [{"id": i, "label": f"Type {i}", "description": ""} for i in range(1, 8)],
        "blood": [
            {"id": 0, "label": "None"},
            {"id": 1, "label": "Trace"},
            {"id": 2, "label": "Visible"},
        ],
    }
    if not GUT_CONFIG_PATH.exists():
        return out
    try:
        raw = GUT_CONFIG_PATH.read_text(encoding="utf-8")
        data = _extract_frontmatter(raw) or yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("gut-config.yaml failed to parse: %s", exc)
        return out
    if isinstance(data.get("bristol"), list):
        out["bristol"] = [
            {
                "id": int(b.get("id", 0)),
                "label": str(b.get("label", "")),
                "description": str(b.get("description", "")),
            }
            for b in data["bristol"]
            if isinstance(b, dict) and b.get("id") is not None
        ]
    if isinstance(data.get("blood"), list):
        out["blood"] = [
            {"id": int(b.get("id", 0)), "label": str(b.get("label", ""))}
            for b in data["blood"]
            if isinstance(b, dict) and b.get("id") is not None
        ]
    return out


def _event_file(day: str, nn: int) -> Path:
    return GUT_DIR / f"{day}--{nn:02d}.md"


def _load_events(day: str) -> List[Dict[str, Any]]:
    if not GUT_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for p in sorted(GUT_DIR.glob(f"{day}--*.md")):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("gut event %s failed to parse: %s", p.name, exc)
            continue
        if fm:
            fm["_file"] = p.name
            out.append(fm)
    return out


def _next_nn(day: str) -> int:
    nns: List[int] = []
    for p in GUT_DIR.glob(f"{day}--*.md"):
        parts = p.stem.split("--")
        if len(parts) == 2:
            try:
                nns.append(int(parts[1]))
            except ValueError:
                pass
    return max(nns) + 1 if nns else 1


def _write_event(path: Path, event: Dict[str, Any]) -> None:
    GUT_DIR.mkdir(parents=True, exist_ok=True)
    event = {k: v for k, v in event.items() if not k.startswith("_")}
    if isinstance(event.get("date"), str):
        try:
            event["date"] = date.fromisoformat(event["date"])
        except ValueError:
            pass
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    atomic_write_text(path, body)


def _find_by_id(entry_id: str, day: Optional[str] = None) -> Optional[Path]:
    pattern = f"{day}--*.md" if day else "*.md"
    for p in GUT_DIR.glob(pattern):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        if str(fm.get("id", "")) == entry_id:
            return p
    return None


def _hours_between(start: Optional[str], end: Optional[str]) -> Optional[float]:
    if not start or not end:
        return None
    try:
        a = datetime.fromisoformat(start)
        b = datetime.fromisoformat(end)
    except ValueError:
        return None
    delta = (b - a).total_seconds() / 3600.0
    return round(max(delta, 0.0), 2)


def _with_derived(event: Dict[str, Any]) -> Dict[str, Any]:
    event["discomfort_hours"] = _hours_between(
        event.get("discomfort_start"), event.get("discomfort_end")
    )
    event["discomfort_open"] = bool(event.get("discomfort_start")) and not event.get(
        "discomfort_end"
    )
    return event


def _coerce_int_in(value: Any, allowed: set[int], default: int) -> int:
    try:
        i = int(value)
    except (TypeError, ValueError):
        return default
    return i if i in allowed else default


@router.get("/config")
def gut_config() -> Dict[str, Any]:
    return _load_gut_config()


@router.get("/day/{day}")
def gut_day(day: str) -> Dict[str, Any]:
    events = sorted(_load_events(day), key=lambda e: str(e.get("time", "")))
    events = [_with_derived(e) for e in events]
    bristol_counts: Dict[int, int] = {}
    blood_flag = 0
    total_discomfort = 0.0
    open_discomfort = 0
    for e in events:
        b = _coerce_int_in(e.get("bristol"), set(range(1, 8)), 4)
        bristol_counts[b] = bristol_counts.get(b, 0) + 1
        blood = _coerce_int_in(e.get("blood"), {0, 1, 2}, 0)
        if blood > blood_flag:
            blood_flag = blood
        if e.get("discomfort_hours") is not None:
            total_discomfort += float(e["discomfort_hours"])
        if e.get("discomfort_open"):
            open_discomfort += 1
    return {
        "date": day,
        "entries": events,
        "movement_count": len(events),
        "bristol_counts": bristol_counts,
        "max_blood": blood_flag,
        "total_discomfort_h": round(total_discomfort, 2) if total_discomfort else 0.0,
        "open_discomfort": open_discomfort,
    }


@router.post("/entry")
async def gut_add_entry(request: Request) -> Dict[str, Any]:
    """Body: {date, time, bristol, blood?, discomfort?, note?}
    `discomfort` is a bool — when true, discomfort_start defaults to the
    entry timestamp and discomfort_end is left null (mark resolved later
    via PUT /entry/{id}).
    """
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    time_str = str(payload.get("time", "")).strip()
    if not time_str:
        raise HTTPException(status_code=400, detail="time is required")

    bristol = _coerce_int_in(payload.get("bristol"), set(range(1, 8)), 4)
    blood = _coerce_int_in(payload.get("blood"), {0, 1, 2}, 0)
    note = str(payload.get("note") or "").strip() or None

    discomfort = bool(payload.get("discomfort"))
    start_iso: Optional[str] = None
    end_iso: Optional[str] = None
    if discomfort:
        start_iso = f"{day}T{time_str}"
    # Explicit overrides if the caller provided timestamps.
    if payload.get("discomfort_start"):
        start_iso = str(payload["discomfort_start"])
    if payload.get("discomfort_end"):
        end_iso = str(payload["discomfort_end"])

    entry_id = str(uuid.uuid4())[:8]
    nn = _next_nn(day)
    event = {
        "date": day,
        "time": time_str,
        "id": entry_id,
        "section": "gut",
        "bristol": bristol,
        "blood": blood,
        "discomfort_start": start_iso,
        "discomfort_end": end_iso,
        "note": note,
        "created_at": datetime.now().isoformat(),
    }
    _write_event(_event_file(day, nn), event)
    return {"ok": True, "entry": _with_derived(event)}


@router.put("/entry/{entry_id}")
async def gut_update_entry(request: Request, entry_id: str) -> Dict[str, Any]:
    """Edit an entry. Any subset of fields may be supplied:
    {time, bristol, blood, discomfort_start, discomfort_end, note}.
    Pass `discomfort_end: "now"` to stamp the current moment.
    """
    params = dict(request.query_params)
    day = _normalize_date(params.get("date"))
    path = _find_by_id(entry_id, day)
    if path is None:
        raise HTTPException(status_code=404, detail="entry not found")

    existing = _extract_frontmatter(path.read_text(encoding="utf-8"))
    payload = await request.json()

    if "time" in payload:
        t = str(payload["time"]).strip()
        if t:
            existing["time"] = t
    if "bristol" in payload:
        existing["bristol"] = _coerce_int_in(
            payload["bristol"], set(range(1, 8)), int(existing.get("bristol", 4))
        )
    if "blood" in payload:
        existing["blood"] = _coerce_int_in(
            payload["blood"], {0, 1, 2}, int(existing.get("blood", 0))
        )
    if "note" in payload:
        n = str(payload["note"] or "").strip()
        existing["note"] = n or None
    # Sanitize legacy rows that captured the literal "None" string.
    if existing.get("note") in ("None", "none"):
        existing["note"] = None
    if "discomfort_start" in payload:
        v = payload["discomfort_start"]
        existing["discomfort_start"] = str(v) if v else None
    if "discomfort_end" in payload:
        v = payload["discomfort_end"]
        if v == "now":
            existing["discomfort_end"] = datetime.now().replace(microsecond=0).isoformat(
                timespec="minutes"
            )
        else:
            existing["discomfort_end"] = str(v) if v else None
    existing["updated_at"] = datetime.now().isoformat()
    _write_event(path, existing)
    return {"ok": True, "entry": _with_derived(existing)}


@router.delete("/entry/{entry_id}")
async def gut_delete_entry(request: Request, entry_id: str) -> Dict[str, Any]:
    params = dict(request.query_params)
    day = _normalize_date(params.get("date"))
    path = _find_by_id(entry_id, day)
    if path is None:
        return {"ok": True}
    path.unlink()
    return {"ok": True}


@router.get("/history")
def gut_history(days: int = 30) -> Dict[str, Any]:
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        events = [_with_derived(e) for e in _load_events(d)]
        movements = len(events)
        bristol_sum = 0
        bristol_n = 0
        blood_flag = 0
        discomfort_h = 0.0
        for e in events:
            b = _coerce_int_in(e.get("bristol"), set(range(1, 8)), 0)
            if b:
                bristol_sum += b
                bristol_n += 1
            blood = _coerce_int_in(e.get("blood"), {0, 1, 2}, 0)
            if blood > blood_flag:
                blood_flag = blood
            if e.get("discomfort_hours") is not None:
                discomfort_h += float(e["discomfort_hours"])
        out.append({
            "date": d,
            "movements": movements,
            "avg_bristol": round(bristol_sum / bristol_n, 2) if bristol_n else None,
            "max_blood": blood_flag,
            "discomfort_h": round(discomfort_h, 2),
        })
    return {"daily": out}
