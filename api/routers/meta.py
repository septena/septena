"""Meta / Data quality — cross-section endpoints that reach into every
other section's paths. /api/config returns filesystem config + reachable
integrations + nav visibility. /api/meta returns freshness/recency for
every data source.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter

from api.paths import (
    APPLE_HEALTH_PATH,
    CACHE_DIR,
    CAFFEINE_DIR,
    CANNABIS_DIR,
    CHORES_LOG_DIR,
    DATA_DIR,
    DATA_ROOT,
    HABITS_DIR,
    HEALTH_CACHE_PATH,
    HEALTH_ROOT,
    INTEGRATIONS_DIR,
    NUTRITION_DIR,
    OURA_TOKEN_PATH,
    SUPPL_DIR,
    WITHINGS_CREDS_PATH,
    WITHINGS_TOKEN_PATH,
    available_sections,
)

router = APIRouter(tags=["meta"])


def _dir_meta(directory: Path, pattern: str = "*.md") -> Dict[str, Any]:
    """Return file count, newest and oldest file dates for a data directory."""
    if not directory.exists():
        return {"files": 0, "newest": None, "oldest": None, "dir": str(directory)}
    files = sorted(directory.glob(pattern))
    if not files:
        return {"files": 0, "newest": None, "oldest": None, "dir": str(directory)}
    # Extract dates from filenames (YYYY-MM-DD prefix) or fall back to mtime
    dates: list[str] = []
    mtimes: list[float] = []
    for f in files:
        name = f.stem
        part = name[:10]
        if len(part) == 10 and part[4] == "-" and part[7] == "-":
            dates.append(part)
        mtimes.append(f.stat().st_mtime)
    newest_date = max(dates) if dates else None
    oldest_date = min(dates) if dates else None
    newest_mtime = datetime.fromtimestamp(max(mtimes)).isoformat() if mtimes else None
    return {
        "files": len(files),
        "newest": newest_date,
        "oldest": oldest_date,
        "last_modified": newest_mtime,
        "dir": str(directory),
    }


@router.get("/api/config")
def get_config() -> Dict[str, Any]:
    """Resolved filesystem config + reachable integrations + nav visibility.
    Lets the UI show correct paths, gate integration-specific views when
    tokens are missing, render onboarding when the data folder is missing,
    and filter nav by what actually exists in the user's data folder."""
    data_exists = DATA_ROOT.exists() and DATA_ROOT.is_dir()
    data_has_sections = data_exists and any(
        child.is_dir() and not child.name.startswith(".")
        for child in DATA_ROOT.iterdir()
    )
    oura = OURA_TOKEN_PATH.exists()
    withings = WITHINGS_TOKEN_PATH.exists() and WITHINGS_CREDS_PATH.exists()
    apple_health = APPLE_HEALTH_PATH.exists()
    return {
        "paths": {
            "data": str(DATA_ROOT),
            "health": str(HEALTH_ROOT),
            "integrations": str(INTEGRATIONS_DIR),
            "cache": str(CACHE_DIR),
        },
        "data_exists": data_exists,
        "data_has_sections": data_has_sections,
        "integrations": {
            "oura": oura,
            "withings": withings,
            "apple_health": apple_health,
        },
        "available_sections": available_sections(oura, withings, apple_health),
    }


@router.get("/api/meta")
def get_meta() -> Dict[str, Any]:
    """Data quality and recency overview for all sections."""
    sources: Dict[str, Any] = {}

    # Training
    sources["training"] = {"label": "Training", **_dir_meta(DATA_DIR)}
    # Nutrition
    sources["nutrition"] = {"label": "Nutrition", **_dir_meta(NUTRITION_DIR)}
    # Habits
    sources["habits"] = {"label": "Habits", **_dir_meta(HABITS_DIR)}
    # Chores
    sources["chores"] = {"label": "Chores", **_dir_meta(CHORES_LOG_DIR)}
    # Supplements
    sources["supplements"] = {"label": "Supplements", **_dir_meta(SUPPL_DIR)}
    # Cannabis
    sources["cannabis"] = {"label": "Cannabis", **_dir_meta(CANNABIS_DIR)}
    # Caffeine
    sources["caffeine"] = {"label": "Caffeine", **_dir_meta(CAFFEINE_DIR)}

    # Health — external sources
    health_sub: Dict[str, Any] = {}

    # Pull the most-recent sample date for Oura/Withings from the health
    # cache. The live APIs don't write to disk, so the token file's mtime
    # tells us nothing about actual data freshness. The cache is the last
    # payload we successfully fetched, which IS a meaningful recency signal.
    cache_oura_rows: List[Dict[str, Any]] = []
    cache_withings_rows: List[Dict[str, Any]] = []
    if HEALTH_CACHE_PATH.exists():
        try:
            cache_data = json.loads(HEALTH_CACHE_PATH.read_text())
            cache_oura_rows = cache_data.get("oura") or []
            cache_withings_rows = cache_data.get("withings") or []
        except Exception:
            pass

    def _newest_sample_date(rows: List[Dict[str, Any]], fields: List[str]) -> str | None:
        """Newest row date where at least one `fields` entry is non-null."""
        for row in reversed(rows):
            if any(row.get(f) is not None for f in fields):
                return row.get("date")
        return None

    def _as_eod_iso(day: str | None) -> str | None:
        """ISO date → ISO datetime at 23:59 local so freshness math works."""
        if not day:
            return None
        return f"{day}T23:59:59"

    # Apple Health Auto Export
    if APPLE_HEALTH_PATH.exists():
        st = APPLE_HEALTH_PATH.stat()
        health_sub["apple"] = {
            "label": "Apple Health",
            "status": "ok",
            "last_modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
            "size_mb": round(st.st_size / 1_048_576, 1),
        }
    else:
        health_sub["apple"] = {"label": "Apple Health", "status": "missing"}

    # Oura — recency = date of most recent sleep/readiness/activity sample.
    if OURA_TOKEN_PATH.exists():
        newest = _newest_sample_date(
            cache_oura_rows,
            ["sleep_score", "readiness_score", "activity_score", "steps"],
        )
        health_sub["oura"] = {
            "label": "Oura Ring",
            "status": "ok" if newest else "no data",
            "last_modified": _as_eod_iso(newest),
            "detail": f"last sleep {newest}" if newest else None,
        }
    else:
        health_sub["oura"] = {"label": "Oura Ring", "status": "no token"}

    # Withings — recency = date of most recent weight sample.
    if WITHINGS_TOKEN_PATH.exists():
        try:
            wt = json.loads(WITHINGS_TOKEN_PATH.read_text())
            expires = wt.get("expires_at")
            expired = expires is not None and expires < datetime.now().timestamp()
            newest = _newest_sample_date(cache_withings_rows, ["weight_kg", "fat_pct"])
            health_sub["withings"] = {
                "label": "Withings",
                "status": "expired" if expired else ("ok" if newest else "no data"),
                "last_modified": _as_eod_iso(newest),
                "detail": f"last weigh-in {newest}" if newest else None,
            }
        except Exception:
            health_sub["withings"] = {"label": "Withings", "status": "error"}
    else:
        health_sub["withings"] = {"label": "Withings", "status": "no token"}

    # Health cache
    if HEALTH_CACHE_PATH.exists():
        st = HEALTH_CACHE_PATH.stat()
        health_sub["cache"] = {
            "label": "Health Cache",
            "last_modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
        }
    else:
        health_sub["cache"] = {"label": "Health Cache", "last_modified": None}

    sources["health"] = {"label": "Health", "sources": health_sub}

    return {"sources": sources}
