"""Air — ambient environment data from an Aranet4 CO2/temp/humidity sensor.

Read-only from the frontend's perspective. Writes happen out-of-band via
`scripts/aranet_poller.py`, which is scheduled by launchd and runs under
the user session (BLE needs Bluetooth TCC permission, which uvicorn
doesn't have).

**Storage:** one YAML per **day** at `Bases/Air/Log/{date}.md`, with all
readings as a list under `readings:`. At 2-min cadence that's ~720
readings/day — per-file would create ~250k files/year. Daily rollup
keeps to ~365 files/year. This is the same tradeoff we made for
Health/Sleep/Body (external snapshots, not per-event).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter

from api import logger
from api.parsing import _extract_frontmatter, _normalize_number
from api.paths import AIR_DIR

router = APIRouter(prefix="/api/air", tags=["air"])


def _day_file(day: str) -> Path:
    return AIR_DIR / f"{day}.md"


def _load_day(day: str) -> List[Dict[str, Any]]:
    """Return the day's readings as a list of dicts. Each dict has the
    per-reading fields (time, co2_ppm, temp_c, humidity_pct, pressure_hpa)
    — the caller shouldn't need to know whether they came from per-event
    files or a rollup."""
    path = _day_file(day)
    if not path.exists():
        return []
    try:
        fm = _extract_frontmatter(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("air day %s failed to parse: %s", path.name, exc)
        return []
    if not fm:
        return []
    readings = fm.get("readings") or []
    if not isinstance(readings, list):
        return []
    # Return dicts that look like per-event frontmatter — backwards
    # compatible with any code that expects `date` on each reading.
    out: List[Dict[str, Any]] = []
    for r in readings:
        if not isinstance(r, dict):
            continue
        out.append({"date": day, **r})
    return out


def _latest_reading() -> Optional[Dict[str, Any]]:
    if not AIR_DIR.exists():
        return None
    files = sorted(AIR_DIR.glob("*.md"))
    if not files:
        return None
    # Iterate newest-first until we find a day with any readings.
    for p in reversed(files):
        day = p.stem
        events = _load_day(day)
        if events:
            return sorted(events, key=lambda e: str(e.get("time", "")))[-1]
    return None


def _co2_band(ppm: float) -> str:
    """CO2 health bands. <800 good, 800-1000 ok, 1000-1400 poor, >1400 bad."""
    if ppm < 800:
        return "good"
    if ppm < 1000:
        return "ok"
    if ppm < 1400:
        return "poor"
    return "bad"


def _day_stats(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    co2 = [
        v for v in (_normalize_number(e.get("co2_ppm")) for e in events) if v is not None
    ]
    temp = [
        v for v in (_normalize_number(e.get("temp_c")) for e in events) if v is not None
    ]
    hum = [
        v for v in (_normalize_number(e.get("humidity_pct")) for e in events) if v is not None
    ]
    mins_over_1000 = sum(1 for v in co2 if v >= 1000) * 2  # readings are ~2-min apart
    return {
        "readings": len(events),
        "co2_avg": round(sum(co2) / len(co2), 0) if co2 else None,
        "co2_max": round(max(co2), 0) if co2 else None,
        "co2_min": round(min(co2), 0) if co2 else None,
        "temp_avg": round(sum(temp) / len(temp), 1) if temp else None,
        "humidity_avg": round(sum(hum) / len(hum), 0) if hum else None,
        "minutes_over_1000": mins_over_1000,
    }


def _rolling_events(hours: int) -> List[Dict[str, Any]]:
    """Events from the last N hours, spanning yesterday + today."""
    now = datetime.now()
    cutoff = now - timedelta(hours=hours)
    today = date.today()
    yesterday = today - timedelta(days=1)
    out: List[Dict[str, Any]] = []
    for d in (yesterday, today):
        for e in _load_day(d.isoformat()):
            t = str(e.get("time", "")).strip()
            if not t:
                continue
            try:
                ts = datetime.fromisoformat(f"{d.isoformat()}T{t}")
            except ValueError:
                continue
            if ts >= cutoff:
                out.append(e)
    return out


@router.get("/summary")
def air_summary() -> Dict[str, Any]:
    """Latest reading + today's day-stats. Used by the mini-tile on the
    overview home and the headline row on the Air dashboard."""
    latest = _latest_reading()
    today = date.today().isoformat()
    today_events = _load_day(today)
    last_ts: Optional[str] = None
    if latest:
        d = latest.get("date")
        t = latest.get("time") or ""
        last_ts = f"{d}T{t}" if d and t else None
    co2 = _normalize_number(latest.get("co2_ppm")) if latest else None
    return {
        "latest": latest,
        "last_reading_at": last_ts,
        "co2_band": _co2_band(co2) if co2 is not None else None,
        "today": _day_stats(today_events),
        "last_24h": _day_stats(_rolling_events(24)),
    }


@router.get("/day/{day}")
def air_day(day: str) -> Dict[str, Any]:
    events = sorted(_load_day(day), key=lambda e: str(e.get("time", "")))
    return {
        "date": day,
        "readings": events,
        "stats": _day_stats(events),
    }


@router.get("/history")
def air_history(days: int = 7) -> Dict[str, Any]:
    """Daily aggregates for the last N days — one point per day."""
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        events = _load_day(d)
        stats = _day_stats(events)
        out.append({"date": d, **stats})
    return {"daily": out}


@router.get("/overnight")
def air_overnight(days: int = 30) -> Dict[str, Any]:
    """Sleep-window aggregates per night — labeled by the wake date (matches
    how Oura labels `sleep_score`). Window is 22:00 of the prior day through
    07:00 of the wake date. Used by /insights to correlate air conditions
    against sleep quality."""
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        wake = today - timedelta(days=offset)
        prev = wake - timedelta(days=1)
        # Collect evening readings (≥22:00) from prior day + early morning
        # readings (<07:00) from wake day.
        window: List[Dict[str, Any]] = []
        for e in _load_day(prev.isoformat()):
            t = str(e.get("time", "")).strip()
            if t and t >= "22:00":
                window.append(e)
        for e in _load_day(wake.isoformat()):
            t = str(e.get("time", "")).strip()
            if t and t < "07:00":
                window.append(e)
        if not window:
            continue
        stats = _day_stats(window)
        co2_vals = [
            v for v in (_normalize_number(e.get("co2_ppm")) for e in window) if v is not None
        ]
        temp_vals = [
            v for v in (_normalize_number(e.get("temp_c")) for e in window) if v is not None
        ]
        out.append({
            "date": wake.isoformat(),
            "readings": len(window),
            "co2_avg": stats["co2_avg"],
            "co2_max": stats["co2_max"],
            "co2_min": round(min(co2_vals), 0) if co2_vals else None,
            "temp_avg": stats["temp_avg"],
            "temp_min": round(min(temp_vals), 1) if temp_vals else None,
            "temp_max": round(max(temp_vals), 1) if temp_vals else None,
            "humidity_avg": stats["humidity_avg"],
        })
    return {"nights": out}


@router.get("/readings")
def air_readings(days: int = 1, hours: Optional[int] = None) -> Dict[str, Any]:
    """Flat time-series across the last N days for charting. Points are
    {datetime, co2_ppm, temp_c, humidity_pct}. Ordered oldest-first.

    When `hours` is set, returns a rolling window ending now (spans yesterday
    + today as needed) and `days` is ignored."""
    today = date.today()
    if hours is not None:
        cutoff = datetime.now() - timedelta(hours=hours)
        day_iter = [today - timedelta(days=1), today]
    else:
        cutoff = None
        day_iter = [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]
    out: List[Dict[str, Any]] = []
    for d in day_iter:
        ds = d.isoformat()
        events = sorted(_load_day(ds), key=lambda e: str(e.get("time", "")))
        for e in events:
            t = str(e.get("time", "")).strip()
            if not t:
                continue
            if cutoff is not None:
                try:
                    ts = datetime.fromisoformat(f"{ds}T{t}")
                except ValueError:
                    continue
                if ts < cutoff:
                    continue
            out.append({
                "datetime": f"{ds}T{t}",
                "date": ds,
                "time": t,
                "co2_ppm": _normalize_number(e.get("co2_ppm")),
                "temp_c": _normalize_number(e.get("temp_c")),
                "humidity_pct": _normalize_number(e.get("humidity_pct")),
                "pressure_hpa": _normalize_number(e.get("pressure_hpa")),
            })
    return {"readings": out}
