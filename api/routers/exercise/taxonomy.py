"""Exercise taxonomy — config loader, seed defaults, group classification.

Config at Bases/Exercise/exercise-config.yaml is authoritative. The settings
UI reads/writes it through routes defined here.
"""
from __future__ import annotations

from typing import Any, Dict, List

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.io import atomic_write_text
from api.parsing import _slugify
from api.paths import EXERCISE_CONFIG_PATH

router = APIRouter(tags=["exercise"])

# Seed sets used when exercise-config.yaml is missing (fresh install).
_DEFAULT_CARDIO = {"rowing", "elliptical", "stairs"}
_DEFAULT_MOBILITY = {"surya namaskar", "pull up"}
_DEFAULT_CORE = {"ab crunch", "abdominal"}
_DEFAULT_LOWER = {
    "leg press", "single leg press", "leg extension", "leg curl",
    "calf press", "abduction", "adduction", "squat", "dead lift",
}
# Legacy aliases from the pre-2026-04 schema.
_DEFAULT_ALIASES: Dict[str, str] = {"row": "rowing", "curl": "leg curl"}

_DEFAULT_TYPES = [
    {"id": "strength", "label": "Strength",
     "fields": ["weight", "sets", "reps", "difficulty"], "shade": "strength"},
    {"id": "cardio", "label": "Cardio",
     "fields": ["duration_min", "distance_m", "level"], "shade": "cardio"},
    {"id": "mobility", "label": "Mobility",
     "fields": ["duration_min"], "shade": "mobility"},
    {"id": "core", "label": "Core",
     "fields": ["sets", "reps"], "shade": "strength", "is_finisher": True},
]


def _slug(name: str) -> str:
    return _slugify(name)


def _seed_exercises() -> List[Dict[str, Any]]:
    seed: List[Dict[str, Any]] = []
    for n in sorted(_DEFAULT_CARDIO):
        seed.append({"id": _slug(n), "name": n, "type": "cardio"})
    for n in sorted(_DEFAULT_MOBILITY):
        seed.append({"id": _slug(n), "name": n, "type": "mobility"})
    for n in sorted(_DEFAULT_CORE):
        seed.append({"id": _slug(n), "name": n, "type": "core"})
    for n in sorted(_DEFAULT_LOWER):
        seed.append({"id": _slug(n), "name": n, "type": "strength", "subgroup": "lower"})
    return seed


def _load_config() -> Dict[str, Any]:
    """Config is authoritative. Falls back to seed defaults if YAML missing."""
    if EXERCISE_CONFIG_PATH.exists():
        try:
            raw = yaml.safe_load(EXERCISE_CONFIG_PATH.read_text(encoding="utf-8")) or {}
            return {
                "types": raw.get("types") or _DEFAULT_TYPES,
                "exercises": raw.get("exercises") or [],
                "aliases": raw.get("aliases") or {},
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("exercise-config.yaml failed to parse: %s", exc)
    return {"types": _DEFAULT_TYPES, "exercises": _seed_exercises(), "aliases": dict(_DEFAULT_ALIASES)}


def _save_config(data: Dict[str, Any]) -> None:
    EXERCISE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    atomic_write_text(EXERCISE_CONFIG_PATH, body)


def _config_lookup() -> Dict[str, str]:
    """lowercased name → type id, merging aliases."""
    cfg = _load_config()
    out: Dict[str, str] = {}
    for ex in cfg["exercises"]:
        name = ex.get("name")
        t = ex.get("type")
        if name and t:
            out[name.lower()] = t
    for alias, target in cfg.get("aliases", {}).items():
        key = target.lower() if isinstance(target, str) else ""
        if key in out:
            out[alias.lower()] = out[key]
    return out


def _config_subgroup_lookup() -> Dict[str, str]:
    cfg = _load_config()
    out: Dict[str, str] = {}
    for ex in cfg["exercises"]:
        name, sub = ex.get("name"), ex.get("subgroup")
        if name and sub:
            out[name.lower()] = sub
    return out


def exercise_group(name: str) -> str:
    """Return the session-day bucket for an exercise name."""
    key = (name or "").lower()
    types = _config_lookup()
    t = types.get(key)
    if t == "cardio":
        return "cardio"
    if t == "mobility":
        return "mobility"
    if t == "core":
        return "core"
    if t == "strength":
        sub = _config_subgroup_lookup().get(key, "upper")
        return sub or "upper"
    return "upper"


def _is_cardio_type(name: str) -> bool:
    t = _config_lookup().get((name or "").lower())
    return t in ("cardio", "mobility")


def day_groups(entries_for_day: List[Dict[str, Any]]) -> set[str]:
    """Groups present on a given day, excluding `core` (finisher, not a type)."""
    return {
        exercise_group(e.get("exercise") or "")
        for e in entries_for_day
        if e.get("exercise")
    } - {"core"}


@router.get("/api/exercise/config")
def exercise_config() -> Dict[str, Any]:
    return _load_config()


@router.post("/api/exercise/exercises")
async def exercise_add(request: Request) -> Dict[str, Any]:
    """Body: {name, type, subgroup?}. Adds a new exercise to config."""
    payload = await request.json()
    name = str(payload.get("name", "")).strip()
    type_id = str(payload.get("type", "")).strip()
    if not name or not type_id:
        raise HTTPException(status_code=400, detail="name and type are required")
    cfg = _load_config()
    type_ids = {t["id"] for t in cfg["types"]}
    if type_id not in type_ids:
        raise HTTPException(status_code=400, detail=f"unknown type: {type_id}")
    ex_id = _slug(name)
    if any(e.get("id") == ex_id for e in cfg["exercises"]):
        raise HTTPException(status_code=409, detail="exercise already exists")
    new_ex: Dict[str, Any] = {"id": ex_id, "name": name, "type": type_id}
    sub = str(payload.get("subgroup") or "").strip()
    if sub:
        new_ex["subgroup"] = sub
    cfg["exercises"].append(new_ex)
    _save_config(cfg)
    return new_ex


@router.put("/api/exercise/exercises/{ex_id}")
async def exercise_update(ex_id: str, request: Request) -> Dict[str, Any]:
    """Body: partial {name?, type?, subgroup?}. Renaming does NOT rewrite log files."""
    payload = await request.json()
    cfg = _load_config()
    for ex in cfg["exercises"]:
        if ex.get("id") == ex_id:
            if "name" in payload:
                ex["name"] = str(payload["name"]).strip() or ex["name"]
            if "type" in payload:
                t = str(payload["type"]).strip()
                type_ids = {tt["id"] for tt in cfg["types"]}
                if t and t in type_ids:
                    ex["type"] = t
            if "subgroup" in payload:
                sub = str(payload.get("subgroup") or "").strip()
                if sub:
                    ex["subgroup"] = sub
                else:
                    ex.pop("subgroup", None)
            _save_config(cfg)
            return ex
    raise HTTPException(status_code=404, detail="exercise not found")


@router.delete("/api/exercise/exercises/{ex_id}")
def exercise_delete(ex_id: str) -> Dict[str, Any]:
    """Remove an exercise from config. Historical log files are preserved."""
    cfg = _load_config()
    before = len(cfg["exercises"])
    cfg["exercises"] = [e for e in cfg["exercises"] if e.get("id") != ex_id]
    if len(cfg["exercises"]) == before:
        raise HTTPException(status_code=404, detail="exercise not found")
    _save_config(cfg)
    return {"ok": True}
