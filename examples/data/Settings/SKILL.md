---
name: septena-settings
description: Read and update Septena's app-level configuration — macro/cardio/sleep targets, section order, theme, units, animations, and per-section enable/disable. Single YAML file, partial writes OK.
---

# Septena · Settings

App-level user preferences live in one file. Partial writes are safe —
missing keys fall back to shipped defaults on every read. Edit by hand
on disk, via the in-app Settings UI, or via `PUT /api/settings`.

## Where it lives

`$SEPTENA_DATA_DIR/Settings/settings.yaml`

Missing file → shipped defaults apply. Malformed YAML → shipped defaults
+ a warning in the backend logs. Safe to delete entirely.

## Schema

```yaml
# Order of the tabs in the nav bar and cards on the homepage.
# Keys not present here are appended in registry order.
section_order:
  - training
  - nutrition
  - habits
  - chores
  - supplements
  - cannabis
  - caffeine
  - health
  - sleep
  - body

# Daily targets. Numbers can be plain integers or floats.
targets:
  protein_min_g: 100
  protein_max_g: 150
  fat_min_g: 50
  fat_max_g: 80
  carbs_min_g: 200
  carbs_max_g: 300
  kcal_min: 2000
  kcal_max: 2500
  z2_weekly_min: 150       # target weekly cardio minutes in Zone 2
  sleep_target_h: 8
  fasting_min_h: 14        # daily fasting window floor
  fasting_max_h: 16        # daily fasting window ceiling
  eating_min_h: 8          # daily eating window floor
  eating_max_h: 10         # daily eating window ceiling

units:
  weight: "kg"             # kg | lb
  distance: "km"           # km | mi

theme: "system"            # system | light | dark

# Per-section two-stat picker overrides. Empty = use card defaults.
mini_stats: {}

animations:
  training_complete: true  # confetti on session-done page
  first_meal: true         # break-fast celebration on nutrition dashboard
  histograms_raise: true   # quick raise-from-baseline on chart bars

# Per-section metadata. Label / emoji / color / tagline are presentation
# bits editable from the Settings UI. `enabled` overrides the default
# (which is "enabled iff section folder exists, or integration is
# reachable"). Explicit true/false always wins.
sections:
  nutrition:
    label: Nutrition
    emoji: 🍱
    color: "hsl(45,90%,48%)"
    tagline: "Meals, macros & fasting"
    enabled: true         # optional explicit override

```

## How to read / write

### Via HTTP API (app running)

```
GET  /api/settings      → merged defaults + user overrides
PUT  /api/settings      → partial object; deep-merges into existing file
```

`PUT` is deep-merge, not overwrite. To change one target:

```json
{ "targets": { "protein_min_g": 120 } }
```

leaves every other key alone.

### Via file (app not running)

Write valid YAML to `$SEPTENA_DATA_DIR/Settings/settings.yaml`. Only include
the keys you want to override — the backend deep-merges on next load,
so partial files are valid. A brand-new install can create this file
from scratch or from the template at `examples/data/Settings/settings.yaml`.

## Section enable/disable rules

`sections.{key}.enabled` has three states:

| Value | Behavior |
|---|---|
| `true` | Always enabled, even if the section's data folder is missing |
| `false` | Always disabled, even if the folder exists |
| *(unset)* | Auto: enabled iff the data folder exists (or the integration token is present for sleep/body/health) |

## Example interactions

- **"Set my protein target to 140-160g"** → `PUT /api/settings` with
  `{"targets": {"protein_min_g": 140, "protein_max_g": 160}}`, or edit
  those two keys in the file.
- **"Switch to Fahrenheit and miles"** → `{"units": {"weight": "lb",
  "distance": "mi"}}` — note the current setting stays on `"weight"`
  just because lbs is imperial.
- **"Turn off the confetti animation"** → `{"animations":
  {"training_complete": false}}`.
- **"Reorder my nav: Habits first, then Nutrition, then Training"** →
  write the new list to `section_order`. Unlisted sections append in
  registry order.
- **"Disable Cannabis"** → `{"sections": {"cannabis": {"enabled":
  false}}}` — the folder can stay untouched in the data folder, it just
  won't show in nav.
