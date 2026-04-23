---
name: septena-nutrition
description: Log meals and snacks to Septena's Nutrition section. One Markdown file per eating event, YAML frontmatter, human-readable.
---

# Septena · Nutrition

Track meals, macros, and (by derivation) fasting windows.

## Where it lives

- **Log folder:** `$SEPTENA_DATA_DIR/Nutrition/Log/`
- **Config:** `$SEPTENA_DATA_DIR/Nutrition/macros-config.yaml` — daily macro target ranges
- **One file per eating event** — meals, snacks, supplements (when taken with food)

## Filename

`YYYY-MM-DD--HHMM--NN.md` — NN starts at 01 and increments on same-minute collisions.

Example: `2026-04-18--0800--01.md`

## YAML schema

```yaml
---
date: "2026-04-18"        # required, YYYY-MM-DD
time: "08:00"             # required, 24h HH:MM
emoji: 🍳                 # optional, one emoji for the UI
protein_g: 22             # required, integer/float grams
fat_g: 14                 # required
carbs_g: 30               # required
kcal: 340                 # required
foods:                    # required, list; foods[0] is rendered as the title
  - Breakfast
  - 2 eggs (~12g protein)
  - 2 slices whole-wheat toast
note: ""                  # optional freeform
section: nutrition        # required — must be literal "nutrition"
---
```

## How to use this skill

**Logging a meal:** write one file with today's date, current time, rough macro estimates, and a foods list. The title of the meal (e.g. "Breakfast", "Lunch", "Pasta Bolognese") is the first item of `foods`. There is no separate `name` field.

**Reading the day:** glob `$SEPTENA_DATA_DIR/Nutrition/Log/{today}--*.md`, parse frontmatter, sum the macro fields. To get targets, read `macros-config.yaml` (format: `targets: { protein: {min, max, unit}, ... }`); missing file → shipped defaults apply (100–150g protein, 50–80g fat, 200–300g carbs, 2000–2500 kcal).

**Fasting window:** gap between the latest `time` of day N and the earliest `time` of day N+1.

## Example interactions

- "Log breakfast: 3 eggs, toast, coffee, ~28g protein" → create file with today/now, protein_g 28, foods list starting with "Breakfast".
- "What's my protein today?" → sum protein_g across today's files.
- "Show the last 7 days of kcal" → aggregate kcal per date for date ≥ today-7.
