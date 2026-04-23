---
name: septena-caffeine
description: Log caffeine intake (coffee, matcha, tea) with brewing method and time of day. Optional bean presets live in config.
---

# Septena · Caffeine

Log coffee/matcha/tea events for time-of-day pattern analysis.

## Where it lives

- **Config:** `$VAULT/Caffeine/caffeine-config.yaml` — optional bean presets
- **Log folder:** `$VAULT/Caffeine/Log/`

## caffeine-config.yaml schema

```yaml
beans: []
  # - id: ethiopia-yirgacheffe
  #   name: Ethiopia Yirgacheffe
  # - id: colombia-huila
  #   name: Colombia Huila
```

Beans are purely optional — they populate a dropdown for faster logging. Any string in `beans` on an entry works.

## Log filename

`YYYY-MM-DD--{method-slug}--NN.md` — NN increments per drink in a day.

Example: `2026-04-18--v60--01.md`

## YAML schema

```yaml
---
date: "2026-04-18"
time: "09:15"             # required, HH:MM
id: "caffeine-2026-04-18-09-15"
section: caffeine
method: v60               # required: v60 | aeropress | french-press | espresso | matcha | tea | other
beans: ethiopia-yirgacheffe  # optional bean id (from config) or free string
grams: 18                 # optional, grams of coffee used
note: null                # optional
---
```

## How to use this skill

**Logging a drink:** create one file per caffeinated drink with the current time and method. Beans and grams are optional — log just the method if you don't know/care.

**Reading patterns:** aggregate by hour of `time` to see when you drink; aggregate by `beans` to see rotation.

## Example interactions

- "Just made a v60" → write file with method: v60, time=now.
- "Matcha at 3pm" → method: matcha, time: "15:00".
- "When do I usually have my first coffee?" → read all files, extract hour from `time`, find the earliest per day, average.
