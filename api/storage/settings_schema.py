"""Settings JSON-Schema loader.

`api/settings.schema.json` is the single source of truth for the settings
shape. This module loads it once at import time and exposes:

  • DEFAULT_SETTINGS  — derived from the schema's `default` annotations.
                        Used to seed the in-memory store.
  • filter_patch()    — strips unknown keys / wrong types from a PUT
                        payload, walking the schema tree. Replaces the
                        old `SETTINGS_ALLOWED_TEMPLATE` + `_pick_allowed`.
  • sanitize()        — filter_patch + deep-merge into defaults.

Validation is intentionally light (whitelist by shape) — same behaviour as
the legacy code. Range/enum/regex enforcement can be layered on top later
without touching call sites.
"""
from __future__ import annotations

import json
import pathlib
from copy import deepcopy
from typing import Any, Dict

SCHEMA_PATH = pathlib.Path(__file__).resolve().parent.parent / "settings.schema.json"

with SCHEMA_PATH.open(encoding="utf-8") as _f:
    SETTINGS_JSON_SCHEMA: Dict[str, Any] = json.load(_f)


def _derive_default(schema: Dict[str, Any]) -> Any:
    """Walk a JSON Schema node and return its default value.

    `default` on a node wins outright (so handcrafted seeds — like the full
    `sections` dictionary — flow through unchanged). Otherwise we recurse
    into `properties` for objects and return the empty array/None for
    other shapes.
    """
    if "default" in schema:
        return deepcopy(schema["default"])
    t = schema.get("type")
    if t == "object":
        out: Dict[str, Any] = {}
        for key, sub in (schema.get("properties") or {}).items():
            out[key] = _derive_default(sub)
        return out
    if t == "array":
        return []
    if t == "boolean":
        return False
    if t in ("number", "integer"):
        return 0
    if t == "string":
        return ""
    return None


DEFAULT_SETTINGS: Dict[str, Any] = _derive_default(SETTINGS_JSON_SCHEMA)


class _Drop:
    """Sentinel returned by `_filter` when a value violates a constraint
    (wrong type, out-of-enum). The recursive object/array walker omits
    keys/items whose filtered value is `_DROP` — leaving the stored
    settings untouched so deep_merge falls back to the prior or default
    value. Cleaner than returning None, which would be valid for
    nullable fields like `calendar.enabled_calendars`.
    """


_DROP = _Drop()


def _filter(data: Any, schema: Dict[str, Any]) -> Any:
    """Recursive whitelist: keep only keys/items the schema describes,
    enforcing per-leaf constraints (enum membership, min/max bounds, type).

    Returns `_DROP` for primitive leaves whose value violates a
    constraint; the caller (object/array branches) skips those keys/items.
    Unknown object keys are silently dropped — matches legacy behaviour
    so old settings.yaml files don't fail open or fail closed unexpectedly.
    """
    # Compose: oneOf picks the first branch the data fits.
    if "oneOf" in schema:
        for branch in schema["oneOf"]:
            if _matches(data, branch):
                return _filter(data, branch)
        return _DROP

    t = schema.get("type")
    if t == "object":
        if not isinstance(data, dict):
            return {}
        out: Dict[str, Any] = {}
        props = schema.get("properties") or {}
        addl = schema.get("additionalProperties")
        for key, value in data.items():
            if key in props:
                filtered = _filter(value, props[key])
            elif isinstance(addl, dict):
                filtered = _filter(value, addl)
            elif addl is True:
                filtered = value
            else:
                continue  # additionalProperties is False or missing → drop
            if filtered is _DROP:
                continue
            out[key] = filtered
        return out
    if t == "array":
        if not isinstance(data, list):
            return []
        items_schema = schema.get("items")
        if isinstance(items_schema, dict):
            out_list: list[Any] = []
            for item in data:
                filtered = _filter(item, items_schema)
                if filtered is _DROP:
                    continue
                out_list.append(filtered)
            return out_list
        return list(data)
    if t == "null":
        return None if data is None else _DROP

    # Primitive — enforce the constraints we can read from the schema.
    if t == "boolean":
        return bool(data) if isinstance(data, bool) else _DROP
    if t in ("number", "integer"):
        if not isinstance(data, (int, float)) or isinstance(data, bool):
            return _DROP
        # `integer` rounds; otherwise keep the caller's int/float as-is so
        # we don't surprise YAML readers with `130 → 130.0` on round-trips.
        n: int | float = int(data) if t == "integer" else data
        if "minimum" in schema and n < schema["minimum"]:
            n = schema["minimum"]
        if "maximum" in schema and n > schema["maximum"]:
            n = schema["maximum"]
        return n
    if t == "string":
        if not isinstance(data, str):
            return _DROP
        if "enum" in schema and data not in schema["enum"]:
            # Not a valid enum value — drop rather than poison the store.
            return _DROP
        return data

    return data


def _matches(data: Any, schema: Dict[str, Any]) -> bool:
    """Loose type predicate used to pick a `oneOf` branch."""
    t = schema.get("type")
    if t == "null":
        return data is None
    if t == "object":
        return isinstance(data, dict)
    if t == "array":
        return isinstance(data, list)
    if t == "boolean":
        return isinstance(data, bool)
    if t in ("number", "integer"):
        return isinstance(data, (int, float)) and not isinstance(data, bool)
    if t == "string":
        return isinstance(data, str)
    return True


def filter_patch(data: Dict[str, Any]) -> Dict[str, Any]:
    """Strip unknown keys / wrong types from an incoming PUT payload."""
    if not isinstance(data, dict):
        return {}
    return _filter(data, SETTINGS_JSON_SCHEMA)


def sanitize(data: Dict[str, Any], defaults: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Filter then deep-merge into defaults — used when reading from disk."""
    from .schemas import deep_merge  # local import: schemas keeps deep_merge

    return deep_merge(defaults or DEFAULT_SETTINGS, filter_patch(data))


def list_unknown_paths(
    data: Any,
    schema: Dict[str, Any] | None = None,
    prefix: str = "",
) -> list[str]:
    """Return the dotted paths in `data` that the schema doesn't describe.

    Used by `scripts/cleanup_data_fields.py` to spot stale keys lingering
    in `settings.yaml` after schema changes. Walks `properties` /
    `additionalProperties` / `items` the same way `_filter` does.
    """
    schema = schema if schema is not None else SETTINGS_JSON_SCHEMA
    out: list[str] = []
    t = schema.get("type")
    if t == "object":
        if not isinstance(data, dict):
            return out
        props = schema.get("properties") or {}
        addl = schema.get("additionalProperties")
        for key, value in data.items():
            next_prefix = f"{prefix}.{key}" if prefix else key
            if key in props:
                out.extend(list_unknown_paths(value, props[key], next_prefix))
            elif isinstance(addl, dict):
                out.extend(list_unknown_paths(value, addl, next_prefix))
            elif addl is True:
                continue
            else:
                out.append(next_prefix)
        return out
    if t == "array":
        if not isinstance(data, list):
            return out
        items = schema.get("items")
        if isinstance(items, dict):
            for item in data:
                out.extend(list_unknown_paths(item, items, f"{prefix}[]"))
        return out
    return out


__all__ = [
    "DEFAULT_SETTINGS",
    "SETTINGS_JSON_SCHEMA",
    "filter_patch",
    "sanitize",
]
