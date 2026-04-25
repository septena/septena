"""Settings persistence and normalization.

Defaults and the wire shape are loaded from `api/settings.schema.json`
via `api.storage.settings_schema`. Edit the JSON file (not this module) to
change a default — restart the server to pick it up.
"""
from __future__ import annotations

from typing import Any, Dict

from api import logger
import api.paths as paths
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.schemas import deep_merge
from api.storage.settings_schema import DEFAULT_SETTINGS, filter_patch, sanitize

SECTION_KEY_ALIASES = {
    "exercise": "training",
}

ANIMATION_KEY_ALIASES = {
    "exercise_complete": "training_complete",
}



def _canonicalize_section_order(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        key = SECTION_KEY_ALIASES.get(str(item), str(item))
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _canonicalize_sections(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    out: Dict[str, Any] = {}
    for key, meta in value.items():
        canonical = SECTION_KEY_ALIASES.get(str(key), str(key))
        if canonical == "training" and isinstance(meta, dict):
            normalized_meta = dict(meta)
            label = str(normalized_meta.get("label") or "").strip().lower()
            if label == "exercise":
                normalized_meta["label"] = "Training"
            meta = normalized_meta
        if canonical in out and isinstance(out[canonical], dict) and isinstance(meta, dict):
            out[canonical] = deep_merge(out[canonical], meta)
        else:
            out[canonical] = meta
    return out


def _canonicalize_animations(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    out = dict(value)
    if "training_complete" not in out and "exercise_complete" in out:
        out["training_complete"] = out["exercise_complete"]
    out.pop("exercise_complete", None)
    return out


def _canonicalize_settings(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    out = dict(data)
    if "section_order" in out:
        out["section_order"] = _canonicalize_section_order(out["section_order"])
    if "sections" in out:
        out["sections"] = _canonicalize_sections(out["sections"])
    if "animations" in out:
        out["animations"] = _canonicalize_animations(out["animations"])
    return out


def _read_raw_document() -> PlainYamlDocument:
    try:
        document = read_yaml_document(paths.SETTINGS_PATH, default={})
    except Exception as exc:  # noqa: BLE001
        logger.warning("settings.yaml failed to parse: %s", exc)
        return PlainYamlDocument(data={}, header="")
    if not isinstance(document.data, dict):
        return PlainYamlDocument(data={}, header=document.header)
    return document


def load_settings() -> Dict[str, Any]:
    raw = _canonicalize_settings(_read_raw_document().data)
    return sanitize(raw, DEFAULT_SETTINGS)


def save_settings_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    document = _read_raw_document()
    raw = _canonicalize_settings(document.data if isinstance(document.data, dict) else {})
    filtered_patch = filter_patch(_canonicalize_settings(patch))
    merged_raw = deep_merge(raw, filtered_patch)
    write_yaml_document(
        paths.SETTINGS_PATH,
        PlainYamlDocument(data=merged_raw, header=document.header),
    )
    return sanitize(merged_raw, DEFAULT_SETTINGS)


def load_targets() -> Dict[str, Any]:
    merged = load_settings()
    targets = merged.get("targets")
    if not isinstance(targets, dict):
        return dict(DEFAULT_SETTINGS["targets"])
    return {**DEFAULT_SETTINGS["targets"], **targets}


def load_day_phases() -> list[Dict[str, Any]]:
    merged = load_settings()
    phases = merged.get("day_phases") or DEFAULT_SETTINGS["day_phases"]
    out: list[Dict[str, Any]] = []
    for phase in phases:
        if not isinstance(phase, dict):
            continue
        phase_id = str(phase.get("id") or "").strip().lower()
        if not phase_id:
            continue
        raw_messages = phase.get("messages") or []
        messages: list[Dict[str, str]] = []
        if isinstance(raw_messages, list):
            for message in raw_messages:
                if not isinstance(message, dict):
                    continue
                greeting = str(message.get("greeting") or "").strip()
                subtitle = str(message.get("subtitle") or "").strip()
                if greeting or subtitle:
                    messages.append({"greeting": greeting, "subtitle": subtitle})
        out.append({
            "id": phase_id,
            "label": str(phase.get("label") or phase_id.title()),
            "emoji": str(phase.get("emoji") or ""),
            "start": str(phase.get("start") or "00:00"),
            "cutoff": str(phase.get("cutoff") or "23:59"),
            "messages": messages,
        })
    if not out:
        return list(DEFAULT_SETTINGS["day_phases"])
    return out
