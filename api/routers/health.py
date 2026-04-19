"""Health — Oura + Withings + Apple Health Auto Export.

Three external sources stitched together. Oura and Withings are live API
calls; Apple Health is read from a file Health Auto Export drops on disk.
The combined endpoint writes a local JSON snapshot used by the cache
endpoint so the frontend has an instant-load path.
"""
from __future__ import annotations

import json
import subprocess
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter

from api.paths import (
    APPLE_HEALTH_PATH,
    HEALTH_CACHE_PATH,
    OURA_TOKEN_PATH,
    WITHINGS_CREDS_PATH,
    WITHINGS_TOKEN_PATH,
)

router = APIRouter(prefix="/api/health", tags=["health"])


def _fetch_oura(url: str) -> Dict[str, Any]:
    """GET an Oura API endpoint with Bearer auth. Returns {} on failure."""
    if not OURA_TOKEN_PATH.exists():
        return {}
    token = OURA_TOKEN_PATH.read_text().strip()
    result = subprocess.run(
        ["curl", "-s", "-H", f"Authorization: Bearer {token}", url],
        capture_output=True, text=True
    )
    try:
        return json.loads(result.stdout)
    except Exception:
        return {}


def _oura_sleep(start: str, end: str) -> List[Dict[str, Any]]:
    url = f"https://api.ouraring.com/v2/usercollection/sleep?start_date={start}&end_date={end}"
    data = _fetch_oura(url)
    return data.get("data", [])


def _oura_activity(start: str, end: str) -> List[Dict[str, Any]]:
    url = f"https://api.ouraring.com/v2/usercollection/daily_activity?start_date={start}&end_date={end}"
    data = _fetch_oura(url)
    return data.get("data", [])


def _oura_readiness(start: str, end: str) -> List[Dict[str, Any]]:
    url = f"https://api.ouraring.com/v2/usercollection/daily_readiness?start_date={start}&end_date={end}"
    data = _fetch_oura(url)
    return data.get("data", [])


def _oura_daily_sleep(start: str, end: str) -> List[Dict[str, Any]]:
    url = f"https://api.ouraring.com/v2/usercollection/daily_sleep?start_date={start}&end_date={end}"
    data = _fetch_oura(url)
    return data.get("data", [])


def _withings_token() -> Dict[str, Any] | None:
    if not WITHINGS_TOKEN_PATH.exists():
        return None
    try:
        raw = json.loads(WITHINGS_TOKEN_PATH.read_text())
        if isinstance(raw, dict) and "body" in raw:
            return raw["body"]
        return raw
    except Exception:
        return None


def _withings_refresh() -> bool:
    tok = _withings_token()
    if not tok:
        return False
    if not WITHINGS_CREDS_PATH.exists():
        return False
    try:
        creds = json.loads(WITHINGS_CREDS_PATH.read_text())
    except Exception:
        return False
    client_id = creds.get("client_id")
    client_secret = creds.get("client_secret")
    refresh_token = tok.get("refresh_token")
    if not all([client_id, client_secret, refresh_token]):
        return False
    data = urllib.parse.urlencode({
        "action": "requesttoken",
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }).encode()
    req = urllib.request.Request("https://wbsapi.withings.net/v2/oauth2", data=data)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())
        if res.get("status") == 0:
            res["expires_at"] = int(datetime.now().timestamp()) + res.get("expires_in", 10800)
            WITHINGS_TOKEN_PATH.write_text(json.dumps(res))
            return True
    except Exception:
        pass
    return False


def _withings_measure(start: str, end: str) -> List[Dict[str, Any]]:
    tok = _withings_token()
    if not tok:
        return []
    access_token = tok.get("access_token")
    if not access_token:
        return []
    start_ts = int(datetime.fromisoformat(start).timestamp())
    end_ts = int(datetime.fromisoformat(end).timestamp())
    url = (
        f"https://wbsapi.withings.net/v2/measure"
        f"?action=getmeas"
        f"&meastypes=1,6"
        f"&startdate={start_ts}"
        f"&enddate={end_ts}"
        f"&timezone=Europe/Amsterdam"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())
    except Exception:
        return []
    if res.get("status") != 0:
        if res.get("status") == 401:
            _withings_refresh()
        return []
    results = []
    for g in res.get("body", {}).get("measuregrps", []):
        entry: Dict[str, Any] = {
            "date": datetime.fromtimestamp(g["date"]).strftime("%Y-%m-%d")
        }
        for m in g.get("measures", []):
            t, v, u = m["type"], m["value"], m.get("unit", 1)
            if t == 1:
                entry["weight_kg"] = round(v * (0.001 if u == -3 else 1), 1)
            if t == 6:
                entry["fat_pct"] = round(v * (0.001 if u == -3 else 1), 1)
        if "weight_kg" in entry:
            results.append(entry)
    return results


def _date_range(days: int, end_iso: str | None = None) -> tuple[str, str]:
    end = date.fromisoformat(end_iso) if end_iso else date.today()
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


# ── Apple Health Auto Export ───────────────────────────────────────────────

APPLE_METRIC_KEYS = [
    "step_count", "active_energy", "vo2_max", "heart_rate_variability",
    "resting_heart_rate", "respiratory_rate", "blood_oxygen_saturation",
    "cardio_recovery", "flights_climbed", "walking_running_distance",
    "apple_exercise_time",
]

APPLE_SLEEP_KEYS = ["totalSleep", "deep", "rem", "core", "awake", "inBed",
                    "sleepStart", "sleepEnd", "inBedStart", "inBedEnd"]


def _read_apple_health() -> Dict[str, Any]:
    """Read and parse latest.json from Apple Health Auto Export."""
    if not APPLE_HEALTH_PATH.exists():
        return {}
    try:
        raw = json.loads(APPLE_HEALTH_PATH.read_text())
        metrics = {m["name"]: m for m in raw["data"]["data"]["metrics"]}
        return metrics
    except Exception:
        return {}


def _aggregate_apple_days(days: int, end_iso: str | None = None) -> List[Dict[str, Any]]:
    """Aggregate Apple Health metrics per day for N days ending at `end_iso`
    (default today)."""
    metrics = _read_apple_health()
    if not metrics:
        return []

    end = date.fromisoformat(end_iso) if end_iso else date.today()

    # Index raw data by day string (YYYY-MM-DD)
    def day_key(ts: str) -> str:
        return ts[:10]

    indexed: Dict[str, Dict[str, Any]] = {}
    for i in range(days):
        d = (end - timedelta(days=i)).isoformat()
        indexed[d] = {"date": d}

    # Per-minute metrics → sum per day
    for metric_name in ["step_count", "active_energy", "flights_climbed",
                         "walking_running_distance", "apple_exercise_time"]:
        if metric_name not in metrics:
            continue
        daily: Dict[str, float] = {}
        for r in metrics[metric_name].get("data", []):
            dk = day_key(r["date"])
            if dk in indexed:
                daily[dk] = daily.get(dk, 0) + float(r.get("qty", 0))
        for dk, v in daily.items():
            key = {
                "step_count": "steps",
                "active_energy": "active_cal",
                "flights_climmed": "flights_climbed",
                "walking_running_distance": "distance_km",
                "apple_exercise_time": "exercise_min",
            }.get(metric_name, metric_name)
            indexed[dk][key] = round(v, 2)

    # Episodic metrics → latest per day (by timestamp desc)
    for metric_name in ["vo2_max", "heart_rate_variability", "resting_heart_rate",
                         "respiratory_rate", "blood_oxygen_saturation", "cardio_recovery"]:
        if metric_name not in metrics:
            continue
        latest_per_day: Dict[str, Dict[str, Any]] = {}
        for r in metrics[metric_name].get("data", []):
            dk = day_key(r["date"])
            if dk in indexed:
                if dk not in latest_per_day or r["date"] > latest_per_day[dk]["date"]:
                    latest_per_day[dk] = r
        for dk, r in latest_per_day.items():
            key = {
                "heart_rate_variability": "hrv",
                "blood_oxygen_saturation": "spo2",
                "cardio_recovery": "cardio_recovery",
            }.get(metric_name, metric_name)
            indexed[dk][key] = round(float(r["qty"]), 1) if r.get("qty") is not None else None

    # Heart rate → avg for the day (sampled from per-minute)
    if "heart_rate" in metrics:
        hr_daily: Dict[str, list] = {}
        for r in metrics["heart_rate"].get("data", []):
            dk = day_key(r["date"])
            if dk in indexed and r.get("qty") is not None:
                hr_daily.setdefault(dk, []).append(float(r["qty"]))
        for dk, vals in hr_daily.items():
            indexed[dk]["hr_avg"] = round(sum(vals) / len(vals), 1)

    # Sleep analysis (from Apple Health — sourced from Oura)
    sleep_map: Dict[str, Dict[str, Any]] = {}
    for r in metrics.get("sleep_analysis", {}).get("data", []):
        dk = day_key(r["date"])
        if dk in indexed:
            sleep_map[dk] = r
    for dk, r in sleep_map.items():
        indexed[dk].update({
            "apple_total_h": round(r.get("totalSleep", 0) or 0, 2),
            "apple_deep_h": round(r.get("deep", 0) or 0, 2),
            "apple_rem_h": round(r.get("rem", 0) or 0, 2),
            "apple_core_h": round(r.get("core", 0) or 0, 2),
            "apple_awake_h": round(r.get("awake", 0) or 0, 2),
            "apple_bedtime": r.get("sleepStart", "")[11:16] if r.get("sleepStart") else None,
            "apple_wake_time": r.get("sleepEnd", "")[11:16] if r.get("sleepEnd") else None,
        })

    return sorted(indexed.values(), key=lambda x: x["date"])


@router.get("/apple")
def health_apple(days: int = 30, end: str | None = None) -> Dict[str, Any]:
    """Apple Health Auto Export — aggregated per-day metrics."""
    return {"apple": _aggregate_apple_days(days, end)}


@router.get("/oura")
def health_oura(days: int = 30, end: str | None = None) -> Dict[str, Any]:
    """Oura sleep + activity + readiness for the last N days ending at `end`."""
    start, end = _date_range(days, end)
    end_plus = (date.fromisoformat(end) + timedelta(days=1)).isoformat()
    sleep_records = _oura_sleep(start, end_plus)
    act_records = _oura_activity(start, end_plus)
    readiness_records = _oura_readiness(start, end_plus)
    daily_sleep_records = _oura_daily_sleep(start, end_plus)

    # Index by date
    sleep_map = {r.get("day"): r for r in sleep_records}
    act_map = {r.get("day"): r for r in act_records}
    readiness_map = {r.get("day"): r for r in readiness_records}
    daily_sleep_map = {r.get("day"): r for r in daily_sleep_records}

    def h(s): return round(s / 3600, 2) if s else None

    rows = []
    for offset in range(days - 1, -1, -1):
        d = (date.fromisoformat(end) - timedelta(days=offset)).isoformat()
        s = sleep_map.get(d, {})
        a = act_map.get(d, {})
        r = readiness_map.get(d, {})
        ds = daily_sleep_map.get(d, {})
        rows.append({
            "date": d,
            "sleep_score": ds.get("score"),
            "total_h": h(s.get("total_sleep_duration")),
            "deep_h": h(s.get("deep_sleep_duration")),
            "rem_h": h(s.get("rem_sleep_duration")),
            "light_h": h(s.get("light_sleep_duration")),
            "awake_h": h(s.get("awake_time")),
            "efficiency": s.get("efficiency"),
            "hrv": s.get("average_hrv"),
            "resting_hr": s.get("lowest_heart_rate"),
            "bedtime": (s.get("bedtime_start") or "")[11:16] if s.get("bedtime_start") else None,
            "wake_time": (s.get("bedtime_end") or "")[11:16] if s.get("bedtime_end") else None,
            "readiness_score": r.get("score"),
            "activity_score": a.get("score"),
            "steps": a.get("steps"),
            "active_cal": a.get("active_calories"),
        })
    return {"oura": rows}


@router.get("/withings")
def health_withings(days: int = 30, end: str | None = None) -> Dict[str, Any]:
    """Withings weight + body fat for the last N days ending at `end`."""
    start, end = _date_range(days, end)
    measurements = _withings_measure(start, end)
    meas_map = {m["date"]: m for m in measurements}
    rows = []
    for offset in range(days - 1, -1, -1):
        d = (date.fromisoformat(end) - timedelta(days=offset)).isoformat()
        m = meas_map.get(d, {})
        rows.append({"date": d, "weight_kg": m.get("weight_kg"), "fat_pct": m.get("fat_pct")})
    return {"withings": rows}


@router.get("/summary")
def health_summary() -> Dict[str, Any]:
    """Latest values from Oura + Withings."""
    start, end = _date_range(7)
    end_plus = (date.fromisoformat(end) + timedelta(days=1)).isoformat()
    sleep_records = _oura_sleep(start, end_plus)
    readiness_records = _oura_readiness(start, end_plus)
    daily_sleep_records = _oura_daily_sleep(start, end_plus)
    withings = _withings_measure(start, end)

    latest_sleep = sleep_records[-1] if sleep_records else None
    latest_readiness = readiness_records[-1] if readiness_records else None
    latest_daily_sleep = daily_sleep_records[-1] if daily_sleep_records else None
    latest_w = withings[-1] if withings else None

    def h(s): return round(s / 3600, 1) if s else None

    return {
        "oura": {
            "sleep_score": latest_daily_sleep.get("score") if latest_daily_sleep else None,
            "readiness_score": latest_readiness.get("score") if latest_readiness else None,
            "total_h": h(latest_sleep.get("total_sleep_duration")) if latest_sleep else None,
            "deep_h": h(latest_sleep.get("deep_sleep_duration")) if latest_sleep else None,
            "rem_h": h(latest_sleep.get("rem_sleep_duration")) if latest_sleep else None,
            "hrv": latest_sleep.get("average_hrv") if latest_sleep else None,
            "resting_hr": latest_sleep.get("lowest_heart_rate") if latest_sleep else None,
            "bedtime": (latest_sleep.get("bedtime_start") or "")[11:16] if latest_sleep and latest_sleep.get("bedtime_start") else None,
            "wake_time": (latest_sleep.get("bedtime_end") or "")[11:16] if latest_sleep and latest_sleep.get("bedtime_end") else None,
            "steps": latest_readiness and latest_readiness.get("daily_steps"),
        } if latest_sleep or latest_readiness else None,
        "withings": {
            "weight_kg": latest_w.get("weight_kg") if latest_w else None,
            "fat_pct": latest_w.get("fat_pct") if latest_w else None,
        } if latest_w else None,
    }


@router.get("/combined")
def health_combined(days: int = 7, end: str | None = None) -> Dict[str, Any]:
    """All health sources combined. Writes to cache only when anchored at today
    so the cache remains a live "now" snapshot rather than a time-travelled view."""
    apple = _aggregate_apple_days(days, end)
    oura = health_oura(days, end)["oura"]
    withings = health_withings(days, end)["withings"]
    result = {"apple": apple, "oura": oura, "withings": withings}
    if end is None:
        try:
            HEALTH_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            HEALTH_CACHE_PATH.write_text(json.dumps(result))
        except Exception:
            pass
    return result


@router.get("/cache")
def health_cache() -> Dict[str, Any]:
    """Return cached health data (instant, no API calls)."""
    if HEALTH_CACHE_PATH.exists():
        try:
            return json.loads(HEALTH_CACHE_PATH.read_text())
        except Exception:
            pass
    return {"apple": [], "oura": [], "withings": []}
