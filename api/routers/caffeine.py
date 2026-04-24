"""Caffeine API backed by the shared caffeine service."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api.parsing import _normalize_date, _normalize_number
from api.services import caffeine as caffeine_service

router = APIRouter(prefix="/api/caffeine", tags=["caffeine"])


@router.get("/config")
def caffeine_config() -> Dict[str, Any]:
    return caffeine_service.load_caffeine_config()


@router.get("/day/{day}")
def caffeine_day(day: str) -> Dict[str, Any]:
    return caffeine_service.day_summary(day)


@router.post("/entry")
async def caffeine_add_entry(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    time_str = str(payload.get("time", "")).strip()
    method = str(payload.get("method", "v60")).strip() or "v60"
    beans_raw = str(payload.get("beans", "")).strip()
    beans = beans_raw if beans_raw and beans_raw.lower() != "none" else None
    grams = _normalize_number(payload.get("grams"))
    note = str(payload.get("notes", "")).strip() or None
    if not time_str:
        raise HTTPException(status_code=400, detail="time is required")

    record = {
        "date": day,
        "time": time_str,
        "id": str(uuid.uuid4())[:8],
        "section": "caffeine",
        "method": method,
        "beans": beans,
        "grams": grams if grams is not None and grams > 0 else None,
        "note": note,
        "created_at": datetime.now().isoformat(),
    }
    record = caffeine_service.add_entry(record)
    return {"ok": True, "entry": record}


@router.put("/entry/{entry_id}")
async def caffeine_update_entry(request: Request, entry_id: str) -> Dict[str, Any]:
    """Edit a logged caffeine entry. Mutable: time, method, beans, grams, note."""
    params = dict(request.query_params)
    day = _normalize_date(params.get("date")) or date.today().isoformat()
    payload = await request.json()
    updated = caffeine_service.update_entry(entry_id, day, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="entry not found")
    return {"ok": True, "entry": updated}


@router.delete("/entry/{entry_id}")
async def caffeine_delete_entry(request: Request, entry_id: str) -> Dict[str, Any]:
    params = dict(request.query_params)
    day = _normalize_date(params.get("date")) or date.today().isoformat()
    caffeine_service.delete_entry(entry_id, day=day)
    return {"ok": True}


@router.get("/history")
def caffeine_history(days: int = 30) -> Dict[str, Any]:
    return caffeine_service.history(days=days)


@router.get("/sessions")
def caffeine_sessions(days: int = 30) -> Dict[str, Any]:
    return caffeine_service.sessions(days=days)
