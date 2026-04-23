---
name: septena-habits
description: Track daily habits from a fixed user-defined checklist, bucketed by time of day. Two file shapes — config lists the habits, per-event logs mark completions.
---

# Septena · Habits

A fixed, configurable checklist of daily habits bucketed into morning / afternoon / evening. Habits are NOT ad-hoc — the set is defined in `habits-config.yaml`, and each daily completion is one small Markdown file.

## Where it lives

- **Config:** `$VAULT/Habits/habits-config.yaml` — the master list
- **Log folder:** `$VAULT/Habits/Log/` — per-completion event files

## habits-config.yaml schema

```yaml
habits:
  - id: meditation          # required, unique, kebab-case
    name: Meditation 10min  # required, user-facing label
    bucket: morning         # required: morning | afternoon | evening
  - id: walk
    name: Walk outside
    bucket: afternoon
```

The UI reads this file on every request but never writes to it — safe for manual edits on disk.

## Log filename

`YYYY-MM-DD--{habit-id}--NN.md` — one file per completion. NN is always 01 (habits don't repeat within a day).

Example: `2026-04-18--meditation--01.md`

## Log YAML schema

```yaml
---
date: "2026-04-18"
id: "habit-2026-04-18-meditation"
section: habits
habit_id: meditation
habit_name: "Meditation 10min"
bucket: morning
note: null                 # optional string if the user left a comment
---
```

## How to use this skill

**Logging a completion:** create one file per completed habit with today's date and the habit's id/name/bucket (lookup from habits-config.yaml). Fields are redundant-by-design — each event file is self-describing for archival durability.

**Uncompleting:** delete the file. The app treats missing files as not-done.

**Reading the day:** glob `$VAULT/Habits/Log/{today}--*.md`, collect `habit_id`s. Merge against `habits-config.yaml` to know which habits are done vs. pending.

**Changing the habit list:** edit `habits-config.yaml` directly — add, remove, or reorder. Existing log files whose `habit_id` no longer appears in the config are silently ignored.

## Example interactions

- "Mark meditation done for today" → create `{today}--meditation--01.md` with the event schema.
- "What did I skip today?" → diff the habits-config list against today's log filenames.
- "Add a new habit 'vitamin D' in morning" → append to `habits-config.yaml`.
