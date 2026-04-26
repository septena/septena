"""Supplements API backed by the shared supplements service."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api.parsing import _normalize_date
from api.services import supplements as supplements_service

router = APIRouter(prefix="/api/supplements", tags=["supplements"])


@router.get("/config")
def supplements_config() -> Dict[str, Any]:
    supplements = supplements_service.load_supplements_config()
    return {"supplements": supplements, "total": len(supplements)}


@router.get("/day/{day}")
def supplements_day(day: str) -> Dict[str, Any]:
    return supplements_service.supplements_day(day)


@router.post("/toggle")
async def supplements_toggle(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    supplement_id = str(payload.get("supplement_id") or "").strip()
    done = bool(payload.get("done"))
    if not supplement_id:
        raise HTTPException(status_code=400, detail="supplement_id is required")
    try:
        return supplements_service.toggle_supplement(
            day=day,
            supplement_id=supplement_id,
            done=done,
            time=str(payload.get("time") or "").strip() or None,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown supplement: {supplement_id}") from None


@router.post("/new")
async def supplements_new(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    name = str(payload.get("name") or "").strip()
    emoji = str(payload.get("emoji") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    return supplements_service.add_supplement(name=name, emoji=emoji)


@router.put("/update")
async def supplements_update(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    supplement_id = str(payload.get("id") or "").strip()
    if not supplement_id:
        raise HTTPException(status_code=400, detail="id is required")
    try:
        return supplements_service.update_supplement(
            supplement_id=supplement_id,
            name=str(payload.get("name") or "").strip() or None,
            emoji=str(payload.get("emoji")) if "emoji" in payload else None,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="supplements-config.yaml not found") from None
    except KeyError:
        raise HTTPException(status_code=404, detail=f"supplement not found: {supplement_id}") from None


@router.delete("/delete/{supplement_id}")
def supplements_delete(supplement_id: str) -> Dict[str, Any]:
    try:
        return supplements_service.delete_supplement(supplement_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="supplements-config.yaml not found") from None
    except KeyError:
        raise HTTPException(status_code=404, detail=f"supplement not found: {supplement_id}") from None


@router.get("/history")
def supplements_history(days: int = 30) -> Dict[str, Any]:
    return supplements_service.supplements_history(days=days)


@router.get("/history-by-id")
def supplements_history_by_id(days: int = 30) -> Dict[str, Any]:
    return supplements_service.supplements_history_by_id(days=days)


@router.get("/range")
def supplements_range(days: int = 14) -> Dict[str, Any]:
    return supplements_service.supplements_range(days=days)
