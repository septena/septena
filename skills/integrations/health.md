---
name: septena-health
description: Read Septena's Health section — per-day vitals (HRV, resting HR, steps, VO₂ max, active calories, exercise minutes) from Apple Health Auto Export. Read-only.
---

# Septena · Health (integration-backed)

Vitals and activity from **Apple Health Auto Export**. An iOS app dumps
the full HealthKit snapshot to a local file; Septena reads and
aggregates per day. No vault folder — read via HTTP API.

## When to use this skill

- User asks about HRV, resting heart rate, steps, VO₂ max, active
  calories, exercise minutes, flights climbed, walking distance.
- User asks how their cardio training is affecting their heart rate
  metrics.
- User wants vitals correlated with nutrition/training/sleep.

## Data source

| File | Purpose |
|---|---|
| `$SEPTENA_INTEGRATIONS_DIR/health_auto_export/latest.json` | Full HealthKit snapshot from the Health Auto Export iOS app |

The iOS app posts to a user-run local webhook that writes this file.
Setup detail: [`docs/HEALTH_DATA_SPEC.md`](../../docs/HEALTH_DATA_SPEC.md).

If the file is missing, `GET /api/config` → `integrations.apple_health`
is `false` and the Health section is hidden.

## Endpoint

### `GET /api/health/apple?days=N` (N defaults to 30)

Returns one row per calendar day with aggregated metrics. Missing
metrics are absent from the row (not null-padded).

```json
{
  "apple": [
    {
      "date": "2026-04-17",
      "steps": 8924,
      "active_cal": 412,
      "exercise_min": 45,
      "distance_km": 6.8,
      "flights_climbed": 12,
      "hrv": 52.3,
      "resting_heart_rate": 54.0,
      "vo2_max": 44.1,
      "spo2": 97.0,
      "respiratory_rate": 14.2,
      "hr_avg": 68.5,
      "apple_total_h": 7.1,
      "apple_deep_h": 1.0,
      "apple_rem_h": 1.6,
      "apple_core_h": 4.2,
      "apple_awake_h": 0.3,
      "apple_bedtime": "23:45",
      "apple_wake_time": "06:55"
    }
  ]
}
```

## Metric aggregation rules

| Kind | How it's rolled up per day |
|---|---|
| `steps`, `active_cal`, `exercise_min`, `distance_km`, `flights_climbed` | **Sum** of minute-level samples for the day |
| `hrv`, `resting_heart_rate`, `vo2_max`, `spo2`, `respiratory_rate`, `cardio_recovery` | **Latest** reading of the day (episodic metrics) |
| `hr_avg` | **Average** of minute-level heart rate samples |
| `apple_*_h` (sleep stages) | Direct from `sleep_analysis` records, keyed to the wake-up day |

## File-only fallback

If the app isn't running, read and parse
`$SEPTENA_INTEGRATIONS_DIR/health_auto_export/latest.json` directly —
structure is `data.data.metrics[]`, each with `name` + `data[{date, qty}]`.
See `docs/HEALTH_DATA_SPEC.md` for the full list of metric names.

## Example interactions

- **"What's my HRV trend?"** → `GET /api/health/apple?days=30`, extract
  `hrv` per day, chart or mean/stddev.
- **"How active was I this week?"** → sum `active_cal` and `exercise_min`
  across last 7 days.
- **"Did I hit my step goal today?"** → `GET /api/health/summary` or the
  last entry of `/api/health/apple?days=1`.
- **"Is my VO₂ max improving?"** → fetch 90d, dedupe null `vo2_max`
  entries, plot non-null values over time.
- **"Rank my lowest-HRV days, what was happening?"** → fetch 30d,
  sort ascending by `hrv`, correlate with Nutrition / Exercise / Cannabis
  / Caffeine entries on those dates.

## Graceful failure

If `latest.json` is missing or malformed, all endpoints return an empty
`"apple": []` array. No errors. The Health UI shows an empty state.
