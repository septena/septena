"""Settings persistence and normalization."""
from __future__ import annotations

from typing import Any, Dict

from api import logger
import api.paths as paths
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.schemas import deep_merge, filter_settings_patch, sanitize_settings

DEFAULT_SETTINGS: Dict[str, Any] = {
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
        "exercise", "nutrition", "habits", "chores", "groceries", "supplements",
        "cannabis", "caffeine", "gut", "health", "sleep", "body",
        "weather", "calendar", "air",
    ],
    "targets": {
        "protein_min_g": 130,
        "protein_max_g": 150,
        "fat_min_g": 55,
        "fat_max_g": 75,
        "weight_min_kg": 83,
        "weight_max_kg": 85,
        "fat_min_pct": 12,
        "fat_max_pct": 15,
        "carbs_min_g": 160,
        "carbs_max_g": 240,
        "fiber_min_g": 25,
        "fiber_max_g": 35,
        "kcal_min": 2000,
        "kcal_max": 2400,
        "z2_weekly_min": 150,
        "sleep_target_h": 8,
        "fasting_min_h": 14,
        "fasting_max_h": 16,
        "evening_hour_24h": 19,
        "post_meal_grace_min": 30,
    },
    "units": {
        "weight": "kg",
        "distance": "km",
    },
    "theme": "system",
    "icon_color": "#ff6600",
    "animations": {
        "exercise_complete": True,
        "first_meal": True,
        "histograms_raise": True,
    },
    "sections": {
        "exercise":     {"label": "Exercise",     "emoji": "🏋️", "color": "hsl(25,95%,53%)",   "tagline": "Sessions, progressions & PRs"},
        "nutrition":    {"label": "Nutrition",    "emoji": "🍱", "color": "hsl(45,90%,48%)",   "tagline": "Meals, macros & fasting"},
        "habits":       {"label": "Habits",       "emoji": "✅", "color": "hsl(220,60%,55%)",  "tagline": "Morning, afternoon & evening routines"},
        "chores":       {"label": "Chores",       "emoji": "🧹", "color": "hsl(200,45%,50%)",  "tagline": "Recurring tasks, deferrable"},
        "groceries":    {"label": "Groceries",    "emoji": "🛒", "color": "hsl(142,55%,38%)",  "tagline": "Smart grocery checklist"},
        "supplements":  {"label": "Supplements",  "emoji": "💊", "color": "hsl(340,70%,50%)",  "tagline": "Daily stack & streaks"},
        "cannabis":     {"label": "Cannabis",     "emoji": "🌿", "color": "hsl(145,55%,38%)",  "tagline": "Log sessions, strains & usage"},
        "caffeine":     {"label": "Caffeine",     "emoji": "☕", "color": "hsl(22,55%,32%)",   "tagline": "V60s, matcha & time of day"},
        "gut":          {"label": "Gut",          "emoji": "🌀", "color": "hsl(28,35%,40%)",   "tagline": "Bristol, blood & discomfort"},
        "health":       {"label": "Health",       "emoji": "💓", "color": "hsl(270,60%,55%)",  "tagline": "HRV, weight & vitals"},
        "sleep":        {"label": "Sleep",        "emoji": "🌙", "color": "hsl(230,55%,55%)",  "tagline": "Score, stages & trends"},
        "body":         {"label": "Body",         "emoji": "⚖️", "color": "hsl(170,50%,42%)",  "tagline": "Weight, body fat & trends"},
        "weather":      {"label": "Weather",      "emoji": "☀️", "color": "hsl(205,75%,50%)",  "tagline": "Today's conditions & forecast", "enabled": False},
        "calendar":     {"label": "Calendar",     "emoji": "📅", "color": "hsl(290,55%,55%)",  "tagline": "Today's events at a glance",   "enabled": False},
        "air":          {"label": "Air",          "emoji": "🌬️", "color": "hsl(190,70%,45%)",  "tagline": "CO₂, temperature & humidity"},
        "correlations": {"label": "Insights",     "emoji": "🔗", "color": "hsl(220,8%,55%)",   "tagline": "Cross-section patterns"},
    },
    "weather": {
        "location": "",
        "units": "celsius",
    },
    "calendar": {
        "show_all_day": True,
        "enabled_calendars": None,
    },
}


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
    raw = _read_raw_document().data
    return sanitize_settings(raw, DEFAULT_SETTINGS)


def save_settings_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    document = _read_raw_document()
    raw = document.data if isinstance(document.data, dict) else {}
    filtered_patch = filter_settings_patch(patch)
    merged_raw = deep_merge(raw, filtered_patch)
    write_yaml_document(
        paths.SETTINGS_PATH,
        PlainYamlDocument(data=merged_raw, header=document.header),
    )
    return sanitize_settings(merged_raw, DEFAULT_SETTINGS)


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
