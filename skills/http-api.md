---
name: septena-http-api
description: Full HTTP endpoint reference for a running Septena backend. Use this when the app is up at http://127.0.0.1:4445 — faster than re-reading YAML files for aggregates, and handles edge cases the file-level skills don't spell out.
---

# Septena · HTTP API reference

When the Septena backend is running (default `http://127.0.0.1:4445`),
prefer HTTP for queries — the server caches, handles malformed YAML
gracefully, and returns the exact shapes the UI uses. For writing,
either HTTP or direct file writes work; HTTP triggers UI invalidation
cleanly.

## Probe for the app

```
GET /api/config
```

Always cheap, always returns JSON. If this succeeds, the app is up. If
it times out or returns 502/503/504, fall back to file-level access
using the per-section `SKILL.md`s.

## Meta

| Method & Path | Purpose |
|---|---|
| `GET /api/config` | Resolved paths, integration reachability, available sections |
| `GET /api/meta` | Per-section data quality + recency (file counts, last modified, newest/oldest dates) |
| `GET /api/sections` | Merged nav metadata (label, color, order, enabled) — single source of truth for the nav |
| `GET /api/settings` | Full merged settings (defaults + user overrides) |
| `PUT /api/settings` | Deep-merge partial settings into `settings.yaml` |

## Nutrition — `/api/nutrition/*`

| Method & Path | Purpose |
|---|---|
| `GET /api/nutrition/entries?since=YYYY-MM-DD` | Individual meal entries (sorted chronological) |
| `GET /api/nutrition/stats?days=N` | Daily aggregates (protein/fat/carbs/kcal + fasting windows) |
| `GET /api/nutrition/macros-config` | Merged macro targets (defaults + user YAML) |
| `POST /api/nutrition/sessions` | Write one meal. Body: `{date, time, emoji, protein_g, fat_g, carbs_g, kcal, foods[], note?}` |
| `PUT /api/nutrition/sessions` | Update existing meal. Body adds `file` (the meal's filename) |
| `DELETE /api/nutrition/sessions?file=<filename>` | Delete by filename |

Full schema in [`examples/vault/Bases/Nutrition/SKILL.md`](../examples/vault/Bases/Nutrition/SKILL.md).

## Exercise — `/api/*` (historical — this section pre-dates the prefix convention)

| Method & Path | Purpose |
|---|---|
| `GET /api/exercises` | List of all exercise names seen in the vault |
| `GET /api/progression/{exercise}` | Chronological series of {weight, reps, duration, …} for one exercise |
| `GET /api/summary?since=YYYY-MM-DD` | Latest weight + trend per exercise |
| `GET /api/entries?since=YYYY-MM-DD` | Flat list of every entry (strength + cardio + mobility) |
| `GET /api/stats` | Totals: sessions, entries, exercises, date range |
| `GET /api/sessions/{date}` | Entries for a specific day |
| `GET /api/sessions/last?type={upper\|lower\|cardio\|yoga}` | Most recent session of that type |
| `GET /api/next-workout` | Suggested next workout type based on gaps |
| `GET /api/cardio-history?days=N` | Daily cardio minutes + 7-day rolling |
| `POST /api/sessions` | Write a full session (N entries with shared `concluded_at`) |
| `POST /api/last-entries` | Bulk lookup of last-known values for a list of exercises |
| `GET /api/reload` | Force cache invalidation (rarely needed — mtime check auto-reloads) |

Full schema in [`examples/vault/Bases/Exercise/SKILL.md`](../examples/vault/Bases/Exercise/SKILL.md).

## Habits — `/api/habits/*`

| Method & Path | Purpose |
|---|---|
| `GET /api/habits/config` | Raw habit list from `habits-config.yaml` |
| `GET /api/habits/day/{day}` | Config merged with that day's completion log |
| `GET /api/habits/history?days=N` | Daily completion percentages |
| `POST /api/habits/toggle` | Body: `{date, habit_id, done}` — idempotent |
| `POST /api/habits/new` | Add a habit to the config |
| `PUT /api/habits/update` | Edit a habit's name / bucket |
| `DELETE /api/habits/delete/{habit_id}` | Remove a habit from the config |

## Supplements — `/api/supplements/*`

Identical shape to Habits — `/config`, `/day/{day}`, `/history`, `/toggle`,
`/new`, `/update`, `/delete/{supplement_id}`.

## Chores — `/api/chores/*`

| Method & Path | Purpose |
|---|---|
| `GET /api/chores/list` | All chore definitions + derived `days_overdue` per item |
| `POST /api/chores/complete` | Body: `{chore_id}` — writes today's completion |
| `POST /api/chores/defer` | Body: `{chore_id, days}` — push next-due without completing |
| `POST /api/chores/definitions` | Create a new chore |
| `PUT /api/chores/definitions/{chore_id}` | Edit cadence / name / emoji |
| `DELETE /api/chores/definitions/{chore_id}` | Remove a chore (keeps history files) |
| `GET /api/chores/history?days=N` | Completion counts per day |

## Caffeine — `/api/caffeine/*`

| Method & Path | Purpose |
|---|---|
| `GET /api/caffeine/config` | Bean presets |
| `GET /api/caffeine/day/{day}` | Entries for a day |
| `GET /api/caffeine/history?days=N` | Daily counts |
| `GET /api/caffeine/sessions?days=N` | Flat entries list for time-of-day analysis |
| `POST /api/caffeine/entry` | Log a drink |
| `DELETE /api/caffeine/entry/{entry_id}` | Remove a drink |

## Cannabis — `/api/cannabis/*`

| Method & Path | Purpose |
|---|---|
| `GET /api/cannabis/config` | Strains + capsule model |
| `GET /api/cannabis/day/{day}` | Entries for a day |
| `GET /api/cannabis/history?days=N` | Daily counts |
| `GET /api/cannabis/sessions?days=N` | Flat entries list |
| `POST /api/cannabis/entry` | Log a session |
| `DELETE /api/cannabis/entry/{entry_id}` | Remove a session |
| `GET /api/cannabis/capsule/active` | Current capsule usage state |
| `POST /api/cannabis/capsule/start` / `/end` | Track capsule lifecycle |

## Health — `/api/health/*` (integration-backed, read-only)

| Method & Path | Source | Purpose |
|---|---|---|
| `GET /api/health/oura?days=N` | Oura API | Sleep + readiness + activity rows |
| `GET /api/health/apple?days=N` | `latest.json` file | Apple Health daily aggregates (HRV, steps, VO₂ max, sleep stages) |
| `GET /api/health/withings?days=N` | Withings API | Weight + body fat rows |
| `GET /api/health/summary` | Oura + Withings latest | Single-object "last-night" snapshot |
| `GET /api/health/combined?days=N` | All three | Merged daily rows; also writes a cache file |
| `GET /api/health/cache` | Cache file | Instant-load, last successful combined result |

Per-source skills: [`skills/integrations/sleep.md`](integrations/sleep.md), [`body.md`](integrations/body.md), [`health.md`](integrations/health.md).

## Optional tiles

| Method & Path | Purpose |
|---|---|
| `GET /api/weather` | Today's weather if `settings.weather.location` is configured |
| `GET /api/calendar` | Today's + upcoming events from macOS Calendar (returns `{error}` when the helper is unavailable; no fallback data) |

## Conventions

- **All dates are ISO strings.** `YYYY-MM-DD` for dates, full ISO for
  timestamps.
- **Errors return `{"detail": "..."}`** with an appropriate status code.
- **Missing integrations return empty arrays or all-null rows**, not
  errors. Check `/api/config` first to know what's reachable.
- **CORS is wildcard** — local-only app, no credentials in play.
- **Mutations invalidate caches automatically** on the next GET (via
  file mtime check for Exercise; fresh disk reads for the rest).
