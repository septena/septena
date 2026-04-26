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


def _slugify(text: str) -> str:
    out: list[str] = []
    prev_dash = False
    for ch in text.lower().strip():
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-") or "phase"


def _canonicalize_day_phases(value: Any) -> Any:
    """Migrate old-shape day_phases (per-phase start/cutoff + messages list)
    into the new shape (greeting + subtitles, dividers as sibling field).
    Idempotent — already-new-shape passes through. Returns a tuple of
    (phases, boundaries, day_end). Boundaries/day_end are derived only when
    migrating from the old shape; otherwise None to leave caller fields
    untouched."""
    if not isinstance(value, list):
        return None
    phases: list[Dict[str, Any]] = []
    cutoffs: list[str] = []
    needs_migration = False
    for raw in value:
        if not isinstance(raw, dict):
            continue
        # Detect old shape: presence of `start`/`cutoff` or `messages` list.
        if "messages" in raw or "start" in raw or "cutoff" in raw:
            needs_migration = True
            messages = raw.get("messages") or []
            greeting = ""
            subtitles: list[str] = []
            if isinstance(messages, list):
                for msg in messages:
                    if not isinstance(msg, dict):
                        continue
                    g = str(msg.get("greeting") or "").strip()
                    s = str(msg.get("subtitle") or "").strip()
                    if g and not greeting:
                        greeting = g
                    if s:
                        subtitles.append(s)
            label = str(raw.get("label") or "").strip()
            phase_id = str(raw.get("id") or "").strip().lower() or _slugify(label)
            phase = {
                "id": phase_id,
                "label": label or phase_id.title(),
                "emoji": str(raw.get("emoji") or ""),
                "greeting": greeting,
                "subtitles": subtitles,
            }
            phases.append(phase)
            cutoffs.append(str(raw.get("cutoff") or "23:59"))
        else:
            # New shape — pass through, ensure id present.
            label = str(raw.get("label") or "").strip()
            phase_id = str(raw.get("id") or "").strip().lower() or _slugify(label)
            subs = raw.get("subtitles") or []
            subtitles = [str(s) for s in subs if isinstance(s, (str, int, float)) and str(s).strip()] if isinstance(subs, list) else []
            phases.append({
                "id": phase_id,
                "label": label or phase_id.title(),
                "emoji": str(raw.get("emoji") or ""),
                "greeting": str(raw.get("greeting") or "").strip(),
                "subtitles": subtitles,
            })
    if not needs_migration:
        return {"phases": phases, "boundaries": None, "day_end": None}
    # Derive N-1 internal dividers + day_end from collected cutoffs.
    boundaries = cutoffs[:-1] if len(cutoffs) >= 2 else []
    day_end = cutoffs[-1] if cutoffs else "22:00"
    return {"phases": phases, "boundaries": boundaries, "day_end": day_end}


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
    if "day_phases" in out:
        migrated = _canonicalize_day_phases(out["day_phases"])
        if migrated is not None:
            out["day_phases"] = migrated["phases"]
            if migrated["boundaries"] is not None and "day_phase_boundaries" not in out:
                out["day_phase_boundaries"] = migrated["boundaries"]
            if migrated["day_end"] is not None and "day_end" not in out:
                out["day_end"] = migrated["day_end"]
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
            phase_id = _slugify(str(phase.get("label") or ""))
        if not phase_id:
            continue
        raw_subs = phase.get("subtitles") or []
        subtitles = [str(s).strip() for s in raw_subs if isinstance(s, (str, int, float)) and str(s).strip()] if isinstance(raw_subs, list) else []
        out.append({
            "id": phase_id,
            "label": str(phase.get("label") or phase_id.title()),
            "emoji": str(phase.get("emoji") or ""),
            "greeting": str(phase.get("greeting") or "").strip(),
            "subtitles": subtitles,
        })
    if not out:
        return list(DEFAULT_SETTINGS["day_phases"])
    return out
