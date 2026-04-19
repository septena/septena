# Sleep

Read-only view of your sleep score, stages, and trends — pulled from
Oura (preferred) or Apple Health.

> Screenshot coming soon.

## What it does

- **Nightly sleep score** from Oura's `daily_sleep` endpoint.
- **Stage breakdown** (deep / REM / light / awake) over time.
- **30/90-day trend charts** against your sleep target (configurable in Settings).
- **Apple Health fallback** — if Oura isn't connected, uses Health Auto Export sleep data.

No writes — Setlist never sends anything back to Oura or Apple. If neither integration is configured, the section shows empty state.

## Data source

- **Oura** — personal access token at `$SETLIST_INTEGRATIONS_DIR/oura/token.txt`.
- **Apple Health** — Health Auto Export posts to `$SETLIST_INTEGRATIONS_DIR/health_auto_export/latest.json`.

See [docs/HEALTH_DATA_SPEC.md](../HEALTH_DATA_SPEC.md) for the exact payload shape.

## Endpoints

Shared with Health/Body: `GET /api/health/summary`, `GET /api/health/oura`, `GET /api/health/apple`, `GET /api/health/combined`, `GET /api/health/cache`.
