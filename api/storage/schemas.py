"""Section schema adapters and document normalization helpers."""
from __future__ import annotations

from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable

from api.parsing import _normalize_date, _normalize_number

from .frontmatter import FrontmatterDocument

HABITS_CONFIG_HEADER = (
    "# Septena habits config — fixed daily checklist.\n"
)

SUPPLEMENTS_CONFIG_HEADER = (
    "# Septena supplements config — fixed daily stack.\n"
)


def _next_numbered_path(directory: Path, prefix: str) -> Path:
    nn = 1
    while True:
        path = directory / f"{prefix}{nn:02d}.md"
        if not path.exists():
            return path
        nn += 1


class HabitEventSchema:
    glob = "*.md"
    allowed_fields = frozenset({
        "date",
        "time",
        "id",
        "section",
        "habit_id",
        "habit_name",
        "emoji",
        "bucket",
        "note",
    })

    def parse(self, path: Path, document: FrontmatterDocument) -> Dict[str, Any] | None:
        fm = document.frontmatter
        day = _normalize_date(fm.get("date"))
        habit_id = str(fm.get("habit_id") or "").strip()
        if not day or not habit_id:
            return None
        return {
            "date": day,
            "time": str(fm.get("time") or "") or None,
            "id": str(fm.get("id") or ""),
            "section": "habits",
            "habit_id": habit_id,
            "habit_name": str(fm.get("habit_name") or ""),
            "emoji": str(fm.get("emoji") or ""),
            "bucket": str(fm.get("bucket") or ""),
            "note": fm.get("note"),
        }

    def serialize(
        self,
        record: Dict[str, Any],
        existing: FrontmatterDocument | None = None,
    ) -> FrontmatterDocument:
        fm: Dict[str, Any] = {
            "date": date.fromisoformat(record["date"]),
        }
        if record.get("time"):
            fm["time"] = str(record["time"])
        fm.update({
            "id": str(record["id"]),
            "section": "habits",
            "habit_id": str(record["habit_id"]),
            "habit_name": str(record.get("habit_name") or ""),
            "emoji": str(record.get("emoji") or "") or None,
            "bucket": str(record.get("bucket") or ""),
            "note": record.get("note") or None,
        })
        body = existing.body if existing else ""
        return FrontmatterDocument(frontmatter=fm, body=body)

    def record_id(self, record: Dict[str, Any]) -> str | None:
        return str(record.get("id") or "") or None

    def record_day(self, record: Dict[str, Any]) -> str | None:
        return _normalize_date(record.get("date"))

    def next_path(self, directory: Path, record: Dict[str, Any]) -> Path:
        return directory / f"{record['date']}--{record['habit_id']}--01.md"

    def glob_for_day(self, day: str) -> str:
        return f"{day}--*.md"


class SupplementEventSchema:
    glob = "*.md"
    allowed_fields = frozenset({
        "date",
        "time",
        "id",
        "section",
        "supplement_id",
        "supplement_name",
        "emoji",
        "note",
    })

    def parse(self, path: Path, document: FrontmatterDocument) -> Dict[str, Any] | None:
        fm = document.frontmatter
        day = _normalize_date(fm.get("date"))
        supplement_id = str(fm.get("supplement_id") or "").strip()
        if not day or not supplement_id:
            return None
        return {
            "date": day,
            "time": str(fm.get("time") or "") or None,
            "id": str(fm.get("id") or ""),
            "section": "supplements",
            "supplement_id": supplement_id,
            "supplement_name": str(fm.get("supplement_name") or ""),
            "emoji": str(fm.get("emoji") or ""),
            "note": fm.get("note"),
        }

    def serialize(
        self,
        record: Dict[str, Any],
        existing: FrontmatterDocument | None = None,
    ) -> FrontmatterDocument:
        fm: Dict[str, Any] = {
            "date": date.fromisoformat(record["date"]),
        }
        if record.get("time"):
            fm["time"] = str(record["time"])
        fm.update({
            "id": str(record["id"]),
            "section": "supplements",
            "supplement_id": str(record["supplement_id"]),
            "supplement_name": str(record.get("supplement_name") or ""),
            "emoji": str(record.get("emoji") or "") or None,
            "note": record.get("note") or None,
        })
        body = existing.body if existing else ""
        return FrontmatterDocument(frontmatter=fm, body=body)

    def record_id(self, record: Dict[str, Any]) -> str | None:
        return str(record.get("id") or "") or None

    def record_day(self, record: Dict[str, Any]) -> str | None:
        return _normalize_date(record.get("date"))

    def next_path(self, directory: Path, record: Dict[str, Any]) -> Path:
        return directory / f"{record['date']}--{record['supplement_id']}--01.md"

    def glob_for_day(self, day: str) -> str:
        return f"{day}--*.md"


class CaffeineEventSchema:
    glob = "*.md"
    allowed_fields = frozenset({
        "date",
        "time",
        "id",
        "section",
        "method",
        "beans",
        "grams",
        "note",
        "created_at",
    })

    def parse(self, path: Path, document: FrontmatterDocument) -> Dict[str, Any] | None:
        fm = document.frontmatter
        day = _normalize_date(fm.get("date"))
        entry_id = str(fm.get("id") or "").strip()
        if not day or not entry_id:
            return None
        return {
            "date": day,
            "time": str(fm.get("time") or "") or None,
            "id": entry_id,
            "section": "caffeine",
            "method": str(fm.get("method") or "v60"),
            "beans": str(fm.get("beans") or "") or None,
            "grams": _normalize_number(fm.get("grams")),
            "note": fm.get("note"),
            "created_at": str(fm.get("created_at") or "") or None,
        }

    def serialize(
        self,
        record: Dict[str, Any],
        existing: FrontmatterDocument | None = None,
    ) -> FrontmatterDocument:
        fm: Dict[str, Any] = {
            "date": date.fromisoformat(record["date"]),
            "time": str(record["time"]),
            "id": str(record["id"]),
            "section": "caffeine",
            "method": str(record.get("method") or "v60"),
            "beans": record.get("beans"),
            "grams": record.get("grams"),
            "note": record.get("note") or None,
            "created_at": record.get("created_at"),
        }
        body = existing.body if existing else ""
        return FrontmatterDocument(frontmatter=fm, body=body)

    def record_id(self, record: Dict[str, Any]) -> str | None:
        return str(record.get("id") or "") or None

    def record_day(self, record: Dict[str, Any]) -> str | None:
        return _normalize_date(record.get("date"))

    def next_path(self, directory: Path, record: Dict[str, Any]) -> Path:
        prefix = f"{record['date']}--{record.get('method') or 'v60'}--"
        return _next_numbered_path(directory, prefix)

    def glob_for_day(self, day: str) -> str:
        return f"{day}--*.md"


class GroceryEventSchema:
    glob = "*.md"
    allowed_fields = frozenset({
        "date",
        "time",
        "id",
        "section",
        "item_id",
        "item_name",
        "category",
        "action",
    })

    def parse(self, path: Path, document: FrontmatterDocument) -> Dict[str, Any] | None:
        fm = document.frontmatter
        day = _normalize_date(fm.get("date"))
        entry_id = str(fm.get("id") or "").strip()
        action = str(fm.get("action") or "").strip()
        if not day or not entry_id or action not in {"bought", "needed"}:
            return None
        return {
            "date": day,
            "time": str(fm.get("time") or "") or None,
            "id": entry_id,
            "section": "groceries",
            "item_id": str(fm.get("item_id") or ""),
            "item_name": str(fm.get("item_name") or ""),
            "category": str(fm.get("category") or "other"),
            "action": action,
        }

    def serialize(
        self,
        record: Dict[str, Any],
        existing: FrontmatterDocument | None = None,
    ) -> FrontmatterDocument:
        fm: Dict[str, Any] = {
            "date": date.fromisoformat(record["date"]),
            "time": str(record["time"]),
            "id": str(record["id"]),
            "section": "groceries",
            "item_id": str(record["item_id"]),
            "item_name": str(record.get("item_name") or ""),
            "category": str(record.get("category") or "other"),
            "action": str(record["action"]),
        }
        body = existing.body if existing else ""
        return FrontmatterDocument(frontmatter=fm, body=body)

    def record_id(self, record: Dict[str, Any]) -> str | None:
        return str(record.get("id") or "") or None

    def record_day(self, record: Dict[str, Any]) -> str | None:
        return _normalize_date(record.get("date"))

    def next_path(self, directory: Path, record: Dict[str, Any]) -> Path:
        prefix = f"{record['date']}--{record['item_id']}--{record['action']}--"
        return _next_numbered_path(directory, prefix)

    def glob_for_day(self, day: str) -> str:
        return f"{day}--*.md"


# Settings shape & validation moved to `api/storage/settings_schema.py`,
# driven by `api/settings.schema.json`. Other section schemas (Habit /
# Supplement / Caffeine / Grocery / Air) and the `deep_merge` helper stay here.

AIR_DAY_ALLOWED_FIELDS = frozenset({"date", "section", "readings"})
GROCERY_ITEM_ALLOWED_FIELDS = frozenset({"id", "name", "category", "emoji", "low", "last_bought"})


def normalize_habit_config(data: Dict[str, Any], phases: Iterable[str]) -> list[Dict[str, Any]]:
    habits = data.get("habits") or []
    phase_ids = tuple(phases)
    fallback = phase_ids[0] if phase_ids else "morning"
    out: list[Dict[str, Any]] = []
    for habit in habits:
        if not isinstance(habit, dict):
            continue
        habit_id = str(habit.get("id") or "").strip()
        name = str(habit.get("name") or "").strip()
        emoji = str(habit.get("emoji") or "").strip()
        bucket = str(habit.get("bucket") or fallback).strip().lower()
        if not habit_id or not name:
            continue
        if bucket not in phase_ids:
            bucket = fallback
        out.append({"id": habit_id, "name": name, "emoji": emoji, "bucket": bucket})
    return out


def normalize_supplement_config(data: Dict[str, Any]) -> list[Dict[str, Any]]:
    supplements = data.get("supplements") or []
    out: list[Dict[str, Any]] = []
    for supplement in supplements:
        if not isinstance(supplement, dict):
            continue
        supplement_id = str(supplement.get("id") or "").strip()
        name = str(supplement.get("name") or "").strip()
        emoji = str(supplement.get("emoji") or "").strip()
        if not supplement_id or not name:
            continue
        out.append({"id": supplement_id, "name": name, "emoji": emoji})
    return out


def normalize_grocery_items(data: Dict[str, Any]) -> list[Dict[str, Any]]:
    items = data.get("items", []) if isinstance(data, dict) else []
    out: list[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        last_bought = item.get("last_bought")
        out.append({
            "id": str(item.get("id", "")),
            "name": str(item.get("name", "")),
            "category": str(item.get("category", "other")),
            "emoji": str(item.get("emoji", "📦")),
            "low": bool(item.get("low", False)),
            "last_bought": str(last_bought) if last_bought else None,
        })
    return out


def merge_grocery_item(existing: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    merged.update(patch)
    return merged


def deep_merge(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    out = deepcopy(base)
    for key, value in (overlay or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = deepcopy(value)
    return out
