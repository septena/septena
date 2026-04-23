---
name: septena-cannabis
description: Log cannabis vape sessions with strain and capsule tracking. Capsule inventory is derived from a simple grams-per-capsule model.
---

# Septena · Cannabis

Log vape sessions, strains, and capsule usage for self-awareness tracking.

## Where it lives

- **Config:** `$SEPTENA_DATA_DIR/Cannabis/cannabis-config.yaml` — strains + capsule model
- **Log folder:** `$SEPTENA_DATA_DIR/Cannabis/Log/`

## cannabis-config.yaml schema

```yaml
capsule_g: 0.15           # grams per capsule
uses_per_capsule: 3       # sessions one capsule lasts
daily_target_g: 0.3       # soft cap for the overview progress bar

strains:
  - id: blue-dream        # required, unique, kebab-case
    name: Blue Dream      # required
```

**Derived:** `grams_per_session = capsule_g / uses_per_capsule`. Not stored per-entry.

## Log filename

`YYYY-MM-DD--{strain-id}--NN.md` — NN increments per session in a day.

## YAML schema

```yaml
---
date: "2026-04-18"
time: "20:30"             # required, HH:MM
id: "cannabis-2026-04-18-20-30"
section: cannabis
strain_id: blue-dream     # required, must exist in config
strain_name: "Blue Dream" # redundant copy for archival self-description
note: null                # optional
---
```

## How to use this skill

**Logging a session:** create one file per vape session with today's date, current time, and the strain id (looked up from config).

**Grams used per day:** `count_sessions(day) * grams_per_session`.

**Adding a strain:** append to `strains:` in `cannabis-config.yaml`.

## Example interactions

- "Just vaped blue dream" → write file with time=now, strain_id: blue-dream.
- "How much did I use yesterday?" → count yesterday's sessions × grams_per_session.
- "Add northern lights to my strains" → append to `cannabis-config.yaml`.
