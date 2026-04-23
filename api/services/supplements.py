"""Supplements config + event persistence."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from api import logger
import api.paths as paths
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.repository import SectionRepository
from api.storage.schemas import (
    SUPPLEMENTS_CONFIG_HEADER,
    SupplementEventSchema,
    normalize_supplement_config,
)


def _events() -> SectionRepository[Dict[str, Any]]:
    return SectionRepository(paths.SUPPL_DIR, SupplementEventSchema())


def load_supplements_config() -> List[Dict[str, Any]]:
    try:
        document = read_yaml_document(paths.SUPPL_CONFIG_PATH, default={})
    except Exception as exc:  # noqa: BLE001
        logger.warning("supplements-config.yaml failed to parse: %s", exc)
        return []
    if not isinstance(document.data, dict):
        return []
    return normalize_supplement_config(document.data)


def supplements_events_repo() -> SectionRepository[Dict[str, Any]]:
    return _events()


def load_supplement_events(day: str) -> List[Dict[str, Any]]:
    return _events().list_day(day)


def write_supplement_event(
    day: str,
    supplement: Dict[str, Any],
    note: Optional[str],
    time: Optional[str] = None,
) -> Dict[str, Any]:
    record: Dict[str, Any] = {
        "date": day,
        "id": f"supplement-{day}-{supplement['id']}",
        "section": "supplements",
        "supplement_id": supplement["id"],
        "supplement_name": supplement["name"],
        "emoji": supplement.get("emoji") or "",
        "note": note or None,
    }
    if time:
        record["time"] = time
    _events().write(record)
    return record


def delete_supplement_event(day: str, supplement_id: str) -> None:
    path = paths.SUPPL_DIR / f"{day}--{supplement_id}--01.md"
    if path.exists():
        path.unlink()
        from api.cache import invalidate

        invalidate(paths.SUPPL_DIR)


def supplements_day(day: str) -> Dict[str, Any]:
    supplements = load_supplements_config()
    events_by_id = {
        str(event.get("supplement_id", "")): event
        for event in load_supplement_events(day)
    }
    items: List[Dict[str, Any]] = []
    done_count = 0
    for supplement in supplements:
        event = events_by_id.get(supplement["id"])
        done = event is not None
        if done:
            done_count += 1
        items.append({
            **supplement,
            "done": done,
            "note": (str(event.get("note") or "") if event else ""),
            "time": (str(event.get("time") or "") if event else "") or None,
        })
    total = len(supplements)
    return {
        "date": day,
        "items": items,
        "done_count": done_count,
        "total": total,
        "percent": round(100 * done_count / total) if total else 0,
    }


def toggle_supplement(day: str, supplement_id: str, done: bool, time: str | None = None) -> Dict[str, Any]:
    config_by_id = {supplement["id"]: supplement for supplement in load_supplements_config()}
    if supplement_id not in config_by_id:
        raise KeyError(supplement_id)

    if done:
        existing = load_supplement_events(day)
        prior = next((event for event in existing if event.get("supplement_id") == supplement_id), None)
        note = prior.get("note") if prior else None
        prior_time = str(prior.get("time") or "") or None if prior else None
        today_iso = date.today().isoformat()
        time_val = time or prior_time or (datetime.now().strftime("%H:%M") if day == today_iso else None)
        write_supplement_event(day, config_by_id[supplement_id], note, time=time_val)
    else:
        delete_supplement_event(day, supplement_id)

    taken = [str(event.get("supplement_id", "")) for event in load_supplement_events(day)]
    return {"ok": True, "date": day, "supplement_id": supplement_id, "done": done, "taken": taken}


def _write_config(data: Dict[str, Any], header: str) -> None:
    write_yaml_document(
        paths.SUPPL_CONFIG_PATH,
        PlainYamlDocument(data=data, header=header or SUPPLEMENTS_CONFIG_HEADER),
    )


def add_supplement(name: str, emoji: str) -> Dict[str, Any]:
    from api.parsing import _slugify

    new_id = _slugify(name)
    document = read_yaml_document(paths.SUPPL_CONFIG_PATH, default={})
    data = document.data if isinstance(document.data, dict) else {}
    supplements: List[Dict[str, Any]] = data.get("supplements") or []
    for supplement in supplements:
        if str(supplement.get("name", "")).strip() == name:
            return {"ok": True, "id": supplement["id"], "name": name, "emoji": supplement.get("emoji", ""), "skipped": True}
    supplements.append({"id": new_id, "name": name, "emoji": emoji})
    data["supplements"] = supplements
    _write_config(data, document.header)
    return {"ok": True, "id": new_id, "name": name, "emoji": emoji}


def update_supplement(supplement_id: str, name: str | None, emoji: str | None) -> Dict[str, Any]:
    if not paths.SUPPL_CONFIG_PATH.exists():
        raise FileNotFoundError(paths.SUPPL_CONFIG_PATH)
    document = read_yaml_document(paths.SUPPL_CONFIG_PATH, default={})
    if not isinstance(document.data, dict):
        raise FileNotFoundError(paths.SUPPL_CONFIG_PATH)
    data = document.data
    supplements: List[Dict[str, Any]] = data.get("supplements") or []
    found = False
    for supplement in supplements:
        if str(supplement.get("id", "")) == supplement_id:
            found = True
            if name:
                supplement["name"] = name
            if emoji is not None:
                supplement["emoji"] = emoji
            break
    if not found:
        raise KeyError(supplement_id)
    data["supplements"] = supplements
    _write_config(data, document.header)
    return {"ok": True, "id": supplement_id}


def delete_supplement(supplement_id: str) -> Dict[str, Any]:
    if not paths.SUPPL_CONFIG_PATH.exists():
        raise FileNotFoundError(paths.SUPPL_CONFIG_PATH)
    document = read_yaml_document(paths.SUPPL_CONFIG_PATH, default={})
    if not isinstance(document.data, dict):
        raise FileNotFoundError(paths.SUPPL_CONFIG_PATH)
    data = document.data
    supplements: List[Dict[str, Any]] = data.get("supplements") or []
    before = len(supplements)
    supplements = [supplement for supplement in supplements if str(supplement.get("id", "")) != supplement_id]
    if len(supplements) == before:
        raise KeyError(supplement_id)
    data["supplements"] = supplements
    _write_config(data, document.header)
    return {"ok": True, "id": supplement_id}


def supplements_history(days: int = 30) -> Dict[str, Any]:
    total = len(load_supplements_config())
    today = date.today()
    daily: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        done = len(load_supplement_events(day))
        daily.append({
            "date": day,
            "done": done,
            "total": total,
            "percent": round(100 * done / total) if total else 0,
        })
    return {"daily": daily, "total": total}


def supplements_history_by_id(days: int = 30) -> Dict[str, Any]:
    supplements = load_supplements_config()
    today = date.today()
    daily: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        taken = [str(event.get("supplement_id", "")) for event in load_supplement_events(day)]
        daily.append({"date": day, "taken": taken})
    return {"daily": daily, "supplements": supplements}
