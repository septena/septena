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


def update_entry(entry_id: str, day: str, patch: Dict[str, Any]) -> Dict[str, Any] | None:
    """Merge a partial patch into an existing entry, write back to the same
    file. Returns the updated record, or None when no entry matches."""
    repo = _events()
    existing = repo.get_by_id(entry_id, day=day)
    path = repo.path_of(entry_id, day=day)
    if existing is None or path is None:
        return None

    if "time" in patch:
        t = str(patch["time"] or "").strip()
        if t:
            existing["time"] = t
    if "method" in patch:
        m = str(patch["method"] or "").strip()
        if m in CAFFEINE_METHODS:
            existing["method"] = m
    if "beans" in patch:
        beans = str(patch["beans"] or "").strip()
        existing["beans"] = beans if beans and beans.lower() != "none" else None
    if "grams" in patch:
        g = patch["grams"]
        if g is None or g == "":
            existing["grams"] = None
        else:
            try:
                gv = float(g)
                existing["grams"] = gv if gv > 0 else None
            except (TypeError, ValueError):
                pass
    if "note" in patch:
        n = str(patch["note"] or "").strip()
        existing["note"] = n or None
    repo.write(existing, path=path)
    return existing


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
