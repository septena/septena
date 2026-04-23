# Septena

**A local-first personal health dashboard for people comfortable running
a small local app: Node frontend, Python backend, and human-readable
YAML in a plain, git-native folder on your disk.**

Septena is one app for several corners of personal health — training,
nutrition, habits, sleep, body, vitals, supplements, caffeine, chores —
tracked through a clean web UI, stored as plain text files you
can read, edit, and back up like any other notes.

Today, Septena is for technical users: people who are fine cloning a
repo, installing Node and Python dependencies, and running a local web
app on their own machine. A packaged desktop app may come later; that
is not the current setup model.

![Overview](docs/screenshots/overview.png)

_Screenshots show demo data — run `npm run seed-demo` to see the app
with data before logging your own._

## Philosophy

- **Your data is yours.** Every event you log is one Markdown file with
  YAML frontmatter in a folder on your disk. No database, no cloud, no
  account. Delete the app tomorrow and your history is untouched.
- **Git-native.** The data folder is just a folder — version it with
  git, sync it with anything, read it with any Markdown/YAML-aware
  tool (including Obsidian if you want). Nothing is locked to one app.
- **One person, one machine.** Septena is built for a single user on
  localhost, not for multi-tenant deployment. Auth, rate limits, and
  CORS tightening are intentionally absent because the threat model is
  "nobody but me."
- **No hidden state.** Section configuration (habits lists, macro
  targets, supplement stacks) is YAML you edit by hand or through the
  Settings UI. Nothing is baked into the app that you can't see and
  change.

## What you can track

Septena ships with these sections. Each one is **auto-detected by
whether its folder exists in your data directory** — sections you haven't set
up simply don't appear in the nav, and optional integrations stay
hidden until their credentials land.

Each section links to its own page with what it can do, the YAML
schema, and the relevant endpoints.

| Section | What it does | Storage |
|---|---|---|
| [**Training**](docs/sections/exercise.md) | Training sessions, progression charts, PR tracking. Pre-fillable templates for upper/lower/cardio/yoga days. | YAML per set |
| [**Nutrition**](docs/sections/nutrition.md) | Meals, supplements, snacks, per-meal macros, rolling daily targets, fasting-window tracking. | YAML per meal |
| [**Habits**](docs/sections/habits.md) | Fixed daily checklist bucketed morning / afternoon / evening with 30-day history. | YAML per day |
| [**Chores**](docs/sections/chores.md) | Recurring, deferrable tasks with overdue tracking. | YAML per chore + per completion |
| [**Supplements**](docs/sections/supplements.md) | Daily stack checklist with streak history. | YAML per day |
| [**Caffeine**](docs/sections/caffeine.md) | V60s, matcha, time-of-day patterns. | YAML per drink |
| [**Sleep**](docs/sections/sleep.md) | Score, stages, trends. | Read-only from Oura / Apple Health |
| [**Body**](docs/sections/body.md) | Weight, body-fat trends. | Read-only from Withings |
| [**Health**](docs/sections/health.md) | HRV, resting HR, steps, VO₂ max, active calories. | Read-only from Apple Health |
| [**Air**](docs/sections/air.md) | Ambient CO₂, temperature, humidity — live band, day-stats, overnight windows. | Read-only from Aranet4 |
| [**Insights**](docs/sections/insights.md) | Cross-section correlations and patterns. | Derived |

The core three — Training, Nutrition, Habits — and the optional
sections ship as starter scaffolding under
[`examples/data/`](examples/data/). The first-install flow in the app
copies whichever sections you pick into your data folder; you can also
copy them by hand.

## Optional integrations

None of these are required. If the token/credential file isn't present,
the section simply shows empty state — the rest of the app still works.

- **Oura Ring** — sleep, readiness, activity. Auth via a personal access
  token.
- **Withings** — weight and body-fat measurements from a Withings scale.
  OAuth2 credentials.
- **Apple Health** — steps, HRV, resting HR, VO₂ max, exercise minutes,
  and sleep (as a fallback when Oura isn't present). Data arrives via the
  [Health Auto Export](https://www.healthyapps.dev/) iOS app posting to a
  local webhook; Septena reads the resulting JSON snapshot.
- **Aranet4** — ambient CO₂, temperature, humidity, pressure from a
  Bluetooth sensor. Polled locally by `scripts/aranet_poller.py` (launchd
  plist in `scripts/com.septena.aranet.plist`); readings land in
  `$SEPTENA_DATA_DIR/Air/Log/{date}.md` as a daily rollup.

All four are optional and each is independent — wire up as many or as few
as you like.

## Data model

Every event — a rep, a meal, a habit toggle, a chore completion — is one
Markdown file with YAML frontmatter. The minimum shape:

```yaml
---
date: "2026-04-18"
id: "2026-04-18T08:15:00-meal-breakfast"
section: nutrition
# … section-specific fields below
---
```

Files live at `$SEPTENA_DATA_DIR/<Section>/Log/`. Filenames vary by section
(e.g. nutrition uses `YYYY-MM-DD--HHMM--NN.md`; training uses
`YYYY-MM-DD--{exercise-slug}--NN.md`). Each section has its own parser
but they share `date`, `id`, and `section` across the universe.

See `docs/HEALTH_DATA_SPEC.md` for the health-data pipeline and
`CLAUDE.md` for section-by-section schema notes.

## Quickstart

**Prerequisites:** Python 3.11+, Node 20+. Septena currently assumes
you already have both installed and are comfortable running a local dev
stack. The data directory is just a folder of Markdown files — no
Obsidian required.

### 1. Clone and install

```bash
git clone https://github.com/septena/septena.git
cd septena
cp .env.example .env.local
pip install -r requirements.txt
npm install
```

### 2. Choose one setup path

#### Option A — Run with demo data

```bash
npm run seed-demo
SEPTENA_DATA_DIR=/tmp/septena-demo-data \
SEPTENA_INTEGRATIONS_DIR=/tmp/none \
uvicorn main:app --port 7000 --reload
```

In a second terminal:

```bash
cd septena
npm run dev
```

Then open `http://localhost:7777`.

#### Option B — Run with a new data folder

If you want to use the default location, leave `.env.local` unchanged.
If not, set `SEPTENA_DATA_DIR` in `.env.local` to your preferred folder.

Create the folder and start the backend:

```bash
mkdir -p ~/Documents/septena-data
uvicorn main:app --port 7000 --reload
```

In a second terminal:

```bash
cd septena
npm run dev
```

Then open `http://localhost:7777`.

On first run, Septena will show onboarding because the data folder is
empty. Pick the sections you want in the checklist and click
`Create my data folder` — the app copies the selected sections from
[`examples/data/`](examples/data/) into your data folder and reloads.

#### Option C — Run with an existing data folder

Set `SEPTENA_DATA_DIR` in `.env.local` if your data folder is not at
`~/Documents/septena-data`, then start both processes:

```bash
uvicorn main:app --port 7000 --reload
```

In a second terminal:

```bash
cd septena
npm run dev
```

Then open `http://localhost:7777`. Any section folders already present
in your data folder will appear automatically.

## Configuration

All config is environment variables — Septena has no global config file.
Defaults work if your data directory lives at
`~/Documents/septena-data/`.

| Variable | Default | Purpose |
|---|---|---|
| `SEPTENA_DATA_DIR` | `~/Documents/septena-data` | Where section YAML logs + configs live (legacy alias: `SEPTENA_DATA_DIR`) |
| `SEPTENA_HEALTH_DIR` | `~/Documents/septena-data/Health` | Read-only health snapshots folder |
| `SEPTENA_INTEGRATIONS_DIR` | `~/.config/openclaw` | Tokens/credentials for Oura/Withings/Apple Health |
| `SEPTENA_CACHE_DIR` | `~/.config/septena` | App-owned scratch space (health cache etc.) |
| `SEPTENA_BACKEND_URL` | `http://127.0.0.1:7000` | Where Next.js proxies `/api/*` |
| `SEPTENA_DEV_ORIGINS` | `localhost` | Comma-separated hostnames for LAN/Tailscale access |

Full list with comments: [`.env.example`](.env.example).

## Integration setup

### Oura Ring (optional)

1. Get a personal access token at https://cloud.ouraring.com/personal-access-tokens
2. Save it to `$SEPTENA_INTEGRATIONS_DIR/oura/token.txt`
3. The Sleep, Health, and Vitals sections will start populating.

### Withings (optional)

1. Register an app at https://developer.withings.com/
2. Complete the OAuth2 flow (we don't ship a helper yet — any OAuth2
   script works) and write the resulting token JSON to
   `$SEPTENA_INTEGRATIONS_DIR/withings/token.json`
3. Save your app credentials to
   `$SEPTENA_INTEGRATIONS_DIR/withings/credentials.json`:
   ```json
   { "client_id": "...", "client_secret": "..." }
   ```
4. The Body section will start populating. Septena auto-refreshes the
   token when it expires.

### Apple Health via Health Auto Export (optional)

1. Install [Health Auto Export](https://www.healthyapps.dev/) on iOS.
2. Configure a REST API export destination pointing to your Mac
   (Tailscale / LAN).
3. Run a receiver that writes payloads to
   `$SEPTENA_INTEGRATIONS_DIR/health_auto_export/latest.json`.
   See `docs/HEALTH_DATA_SPEC.md` for the expected schema.
4. The Health, Sleep, and Body sections will start populating.

## Using with AI agents

Because every section is plain YAML in a known folder, any AI agent that
can read and write files (Claude, Cursor, Codex, Claude Code, Claude
Desktop) can log data, compute totals, and modify configuration — the
Septena app doesn't even need to be running.

Agents can also do the initial local setup for you. Good prompts:

- `Install Septena locally and run it with demo data.`
- `Install Septena locally, create a new empty data folder, and start the app.`
- `Use this README to run Septena against my existing data folder.`

Every section ships a **`SKILL.md`** describing its file layout, YAML
schema, and agent-friendly examples:

- [`examples/data/Nutrition/SKILL.md`](examples/data/Nutrition/SKILL.md) — meals, macros
- [`examples/data/Training/SKILL.md`](examples/data/Training/SKILL.md) — training sessions
- [`examples/data/Habits/SKILL.md`](examples/data/Habits/SKILL.md) — habit checklist
- [`examples/data/Supplements/SKILL.md`](examples/data/Supplements/SKILL.md), [`Chores`](examples/data/Chores/SKILL.md), [`Caffeine`](examples/data/Caffeine/SKILL.md)

Point your agent at the one(s) you need. One skill = one section's
contract; context stays small.

```
/skill examples/data/Nutrition/SKILL.md
```

Then:
> "Log breakfast — Greek yogurt with berries and coffee, ~22g protein, ~340 kcal"

The agent writes `$SEPTENA_DATA_DIR/Nutrition/Log/{today}--{HHMM}--01.md`
with the correct schema.

See [`SKILLS.md`](SKILLS.md) for the full index and shared conventions.

## Customization

Most section behavior is driven by YAML you edit directly:

- **Macro targets:** `$SEPTENA_DATA_DIR/Nutrition/macros-config.yaml` —
  protein/fat/carbs/kcal ranges. Missing file → neutral defaults.
- **Habit list:** `$SEPTENA_DATA_DIR/Habits/habits-config.yaml` — what
  habits appear and in which time-of-day bucket.
- **Supplement stack:** `$SEPTENA_DATA_DIR/Supplements/supplements-config.yaml`
- **Caffeine sources:** `$SEPTENA_DATA_DIR/Caffeine/caffeine-config.yaml`
- **App settings:** `$SEPTENA_DATA_DIR/Settings/settings.yaml` — section
  order, animation preferences, fasting/eating window targets, per-section
  enable/disable. Also editable via the Settings tab.
- **Session templates** (gym routine): `lib/session-templates.ts` — the
  one holdout still in TypeScript. Edit this file to match your own
  split / equipment. Slated to move into YAML in the data folder in a later release.

## Architecture

**Frontend:** Next.js App Router + TypeScript + Tailwind + shadcn/ui +
Recharts. Dev server on port 7777.

**Backend:** FastAPI, entrypoint at `main.py` delegating to `api/app.py`.
One `APIRouter` per section under `api/routers/`. Dev server on port
7000, hot-reloaded with `--reload`. No database — every request re-reads
YAML from disk (cheap at personal-scale data volumes).

**No build step for data.** Edit a YAML file in any editor, reload the
page, changes appear. The Training section caches for performance and
auto-invalidates on file mtime change.

Full folder layout lives in [`CLAUDE.md`](CLAUDE.md).

## Adding your own section

See [`skills/adding-a-section.md`](skills/adding-a-section.md) — the
canonical step-by-step guide covering:

- The five archetypes (per-event log, fixed-set checklist,
  cadence-based, stateful checklist, integration-backed) — pick the
  one that matches your data shape.
- Data-folder layout + universal YAML frontmatter.
- Backend router + shared parsing helpers from `api/parsing.py`.
- Registry wiring (`api/paths.py`, `api/routers/sections.py`,
  `api/routers/settings.py`, `lib/sections.ts`).
- Dashboard + settings-UI card (DRY pattern — one `ManageXCard` in
  `components/manage-items.tsx`, no new settings page needed).
- Per-section `SKILL.md` so agents can log into the section from day
  one.
- End-of-work checklist.

Copy from the nearest existing section's router + dashboard rather
than writing from scratch.

## Scope and limitations

**What Septena is not:**
- **Not multi-user.** Running it on a server exposes your data — the
  threat model assumes localhost, LAN, or Tailscale-only.
- **Not a replacement for Oura/Withings/Apple Health.** It reads their
  data; it doesn't send anything back.
- **Not a coaching app.** No training plans, no meal plans, no
  suggestions — just fast entry and visibility into what you've done.
- **Not polished for strangers yet.** This is a personal project opened
  up. Expect rough edges in onboarding and first-run UX while OSS
  adoption matures.

## Contributing

Septena is a personal project shared publicly under the MIT license.
Issues and PRs are welcome but I only merge changes that match how I
actually use the app. For significantly different flavors,
**fork freely** — the philosophy encourages it.

## Running under `start.sh`

```bash
./start.sh
```

Starts both frontend and backend with logs in `./logs/`. Useful for
putting Septena behind a launchd or systemd service.
