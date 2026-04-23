---
name: septena-chores
description: Track recurring household chores with a user-defined cadence. One Markdown file per chore definition plus one file per completion.
---

# Septena · Chores

Recurring, deferrable tasks with overdue tracking. Chores are NOT ad-hoc — each is defined once in its own file (with a cadence in days) and completions are separate event files.

## Where it lives

- **Definitions:** `$SEPTENA_DATA_DIR/Chores/Definitions/{chore-id}.md` — one file per chore
- **Log folder:** `$SEPTENA_DATA_DIR/Chores/Log/` — one file per completion

## Definition file schema

Filename: `{chore-id}.md` (kebab-case).

```yaml
---
id: dishes                # required, must match filename
name: Dishes              # required, user-facing
cadence_days: 1           # required, how often it should repeat (1=daily, 7=weekly)
emoji: 🍽️                 # required (single character)
section: chores           # required literal
---

Optional freeform body — rendered as a hint when logging. Keep short.
```

## Log filename

`YYYY-MM-DD--{chore-id}--NN.md` — one file per completion. NN increments if a chore is completed multiple times in one day.

## Log YAML schema

```yaml
---
date: "2026-04-18"
id: "chore-2026-04-18-dishes"
section: chores
chore_id: dishes
chore_name: Dishes
note: null
---
```

## How "overdue" works

`days_overdue = (today - last_completion) - cadence_days`. Positive = overdue, zero = due today, negative = due in N days.

## How to use this skill

**Logging a completion:** create one file under `Log/` with today's date and the chore's id/name. Look up the definition from `Definitions/{chore-id}.md`.

**Adding a new chore:** create a file under `Definitions/` with the frontmatter shape above.

**Reading the list:** glob `Definitions/*.md` for the master list; glob `Log/*--{chore-id}--*.md` to find each chore's last completion.

## Example interactions

- "Did the dishes" → create `Log/{today}--dishes--01.md`.
- "What's overdue?" → for each definition, find most-recent Log file for its id, compute days_overdue.
- "Add a new chore: change water filter, every 90 days" → write `Definitions/change-water-filter.md` with cadence_days: 90.
