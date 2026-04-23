"""Settings API backed by the shared settings store."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api.services.settings_store import (
    DEFAULT_SETTINGS,
    load_day_phases,
    load_settings,
    load_targets,
    save_settings_patch,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Compatibility exports for callers that still import from this module.
_load_settings = load_settings


@router.get("")
def settings_get() -> Dict[str, Any]:
    return load_settings()


@router.put("")
async def settings_put(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings must be a JSON object")
    return save_settings_patch(payload)


__all__ = [
    "DEFAULT_SETTINGS",
    "_load_settings",
    "load_day_phases",
    "load_targets",
    "router",
]
