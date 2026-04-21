# Air

Ambient environment monitoring — CO₂, temperature, humidity, pressure — from an [Aranet4](https://aranet.com/products/aranet4/) Bluetooth sensor.

## What it does

- **Live CO₂ reading** with health bands (<800 good, <1000 ok, <1400 poor, ≥1400 bad).
- **Today's day-stats** — avg/min/max CO₂, minutes over 1000 ppm, avg temp + humidity.
- **History** — daily aggregates over the last N days.
- **Overnight window** — 22:00→07:00 aggregates per night, labeled by wake date, for sleep correlations on the Insights page.

## Data source

Readings are polled out-of-band by [`scripts/aranet_poller.py`](../../scripts/aranet_poller.py), scheduled via the launchd plist at [`scripts/com.setlist.aranet.plist`](../../scripts/com.setlist.aranet.plist). The poller runs under the user session because BLE needs Bluetooth TCC permission that a backend `uvicorn` process doesn't have.

## Storage

One YAML file per **day** at `$SETLIST_VAULT/Air/Log/{date}.md`, with all readings of that day as a list under `readings:`. At ~2-minute cadence that's ~720 readings/day — per-event files would create ~250k files/year and choke Obsidian's index; the daily rollup keeps to ~365 files/year.

```yaml
---
date: "2026-04-21"
section: air
readings:
  - time: "08:02"
    co2_ppm: 612
    temp_c: 21.4
    humidity_pct: 44
    pressure_hpa: 1013
  - time: "08:04"
    co2_ppm: 618
    temp_c: 21.4
    humidity_pct: 44
    pressure_hpa: 1013
---
```

## Endpoints

`GET /api/air/summary`, `GET /api/air/day/{day}`, `GET /api/air/history?days=N`, `GET /api/air/overnight?days=N`, `GET /api/air/readings?days=N`.
