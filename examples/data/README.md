# Septena data folder skeleton

Example sections ready to drop into `$SEPTENA_DATA_DIR`. The app
auto-detects which sections exist in your data folder — no config
toggle required. Drop a folder in, the section appears. Remove it, the
section disappears (data stays in the folder; it's just hidden from
nav).

Most users will never copy these by hand — the in-app first-install
flow does it for you via `POST /api/bootstrap`. This tree is the
source the bootstrap endpoint copies from.

## Core

- **Training** — sessions, progressions & PRs
- **Nutrition** — meals, macros, fasting windows
- **Habits** — morning / afternoon / evening checklist
- **Settings** — app preferences (section order, animations)

## Optional

- **Supplements** — daily stack checklist with streak tracking
- **Chores** — recurring tasks with deferrable cadence
- **Caffeine** — drink log with time-of-day patterns
- **Cannabis** — session log, strains, capsule inventory

Three integration-gated sections appear automatically when their tokens
are present under `$SEPTENA_INTEGRATIONS_DIR`:

- **Sleep** — when Oura or Apple Health Auto Export is configured
- **Body** — when Withings is configured
- **Health** — when Apple Health Auto Export is configured

## Manual copy (fallback)

```bash
cp -R examples/data/Training examples/data/Nutrition \
      examples/data/Habits examples/data/Settings \
      "$SEPTENA_DATA_DIR/"
```

## What's not included

- **Session templates** for Training — these live in
  `lib/session-templates.ts` and must be edited in TypeScript for now.
- **Integration tokens** — put those under `SEPTENA_INTEGRATIONS_DIR`,
  not inside the data folder. See the main README.
