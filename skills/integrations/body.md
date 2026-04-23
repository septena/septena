---
name: septena-body
description: Read Septena's Body section — daily weight and body fat percentage measurements from a Withings smart scale, exposed via /api/health/withings. Read-only.
---

# Septena · Body (integration-backed)

Body composition data is pulled live from **Withings** (smart scale,
typically Body+ or Body Smart). No vault folder — agents read via HTTP
API. OAuth2 tokens live under `$SEPTENA_INTEGRATIONS_DIR/withings/`;
the backend auto-refreshes them.

## When to use this skill

- User asks about current/recent weight, body fat %, or trends.
- User wants weight correlated with nutrition (kcal) or training volume.
- User asks "am I losing/gaining weight?" or "how's my body fat?"

## Data source

| File | Purpose |
|---|---|
| `$SEPTENA_INTEGRATIONS_DIR/withings/token.json` | OAuth2 access + refresh tokens (auto-refreshed) |
| `$SEPTENA_INTEGRATIONS_DIR/withings/credentials.json` | `{client_id, client_secret}` — one-time setup |

If both files aren't present, `GET /api/config` → `integrations.withings`
is `false` and the Body section is hidden from the UI.

## Endpoint

### `GET /api/health/withings?days=N` (N defaults to 30)

Returns one row per calendar day. Days with no measurement have null
fields — the scale is used ~1-2× per day on average, so gaps are normal.

```json
{
  "withings": [
    { "date": "2026-04-17", "weight_kg": 72.4, "fat_pct": 18.2 },
    { "date": "2026-04-18", "weight_kg": null, "fat_pct": null },
    { "date": "2026-04-19", "weight_kg": 72.1, "fat_pct": 18.0 }
  ]
}
```

## Notes on the data

- Withings reports weight in **kg** (internally grams with a unit
  exponent — the backend already converts). Conversion to lbs is on you
  if the user prefers imperial.
- Body fat % is a bio-impedance estimate — treat absolute numbers
  cautiously; the **trend** is the signal.
- If the user has multiple measurements in one day, the backend keeps
  the most recent for that date.

## Example interactions

- **"What's my current weight?"** → `GET /api/health/withings?days=7`,
  find the latest non-null `weight_kg`.
- **"Am I losing weight?"** → fetch 14d, compare the 7d rolling mean
  of the first half vs. the second half. Noise-robust and doesn't
  over-interpret a single reading.
- **"Did my body fat go up this month?"** → fetch 30d, filter non-null
  `fat_pct`, compare first and last valid values.
- **"Correlate weight with kcal intake"** → pair Body's 7d rolling
  weight with Nutrition's daily `kcal` from `/api/nutrition/stats`.

## Graceful failure

If Withings tokens are missing/expired beyond refresh, the endpoint
returns an array of rows with all `null`s — no errors. The Body UI
shows empty-state.
