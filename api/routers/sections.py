"""Sections registry — nav-ready merged list of manifest defaults + settings.

The shared manifest defines each section's default wiring and presentation.
`settings.yaml` can override presentation metadata and enablement without
touching source. GET /api/sections merges the two and returns the ordered
list. The `section_order` setting is the single source of truth for ordering.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter

from api.paths import (
    APPLE_HEALTH_PATH,
    OURA_TOKEN_PATH,
    WITHINGS_CREDS_PATH,
    WITHINGS_TOKEN_PATH,
    available_sections,
)
from api.routers.settings import _load_settings
from api.section_manifest import section_defaults

SECTION_DEFAULTS: Dict[str, Dict[str, str]] = section_defaults()


router = APIRouter(prefix="/api/sections", tags=["sections"])


@router.get("")
def sections_list() -> List[Dict[str, Any]]:
    """Merged list: wiring (code) + metadata (settings.yaml), ordered by
    settings.section_order. Keys in section_order that don't match an
    immutable entry are skipped (stale config). Keys present in code but
    missing from section_order get appended in registry order.

    `show_in_nav` and `show_on_dashboard` default to folder-presence +
    integration reachability (see available_sections). settings.yaml can
    override each independently. Legacy `enabled` in settings.yaml, if
    present, acts as a fallback for both flags — so old configs keep
    working. `enabled` is still returned for backward-compat as
    `show_in_nav OR show_on_dashboard` (i.e. "section is visible
    somewhere")."""
    settings = _load_settings()
    order = settings.get("section_order") or []
    meta = settings.get("sections") if isinstance(settings.get("sections"), dict) else {}

    ordered_keys: List[str] = [k for k in order if k in SECTION_DEFAULTS]
    for k in SECTION_DEFAULTS:
        if k not in ordered_keys:
            ordered_keys.append(k)

    # Auto-enable set, recomputed per-request — cheap and always fresh.
    oura = OURA_TOKEN_PATH.exists()
    withings = WITHINGS_TOKEN_PATH.exists() and WITHINGS_CREDS_PATH.exists()
    apple = APPLE_HEALTH_PATH.exists()
    auto_enabled = set(available_sections(oura, withings, apple))

    out: List[Dict[str, Any]] = []
    for idx, key in enumerate(ordered_keys):
        defaults = SECTION_DEFAULTS[key]
        m = meta.get(key, {}) if isinstance(meta, dict) else {}
        if not isinstance(m, dict):
            m = {}
        # Per-surface visibility: explicit new-style flag wins, legacy
        # `enabled` is the fallback, else folder-presence.
        auto = key in auto_enabled
        legacy = m.get("enabled")
        nav_explicit = m.get("show_in_nav")
        dash_explicit = m.get("show_on_dashboard")
        show_in_nav = (
            bool(nav_explicit) if nav_explicit is not None
            else bool(legacy) if legacy is not None
            else auto
        )
        show_on_dashboard = (
            bool(dash_explicit) if dash_explicit is not None
            else bool(legacy) if legacy is not None
            else auto
        )
        out.append({
            "key": key,
            "label": m.get("label") or defaults["label"],
            "emoji": m.get("emoji") or defaults["emoji"],
            "color": m.get("color") or defaults["color"],
            "tagline": m.get("tagline") or defaults["tagline"],
            "enabled": show_in_nav or show_on_dashboard,
            "show_in_nav": show_in_nav,
            "show_on_dashboard": show_on_dashboard,
            "order": idx,
            "path": defaults["path"],
            "apiBase": defaults["apiBase"],
            "dataDir": defaults["dataDir"],
        })
    return out
