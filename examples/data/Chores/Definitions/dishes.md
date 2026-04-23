---
id: dishes
name: Dishes
cadence_days: 1
emoji: 🍽️
section: chores
---

Example chore definition. Each chore is one `.md` file under
`Chores/Definitions/` with this YAML frontmatter.

- `id` — unique, kebab-case. Used as the completion key in
  `Chores/Log/`.
- `cadence_days` — how often it should repeat (1 = daily, 7 = weekly,
  14 = biweekly, etc.).
- `emoji` — shown in the UI.
- Free-text body (like this) is shown as a hint when logging.

Delete this file and add your own — Septena picks up changes on the
next request.
