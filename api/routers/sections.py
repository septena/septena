"""Sections registry — nav-ready merged list of code wiring + user settings.

Wiring (path, apiBase, obsidianDir) is code because changing it means
shipping a new frontend route; metadata (label, emoji, color, tagline,
enabled) is settings so users can tweak theming without touching source.
GET /api/sections merges the two and returns the ordered list. The
`section_order` setting is the single source of truth for ordering.
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

SECTION_IMMUTABLE: Dict[str, Dict[str, str]] = {
    "exercise":     {"path": "/exercise",     "apiBase": "/api",             "obsidianDir": "Bases/Exercise/Log"},
    "nutrition":    {"path": "/nutrition",    "apiBase": "/api/nutrition",   "obsidianDir": "Bases/Nutrition/Log"},
    "habits":       {"path": "/habits",       "apiBase": "/api/habits",      "obsidianDir": "Bases/Habits/Log"},
    "chores":       {"path": "/chores",       "apiBase": "/api/chores",      "obsidianDir": "Bases/Chores/Log"},
    "groceries":    {"path": "/groceries",    "apiBase": "/api/groceries",   "obsidianDir": "Bases/Groceries"},
    "supplements":  {"path": "/supplements",  "apiBase": "/api/supplements", "obsidianDir": "Bases/Supplements/Log"},
    "cannabis":     {"path": "/cannabis",     "apiBase": "/api/cannabis",    "obsidianDir": "Bases/Cannabis/Log"},
    "caffeine":     {"path": "/caffeine",     "apiBase": "/api/caffeine",    "obsidianDir": "Bases/Caffeine/Log"},
    "health":       {"path": "/health",       "apiBase": "/api/health",      "obsidianDir": ""},
    "sleep":        {"path": "/sleep",        "apiBase": "/api/health",      "obsidianDir": ""},
    "body":         {"path": "/body",         "apiBase": "/api/health",      "obsidianDir": ""},
    "weather":      {"path": "/weather",      "apiBase": "/api/weather",     "obsidianDir": ""},
    "calendar":     {"path": "/calendar",     "apiBase": "/api/calendar",    "obsidianDir": ""},
    "air":          {"path": "/air",          "apiBase": "/api/air",         "obsidianDir": "Bases/Air/Log"},
    "correlations": {"path": "/insights",     "apiBase": "",                 "obsidianDir": ""},
}

# Optional local-only extensions extend the registry.
try:
    from api.routers import _local as _local_plugin  # type: ignore[import-not-found]
    SECTION_IMMUTABLE.update(getattr(_local_plugin, "SECTION_IMMUTABLE_EXTRA", {}))
except ImportError:
    pass


router = APIRouter(prefix="/api/sections", tags=["sections"])


@router.get("")
def sections_list() -> List[Dict[str, Any]]:
    """Merged list: wiring (code) + metadata (settings.yaml), ordered by
    settings.section_order. Keys in section_order that don't match an
    immutable entry are skipped (stale config). Keys present in code but
    missing from section_order get appended in registry order.

    `enabled` defaults to folder-presence + integration reachability
    (see available_sections). User settings.yaml can override explicitly
    — any section with `enabled: true|false` in settings wins over the
    auto-detected default. This makes the OSS default "show what exists
    in my vault" while preserving power-user explicit control."""
    settings = _load_settings()
    order = settings.get("section_order") or []
    meta = settings.get("sections") if isinstance(settings.get("sections"), dict) else {}

    ordered_keys: List[str] = [k for k in order if k in SECTION_IMMUTABLE]
    for k in SECTION_IMMUTABLE:
        if k not in ordered_keys:
            ordered_keys.append(k)

    # Auto-enable set, recomputed per-request — cheap and always fresh.
    oura = OURA_TOKEN_PATH.exists()
    withings = WITHINGS_TOKEN_PATH.exists() and WITHINGS_CREDS_PATH.exists()
    apple = APPLE_HEALTH_PATH.exists()
    auto_enabled = set(available_sections(oura, withings, apple))

    out: List[Dict[str, Any]] = []
    for idx, key in enumerate(ordered_keys):
        wiring = SECTION_IMMUTABLE[key]
        m = meta.get(key, {}) if isinstance(meta, dict) else {}
        if not isinstance(m, dict):
            m = {}
        # Explicit override wins; otherwise fall back to folder-presence.
        explicit = m.get("enabled")
        enabled = bool(explicit) if explicit is not None else key in auto_enabled
        out.append({
            "key": key,
            "label": m.get("label") or key.capitalize(),
            "emoji": m.get("emoji") or "",
            "color": m.get("color") or "hsl(0,0%,50%)",
            "tagline": m.get("tagline") or "",
            "enabled": enabled,
            "order": idx,
            "path": wiring["path"],
            "apiBase": wiring["apiBase"],
            "obsidianDir": wiring["obsidianDir"],
        })
    return out
