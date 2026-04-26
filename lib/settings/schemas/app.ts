/**
 * Consolidated settings schema for Septena.
 *
 * Each card on the settings page lives here as one schema + (where needed)
 * a pair of adapters. The dashboard becomes a thin shell that maps groups
 * → cards; adding a new field is a one-line change in this file.
 *
 * Why adapters? `Settings/settings.yaml` keeps a flat shape for backwards
 * compat (`protein_min_g`, `protein_max_g`, …). The schema describes the
 * *logical* shape (one min/max range per macro). `toFooView` projects flat
 * → schema; `fooPatch(path, value)` translates a leaf change back into the
 * partial mutation `patchFoo()` expects. When the YAML layout is migrated
 * (step 4 of the consolidation plan), these adapters disappear.
 */

import type {
  AppSettings,
  AppTheme,
  Targets,
} from "@/lib/api";
import {
  enumField,
  group,
  type Infer,
  numField,
  rangeField,
  stringField,
  toggle,
} from "../schema";

/* ── Targets ───────────────────────────────────────────────────────────── */

export const targetsSchema = group("Targets", {
  macros: group(
    "Macros",
    {
      protein: rangeField({ label: "Protein", unit: "g", default: [120, 180] }),
      fat: rangeField({ label: "Fat", unit: "g", default: [50, 90] }),
      carbs: rangeField({ label: "Carbs", unit: "g", default: [150, 250] }),
      kcal: rangeField({ label: "Kcal", unit: "kcal", step: 10, default: [1800, 2400] }),
    },
    { description: "daily min–max" },
  ),
  body: group("Body", {
    weight: rangeField({ label: "Weight", unit: "kg", step: 0.5, default: [70, 80] }),
    body_fat: rangeField({ label: "Body fat", unit: "%", step: 0.5, default: [12, 18] }),
  }),
  other: group("Other", {
    z2_weekly: numField({
      label: "Z2 cardio (weekly)",
      unit: "min",
      step: 5,
      default: 150,
    }),
    sleep: numField({ label: "Sleep", unit: "h", step: 0.25, default: 8 }),
    fasting: rangeField({
      label: "Fasting window",
      unit: "h",
      step: 1,
      default: [14, 18],
    }),
  }),
});

export type TargetsView = Infer<typeof targetsSchema>;

export function toTargetsView(t: Targets): TargetsView {
  return {
    macros: {
      protein: [t.protein_min_g, t.protein_max_g],
      fat: [t.fat_min_g, t.fat_max_g],
      carbs: [t.carbs_min_g, t.carbs_max_g],
      kcal: [t.kcal_min, t.kcal_max],
    },
    body: {
      weight: [t.weight_min_kg, t.weight_max_kg],
      body_fat: [t.fat_min_pct, t.fat_max_pct],
    },
    other: {
      z2_weekly: t.z2_weekly_min,
      sleep: t.sleep_target_h,
      fasting: [t.fasting_min_h, t.fasting_max_h],
    },
  };
}

/**
 * Translate a leaf change at `path` (relative to TargetsView) back into a
 * partial Targets patch. Returns `null` for paths the schema doesn't own,
 * so callers can skip rather than crash on a stray edit.
 */
export function targetsPatch(
  path: readonly (string | number)[],
  next: unknown,
): Partial<Targets> | null {
  const [group, key] = path;
  if (group === "macros" && typeof key === "string") {
    const [lo, hi] = next as [number, number];
    switch (key) {
      case "protein":
        return { protein_min_g: lo, protein_max_g: hi };
      case "fat":
        return { fat_min_g: lo, fat_max_g: hi };
      case "carbs":
        return { carbs_min_g: lo, carbs_max_g: hi };
      case "kcal":
        return { kcal_min: lo, kcal_max: hi };
    }
  }
  if (group === "body" && typeof key === "string") {
    const [lo, hi] = next as [number, number];
    switch (key) {
      case "weight":
        return { weight_min_kg: lo, weight_max_kg: hi };
      case "body_fat":
        return { fat_min_pct: lo, fat_max_pct: hi };
    }
  }
  if (group === "other" && typeof key === "string") {
    switch (key) {
      case "z2_weekly":
        return { z2_weekly_min: next as number };
      case "sleep":
        return { sleep_target_h: next as number };
      case "fasting": {
        const [lo, hi] = next as [number, number];
        return { fasting_min_h: lo, fasting_max_h: hi };
      }
    }
  }
  return null;
}

/* ── Day phases ────────────────────────────────────────────────────────── */
// Edited via the bespoke <DayPhasesEditor>, not the schema-driven renderer —
// the boundary-divider model doesn't fit a list of independent rows.

/* ── Theme ─────────────────────────────────────────────────────────────── */

export const themeSchema = enumField(["light", "dark", "eink"] as const, {
  label: "Theme",
  labels: { light: "Day", dark: "Night", eink: "Eink" },
  default: "system" as AppTheme as "light",
});

/* ── Animations ────────────────────────────────────────────────────────── */

export const animationsSchema = group("Animations", {
  training_complete: toggle({
    label: "Training complete",
    description: "Confetti when a workout wraps.",
    default: true,
  }),
  first_meal: toggle({
    label: "First meal",
    description: "Break-fast burst on today's first nutrition entry.",
    default: true,
  }),
  histograms_raise: toggle({
    label: "Raise histograms",
    description: "Quick raise-from-baseline on chart bars when a card loads.",
    default: true,
  }),
  habits_complete: toggle({
    label: "Habits complete",
    description: "Confetti when all daily habits are done.",
    default: true,
  }),
  chores_complete: toggle({
    label: "Chores complete",
    description: "Confetti when all due chores for today are done.",
    default: true,
  }),
  supplements_complete: toggle({
    label: "Supplements complete",
    description: "Confetti when the day's supplement stack is finished.",
    default: true,
  }),
  tasks_today_zero: toggle({
    label: "Today inbox zero",
    description: "Confetti when the last task in Today is checked off.",
    default: true,
  }),
});

/* ── Re-exports for ergonomic imports ──────────────────────────────────── */

export type AnimationsView = Infer<typeof animationsSchema>;

/** Pull the AppSettings.animations slice safely (handles older payloads). */
export function toAnimationsView(a: AppSettings["animations"]): AnimationsView {
  return {
    training_complete: a?.training_complete ?? true,
    first_meal: a?.first_meal ?? true,
    histograms_raise: a?.histograms_raise ?? true,
    habits_complete: a?.habits_complete ?? true,
    chores_complete: a?.chores_complete ?? true,
    supplements_complete: a?.supplements_complete ?? true,
    tasks_today_zero: a?.tasks_today_zero ?? true,
  };
}
