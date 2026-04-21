"""Filesystem paths — roots from env, section dirs, token locations, caches.

Everything that's a `Path` (not logic, not constants) lives here so any module
can see the full layout at a glance. Section-specific *behavioural* constants
(taxonomy sets, default macros, etc.) stay with their router.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List

# ── Roots (override via env for non-default setups) ───────────────────────
# VAULT_ROOT holds all per-section YAML logs and config.
# HEALTH_ROOT is read-only aggregated health data (Oura/Withings/HAE snapshots).
# INTEGRATIONS_DIR holds credentials/tokens for optional external services.
# CACHE_DIR is app-owned scratch space.
VAULT_ROOT = Path(os.environ.get("SETLIST_VAULT") or Path.home() / "Documents/obsidian/Bases")
HEALTH_ROOT = Path(os.environ.get("SETLIST_HEALTH_DIR") or Path.home() / "Documents/obsidian/Health")
INTEGRATIONS_DIR = Path(os.environ.get("SETLIST_INTEGRATIONS_DIR") or Path.home() / ".config/openclaw")
CACHE_DIR = Path(os.environ.get("SETLIST_CACHE_DIR") or Path.home() / ".config/setlist")

# ── Section directories ───────────────────────────────────────────────────
DATA_DIR = VAULT_ROOT / "Exercise/Log"
EXERCISE_CONFIG_PATH = VAULT_ROOT / "Exercise/exercise-config.yaml"

NUTRITION_DIR = VAULT_ROOT / "Nutrition/Log"
MACROS_CONFIG_PATH = VAULT_ROOT / "Nutrition/macros-config.yaml"

HABITS_CONFIG_PATH = VAULT_ROOT / "Habits/habits-config.yaml"
HABITS_DIR = VAULT_ROOT / "Habits/Log"

SUPPL_CONFIG_PATH = VAULT_ROOT / "Supplements/supplements-config.yaml"
SUPPL_DIR = VAULT_ROOT / "Supplements/Log"

CANNABIS_CONFIG_PATH = VAULT_ROOT / "Cannabis/cannabis-config.yaml"
CANNABIS_DIR = VAULT_ROOT / "Cannabis/Log"
CANNABIS_CAPSULE_STATE_PATH = VAULT_ROOT / "Cannabis/Log/_capsules.yaml"

CAFFEINE_CONFIG_PATH = VAULT_ROOT / "Caffeine/caffeine-config.yaml"
CAFFEINE_DIR = VAULT_ROOT / "Caffeine/Log"

CHORES_DEFS_DIR = VAULT_ROOT / "Chores/Definitions"
CHORES_LOG_DIR = VAULT_ROOT / "Chores/Log"
GROCERIES_DIR = VAULT_ROOT / "Groceries"
GROCERIES_PATH = VAULT_ROOT / "Groceries/groceries.yaml"
GROCERIES_LOG_DIR = VAULT_ROOT / "Groceries/Log"

AIR_DIR = VAULT_ROOT / "Air/Log"
AIR_STATE_PATH = CACHE_DIR / "aranet-state.json"

SETTINGS_DIR = VAULT_ROOT / "Settings"
SETTINGS_PATH = SETTINGS_DIR / "settings.yaml"

# ── Health integrations ────────────────────────────────────────────────────
OURA_TOKEN_PATH = INTEGRATIONS_DIR / "oura/token.txt"
WITHINGS_TOKEN_PATH = INTEGRATIONS_DIR / "withings/token.json"
WITHINGS_CREDS_PATH = INTEGRATIONS_DIR / "withings/credentials.json"
APPLE_HEALTH_PATH = INTEGRATIONS_DIR / "health_auto_export/latest.json"
HEALTH_CACHE_PATH = CACHE_DIR / "health-cache.json"


# ── Section visibility ─────────────────────────────────────────────────────
# Section key → vault folder name. A section is "active" if its folder
# exists under VAULT_ROOT. Integration-only sections (sleep/body/health)
# follow different visibility rules — see available_sections below.
_VAULT_FOLDER_SECTIONS: Dict[str, str] = {
    "exercise":    "Exercise",
    "nutrition":   "Nutrition",
    "habits":      "Habits",
    "supplements": "Supplements",
    "chores":      "Chores",
    "caffeine":    "Caffeine",
    "cannabis":    "Cannabis",
    "groceries":   "Groceries",
    "air":         "Air",
}


def available_sections(oura: bool, withings: bool, apple: bool) -> List[str]:
    """Which section keys should appear in the UI nav.

    Three rules combine:
    - Vault-folder sections appear when their folder exists under VAULT_ROOT.
    - Integration sections (sleep/body/health) appear when their token
      is reachable — sleep falls back to Apple Health when Oura is absent.
    - Insights appears whenever at least one other section is active —
      correlations need something to correlate.
    """
    out: List[str] = []
    for key, folder in _VAULT_FOLDER_SECTIONS.items():
        if (VAULT_ROOT / folder).is_dir():
            out.append(key)
    if oura or apple:
        out.append("sleep")
    if withings:
        out.append("body")
    if apple:
        out.append("health")
    if out:
        # Registry key is "correlations" (the path is /insights). Keep
        # this string matching the SectionKey type in lib/sections.ts.
        out.append("correlations")
    return out
