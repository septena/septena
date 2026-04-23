"""Habits config + event persistence."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from api import logger
import api.paths as paths
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.repository import SectionRepository
from api.storage.schemas import HABITS_CONFIG_HEADER, HabitEventSchema, normalize_habit_config

from .settings_store import load_day_phases


def _events() -> SectionRepository[Dict[str, Any]]:
    return SectionRepository(paths.HABITS_DIR, HabitEventSchema())


def _phase_ids() -> tuple[str, ...]:
    return tuple(phase["id"] for phase in load_day_phases())


def load_habits_config() -> List[Dict[str, Any]]:
    try:
        document = read_yaml_document(paths.HABITS_CONFIG_PATH, default={})
    except Exception as exc:  # noqa: BLE001
        logger.warning("habits-config.yaml failed to parse: %s", exc)
        return []
    if not isinstance(document.data, dict):
        return []
    return normalize_habit_config(document.data, _phase_ids())


def load_habit_events(day: str) -> List[Dict[str, Any]]:
    return _events().list_day(day)


def habit_events_repo() -> SectionRepository[Dict[str, Any]]:
    return _events()


def write_habit_event(
    day: str,
    habit: Dict[str, Any],
    note: Optional[str],
    time: Optional[str] = None,
) -> Dict[str, Any]:
    record: Dict[str, Any] = {
        "date": day,
        "id": f"habit-{day}-{habit['id']}",
        "section": "habits",
        "habit_id": habit["id"],
        "habit_name": habit["name"],
        "bucket": habit["bucket"],
        "note": note or None,
    }
    if time:
        record["time"] = time
    _events().write(record)
    return record


def delete_habit_event(day: str, habit_id: str) -> None:
    path = paths.HABITS_DIR / f"{day}--{habit_id}--01.md"
    if path.exists():
        path.unlink()
        from api.cache import invalidate

        invalidate(paths.HABITS_DIR)


def habits_day(day: str) -> Dict[str, Any]:
    habits = load_habits_config()
    events_by_id = {str(event.get("habit_id", "")): event for event in load_habit_events(day)}

    phases = _phase_ids()
    grouped: Dict[str, List[Dict[str, Any]]] = {bucket: [] for bucket in phases}
    done_count = 0
    for habit in habits:
        event = events_by_id.get(habit["id"])
        done = event is not None
        if done:
            done_count += 1
        grouped.setdefault(habit["bucket"], []).append({
            **habit,
            "done": done,
            "note": (str(event.get("note") or "") if event else ""),
            "time": (str(event.get("time") or "") if event else "") or None,
        })

    total = len(habits)
    return {
        "date": day,
        "buckets": list(phases),
        "grouped": grouped,
        "done_count": done_count,
        "total": total,
        "percent": round(100 * done_count / total) if total else 0,
    }


def toggle_habit(day: str, habit_id: str, done: bool, time: str | None = None) -> Dict[str, Any]:
    config_by_id = {habit["id"]: habit for habit in load_habits_config()}
    if habit_id not in config_by_id:
        raise KeyError(habit_id)

    if done:
        existing = load_habit_events(day)
        prior = next((event for event in existing if event.get("habit_id") == habit_id), None)
        note = prior.get("note") if prior else None
        prior_time = str(prior.get("time") or "") or None if prior else None
        today_iso = date.today().isoformat()
        time_val = time or prior_time or (datetime.now().strftime("%H:%M") if day == today_iso else None)
        write_habit_event(day, config_by_id[habit_id], note, time=time_val)
    else:
        delete_habit_event(day, habit_id)

    completed = [str(event.get("habit_id", "")) for event in load_habit_events(day)]
    return {"ok": True, "date": day, "habit_id": habit_id, "done": done, "completed": completed}


def _write_habits_config(data: Dict[str, Any], header: str) -> None:
    write_yaml_document(
        paths.HABITS_CONFIG_PATH,
        PlainYamlDocument(data=data, header=header or HABITS_CONFIG_HEADER),
    )


def add_habit(name: str, bucket: str) -> Dict[str, Any]:
    phases = _phase_ids()
    fallback = phases[0] if phases else "morning"
    normalized_bucket = bucket or fallback
    document = read_yaml_document(paths.HABITS_CONFIG_PATH, default={})
    data = document.data if isinstance(document.data, dict) else {}
    habits: List[Dict[str, Any]] = data.get("habits") or []
    for habit in habits:
        if str(habit.get("name", "")).strip() == name and str(habit.get("bucket", "")).strip() == normalized_bucket:
            return {"ok": True, "id": habit["id"], "name": name, "bucket": normalized_bucket, "skipped": True}
    from api.parsing import _slugify

    new_id = _slugify(name)
    habits.append({"id": new_id, "name": name, "bucket": normalized_bucket})
    data["habits"] = habits
    _write_habits_config(data, document.header)
    return {"ok": True, "id": new_id, "name": name, "bucket": normalized_bucket}


def update_habit(habit_id: str, name: str, bucket: str) -> Dict[str, Any]:
    if not paths.HABITS_CONFIG_PATH.exists():
        raise FileNotFoundError(paths.HABITS_CONFIG_PATH)
    document = read_yaml_document(paths.HABITS_CONFIG_PATH, default={})
    if not isinstance(document.data, dict):
        raise FileNotFoundError(paths.HABITS_CONFIG_PATH)
    data = document.data
    habits: List[Dict[str, Any]] = data.get("habits") or []
    found = False
    for habit in habits:
        if str(habit.get("id", "")) == habit_id:
            found = True
            if name:
                habit["name"] = name
            if bucket:
                habit["bucket"] = bucket
            break
    if not found:
        raise KeyError(habit_id)
    data["habits"] = habits
    _write_habits_config(data, document.header)
    return {"ok": True}


def delete_habit(habit_id: str) -> Dict[str, Any]:
    if not paths.HABITS_CONFIG_PATH.exists():
        raise FileNotFoundError(paths.HABITS_CONFIG_PATH)
    document = read_yaml_document(paths.HABITS_CONFIG_PATH, default={})
    if not isinstance(document.data, dict):
        raise FileNotFoundError(paths.HABITS_CONFIG_PATH)
    data = document.data
    habits: List[Dict[str, Any]] = data.get("habits") or []
    before = len(habits)
    habits = [habit for habit in habits if str(habit.get("id", "")) != habit_id]
    if len(habits) == before:
        raise KeyError(habit_id)
    data["habits"] = habits
    _write_habits_config(data, document.header)
    return {"ok": True, "id": habit_id}


def habits_history(days: int = 30) -> Dict[str, Any]:
    total = len(load_habits_config())
    today = date.today()
    daily: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        done = len(load_habit_events(day))
        daily.append({
            "date": day,
            "done": done,
            "total": total,
            "percent": round(100 * done / total) if total else 0,
        })
    return {"daily": daily, "total": total}
