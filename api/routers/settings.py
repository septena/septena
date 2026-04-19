"""Settings — user-editable app prefs in a single YAML file under the vault
so they can be tweaked directly in Obsidian. Defaults are returned when
keys are missing so the file can be partial; PUT merges into existing
state rather than overwriting, for the same reason.
"""
from __future__ import annotations

from typing import Any, Dict

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.paths import SETTINGS_DIR, SETTINGS_PATH

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS: Dict[str, Any] = {
    # Phases of the day — used by habits (bucketing) and greetings. Each
    # phase has an id (stable key stored in habit events), label/emoji
    # (display), start (HH:MM — when the phase becomes "current"), cutoff
    # (HH:MM — after which habits in the phase read as overdue), and
    # `messages` — a list of {greeting, subtitle} pairs the overview home
    # screen picks from at random. Add, edit, or remove pairs freely;
    # empty list falls back to the phase label.
    # Phases are ordered by their start time. `id` must be unique and
    # kebab-case; changing an id orphans any habit rows that reference it.
    "day_phases": [
        {
            "id": "morning", "label": "Morning", "emoji": "🌅",
            "start": "00:00", "cutoff": "11:00",
            "messages": [
                {"greeting": "Good morning", "subtitle": "Start your day strong — check habits and supplements"},
            ],
        },
        {
            "id": "afternoon", "label": "Afternoon", "emoji": "☀️",
            "start": "11:00", "cutoff": "17:00",
            "messages": [
                {"greeting": "Good afternoon", "subtitle": "Midday check-in — how's nutrition and training?"},
            ],
        },
        {
            "id": "evening", "label": "Evening", "emoji": "🌙",
            "start": "17:00", "cutoff": "22:00",
            "messages": [
                {"greeting": "Good evening", "subtitle": "Wind down — review the day and prep for tomorrow"},
            ],
        },
    ],
    "section_order": [
        "exercise", "nutrition", "habits", "chores", "supplements",
        "cannabis", "caffeine", "health", "sleep", "body",
        "weather", "calendar",
    ],
    "targets": {
        "protein_min_g": 130,
        "protein_max_g": 150,
        "fat_min_g": 55,
        "fat_max_g": 75,
        "carbs_min_g": 160,
        "carbs_max_g": 240,
        "fiber_min_g": 25,
        "fiber_max_g": 35,
        "kcal_min": 2000,
        "kcal_max": 2400,
        "z2_weekly_min": 150,
        "sleep_target_h": 8,
    },
    "units": {
        "weight": "kg",    # kg | lb
        "distance": "km",  # km | mi
    },
    "theme": "system",     # system | light | dark
    "mini_stats": {},      # per-section two-stat picker; empty = card defaults
    "animations": {
        "exercise_complete": True,   # confetti on session-done page
        "first_meal": True,          # break-fast celebration on nutrition dashboard
        "histograms_raise": True,    # quick raise-from-baseline on chart bars
    },
    # Per-section metadata. Wiring (path, apiBase, obsidianDir) stays in code
    # — these are user-editable presentation bits. A missing entry falls back
    # to code-side defaults in lib/sections.ts; a missing field on an entry
    # falls back to the default below. See GET /api/sections for the merged
    # view.
    #
    # `enabled` is intentionally NOT set here — it defaults to vault folder
    # presence + integration reachability in the /api/sections handler, so
    # a fresh OSS install sees only what's in the vault. Users can opt in
    # explicitly by setting `enabled: true` on a section in their own
    # settings.yaml, or opt out with `enabled: false`.
    "sections": {
        "exercise":     {"label": "Exercise",     "emoji": "🏋️", "color": "hsl(25,95%,53%)",   "tagline": "Sessions, progressions & PRs"},
        "nutrition":    {"label": "Nutrition",    "emoji": "🍱", "color": "hsl(45,90%,48%)",   "tagline": "Meals, macros & fasting"},
        "habits":       {"label": "Habits",       "emoji": "✅", "color": "hsl(220,60%,55%)",  "tagline": "Morning, afternoon & evening routines"},
        "chores":       {"label": "Chores",       "emoji": "🧹", "color": "hsl(200,45%,50%)",  "tagline": "Recurring tasks, deferrable"},
        "supplements":  {"label": "Supplements",  "emoji": "💊", "color": "hsl(340,70%,50%)",  "tagline": "Daily stack & streaks"},
        "cannabis":     {"label": "Cannabis",     "emoji": "🌿", "color": "hsl(145,55%,38%)",  "tagline": "Log sessions, strains & usage"},
        "caffeine":     {"label": "Caffeine",     "emoji": "☕", "color": "hsl(22,55%,32%)",   "tagline": "V60s, matcha & time of day"},
        "health":       {"label": "Health",       "emoji": "💓", "color": "hsl(270,60%,55%)",  "tagline": "HRV, weight & vitals"},
        "sleep":        {"label": "Sleep",        "emoji": "🌙", "color": "hsl(230,55%,55%)",  "tagline": "Score, stages & trends"},
        "body":         {"label": "Body",         "emoji": "⚖️", "color": "hsl(170,50%,42%)",  "tagline": "Weight, body fat & trends"},
        # Optional tiles — opt-in via Settings. `enabled: false` so they
        # don't render until the user toggles them on (and configures
        # location for weather).
        "weather":      {"label": "Weather",      "emoji": "☀️", "color": "hsl(205,75%,50%)",  "tagline": "Today's conditions & forecast", "enabled": False},
        "calendar":     {"label": "Calendar",     "emoji": "📅", "color": "hsl(290,55%,55%)",  "tagline": "Today's events at a glance",   "enabled": False},
        "correlations": {"label": "Insights",     "emoji": "🔗", "color": "hsl(220,8%,55%)",   "tagline": "Cross-section patterns"},
    },
    # Per-tile config for the optional sections.
    "weather": {
        "location": "",        # human-readable city name; empty = unconfigured
        "units": "celsius",    # celsius | fahrenheit
    },
    "calendar": {
        "source": "auto",      # auto = try macOS Calendar then fake; "fake" forces demo
    },
}


def _deep_merge(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge overlay into base. Lists and scalars overwrite;
    dicts merge key-by-key so a partial user file still loads cleanly."""
    out = dict(base)
    for k, v in (overlay or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _load_settings() -> Dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return dict(DEFAULT_SETTINGS)
    try:
        raw = SETTINGS_PATH.read_text(encoding="utf-8")
        user = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("settings.yaml failed to parse: %s", exc)
        return dict(DEFAULT_SETTINGS)
    if not isinstance(user, dict):
        return dict(DEFAULT_SETTINGS)
    return _deep_merge(DEFAULT_SETTINGS, user)


def _save_settings(merged: Dict[str, Any]) -> None:
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(merged, sort_keys=False, allow_unicode=True)
    SETTINGS_PATH.write_text(body, encoding="utf-8")


def load_day_phases() -> list[Dict[str, Any]]:
    """Return the configured day phases in order, each normalized to
    {id, label, emoji, start, cutoff}. Falls back to defaults when the
    user file is missing or malformed."""
    merged = _load_settings()
    phases = merged.get("day_phases") or DEFAULT_SETTINGS["day_phases"]
    out: list[Dict[str, Any]] = []
    for p in phases:
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or "").strip().lower()
        if not pid:
            continue
        raw_messages = p.get("messages") or []
        messages: list[Dict[str, str]] = []
        if isinstance(raw_messages, list):
            for m in raw_messages:
                if not isinstance(m, dict):
                    continue
                greeting = str(m.get("greeting") or "").strip()
                subtitle = str(m.get("subtitle") or "").strip()
                if greeting or subtitle:
                    messages.append({"greeting": greeting, "subtitle": subtitle})
        out.append({
            "id": pid,
            "label": str(p.get("label") or pid.title()),
            "emoji": str(p.get("emoji") or ""),
            "start": str(p.get("start") or "00:00"),
            "cutoff": str(p.get("cutoff") or "23:59"),
            "messages": messages,
        })
    if not out:
        return list(DEFAULT_SETTINGS["day_phases"])
    return out


@router.get("")
def settings_get() -> Dict[str, Any]:
    return _load_settings()


@router.put("")
async def settings_put(request: Request) -> Dict[str, Any]:
    """Body: partial settings object. Merges into the current file rather
    than overwriting, so a client that only wants to change one key doesn't
    have to round-trip the whole document first."""
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings must be a JSON object")
    current = _load_settings()
    merged = _deep_merge(current, payload)
    _save_settings(merged)
    return merged
