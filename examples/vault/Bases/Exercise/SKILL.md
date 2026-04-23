---
name: septena-exercise
description: Log training sessions (strength, cardio, mobility) to Septena's Exercise section. One Markdown file per exercise entry.
---

# Septena · Exercise

Track training sessions, exercise progression, and cardio zones.

## Where it lives

- **Log folder:** `$VAULT/Exercise/Log/`
- **One file per exercise entry** — a "session" is all entries sharing the same date + `concluded_at`

## Filename

`YYYY-MM-DD--{exercise-slug}--NN.md` — slug is lowercase, hyphenated. NN starts at 01 and increments when the same exercise is repeated in one day.

Example: `2026-04-18--leg-press--01.md`

## YAML schema

Shared fields:
```yaml
---
date: "2026-04-18"              # required, YYYY-MM-DD
exercise: "leg press"           # required, lowercase canonical name
concluded_at: "2026-04-18T08:02:00"  # ISO timestamp of session end — all entries sharing this form a session
difficulty: "medium"            # optional: easy | medium | hard
---
```

**Strength entries** add:
```yaml
weight: 52.0          # kg (float)
sets: 3               # integer
reps: 12              # integer or string (e.g. "12,10,8" for descending)
```

**Cardio entries** (elliptical, rowing, stairs, cycling, running, walking, swimming) add:
```yaml
duration_min: 10      # minutes (float)
distance_m: 1500      # meters (integer)
level: 7              # machine resistance (integer, machine-specific)
```

**Mobility entries** (surya namaskar, pull-ups) typically have only `duration_min`.

## How to use this skill

**Logging a strength set:** create one file per exercise with that day's date, the exercise slug, weight/sets/reps, and a shared `concluded_at` timestamp so all entries in the session link together.

**Logging cardio:** same pattern, but with `duration_min` + `distance_m` + `level` instead of weight/sets/reps. Cardio is classified by exercise name (see list above); a new cardio exercise adds itself when first logged.

**Session templates:** pre-filled exercise lists for upper / lower / cardio / yoga days live in `lib/session-templates.ts` (TypeScript, not in the vault yet — edit there if you change gym routine).

**Reading progression:** glob `$VAULT/Exercise/Log/*--{exercise-slug}--*.md`, parse frontmatter, order by date. The backend exposes `/api/progression/{exercise}` with this logic baked in.

## Example interactions

- "I did 3×12 leg press at 52kg" → create `{today}--leg-press--01.md` with weight 52, sets 3, reps 12.
- "Row for 20 minutes 1900m at level 2" → create `{today}--rowing--01.md` with cardio fields.
- "What's my chest press trend?" → read all files matching `*--chest-press--*.md`, plot weight over date.
