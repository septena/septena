"""Groceries item + event persistence."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List
import uuid

from api import logger
import api.paths as paths
from api.storage.frontmatter import FrontmatterMarkdownCodec
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.repository import SectionRepository
from api.storage.schemas import GroceryEventSchema, normalize_grocery_items

CATEGORIES = ["produce", "dairy", "grains", "meat", "frozen", "household", "other"]


def _events() -> SectionRepository[Dict[str, Any]]:
    return SectionRepository(
        paths.GROCERIES_LOG_DIR,
        GroceryEventSchema(),
        codec=FrontmatterMarkdownCodec(),
    )


def grocery_events_repo() -> SectionRepository[Dict[str, Any]]:
    return _events()


def _read_items_document() -> PlainYamlDocument:
    try:
        document = read_yaml_document(paths.GROCERIES_PATH, default={"items": []})
    except Exception as exc:  # noqa: BLE001
        logger.warning("groceries.yaml failed to parse: %s", exc)
        return PlainYamlDocument(data={"items": []}, header="")
    if not isinstance(document.data, dict):
        document.data = {"items": []}
    return document


def load_items() -> Dict[str, Any]:
    document = _read_items_document()
    return {"items": normalize_grocery_items(document.data)}


def _write_items_document(document: PlainYamlDocument) -> None:
    write_yaml_document(paths.GROCERIES_PATH, document)


def add_item(name: str, category: str, emoji: str) -> Dict[str, Any]:
    document = _read_items_document()
    data = document.data
    item = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "category": category or "other",
        "emoji": emoji or "📦",
        "low": False,
        "last_bought": None,
    }
    data.setdefault("items", []).append(item)
    _write_items_document(document)
    return item


def write_toggle_event(item: Dict[str, Any], action: str) -> Dict[str, Any]:
    today = date.today().isoformat()
    now = datetime.now().strftime("%H:%M")
    nn_path = _events().next_path({
        "date": today,
        "item_id": str(item.get("id", "")),
        "action": action,
    })
    seq = nn_path.stem.rsplit("--", 1)[-1]
    record = {
        "date": today,
        "time": now,
        "id": f"grocery-{today}-{item.get('id')}-{action}-{seq}",
        "section": "groceries",
        "item_id": str(item.get("id", "")),
        "item_name": str(item.get("name", "")),
        "category": str(item.get("category", "other")),
        "action": action,
    }
    _events().write(record, path=nn_path)
    return record


def patch_item(item_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    document = _read_items_document()
    data = document.data
    for item in data.get("items", []):
        if item.get("id") == item_id:
            if "low" in payload:
                new_low = bool(payload["low"])
                prev_low = bool(item.get("low"))
                if prev_low and not new_low:
                    item["last_bought"] = date.today().isoformat()
                    write_toggle_event(item, "bought")
                elif new_low and not prev_low:
                    write_toggle_event(item, "needed")
                item["low"] = new_low
            if "name" in payload:
                item["name"] = str(payload["name"]).strip()
            if "category" in payload:
                item["category"] = str(payload["category"]).strip() or "other"
            if "emoji" in payload:
                item["emoji"] = str(payload["emoji"]).strip() or "📦"
            _write_items_document(document)
            return {
                "id": str(item.get("id", "")),
                "name": str(item.get("name", "")),
                "category": str(item.get("category", "other")),
                "emoji": str(item.get("emoji", "📦")),
                "low": bool(item.get("low", False)),
                "last_bought": str(item.get("last_bought") or "") or None,
            }
    raise KeyError(item_id)


def delete_item(item_id: str) -> Dict[str, Any]:
    document = _read_items_document()
    data = document.data
    before = len(data.get("items", []))
    data["items"] = [item for item in data.get("items", []) if item.get("id") != item_id]
    if len(data["items"]) == before:
        raise KeyError(item_id)
    _write_items_document(document)
    return {"ok": True}


def history(days: int = 30) -> Dict[str, Any]:
    bought_by_day: Dict[str, int] = {}
    needed_by_day: Dict[str, int] = {}
    for event in _events().list():
        day = str(event["date"])
        if event["action"] == "bought":
            bought_by_day[day] = bought_by_day.get(day, 0) + 1
        elif event["action"] == "needed":
            needed_by_day[day] = needed_by_day.get(day, 0) + 1
    today = date.today()
    daily: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        daily.append({
            "date": day,
            "bought": bought_by_day.get(day, 0),
            "needed": needed_by_day.get(day, 0),
        })
    return {"daily": daily}
