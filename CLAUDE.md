# CLAUDE.md — Setlist

## App Purpose

Setlist is a local-first personal health command center. Multiple areas of life, one app:

- **Exercise** — sessions, progressions & PRs
- **Nutrition** — meals, macros & fasting
- **Habits** — fixed daily checklist bucketed morning / afternoon / evening
- **Chores** — recurring deferrable tasks
- **Supplements** — daily stack + streaks
- **Cannabis / Caffeine** — consumption logs with strains / beans / methods
- **Health / Sleep / Body** — read-only views of HRV, sleep stages, weight, body fat from Oura / Withings / Health Auto Export
- **Weather / Calendar** — optional ambient tiles (Open-Meteo + macOS Calendar); off by default
- **Insights** — cross-section correlations (WIP)

**Canonical data:** All structured data lives in Obsidian YAML files under `~/Documents/obsidian/Bases/<Section>/`. Each section has its own folder containing any per-section config YAML plus a `Log/` subfolder with one file per event. Every event shares a universal frontmatter core — `date`, `id`, `section` (plus `time` when the event has a moment) — with section-specific fields added flat. Health/Sleep/Body are the exceptions — they read Oura, Withings, and Health Auto Export data directly. No separate database.

## Architecture

```
setlist/                              # Next.js frontend :4444
  app/
    page.tsx                          → root launcher (grid of section cards)
    layout.tsx                        → shell: BackendStatusBanner + SectionTabs
    exercise/                         → dashboard + session/{active,done,new,start,[date]}
    nutrition/page.tsx                → dashboard + inline entry form
    habits/page.tsx, chores/page.tsx, supplements/page.tsx
    cannabis/page.tsx, caffeine/page.tsx
    health/page.tsx, sleep/page.tsx, body/page.tsx   → read-only metric views (share /api/health)
    insights/page.tsx                 → cross-section correlations (WIP)
    weather/page.tsx, calendar/page.tsx → optional ambient tiles
    settings/page.tsx                 → global settings UI
    globals.css                       → shared styles
  components/
    section-tabs.tsx                  → sticky top pill nav (hidden on root launcher)
    coming-soon.tsx                   → placeholder for sections awaiting build
    {section}-dashboard.tsx           → one per section (exercise uses training-dashboard.tsx)
    settings-dashboard.tsx            → global settings UI
    quick-log-forms.tsx               → unified multi-section entry form
    onboarding-gate.tsx, backend-status-banner.tsx, pull-to-refresh.tsx
  lib/
    api.ts                            → API client — one block per section (see // ── markers)
    sections.ts                       → section registry: code-side wiring + EXERCISE_SHADES
    pr.ts, session-draft.ts, session-templates.ts, idb.ts, utils.ts, fasting.ts, macro-targets.ts
  main.py                             → thin entrypoint: `from api.app import app`
  api/                                → FastAPI backend :4445
    app.py                            → FastAPI app, CORS, lifespan, router inclusion
    paths.py                          → VAULT_ROOT / HEALTH_ROOT / section dirs / token paths
    parsing.py                        → _extract_frontmatter, _normalize_date/number, _slugify
    routers/
      exercise.py                     → in-memory cache + taxonomy + /api/sessions, /api/summary…
      nutrition.py                    → /api/nutrition/*
      habits.py                       → /api/habits/*
      supplements.py                  → /api/supplements/*
      cannabis.py                     → /api/cannabis/* (capsule model)
      caffeine.py                     → /api/caffeine/*
      chores.py                       → /api/chores/*
      health.py                       → /api/health/* (Oura + Withings + Apple HAE)
      weather.py                      → /api/weather (Open-Meteo + geocoding cache)
      calendar.py                     → /api/calendar (macOS Calendar via osascript)
      settings.py                     → /api/settings + DEFAULT_SETTINGS
      sections.py                     → /api/sections (merges wiring + settings metadata)
      meta.py                         → /api/config, /api/meta (cross-section freshness)
```

`main.py` is a two-line shim so `uvicorn main:app` keeps working; all backend code lives under `api/`. Each router owns its section's paths constants, loader, and write helpers — shared filesystem roots live in `api/paths.py`, shared YAML-frontmatter helpers in `api/parsing.py`.

## Section Registry

Two halves: the wiring (stable, code) and the metadata (user-editable, settings).

- **`api/routers/sections.py:SECTION_IMMUTABLE`** — `{ key: { path, apiBase, obsidianDir } }`. Changing any of these means shipping a new frontend route, so it stays in source.
- **`DEFAULT_SETTINGS["sections"]`** in `api/routers/settings.py` — `{ label, emoji, color, tagline }` per key. Users override in `Bases/Settings/settings.yaml`.
- **`lib/sections.ts`** — code-side defaults the frontend falls back to before `GET /api/sections` resolves. Also exports `EXERCISE_SHADES` (strength / cardio / mobility shades of orange, aligned to tailwind `orange-500/400/300`).

`GET /api/sections` merges both halves, ordered by `settings.section_order`, with `enabled` defaulting to vault-folder-presence + integration reachability (see `api/paths.py:available_sections`) and user-explicit overrides winning when present.

Registered keys: `exercise, nutrition, habits, chores, supplements, cannabis, caffeine, health, sleep, body, correlations` (correlations path is `/insights`).

## Backend routes

Exercise routes are unprefixed (they predate the prefixed pattern). Every other section uses `APIRouter(prefix="/api/{section}")`.

```
# Exercise  (api/routers/exercise.py)
GET  /api/exercises
GET  /api/progression/{exercise}
GET  /api/summary[?since=YYYY-MM-DD]
POST /api/sessions
GET  /api/sessions/last?type=
GET  /api/sessions/{date}
GET  /api/stats
GET  /api/reload
GET  /api/next-workout
POST /api/last-entries
GET  /api/entries
GET  /api/cardio-history?days=N

# Nutrition  (api/routers/nutrition.py)
GET    /api/nutrition/macros-config
GET    /api/nutrition/entries
GET    /api/nutrition/stats?days=N
POST   /api/nutrition/sessions
PUT    /api/nutrition/sessions           # update by filename
DELETE /api/nutrition/sessions           # delete by filename

# Habits / Supplements (same shape)
GET    /api/{section}/config
GET    /api/{section}/day/{day}          # config merged with that day's events
POST   /api/{section}/toggle             # {date, id, done}
POST   /api/{section}/new                # add to config yaml
PUT    /api/{section}/update             # edit config entry
DELETE /api/{section}/delete/{id}        # remove from config (historical logs kept)
GET    /api/{section}/history?days=N

# Cannabis
GET    /api/cannabis/config              # strains + capsule model
GET    /api/cannabis/day/{day}
POST   /api/cannabis/entry               # vape session inherits active capsule
DELETE /api/cannabis/entry/{entry_id}
GET    /api/cannabis/capsule/active
POST   /api/cannabis/capsule/start       # {strain?}
POST   /api/cannabis/capsule/end
GET    /api/cannabis/history?days=N
GET    /api/cannabis/sessions?days=N

# Caffeine
GET    /api/caffeine/config              # bean presets
GET    /api/caffeine/day/{day}
POST   /api/caffeine/entry
DELETE /api/caffeine/entry/{entry_id}
GET    /api/caffeine/history?days=N
GET    /api/caffeine/sessions?days=N

# Chores
GET    /api/chores/list                  # replayed event log → current due state
POST   /api/chores/complete
POST   /api/chores/defer                 # mode: "day" | "weekend"
POST   /api/chores/definitions           # create
PUT    /api/chores/definitions/{id}
DELETE /api/chores/definitions/{id}
GET    /api/chores/history?days=N

# Health  (serves Health / Sleep / Body frontends)
GET    /api/health/summary               # latest values across sources
GET    /api/health/oura?days=N           # sleep + activity + readiness
GET    /api/health/withings?days=N       # weight + body fat
GET    /api/health/apple?days=N          # Health Auto Export aggregates
GET    /api/health/combined?days=N       # writes cache snapshot
GET    /api/health/cache                 # instant reload from snapshot

# Settings / Sections / Meta
GET  /api/settings                       # merged defaults + Bases/Settings/settings.yaml
PUT  /api/settings                       # deep-merge partial JSON into YAML
GET  /api/sections                       # merged registry (wiring + metadata)
GET  /api/config                         # paths + integration reachability + nav visibility
GET  /api/meta                           # per-section file counts / freshness
```

Only Exercise caches (`_cache`, `fresh_cache` dep); every other router re-reads from disk per request — cheap at current data volumes.

### Hardcoded taxonomies

- `api/routers/caffeine.py:CAFFEINE_METHODS`
- `api/routers/exercise.py:CARDIO_EXERCISES / MOBILITY_EXERCISES / CORE_EXERCISES / LOWER_EXERCISES / LEGACY_ALIASES`
- `components/training-dashboard.tsx:CARDIO_EXERCISES / MOBILITY_EXERCISES / CORE_EXERCISES` (frontend mirror)
- `lib/sections.ts:EXERCISE_SHADES`

Moving these to per-section `{section}-config.yaml` + `/api/{section}/config` would mirror how strains/beans already work.

### YAML Schema — Nutrition Sessions

One file per eating event at `Bases/Nutrition/Log/{date}--{HHMM}--NN.md`. NN resolves collisions when two events share the same minute.

```yaml
---
date: "2026-04-11"
time: "11:15"
emoji: 🍳
protein_g: 22
fat_g: 14
carbs_g: 30
kcal: 340
foods:
  - Breakfast
  - 2 eggs (~12g protein)
  - Coffee with milk (~2g protein)
section: nutrition
---
First meal of the day
```

`foods[0]` is the title (rendered bold in the UI); subsequent entries are the ingredient/detail list. There is no separate `name` field — if the meal needs a short summary like "Breakfast" or "Pasta Bolognese", make it the first item of `foods`. Free-form notes live in the markdown body, not frontmatter.

Daily targets are ranges stored in `Bases/Settings/settings.yaml` under `targets.*` (protein/fat/carbs/kcal min+max, fasting and eating window hours). Frontend defaults in `lib/macro-targets.ts`. Backfill carbs on legacy rows with `scripts/backfill_carbs.py` (kcal-math estimate: `carbs ≈ (kcal - 4*protein - 9*fat) / 4`, clamped to ≥ 0).

### Habits — fixed checklist model

Habits are NOT ad-hoc entries. They're a fixed, configurable set of recurring daily habits bucketed by time of day.

**Config** at `Bases/Habits/habits-config.yaml`:

```yaml
habits:
  - id: creatine
    name: Creatine 5g
    bucket: morning          # morning | afternoon | evening
  - id: meditation
    name: Meditation 10min
    bucket: morning
```

**Per-completion events** — one file per habit per day at `Bases/Habits/Log/{date}--{habit_id}--01.md`, written on toggle-on, unlinked on toggle-off. Mirrors the per-event pattern used by cannabis/caffeine/supplements/chores — no consolidated daily log.

```yaml
---
date: 2026-04-11
id: habit-2026-04-11-creatine
section: habits
habit_id: creatine
habit_name: Creatine 5g
bucket: morning
note: null
---
```

Toggle endpoint is idempotent. Adding/removing habits uses `POST /api/habits/new` + `DELETE /api/habits/delete/{id}` (the UI edits config via the settings screen), or you can edit `habits-config.yaml` directly — existing event files stay valid, unknown ids surface as orphans.

Supplements follow the same shape (`supplements-config.yaml` + per-dose event files), just without buckets.

### Cannabis — capsule model

Each active "capsule" is a dose unit (~0.15g, split across ~3 uses). Active-capsule state lives in `Bases/Cannabis/Log/_capsules.yaml`; vape sessions inherit the capsule's strain and bump `use_count`; edibles stand alone. Grams is snapshotted per-event so historical entries remain stable when the capsule model changes. Strains are presets defined in `Bases/Cannabis/cannabis-config.yaml`.

### Chores — replayed event log

Definitions live in `Bases/Chores/Definitions/*.md` (one note per chore with `cadence_days`); events live in `Bases/Chores/Log/*.md` as either `complete` or `defer` entries. Current due date is derived by replaying events chronologically: a `complete` sets due = event.date + cadence_days; a `defer` sets due = new_due_date. No "current state" is persisted — the log is authoritative.

### Health / Sleep / Body — read-only metric views

Three separate frontend pages backed by the same `/api/health` router. Data sources: Health Auto Export drops `~/.config/openclaw/health_auto_export/latest.json` (`data.data.metrics[]` with `name`, `units`, `data[]` of `{date, qty, source}`); Oura API and Withings API feed sleep and body-composition series. `api/routers/health.py:APPLE_METRIC_KEYS` and `APPLE_SLEEP_KEYS` define which HAE metrics surface; `_aggregate_apple_days` buckets per-minute metrics (`step_count`, `active_energy`, `flights_climbed`, `walking_running_distance`, `apple_exercise_time`) as daily sums, episodic metrics (HRV, VO₂, resting HR, respiratory rate, SpO₂, cardio recovery) as latest-per-day, heart rate as the per-day average.

Oura daily sleep score comes from `daily_sleep` (separate endpoint from `sleep`). Headline metrics: HRV, resting HR, steps, VO₂ max, active kcal, exercise minutes, sleep score/stages, weight, body fat.

### Settings

`Bases/Settings/settings.yaml` — single user-preference file. `GET /api/settings` returns merged defaults + user YAML; `PUT` deep-merges partial JSON into disk.

Persists: `section_order`, `targets` (macros min/max, Z2 weekly min, sleep target, fasting/eating window hours), `units` (weight kg/lb, distance km/mi), `theme` (system/light/dark), `mini_stats` (per-section two-stat picker), `animations` (exercise_complete, first_meal, histograms_raise toggles), `sections` (per-section label/emoji/color/tagline + optional `enabled` override). See `api/routers/settings.py:DEFAULT_SETTINGS` for the full shape.

## API Client (`lib/api.ts`)

One block per section, all appended to the same file. See the `// ── {Section} ──` markers for boundaries. Shared: `request<T>()`, `BackendUnreachableError`, `API_BASE`.

## Design System

- **Orange** is the **global** accent — tabs, launcher cards, exercise dashboard. Exercise's section color is also orange (`hsl(25,95%,53%)` ≈ `orange-500`); other sections have their own colors used for in-section CTAs and charts, but the nav tab pill stays orange.
- **Tabs:** sticky top, pill style. Active = `border-orange-500 bg-orange-500 text-white`. Inactive hovers to orange.
- **Cards:** `border-border bg-background` with section-color hover on interactive elements
- **Charts:** Recharts, section-coloured; see `components/training-dashboard.tsx` for the house style
- **Fonts:** System stack (no Google Fonts)
- **No hover crosshair** on charts (`cursor={false}`)
- **Dots always visible** on line charts (`dot={{ r: 4 }}`)
- **YAxis domain:** `domain={[0, "auto"]}` — prevents axis collapse on sparse data
- **Weekday tick labels:** Title Case "Sun Mon Tue … Sat", no today-emphasis
- **Label casing:** Title Case for anything label-shaped — buttons, tabs, stat tile headings, form field labels, chart axis labels, select/menu options, card titles, cadence presets ("Every Other", "Weekly"). Sentence case stays for prose — tooltip descriptions, empty-state messages, taglines, body copy. Never `.toLowerCase()` a label source before rendering.
- **Time format:** 24-hour everywhere (`HH:MM`). No am/pm, anywhere in the UI.

## File Creation Rules

1. **One section per PR** — follow the same cadence as shipped sections.
2. **YAML first** — verify schema + loader with `curl` before building the UI.
3. **Existing patterns** — copy `nutrition-dashboard.tsx` or `habits-dashboard.tsx`; fixed-checklist sections (habits, supplements) share a template.
4. **No credentials in code** — use env vars or credential files.

## Key Dependencies

```json
{
  "next": "^15",
  "react": "^19",
  "recharts": "^2.x",
  "tailwindcss": "^3.x",
  "shadcn/ui": "^0.x",
  "fastapi": "0.x",
  "python-multipart": "0.x"
}
```

## Known Skills (use before writing one-off scripts)

- `obsidian-markdown` — wikilinks, callouts, YAML frontmatter
- `obsidian-cli` — vault operations
- `defuddle` — clean content extraction from web pages
- `ocr` — image-based food labels (future)

## Adding a New Section

### Phase 1: Data + Backend
1. Create `Bases/{Section}/` directory (or config file if it's a fixed-set model like habits).
2. Write sample data.
3. Add section paths to `api/paths.py` (`{SECTION}_DIR`, config paths).
4. Create `api/routers/{section}.py` with an `APIRouter(prefix="/api/{section}")`. Reuse `_extract_frontmatter`, `_normalize_date/number`, `_slugify` from `api.parsing`.
5. Wire the new router into `api/app.py` (import + `app.include_router`).
6. If the section should be visible in the nav based on folder presence, add it to `_VAULT_FOLDER_SECTIONS` in `api/paths.py`.
7. Verify with `curl`.

### Phase 2: API Client
8. Append types + client functions to `lib/api.ts` under a `// ── {Section} ──` marker.
9. Add an entry to `SECTION_IMMUTABLE` in `api/routers/sections.py` and to `DEFAULT_SETTINGS["sections"]` in `api/routers/settings.py`. Add the key to `DEFAULT_SETTINGS["section_order"]` for nav ordering.

### Phase 3: Frontend
10. Create `app/{section}/page.tsx` importing a dashboard component.
11. Create `components/{section}-dashboard.tsx` — copy `nutrition-dashboard.tsx` as a starting point.
12. Charts use `ChartContainer` + Recharts with the section's color.
13. For entry forms, inline inside the dashboard (see `NutritionEntryForm`).

### Phase 4: Skill (optional)
14. `~/.openclaw/skills/{section}-logger/SKILL.md` + `scripts/{section}_logger.py`.
15. Cron reminder if needed.

## Running locally

- Frontend: `npm run dev` on :4444 (managed via `.claude/launch.json` → `setlist-dev`).
- Backend: `python3 -m uvicorn main:app --port 4445` — run directly; the preview-server config for this one fails due to sandbox import restrictions on `h11`. `start.sh` wraps the same command.
