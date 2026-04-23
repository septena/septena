"""Caffeine event persistence."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List

from api import logger
import api.paths as paths
from api.storage.plain_yaml import read_yaml_document
from api.storage.repository import SectionRepository
from api.storage.schemas import CaffeineEventSchema

CAFFEINE_METHODS = {"v60", "matcha", "other"}


def _events() -> SectionRepository[Dict[str, Any]]:
    return SectionRepository(paths.CAFFEINE_DIR, CaffeineEventSchema())


def caffeine_events_repo() -> SectionRepository[Dict[str, Any]]:
    return _events()


def load_caffeine_config() -> Dict[str, Any]:
    out: Dict[str, Any] = {"beans": []}
    try:
        document = read_yaml_document(paths.CAFFEINE_CONFIG_PATH, default={})
    except Exception as exc:  # noqa: BLE001
        logger.warning("caffeine-config.yaml failed to parse: %s", exc)
        return out
    data = document.data if isinstance(document.data, dict) else {}
    beans = data.get("beans") or []
    out["beans"] = [
        {"id": str(bean.get("id", "")), "name": str(bean.get("name", ""))}
        for bean in beans
        if isinstance(bean, dict) and bean.get("id")
    ]
    return out


def load_day(day: str) -> List[Dict[str, Any]]:
    return sorted(_events().list_day(day), key=lambda event: str(event.get("time", "")))


def add_entry(record: Dict[str, Any]) -> Dict[str, Any]:
    if record.get("method") not in CAFFEINE_METHODS:
        record["method"] = "other"
    if not record.get("time"):
        raise ValueError("time is required")
    _events().write(record)
    return record


def delete_entry(entry_id: str, day: str | None = None) -> bool:
    return _events().delete(entry_id, day=day)


def day_summary(day: str) -> Dict[str, Any]:
    events = load_day(day)
    method_counts: Dict[str, int] = {method: 0 for method in CAFFEINE_METHODS}
    total_g = 0.0
    grams_count = 0
    for event in events:
        method = str(event.get("method", "v60"))
        if method in method_counts:
            method_counts[method] += 1
        grams = event.get("grams")
        if isinstance(grams, (int, float)) and grams > 0:
            total_g += float(grams)
            grams_count += 1
    return {
        "date": day,
        "entries": events,
        "session_count": len(events),
        "methods": method_counts,
        "total_g": round(total_g, 2) if grams_count else None,
    }


def history(days: int = 30) -> Dict[str, Any]:
    today = date.today()
    daily: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        events = load_day(day)
        total_g = 0.0
        grams_count = 0
        for event in events:
            grams = event.get("grams")
            if isinstance(grams, (int, float)) and grams > 0:
                total_g += float(grams)
                grams_count += 1
        daily.append({
            "date": day,
            "sessions": len(events),
            "total_g": round(total_g, 2) if grams_count else None,
        })
    return {"daily": daily}


def sessions(days: int = 30) -> Dict[str, Any]:
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        for event in load_day(day):
            time_str = str(event.get("time") or "").strip()
            if not time_str:
                continue
            parts = time_str.split(":")
            try:
                hh = int(parts[0])
                mm = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                continue
            out.append({
                "date": day,
                "time": time_str,
                "hour": round(hh + mm / 60.0, 3),
                "method": event.get("method", "v60"),
                "beans": event.get("beans"),
                "grams": event.get("grams"),
            })
    return {"sessions": out}
