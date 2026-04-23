"""Habits API backed by the shared habits service."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api.parsing import _normalize_date
from api.services import habits as habits_service
from api.services.settings_store import load_day_phases

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _phase_ids() -> tuple[str, ...]:
    return tuple(phase["id"] for phase in load_day_phases())


@router.get("/config")
def habits_config() -> Dict[str, Any]:
    habits = habits_service.load_habits_config()
    phases = _phase_ids()
    grouped: Dict[str, list[Dict[str, Any]]] = {bucket: [] for bucket in phases}
    for habit in habits:
        grouped.setdefault(habit["bucket"], []).append(habit)
    return {"buckets": list(phases), "grouped": grouped, "total": len(habits)}


@router.get("/day/{day}")
def habits_day(day: str) -> Dict[str, Any]:
    return habits_service.habits_day(day)


@router.post("/toggle")
async def habits_toggle(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    habit_id = str(payload.get("habit_id") or "").strip()
    done = bool(payload.get("done"))
    if not habit_id:
        raise HTTPException(status_code=400, detail="habit_id is required")
    try:
        return habits_service.toggle_habit(
            day=day,
            habit_id=habit_id,
            done=done,
            time=str(payload.get("time") or "").strip() or None,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown habit: {habit_id}") from None


@router.post("/new")
async def habits_new(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    name = str(payload.get("name") or "").strip()
    phases = _phase_ids()
    fallback = phases[0] if phases else "morning"
    bucket = str(payload.get("bucket") or fallback).strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if bucket not in phases:
        raise HTTPException(status_code=400, detail=f"bucket must be one of {phases}")
    return habits_service.add_habit(name=name, bucket=bucket)


@router.put("/update")
async def habits_update(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    habit_id = str(payload.get("id") or "").strip()
    name = str(payload.get("name") or "").strip()
    bucket = str(payload.get("bucket") or "").strip().lower()
    if not habit_id:
        raise HTTPException(status_code=400, detail="id is required")
    phases = _phase_ids()
    if bucket and bucket not in phases:
        raise HTTPException(status_code=400, detail=f"bucket must be one of {phases}")
    try:
        return habits_service.update_habit(habit_id=habit_id, name=name, bucket=bucket)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="habits-config.yaml not found") from None
    except KeyError:
        raise HTTPException(status_code=404, detail=f"habit not found: {habit_id}") from None


@router.delete("/delete/{habit_id}")
def habits_delete(habit_id: str) -> Dict[str, Any]:
    try:
        return habits_service.delete_habit(habit_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="habits-config.yaml not found") from None
    except KeyError:
        raise HTTPException(status_code=404, detail=f"habit not found: {habit_id}") from None


@router.get("/history")
def habits_history(days: int = 30) -> Dict[str, Any]:
    return habits_service.habits_history(days=days)
