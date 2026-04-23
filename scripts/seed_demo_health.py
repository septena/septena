#!/usr/bin/env python3
"""Seed a fake health-cache.json covering Oura + Withings + Apple HAE.

Used by the screenshot pipeline so the sleep/body/health pages render
without needing real Oura tokens, Withings OAuth, or a device dropping
HealthKit data. The backend reads this file when SEPTENA_DEMO_HEALTH=1.

Shape mirrors what /api/health/combined returns:

    {
      "apple":    [ { date, steps, active_cal, exercise_min, hrv, ... }, ... ],
      "oura":     [ { date, sleep_score, total_h, deep_h, rem_h, hrv, ... }, ... ],
      "withings": [ { date, weight_kg, fat_pct }, ... ]
    }
"""
from __future__ import annotations

import argparse
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path


def _oura_row(d: date, i: int) -> dict:
    # Cycle through realistic values with some noise. Weekdays a bit
    # better-rested than weekends.
    weekday_boost = -5 if d.weekday() >= 5 else 0
    score = 78 + weekday_boost + random.randint(-6, 8)
    total_h = round(7.2 + random.uniform(-0.9, 0.7), 2)
    deep_h = round(1.4 + random.uniform(-0.3, 0.4), 2)
    rem_h = round(1.8 + random.uniform(-0.4, 0.5), 2)
    light_h = round(max(0.5, total_h - deep_h - rem_h - 0.3), 2)
    return {
        "date": d.isoformat(),
        "sleep_score": score,
        "total_h": total_h,
        "deep_h": deep_h,
        "rem_h": rem_h,
        "light_h": light_h,
        "awake_h": round(random.uniform(0.1, 0.4), 2),
        "efficiency": round(88 + random.uniform(-5, 6), 1),
        "hrv": round(42 + math.sin(i / 3.5) * 8 + random.uniform(-3, 3), 1),
        "resting_hr": round(56 + math.cos(i / 4.0) * 3 + random.uniform(-1.5, 1.5), 1),
        "bedtime": f"{random.randint(22, 23):02d}:{random.randint(0, 59):02d}",
        "wake_time": f"{random.randint(6, 7):02d}:{random.randint(0, 59):02d}",
        "readiness_score": 78 + random.randint(-7, 8),
        "activity_score": 80 + random.randint(-10, 10),
        "steps": 9000 + random.randint(-3000, 5000),
        "active_cal": 450 + random.randint(-180, 300),
    }


def _withings_row(d: date, i: int) -> dict:
    # Slow weight drift downward over the period, ±0.4 kg noise.
    base_weight = 80.5 - i * 0.03
    return {
        "date": d.isoformat(),
        "weight_kg": round(base_weight + random.uniform(-0.4, 0.4), 1),
        "fat_pct": round(17.5 + random.uniform(-0.8, 0.8), 1),
    }


def _apple_row(d: date, i: int) -> dict:
    steps = 8500 + random.randint(-3500, 5500)
    return {
        "date": d.isoformat(),
        "steps": steps,
        "active_cal": round(420 + random.uniform(-180, 320), 0),
        "exercise_min": random.randint(15, 65),
        "flights_climbed": random.randint(5, 22),
        "distance_km": round(steps * 0.00075 + random.uniform(-0.3, 0.3), 2),
        "hrv": round(44 + math.sin(i / 3.5) * 8 + random.uniform(-3, 3), 1),
        "resting_heart_rate": round(57 + random.uniform(-2, 2), 1),
        "respiratory_rate": round(14 + random.uniform(-1, 1), 1),
        "spo2": round(97 + random.uniform(-1, 1.5), 1),
        "vo2_max": round(42 + random.uniform(-1, 1), 1),
        "heart_rate": round(72 + random.uniform(-5, 5), 1),
    }


def build_cache(today: date, days: int = 30, seed: int = 42) -> dict:
    random.seed(seed)
    rows_desc = range(days - 1, -1, -1)  # oldest → newest, like the real API
    dates = [today - timedelta(days=offset) for offset in rows_desc]
    return {
        "apple":    [_apple_row(d, i) for i, d in enumerate(dates)],
        "oura":     [_oura_row(d, i) for i, d in enumerate(dates)],
        "withings": [_withings_row(d, i) for i, d in enumerate(dates)],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True, type=Path,
                    help="Target path for health-cache.json")
    ap.add_argument("--today", default=None,
                    help="Override 'today' as YYYY-MM-DD")
    ap.add_argument("--days", type=int, default=30)
    args = ap.parse_args()

    today = (date.fromisoformat(args.today) if args.today else date.today())
    cache = build_cache(today, args.days)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(cache))
    print(f"Seeded {args.out}  ({args.days} days ending {today.isoformat()})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
