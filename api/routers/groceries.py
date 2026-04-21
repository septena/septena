"""Groceries — smart checklist with low-stock tracking.

Data lives in Groceries/groceries.yaml. A grocery item has:
  low:         true → running short, need to buy
  last_bought: ISO date stamped when low flips true → false
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date
from api.paths import GROCERIES_DIR, GROCERIES_LOG_DIR, GROCERIES_PATH

router = APIRouter(prefix="/api/groceries", tags=["groceries"])

CATEGORIES = ["produce", "dairy", "grains", "meat", "frozen", "household", "other"]


def _load() -> Dict[str, Any]:
    if not GROCERIES_PATH.exists():
        return {"items": []}
    try:
        return yaml.safe_load(GROCERIES_PATH.read_text()) or {"items": []}
    except Exception as exc:  # noqa: BLE001
        logger.warning("groceries.yaml failed to parse: %s", exc)
        return {"items": []}


def _save(data: Dict[str, Any]) -> None:
    GROCERIES_DIR.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    GROCERIES_PATH.write_text(body, encoding="utf-8")


def _norm(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise field types after loading."""
    items = []
    for it in data.get("items", []):
        last_bought = it.get("last_bought")
        items.append({
            "id": str(it.get("id", "")),
            "name": str(it.get("name", "")),
            "category": str(it.get("category", "other")),
            "emoji": str(it.get("emoji", "📦")),
            "low": bool(it.get("low", False)),
            "last_bought": str(last_bought) if last_bought else None,
        })
    return {"items": items}


@router.get("")
def groceries_list() -> Dict[str, Any]:
    return _norm(_load())


@router.post("/item")
async def groceries_add(request: Request) -> Dict[str, Any]:
    """Body: {name, category?, emoji?}. Adds a new grocery item."""
    payload = await request.json()
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    data = _load()
    new_item = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "category": str(payload.get("category", "other")).strip() or "other",
        "emoji": str(payload.get("emoji", "📦")).strip() or "📦",
        "low": False,
        "last_bought": None,
    }
    data.setdefault("items", []).append(new_item)
    _save(data)
    return new_item


def _write_toggle_event(item: Dict[str, Any], action: str) -> None:
    """Append a per-toggle event file so history can be replayed.

    action is "needed" (low flipped true) or "bought" (low flipped false).
    NN suffix disambiguates multiple toggles of the same item on one day.
    """
    GROCERIES_LOG_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today()
    now = datetime.now()
    n = 1
    while True:
        path = GROCERIES_LOG_DIR / f"{today.isoformat()}--{item.get('id')}--{action}--{n:02d}.md"
        if not path.exists():
            break
        n += 1
    event = {
        "date": today,
        "time": now.strftime("%H:%M"),
        "id": f"grocery-{today.isoformat()}-{item.get('id')}-{action}-{n:02d}",
        "section": "groceries",
        "item_id": str(item.get("id", "")),
        "item_name": str(item.get("name", "")),
        "category": str(item.get("category", "other")),
        "action": action,
    }
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    path.write_text(body, encoding="utf-8")


@router.patch("/item/{item_id}")
async def groceries_patch(item_id: str, request: Request) -> Dict[str, Any]:
    """Body: partial fields {low?, name?, category?, emoji?}. Updates one item.

    When `low` flips, stamps `last_bought` (on true→false) and writes a
    toggle event to Log/ so history can be reconstructed per day.
    """
    payload = await request.json()
    data = _load()
    for it in data.get("items", []):
        if it.get("id") == item_id:
            if "low" in payload:
                new_low = bool(payload["low"])
                prev_low = bool(it.get("low"))
                if prev_low and not new_low:
                    it["last_bought"] = date.today().isoformat()
                    _write_toggle_event(it, "bought")
                elif new_low and not prev_low:
                    _write_toggle_event(it, "needed")
                it["low"] = new_low
            if "name" in payload:
                it["name"] = str(payload["name"]).strip()
            if "category" in payload:
                it["category"] = str(payload["category"]).strip() or "other"
            if "emoji" in payload:
                it["emoji"] = str(payload["emoji"]).strip() or "📦"
            _save(data)
            return it
    raise HTTPException(status_code=404, detail="item not found")


@router.get("/history")
def groceries_history(days: int = 30) -> Dict[str, Any]:
    """Daily counts of items marked needed vs bought, for the last N days."""
    bought_by_day: Dict[str, int] = defaultdict(int)
    needed_by_day: Dict[str, int] = defaultdict(int)
    if GROCERIES_LOG_DIR.exists():
        for p in sorted(GROCERIES_LOG_DIR.glob("*.md")):
            try:
                fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
            except Exception as exc:  # noqa: BLE001
                logger.warning("grocery event %s failed to parse: %s", p.name, exc)
                continue
            day = _normalize_date(fm.get("date"))
            action = fm.get("action")
            if not day:
                continue
            if action == "bought":
                bought_by_day[day] += 1
            elif action == "needed":
                needed_by_day[day] += 1
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        out.append({
            "date": d,
            "bought": bought_by_day.get(d, 0),
            "needed": needed_by_day.get(d, 0),
        })
    return {"daily": out}


@router.delete("/item/{item_id}")
def groceries_delete(item_id: str) -> Dict[str, Any]:
    data = _load()
    before = len(data.get("items", []))
    data["items"] = [it for it in data.get("items", []) if it.get("id") != item_id]
    if len(data["items"]) == before:
        raise HTTPException(status_code=404, detail="item not found")
    _save(data)
    return {"ok": True}
