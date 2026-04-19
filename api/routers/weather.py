"""Weather — current conditions for the city configured in settings.

Open-Meteo is used because it requires no API key and has a sibling
geocoding endpoint that resolves a free-form city name to lat/lon. The
geocoding result is cached on disk (keyed by lowercased name) so the
network round-trip only happens when the user changes the location.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from api import logger
from api.paths import CACHE_DIR
from api.routers.settings import _load_settings

router = APIRouter(prefix="/api/weather", tags=["weather"])

GEOCODE_CACHE_PATH = CACHE_DIR / "weather-geocode.json"
WEATHER_TIMEOUT = 6.0


# Open-Meteo WMO weather codes — collapsed to the 8 buckets we care about
# for the tile (icon + short label). Full list is 100+ codes; this covers
# every value the API returns by mapping ranges to a single bucket.
def _wmo_summary(code: int) -> Dict[str, str]:
    if code == 0:
        return {"label": "Clear", "icon": "sun"}
    if code in (1, 2):
        return {"label": "Partly cloudy", "icon": "partly"}
    if code == 3:
        return {"label": "Overcast", "icon": "cloud"}
    if code in (45, 48):
        return {"label": "Fog", "icon": "fog"}
    if 51 <= code <= 67 or 80 <= code <= 82:
        return {"label": "Rain", "icon": "rain"}
    if 71 <= code <= 77 or 85 <= code <= 86:
        return {"label": "Snow", "icon": "snow"}
    if code >= 95:
        return {"label": "Storm", "icon": "storm"}
    return {"label": "—", "icon": "cloud"}


def _load_geocode_cache() -> Dict[str, Dict[str, Any]]:
    if not GEOCODE_CACHE_PATH.exists():
        return {}
    try:
        return json.loads(GEOCODE_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _save_geocode_cache(cache: Dict[str, Dict[str, Any]]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    GEOCODE_CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")


def _geocode(name: str) -> Optional[Dict[str, Any]]:
    """Resolve a city name to {lat, lon, label}. Returns None on miss."""
    key = name.strip().lower()
    if not key:
        return None
    cache = _load_geocode_cache()
    if key in cache:
        return cache[key]
    qs = urllib.parse.urlencode({"name": name, "count": 1, "language": "en"})
    url = f"https://geocoding-api.open-meteo.com/v1/search?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=WEATHER_TIMEOUT) as r:
            payload = json.loads(r.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("weather: geocode failed for %r: %s", name, exc)
        return None
    results = payload.get("results") or []
    if not results:
        return None
    top = results[0]
    resolved = {
        "lat": float(top["latitude"]),
        "lon": float(top["longitude"]),
        "label": ", ".join(filter(None, [top.get("name"), top.get("admin1"), top.get("country_code")])),
    }
    cache[key] = resolved
    _save_geocode_cache(cache)
    return resolved


def _fetch_forecast(lat: float, lon: float, units: str) -> Dict[str, Any]:
    temp_unit = "fahrenheit" if units == "fahrenheit" else "celsius"
    qs = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
        "temperature_unit": temp_unit,
        "wind_speed_unit": "kmh",
        "timezone": "auto",
        "forecast_days": 7,
    })
    url = f"https://api.open-meteo.com/v1/forecast?{qs}"
    with urllib.request.urlopen(url, timeout=WEATHER_TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


@router.get("")
def weather_now() -> Dict[str, Any]:
    settings = _load_settings()
    cfg = settings.get("weather") or {}
    location = (cfg.get("location") or "").strip()
    units = cfg.get("units") or "celsius"
    if not location:
        raise HTTPException(status_code=400, detail="weather location not configured")

    geo = _geocode(location)
    if not geo:
        raise HTTPException(status_code=404, detail=f"could not resolve location {location!r}")

    try:
        forecast = _fetch_forecast(geo["lat"], geo["lon"], units)
    except Exception as exc:  # noqa: BLE001
        logger.warning("weather: forecast fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="weather provider unreachable") from exc

    current = forecast.get("current") or {}
    daily = forecast.get("daily") or {}
    code = int(current.get("weather_code") or 0)
    summary = _wmo_summary(code)

    days = []
    times = daily.get("time") or []
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []
    codes = daily.get("weather_code") or []
    pops = daily.get("precipitation_probability_max") or []
    for i, iso in enumerate(times):
        d_summary = _wmo_summary(int(codes[i]) if i < len(codes) else 0)
        days.append({
            "date": iso,
            "weekday": datetime.fromisoformat(iso).strftime("%a"),
            "high": tmax[i] if i < len(tmax) else None,
            "low": tmin[i] if i < len(tmin) else None,
            "label": d_summary["label"],
            "icon": d_summary["icon"],
            "precip_pct": pops[i] if i < len(pops) else None,
        })

    return {
        "location": geo["label"],
        "units": units,
        "temp_unit": "°F" if units == "fahrenheit" else "°C",
        "current": {
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "wind_kmh": current.get("wind_speed_10m"),
            "code": code,
            "label": summary["label"],
            "icon": summary["icon"],
        },
        "daily": days,
    }
