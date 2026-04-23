---
name: septena-adding-a-section
description: End-to-end guide to add a brand-new section to Septena (e.g. Groceries, Mood, Water, Reading). Covers vault layout, backend router, frontend dashboard, registry wiring, settings UI, and the section's own SKILL.md so it's agent-legible from day one.
---

# Adding a new section

Sections are the main unit of extension in Septena. Adding one means
teaching the backend to read a new folder of YAML files, wiring a React
dashboard to visualize them, registering the section so it appears in
nav + settings, and — critically — writing a `SKILL.md` so agents can
log into it alongside the core sections.

## When to use this skill

- User wants to track something Septena doesn't currently support
  (groceries, water intake, mood, reading, meditation, expenses…).
- User wants to fork a section (e.g. "Workouts" separate from "Exercise"
  for a different framing).

## Pick your section archetype

Copy the one that matches the data shape you need:

| Archetype | Example | Pattern | Copy from |
|---|---|---|---|
| **Per-event log** | meals, drinks, mood check-ins | One file per event, timestamped | [`api/routers/nutrition.py`](../api/routers/nutrition.py) or [`api/routers/caffeine.py`](../api/routers/caffeine.py) |
| **Fixed-set checklist** | habits, supplements | Config YAML lists items; one file per completion | [`api/routers/habits.py`](../api/routers/habits.py) or [`api/routers/supplements.py`](../api/routers/supplements.py) |
| **Cadence-based tasks** | chores, maintenance | Definition files + replayed event log | [`api/routers/chores.py`](../api/routers/chores.py) |
| **Stateful checklist** | groceries (low / last_bought) | Single YAML dict, no per-day log | [`api/routers/groceries.py`](../api/routers/groceries.py) |
| **Integration-backed** | sleep, body weight, health | No vault folder; reads external API | [`api/routers/health.py`](../api/routers/health.py) (see [`skills/integrations/`](integrations/)) |

## Filesystem layout

Vault-backed sections live under `$SEPTENA_DATA_DIR/<Section>/`:

```
Bases/Groceries/
  groceries.yaml            ← config (fixed-set / stateful sections)
  Log/
    2026-04-20--NN.md       ← one file per event (per-event sections)
    _state.yaml             ← capsule/active state (if needed)
```

Universal frontmatter fields (required on every event file):

```yaml
date: "2026-04-20"          # ISO
id: "groceries-2026-04-20-1" # unique within section
section: groceries          # matches the registry key
time: "14:15"               # optional; required for time-of-day events
```

Section-specific fields are **flat** after that — no nesting unless
semantically necessary.

## Six-step recipe

Assume we're adding **Mood** as a per-event log.

### 1. Add filesystem paths

In [`api/paths.py`](../api/paths.py):

```python
MOOD_DIR = VAULT_ROOT / "Mood/Log"
MOOD_CONFIG_PATH = VAULT_ROOT / "Mood/mood-config.yaml"  # if the section has config
```

Then add `"mood": "Mood"` to `_VAULT_FOLDER_SECTIONS` so the section
auto-enables whenever the folder exists.

### 2. Write the backend router

`api/routers/mood.py`:

```python
from fastapi import APIRouter, HTTPException
from starlette.requests import Request
import yaml

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date, _slugify
from api.paths import MOOD_DIR, MOOD_CONFIG_PATH

router = APIRouter(prefix="/api/mood", tags=["mood"])


@router.get("/entries")
def entries(days: int = 30):
    # glob MOOD_DIR / "*.md", parse via _extract_frontmatter, sort by date desc
    ...

@router.post("/entry")
async def new_entry(request: Request):
    # write one YAML file to MOOD_DIR using universal frontmatter
    ...
```

Reuse shared helpers from [`api/parsing.py`](../api/parsing.py) —
`_extract_frontmatter`, `_normalize_date`, `_normalize_number`,
`_slugify`. Don't reimplement YAML parsing.

Mount it in [`api/app.py`](../api/app.py):

```python
from api.routers import mood
app.include_router(mood.router)
```

### 3. Register in the section registry

Two halves — code wiring (stable) and metadata (user-editable):

**Wiring** — [`api/routers/sections.py`](../api/routers/sections.py)'s
`SECTION_IMMUTABLE`:

```python
"mood": {"path": "/mood", "apiBase": "/api/mood", "dataDir": "Bases/Mood/Log"},
```

**Metadata defaults** — [`api/routers/settings.py`](../api/routers/settings.py)'s
`DEFAULT_SETTINGS`:

```python
"sections": {
    # …
    "mood": {"label": "Mood", "emoji": "💭", "color": "hsl(280,55%,55%)", "tagline": "Daily emotional check-ins"},
},
"section_order": ["exercise", "nutrition", …, "mood"],  # position in nav
```

**Frontend fallback** — [`lib/sections.ts`](../lib/sections.ts) has the
same metadata as a client-side fallback before `GET /api/sections`
resolves. Add a matching entry and append `"mood"` to the `SectionKey`
union.

### 4. API client block

Append typed fetchers to [`lib/api.ts`](../lib/api.ts) under a new
`// ── Mood ──` marker. Follow the shape of an existing block (e.g.
Caffeine) — one `type` per response, one `async function` per endpoint,
reusing the shared `request<T>()` helper.

### 5. Build the dashboard

- `app/mood/page.tsx` — a thin entry point that imports the dashboard.
- `components/mood-dashboard.tsx` — copy the nearest archetype
  ([`nutrition-dashboard.tsx`](../components/nutrition-dashboard.tsx) for
  per-event, [`habits-dashboard.tsx`](../components/habits-dashboard.tsx)
  for fixed-set) and replace the section-specific fields.
- Use `SECTIONS.mood.color` as the accent and `EXERCISE_SHADES`-style
  conventions for chart colors.
- Charts: `ChartContainer` + Recharts, `dot={{ r: 4 }}`,
  `cursor={false}`, `domain={[0, "auto"]}`, Title-Case weekday ticks.
- Time format: 24-hour only (`HH:MM`).

### 6. Settings UI card (if the section has editable config)

Follow the DRY pattern in [`components/manage-items.tsx`](../components/manage-items.tsx):
export a `ManageMoodCard` using the shared `ShellCard`, `TextInput`,
`SaveCancel`, `IconButton` primitives. Then wire it into
[`app/settings/[section]/page.tsx`](../app/settings/[section]/page.tsx)
with a single line:

```tsx
{key === "mood" && <ManageMoodCard />}
```

No new settings page — the dynamic `[section]` route already renders
appearance fields (label, emoji, color, tagline, enabled). Adding a
`ManageX` card gives you the per-item editor in the same chrome.

For fixed-set or taxonomy-heavy sections, also expose a config endpoint
(`GET /api/<section>/config`) with `POST` / `PUT` / `DELETE` for the
items — see `api/routers/exercise.py` (`/api/exercise/config` +
`/api/exercise/exercises`) as the canonical worked example.

### 7. Ship the SKILL.md

`examples/vault/Bases/Mood/SKILL.md`:

```markdown
---
name: septena-mood
description: Log mood check-ins with valence, arousal, trigger.
---

# Septena · Mood

## Where it lives
## Filename convention
## YAML schema
## How to use this skill
## Example interactions
```

Mirror the shape of the existing SKILL.md files — an agent that's
loaded one Septena skill should recognize the shape of any other.

Finally update the index tables in [`SKILLS.md`](../SKILLS.md) and the
HTTP API reference in [`skills/http-api.md`](http-api.md).

## Is it core or optional?

Put it in `examples/vault/Bases/` if it answers yes to all three:

1. **Universal?** Most users would want this, not just you.
2. **Core to health?** The app's North Star is personal health — does
   this section serve that, or is it adjacent (finance, reading)?
3. **Low setup cost?** Users shouldn't need a database, API token, or
   external service.

Otherwise, `examples/vault/optional/` is the honest place. Users copy
it in when they want it.

## Integration-backed sections (no vault folder)

If the data source is an external API or snapshot file (like Sleep
from Oura), the pattern differs:

- No vault folder — data comes from a token or file outside the vault,
  typically under `$SEPTENA_INTEGRATIONS_DIR` (default
  `~/.config/openclaw/`).
- Backend router reads + aggregates the external data (see
  `api/routers/health.py`).
- Gate visibility in [`api/paths.py`](../api/paths.py)'s
  `available_sections()` on the integration being reachable instead of
  folder presence.
- Skill file lives in `skills/integrations/<section>.md`, not
  `examples/vault/`.
- Write endpoints usually aren't applicable — it's a read-only window
  into someone else's system.

See [`skills/integrations/sleep.md`](integrations/sleep.md) for a
worked example.

## Agent-friendly checklist

Before declaring the section done, verify:

- [ ] Folder exists at `$SEPTENA_DATA_DIR/<Section>/` with a `Log/` or
      `Definitions/` subfolder (if vault-backed)
- [ ] Starter config YAML exists (if the section has config)
- [ ] `api/paths.py`: path constants + `_VAULT_FOLDER_SECTIONS` entry
- [ ] `api/routers/<section>.py`: at least one `GET` and one `POST`
      (unless read-only)
- [ ] Router mounted in `api/app.py`
- [ ] `api/routers/sections.py`: `SECTION_IMMUTABLE` entry
- [ ] `api/routers/settings.py`: `DEFAULT_SETTINGS["sections"][<key>]`
      + key appended to `section_order`
- [ ] `lib/sections.ts`: entry + `SectionKey` union updated
- [ ] `lib/api.ts`: typed client block under `// ── <Section> ──`
- [ ] `app/<section>/page.tsx` + `components/<section>-dashboard.tsx`
- [ ] `ManageXCard` in `components/manage-items.tsx` (if editable)
      wired into `app/settings/[section]/page.tsx`
- [ ] `examples/vault/.../{Section}/SKILL.md` with the three core
      sections: Schema, How to use, Example interactions
- [ ] `SKILLS.md` index updated
- [ ] `skills/http-api.md` endpoint table updated
- [ ] `docs/sections/<section>.md` user-facing explainer (linked from
      `README.md`'s sections table)
