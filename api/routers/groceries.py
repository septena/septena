"""Groceries API backed by the shared groceries service."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api.services import groceries as groceries_service

router = APIRouter(prefix="/api/groceries", tags=["groceries"])

CATEGORIES = groceries_service.CATEGORIES


@router.get("")
def groceries_list() -> Dict[str, Any]:
    return groceries_service.load_items()


@router.post("/item")
async def groceries_add(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    category = str(payload.get("category", "other")).strip() or "other"
    emoji = str(payload.get("emoji", "📦")).strip() or "📦"
    return groceries_service.add_item(name=name, category=category, emoji=emoji)


@router.patch("/item/{item_id}")
async def groceries_patch(item_id: str, request: Request) -> Dict[str, Any]:
    payload = await request.json()
    try:
        return groceries_service.patch_item(item_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="item not found") from None


@router.get("/history")
def groceries_history(days: int = 30) -> Dict[str, Any]:
    return groceries_service.history(days=days)


@router.delete("/item/{item_id}")
def groceries_delete(item_id: str) -> Dict[str, Any]:
    try:
        return groceries_service.delete_item(item_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="item not found") from None
