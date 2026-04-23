# Backlog

Deferred ideas — not scheduled, not blocking, kept here so they don't
get re-discovered from scratch every time.

## Storage layer

- **Git-backed vault writes.** Storage today is plain YAML under
  `$SEPTENA_DATA_DIR`; the user can commit manually. Option on the table:
  run `git add <file> && git commit -m "..."` automatically from the
  write paths (one helper, called from each router's write). Gives free
  history, undo, and multi-device sync via a remote. Deferred because
  (a) manual commits work, (b) auto-commit couples the app to git being
  installed and the vault being a repo, (c) commit messages would be
  machine-generated noise unless we put effort in. Revisit if/when the
  user wants cross-device sync or an in-app "undo last change".

- **Generalise the storage backend** (SQLite / Supabase / Convex /
  PocketBase / etc). Routers currently read/write the filesystem
  directly. If we ever want to run on something other than YAML files,
  the shape would be an `EventStore` interface (`list / get / put /
  delete` + `get_config / put_config`) with YAML as one implementation.
  Not doing this now — we're committed to git/text.

## Insights

- **Widen correlation window** from 30d to 90/180d once enough data has
  accumulated. See `MEMORY.md` — `project_insights_roadmap.md`.

## Taxonomies

- Hardcoded taxonomies (`CAFFEINE_METHODS`, exercise cardio/mobility/
  core/lower defaults, frontend mirrors in `training-dashboard.tsx`)
  could move to per-section `{section}-config.yaml` + a
  `/api/{section}/config` route, mirroring how strains and beans already
  work. Not urgent — they're stable.
