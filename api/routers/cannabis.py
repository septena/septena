"""Cannabis — per-event logging with a capsule model.

A "capsule" is a single dose-unit (~0.15g) shared across ~3 uses. Vape
sessions inherit the active capsule's strain and bump its use count;
edibles are standalone. Capsule state lives in Log/_capsules.yaml so
session files stay self-describing.
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
from api.cache import parse_dir_cached
from api.io import atomic_write_text
from api.parsing import _extract_frontmatter, _normalize_date, _normalize_number
from api.paths import (
    CANNABIS_CAPSULE_STATE_PATH,
    CANNABIS_CONFIG_PATH,
    CANNABIS_DIR,
)

# Default capsule model — overridden by cannabis-config.yaml if present.
DEFAULT_CAPSULE_G = 0.15
DEFAULT_USES_PER_CAPSULE = 3

router = APIRouter(prefix="/api/cannabis", tags=["cannabis"])


def _load_cannabis_config() -> Dict[str, Any]:
    """Return the full cannabis config: strains + capsule model."""
    out: Dict[str, Any] = {
        "strains": [],
        "capsule_g": DEFAULT_CAPSULE_G,
        "uses_per_capsule": DEFAULT_USES_PER_CAPSULE,
    }
    if not CANNABIS_CONFIG_PATH.exists():
        return out
    try:
        raw = CANNABIS_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("cannabis-config.yaml failed to parse: %s", exc)
        return out
    strains = data.get("strains") or []
    out["strains"] = [
        {"id": str(s.get("id", "")), "name": str(s.get("name", ""))}
        for s in strains
        if s.get("id")
    ]
    cg = _normalize_number(data.get("capsule_g"))
    if cg and cg > 0:
        out["capsule_g"] = cg
    upc = _normalize_number(data.get("uses_per_capsule"))
    if upc and upc > 0:
        out["uses_per_capsule"] = upc
    return out


def _grams_per_use() -> float:
    cfg = _load_cannabis_config()
    return cfg["capsule_g"] / cfg["uses_per_capsule"]


def _load_capsule_state() -> Dict[str, Any]:
    """Load capsule state: {active: capsule | null}. Active capsule schema:
    {id, strain, started_at, use_count}."""
    if not CANNABIS_CAPSULE_STATE_PATH.exists():
        return {"active": None}
    try:
        raw = CANNABIS_CAPSULE_STATE_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("cannabis _capsules.yaml failed to parse: %s", exc)
        return {"active": None}
    active = data.get("active")
    if not isinstance(active, dict):
        active = None
    return {"active": active}


def _save_capsule_state(state: Dict[str, Any]) -> None:
    CANNABIS_DIR.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(state, sort_keys=False, allow_unicode=True)
    atomic_write_text(CANNABIS_CAPSULE_STATE_PATH, body)


def _cannabis_event_file(day: str, method: str, nn: int) -> Path:
    return CANNABIS_DIR / f"{day}--{method}--{nn:02d}.md"


def _parse_cannabis_event(p: Path) -> Dict[str, Any] | None:
    try:
        fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("cannabis event %s failed to parse: %s", p.name, exc)
        return None
    if not fm:
        return None
    fm["_day"] = p.name.split("--", 1)[0]
    return fm


def _load_cannabis_events(day: str) -> List[Dict[str, Any]]:
    """Per-event files for the given day, served from the mtime cache.
    `_capsules.yaml` is skipped — its stem doesn't have the ``--`` prefix."""
    return [
        e for e in parse_dir_cached(CANNABIS_DIR, "*.md", _parse_cannabis_event)
        if e.get("_day") == day
    ]


def _next_cannabis_nn(day: str, method: str) -> int:
    """Next NN for same-day same-method events. Parses the ``--NN.md`` tail
    of existing filenames so the sequence survives deletions."""
    nns: List[int] = []
    for p in CANNABIS_DIR.glob(f"{day}--{method}--*.md"):
        parts = p.stem.split("--")
        if len(parts) == 3:
            try:
                nns.append(int(parts[2]))
            except ValueError:
                pass
    return max(nns) + 1 if nns else 1


def _write_cannabis_event(path: Path, event: Dict[str, Any]) -> None:
    CANNABIS_DIR.mkdir(parents=True, exist_ok=True)
    # Normalise `date` to a real date() so YAML dumps it bare.
    if isinstance(event.get("date"), str):
        try:
            event["date"] = date.fromisoformat(event["date"])
        except ValueError:
            pass
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    atomic_write_text(path, body)


def _delete_cannabis_event_by_id(entry_id: str, day: Optional[str] = None) -> bool:
    """Find the event file whose frontmatter `id` matches and unlink it.
    Scoped to a single day if provided; otherwise scans the whole dir."""
    pattern = f"{day}--*.md" if day else "*.md"
    for p in CANNABIS_DIR.glob(pattern):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        if str(fm.get("id", "")) == entry_id:
            p.unlink()
            return True
    return False


def _total_grams(entries: List[Dict[str, Any]]) -> float:
    """Sum per-entry stored grams. Edibles have grams=null and are skipped."""
    total = 0.0
    for e in entries:
        g = _normalize_number(e.get("grams"))
        if g and g > 0:
            total += g
    return round(total, 3)


@router.get("/config")
def cannabis_config() -> Dict[str, Any]:
    return _load_cannabis_config()


@router.get("/day/{day}")
def cannabis_day(day: str) -> Dict[str, Any]:
    """Return entries for the day + daily totals."""
    events = sorted(_load_cannabis_events(day), key=lambda e: str(e.get("time", "")))
    total_g = _total_grams(events)
    method_counts: Dict[str, int] = {"vape": 0, "edible": 0}
    for e in events:
        m = str(e.get("method", "vape"))
        if m in method_counts:
            method_counts[m] += 1
    return {
        "date": day,
        "entries": events,
        "total_g": total_g,
        "session_count": len(events),
        "methods": method_counts,
        "capsule": _load_capsule_state(),
    }


@router.post("/entry")
async def cannabis_add_entry(request: Request) -> Dict[str, Any]:
    """Body: {date, time, method, notes, effect}. Strain is inherited from
    the active capsule — the client does not pass it anymore. Vape sessions
    increment the active capsule's use_count; edibles don't touch it.
    Grams is snapshotted per-entry from current config at write time so
    historical entries stay stable when the capsule model changes."""
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    time_str = str(payload.get("time", "")).strip()
    method = str(payload.get("method", "vape")).strip() or "vape"
    notes = str(payload.get("notes", "")).strip() or None
    effect = str(payload.get("effect", "")).strip() or None

    if not time_str:
        raise HTTPException(status_code=400, detail="time is required")

    state = _load_capsule_state()
    active = state.get("active")
    if method == "vape" and not active:
        raise HTTPException(status_code=400, detail="no_active_capsule")

    strain = active["strain"] if active else None
    capsule_id = active["id"] if active else None
    grams = round(_grams_per_use(), 3) if method == "vape" else None

    entry_id = str(uuid.uuid4())[:8]
    nn = _next_cannabis_nn(day, method)
    event = {
        "date": day,
        "time": time_str,
        "id": entry_id,
        "section": "cannabis",
        "method": method,
        "strain": strain,
        "grams": grams,
        "capsule_id": capsule_id,
        "effect": effect,
        "note": notes,
        "created_at": datetime.now().isoformat(),
    }
    _write_cannabis_event(_cannabis_event_file(day, method, nn), event)

    if method == "vape" and active:
        active["use_count"] = int(active.get("use_count", 0)) + 1
        _save_capsule_state({"active": active})

    return {"ok": True, "entry": event}


@router.get("/capsule/active")
def cannabis_active_capsule() -> Dict[str, Any]:
    state = _load_capsule_state()
    cfg = _load_cannabis_config()
    return {
        "active": state.get("active"),
        "uses_per_capsule": cfg["uses_per_capsule"],
    }


@router.post("/capsule/start")
async def cannabis_start_capsule(request: Request) -> Dict[str, Any]:
    """Body: {strain?}. Starts a fresh capsule. If another is active, it's
    ended (discarded) — its sessions remain in day logs with their capsule_id.
    """
    payload = await request.json()
    strain_raw = str(payload.get("strain", "")).strip()
    strain = strain_raw if strain_raw and strain_raw.lower() != "none" else None
    new_capsule = {
        "id": "cap-" + str(uuid.uuid4())[:8],
        "strain": strain,
        "started_at": datetime.now().isoformat(),
        "use_count": 0,
    }
    _save_capsule_state({"active": new_capsule})
    return {"ok": True, "active": new_capsule}


@router.post("/capsule/end")
async def cannabis_end_capsule() -> Dict[str, Any]:
    """End the currently active capsule. No-op if none active."""
    _save_capsule_state({"active": None})
    return {"ok": True}


@router.delete("/entry/{entry_id}")
async def cannabis_delete_entry(request: Request, entry_id: str) -> Dict[str, Any]:
    """Delete entry from a specific day. Day defaults to today."""
    params = dict(request.query_params)
    day = _normalize_date(params.get("date")) or date.today().isoformat()
    _delete_cannabis_event_by_id(entry_id, day)
    return {"ok": True}


@router.get("/history")
def cannabis_history(days: int = 30) -> Dict[str, Any]:
    """Daily session counts and gram totals for the last N days."""
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        events = _load_cannabis_events(d)
        out.append({
            "date": d,
            "sessions": len(events),
            "total_g": _total_grams(events),
        })
    return {"daily": out}


@router.get("/sessions")
def cannabis_sessions(days: int = 30) -> Dict[str, Any]:
    """Flat list of every entry from the last N days for time-of-day analysis.

    Each item includes date, time, method, amount, and a derived `hour` float
    (0.0–24.0) so the frontend can plot it directly on a scatter axis.
    """
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        for e in _load_cannabis_events(d):
            time_str = str(e.get("time", "")).strip()
            if not time_str:
                continue
            parts = time_str.split(":")
            try:
                hh = int(parts[0])
                mm = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                continue
            hour = hh + mm / 60.0
            strain = e.get("strain")
            out.append({
                "date": d,
                "time": time_str,
                "hour": round(hour, 3),
                "method": e.get("method", "vape"),
                "strain": strain if isinstance(strain, str) and strain else None,
            })
    return {"sessions": out}
