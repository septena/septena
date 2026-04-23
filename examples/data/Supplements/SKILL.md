---
name: septena-supplements
description: Track daily supplement intake against a fixed user-defined stack. Two file shapes — config lists the stack, per-event logs mark completions.
---

# Septena · Supplements

Daily stack checklist with streak tracking. Same shape as Habits — a fixed config of known supplements plus per-event completion files.

## Where it lives

- **Config:** `$SEPTENA_DATA_DIR/Supplements/supplements-config.yaml`
- **Log folder:** `$SEPTENA_DATA_DIR/Supplements/Log/`

## supplements-config.yaml schema

```yaml
supplements:
  - id: omega3              # required, unique, kebab-case
    name: Omega-3           # required, user-facing
    emoji: 🐟               # required (single character)
  - id: creatine
    name: Creatine 5g
    emoji: 💪
```

## Log filename

`YYYY-MM-DD--{supplement-id}--NN.md` — one file per completion (NN is always 01).

## Log YAML schema

```yaml
---
date: "2026-04-18"
id: "supplement-2026-04-18-omega3"
section: supplements
supplement_id: omega3
supplement_name: "Omega-3"
emoji: 🐟
note: null
---
```

## How to use this skill

**Logging a supplement:** create one file per taken item with today's date. Look up the supplement in `supplements-config.yaml` to populate name/emoji.

**Reading the day:** glob today's files, collect `supplement_id`s, diff against the configured stack.

**Changing the stack:** edit `supplements-config.yaml` directly. Existing log files with dropped ids are ignored.

## Example interactions

- "Took omega-3 and creatine" → create two files, one per supplement.
- "What's left to take today?" → diff stack config vs. today's log.
- "Add magnesium to my stack" → append to `supplements-config.yaml`.
