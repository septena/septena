# Setlist vault skeleton

Two layers: a lean **core** (`Bases/`) that's the sensible default, and
**optional** extensions (`optional/`) you drop in when you want them.
The app auto-detects which sections exist in your vault — no config
toggle required. Drag a folder in, the section appears. Remove it, the
section disappears (data stays in the folder; it's just hidden from
nav).

## Core — copy to bootstrap

```bash
cp -R examples/vault/Bases/* "$SETLIST_VAULT"
# default: cp -R examples/vault/Bases/* ~/Documents/obsidian/Bases/
```

Gives you three active-tracking sections plus app settings:

- **Exercise** — training sessions and progression
- **Nutrition** — meals, macros, fasting windows
- **Habits** — morning / afternoon / evening checklist
- **Settings** — app preferences (section order, animations)

Three integration-gated sections appear automatically when their tokens
are present under `$SETLIST_INTEGRATIONS_DIR`:

- **Sleep** — when Oura or Apple Health Auto Export is configured
- **Body** — when Withings is configured
- **Health** — when Apple Health Auto Export is configured

## Optional — copy what you want

```bash
# pick one, all, or none
cp -R examples/vault/optional/Supplements "$SETLIST_VAULT/"
cp -R examples/vault/optional/Chores "$SETLIST_VAULT/"
cp -R examples/vault/optional/Caffeine "$SETLIST_VAULT/"
cp -R examples/vault/optional/Cannabis "$SETLIST_VAULT/"
```

- **Supplements** — daily stack checklist with streak tracking
- **Chores** — recurring tasks with deferrable cadence
- **Caffeine** — drink log with time-of-day patterns
- **Cannabis** — session log, strains, capsule inventory

Each section folder is self-contained — copy the whole thing and Setlist
picks it up on the next request.

## What's not included

- **Session templates** for Exercise — these live in
  `lib/session-templates.ts` and must be edited in TypeScript for now.
- **Integration tokens** — put those under `SETLIST_INTEGRATIONS_DIR`,
  not inside the vault. See the main README.
