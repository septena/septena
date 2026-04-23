---
name: septena
description: Work with a Septena vault — a local-first personal week tracker whose data lives as plain-YAML Markdown files in a known folder structure. Lets agents log events, query totals, and modify configuration without the app running.
---

# Septena Skills — for AI agents

Septena is a local-first personal health dashboard. Every event the user
logs — a meal, a set, a habit completion, a chore — is one Markdown file
with YAML frontmatter in a known folder. Read those files; write new
ones; the UI updates on the next request. The Septena app doesn't have
to be running for agents to participate.

## When to use this skill

- You're asked to log, query, or summarize anything health-related for a
  user who already has a Septena vault.
- You're asked to edit a `*-config.yaml` (habits, supplements, macros,
  strains, settings).
- You're asked to analyze patterns across sections (correlations,
  streaks, long-term trends).

When the user mentions a specific section (nutrition / exercise / habits
/ etc.), load that section's `SKILL.md` too — this top-level one gives
you the conventions and the routing table; the section skill gives you
the actual schema.

## Where the vault lives

Default: `~/Documents/septena-data/`.
Override: `$SEPTENA_DATA_DIR`. Always resolve through the env var when it's
set — users may point it at any directory.

Structure (a section exists iff its folder exists under the vault):

```
$SEPTENA_DATA_DIR/
  Nutrition/    macros-config.yaml   Log/*.md
  Exercise/                          Log/*.md
  Habits/       habits-config.yaml   Log/*.md
  Supplements/  supplements-config.yaml  Log/*.md    (optional)
  Chores/       Definitions/*.md     Log/*.md         (optional)
  Caffeine/     caffeine-config.yaml Log/*.md         (optional)
  Cannabis/     cannabis-config.yaml Log/*.md         (optional)
  Settings/     settings.yaml
```

Sleep / Body / Health are integration-backed (Oura, Withings, Apple
Health Auto Export) and have no vault folder — see the `skills/integrations/`
files for those.

## Universal event schema

Every event file has these three fields on top of its section-specific
schema:

```yaml
---
date: "2026-04-18"        # required, quoted, YYYY-MM-DD
section: nutrition        # required, matches the folder name (lowercase)
id: "…"                   # required on most sections, stable identifier
# …section-specific fields…
---
```

Filenames always sort correctly under `ls`:

```
YYYY-MM-DD--{disambiguator}--NN.md
```

- `YYYY-MM-DD` is the canonical event date.
- `{disambiguator}` varies by section: `HHMM` for nutrition/caffeine/
  cannabis (time of day), `{exercise-slug}` for exercise,
  `{habit-id}` / `{supplement-id}` / `{chore-id}` for those.
- `NN` is `01`-padded and increments on same-minute collisions.

## Unknown fields are preserved

Parsers read known fields and pass the rest through. Safe to add your
own bookkeeping fields (`agent_source: claude`, `confidence: 0.7`,
anything) without breaking the UI.

## Index of section skills

**Core sections (ship by default):**

| Section | Skill | One-liner |
|---|---|---|
| Nutrition | [`Bases/Nutrition/SKILL.md`](examples/vault/Bases/Nutrition/SKILL.md) | Log meals, macros, foods lists |
| Exercise | [`Bases/Exercise/SKILL.md`](examples/vault/Bases/Exercise/SKILL.md) | Log strength sets, cardio, mobility |
| Habits | [`Bases/Habits/SKILL.md`](examples/vault/Bases/Habits/SKILL.md) | Daily habit completions against a fixed config |
| Settings | [`Bases/Settings/SKILL.md`](examples/vault/Bases/Settings/SKILL.md) | App-level config: targets, section order, animations |

**Optional sections (present iff user copied the folder):**

| Section | Skill | One-liner |
|---|---|---|
| Supplements | [`optional/Supplements/SKILL.md`](examples/vault/optional/Supplements/SKILL.md) | Daily supplement stack completions |
| Chores | [`optional/Chores/SKILL.md`](examples/vault/optional/Chores/SKILL.md) | Recurring tasks with cadence + overdue |
| Caffeine | [`optional/Caffeine/SKILL.md`](examples/vault/optional/Caffeine/SKILL.md) | Drink log with method + beans |
| Cannabis | [`optional/Cannabis/SKILL.md`](examples/vault/optional/Cannabis/SKILL.md) | Vape session log with strains |

**Integration-backed sections (read-only from external services):**

| Section | Skill | Data source |
|---|---|---|
| Sleep | [`skills/integrations/sleep.md`](skills/integrations/sleep.md) | Oura + Apple Health Auto Export |
| Body | [`skills/integrations/body.md`](skills/integrations/body.md) | Withings |
| Health | [`skills/integrations/health.md`](skills/integrations/health.md) | Apple Health Auto Export (HRV, steps, VO₂ max, etc.) |
| Insights | [`skills/integrations/insights.md`](skills/integrations/insights.md) | Derived — cross-section correlations |

**Meta skills:**

| Skill | Purpose |
|---|---|
| [`skills/http-api.md`](skills/http-api.md) | HTTP endpoints if the app is running — faster than re-reading files |
| [`skills/adding-a-section.md`](skills/adding-a-section.md) | Build your own section (e.g. Groceries, Mood) |

## File access vs. HTTP API — which to use

If the Septena app is running (default `http://127.0.0.1:7000`):

- **Querying aggregates** — hit the HTTP API. It caches, handles edge
  cases, and gives you shapes the UI already uses. See
  [`skills/http-api.md`](skills/http-api.md).
- **Logging events** — either works. HTTP `POST /api/{section}/…`
  triggers UI invalidation cleanly, but writing the file directly is
  equivalent since the backend re-reads on every GET.

If the app is NOT running:

- Read and write files directly. You'll lose cache benefits and UI
  liveness until the user reloads, but nothing breaks.

## Graceful failure modes

- **Section folder missing** → that section is simply hidden from the
  UI. Creating the folder + dropping a first file makes it appear.
- **Config YAML missing** → shipped defaults apply (documented per
  section). Safe to delete for a fresh start.
- **Unknown fields in frontmatter** → preserved untouched.
- **Integration tokens missing** → that section shows empty state; no
  errors.

## Example end-to-end agent workflow

User: *"Log breakfast — Greek yogurt with berries, coffee, around 22g
protein and 340 kcal. Also I took my creatine."*

1. Resolve `$SEPTENA_DATA_DIR` (default `~/Documents/septena-data/`).
2. Load `examples/vault/Bases/Nutrition/SKILL.md` and
   `examples/vault/optional/Supplements/SKILL.md` for the two schemas.
3. Write `$SEPTENA_DATA_DIR/Nutrition/Log/{today}--{HHMM}--01.md`:
   ```yaml
   ---
   date: "{today}"
   time: "{HH:MM now}"
   emoji: 🥣
   protein_g: 22
   fat_g: 8
   carbs_g: 42
   kcal: 340
   foods:
     - Breakfast
     - Greek yogurt with berries
     - Coffee
   section: nutrition
   ---
   ```
4. Write `$SEPTENA_DATA_DIR/Supplements/Log/{today}--creatine--01.md` with
   the supplements event schema (see `optional/Supplements/SKILL.md`).
5. Confirm: *"Logged breakfast (22g protein, 340 kcal) and creatine."*

No app interaction needed. Files become visible in the UI on the next
page load or refresh.
