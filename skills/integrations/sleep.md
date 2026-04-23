---
name: septena-sleep
description: Read Septena's Sleep section — per-night records from Oura Ring and/or Apple Health Auto Export, exposed via /api/health/oura and /api/health/apple. Read-only.
---

# Septena · Sleep (integration-backed)

Sleep data is pulled live from **Oura** (primary, richer fields) and
**Apple Health Auto Export** (fallback when Oura isn't set up). No vault
folder — nothing to write. Agents read via the HTTP API or the cached
JSON snapshot.

## When to use this skill

- User asks about sleep score, sleep stages (deep/REM/light/awake),
  bedtime/waketime, HRV-while-asleep, or resting heart rate.
- User asks "was last night a good night?" or "how's my sleep trending?"
- User wants sleep correlated with training, nutrition, or habits.

## Data sources

| Source | File | When it's available |
|---|---|---|
| Oura | token at `$SEPTENA_INTEGRATIONS_DIR/oura/token.txt` | If the user has an Oura Ring + personal access token |
| Apple Health | `$SEPTENA_INTEGRATIONS_DIR/health_auto_export/latest.json` | If the user runs the Health Auto Export iOS app |

Check `/api/config` → `integrations.oura` / `integrations.apple_health`
to know which are reachable before querying.

## Endpoints

### `GET /api/health/oura?days=N` (N defaults to 30)

```json
{
  "oura": [
    {
      "date": "2026-04-17",
      "sleep_score": 84,
      "total_h": 7.32,
      "deep_h": 1.12,
      "rem_h": 1.85,
      "light_h": 4.35,
      "awake_h": 0.43,
      "efficiency": 91,
      "hrv": 52,
      "resting_hr": 54,
      "bedtime": "23:42",
      "wake_time": "07:01",
      "readiness_score": 87,
      "activity_score": 82,
      "steps": 8924,
      "active_cal": 412
    }
  ]
}
```

Any field can be `null` on nights the ring wasn't worn or the sync
hasn't completed.

### `GET /api/health/apple?days=N`

Apple Health sleep is returned alongside vitals. Sleep-specific fields
per day:

```json
{
  "apple": [
    {
      "date": "2026-04-17",
      "apple_total_h": 7.1,
      "apple_deep_h": 1.0,
      "apple_rem_h": 1.6,
      "apple_core_h": 4.2,
      "apple_awake_h": 0.3,
      "apple_in_bed_h": 7.4,
      "apple_bedtime": "23:45",
      "apple_wake_time": "06:55"
    }
  ]
}
```

The Health section endpoint at `/api/health/combined?days=N` returns
Oura + Apple + Withings merged — often simpler for cross-source queries.

### `GET /api/health/summary`

Latest single-day values only — useful for "what was last night?"
questions without fetching history.

## File-only fallback

If the app isn't running, read `$SEPTENA_INTEGRATIONS_DIR/health_auto_export/latest.json`
directly for Apple Health data. Oura has no file cache — you need the
live API with the token.

## Example interactions

- **"How did I sleep last night?"** → `GET /api/health/summary`, read
  `oura.sleep_score` / `total_h` (fall back to `apple_total_h` when
  Oura is null).
- **"Am I getting enough deep sleep?"** → `GET /api/health/oura?days=14`,
  compute mean `deep_h` — rule of thumb ≥ 1.0h.
- **"Did my bedtime slip this week?"** → compare `bedtime` values over
  last 7 days; later bedtimes = slipping.
- **"Does caffeine after 2pm hurt my sleep?"** → correlate
  `apple_total_h` / `sleep_score` against same-day caffeine entries
  with `time > 14:00` from the Caffeine section.
