// Daily macro target helpers.
//
// Numeric ranges (min/max) come from the backend (`/api/nutrition/macros-config`),
// which merges the user's `Nutrition/macros-config.yaml` over shipped defaults.
// Labels come from here; colors come from `settings.nutrition.macro_colors`
// (user-configurable via the Nutrition section settings page).

import useSWR from "swr";
import { getSettings, type MacroRange, type AppSettings, type MacroColors } from "@/lib/api";
import { DEFAULT_FASTING_TARGET_MIN, DEFAULT_FASTING_TARGET_MAX } from "@/lib/fasting";

export type MacroKey = "protein" | "fat" | "carbs" | "kcal";

export type MacroTarget = MacroRange & {
  label: string;
  color: string;
};

export type MacroTargets = Record<MacroKey, MacroTarget>;

const LABELS: Record<MacroKey, string> = {
  protein: "Protein",
  fat: "Fat",
  carbs: "Carbs",
  kcal: "Kcal",
};

// Baseline palette picks — identical to DEFAULT_SETTINGS.nutrition.macro_colors
// in the backend. Used as SWR fallback so first paint isn't monochrome.
export const FALLBACK_MACRO_COLORS: MacroColors = {
  protein: "#ef4444",
  fat:     "#f59e0b",
  carbs:   "#3b82f6",
  fiber:   "#10b981",
  kcal:    "#eab308",
  fasting: "#8b5cf6",
};

/** Compile-time fallback, used while the config is loading or if the
 *  backend is unreachable. Kept loose so neither the app nor the OSS
 *  default nudges toward a specific regimen. */
const FALLBACK_RANGES: Record<MacroKey, MacroRange> = {
  protein: { min: 100, max: 150, unit: "g" },
  fat:     { min: 50,  max: 80,  unit: "g" },
  carbs:   { min: 200, max: 300, unit: "g" },
  kcal:    { min: 2000, max: 2500, unit: "" },
};

function buildTargets(
  ranges: Record<MacroKey, MacroRange>,
  colors: MacroColors,
): MacroTargets {
  return {
    protein: { ...ranges.protein, label: LABELS.protein, color: colors.protein },
    fat:     { ...ranges.fat,     label: LABELS.fat,     color: colors.fat },
    carbs:   { ...ranges.carbs,   label: LABELS.carbs,   color: colors.carbs },
    kcal:    { ...ranges.kcal,    label: LABELS.kcal,    color: colors.kcal },
  };
}

export const FALLBACK_MACRO_TARGETS: MacroTargets = buildTargets(
  FALLBACK_RANGES,
  FALLBACK_MACRO_COLORS,
);

function mergeColors(partial: Partial<MacroColors> | undefined): MacroColors {
  return { ...FALLBACK_MACRO_COLORS, ...(partial ?? {}) };
}

/** SWR-backed macro colors — reads `settings.nutrition.macro_colors` with
 *  per-key fallback so a partial patch never leaves any macro uncolored. */
export function useMacroColors(): MacroColors {
  const { data } = useSWR<AppSettings>("settings", getSettings, {
    revalidateOnFocus: false,
  });
  return mergeColors(data?.nutrition?.macro_colors);
}

/** SWR-backed macro targets. Returns the fallback while loading or on
 *  error — rendering never has to branch on `undefined`. */
export function useMacroTargets(): MacroTargets {
  const { data } = useSWR<AppSettings>("settings", getSettings, {
    revalidateOnFocus: false,
  });
  const colors = mergeColors(data?.nutrition?.macro_colors);
  if (!data?.targets) return buildTargets(FALLBACK_RANGES, colors);
  const t = data.targets;
  return buildTargets(
    {
      protein: { min: t.protein_min_g ?? 130, max: t.protein_max_g ?? 150, unit: "g" },
      fat:     { min: t.fat_min_g ?? 55,      max: t.fat_max_g ?? 75,      unit: "g" },
      carbs:   { min: t.carbs_min_g ?? 160,   max: t.carbs_max_g ?? 240,   unit: "g" },
      kcal:    { min: t.kcal_min ?? 2000,     max: t.kcal_max ?? 2400,     unit: "" },
    },
    colors,
  );
}

/** Format a target range for display: "130-150g". */
export function formatRange(t: MacroRange): string {
  return `${t.min}-${t.max}${t.unit}`;
}

/** Progress fraction against the midpoint of the range — gives a useful
 *  "close to target" feel without penalising overshoot within the band. */
export function progressTowardRange(value: number, t: MacroRange): number {
  return value / ((t.min + t.max) / 2);
}

/** Progress fraction in "left" mode: how much of the max budget is still
 *  available. 1 when nothing eaten yet, 0 when at/over max. */
export function progressLeftInRange(value: number, t: MacroRange): number {
  if (t.max <= 0) return 0;
  return Math.min(1, Math.max(0, (t.max - value) / t.max));
}

import type { ProgressMode } from "@/lib/api";

/** SWR-backed progress mode preference. */
export function useProgressMode(): ProgressMode {
  const { data } = useSWR<AppSettings>("settings", getSettings, {
    revalidateOnFocus: false,
  });
  return data?.nutrition?.progress_mode ?? "used";
}

/** Resolve {value, progress} for a macro tile based on progress mode.
 *  "used": show consumed amount, fill toward midpoint.
 *  "left": show remaining-to-max, fill drains as you eat. */
export function macroTileNumbers(
  consumed: number,
  t: MacroRange,
  mode: ProgressMode,
): { value: number | null; progress: number } {
  if (mode === "left") {
    const left = Math.max(0, t.max - consumed);
    return { value: consumed > 0 ? left : t.max, progress: progressLeftInRange(consumed, t) };
  }
  return {
    value: consumed > 0 ? consumed : null,
    progress: progressTowardRange(consumed, t),
  };
}

export type FastingRange = { min: number; max: number };

export type FiberTarget = MacroRange & {
  label: string;
  color: string;
};

/** SWR-backed fiber target from settings.yaml (targets.fiber_min_g/max). */
export function useFiberTarget(): FiberTarget {
  const { data } = useSWR<AppSettings>("settings", getSettings, {
    revalidateOnFocus: false,
  });
  const min = data?.targets?.fiber_min_g;
  const max = data?.targets?.fiber_max_g;
  const colors = mergeColors(data?.nutrition?.macro_colors);
  return {
    min: min ?? 25,
    max: max ?? 35,
    unit: "g",
    label: "Fiber",
    color: colors.fiber,
  };
}

/** SWR-backed fasting window target from settings.yaml (targets.fasting_min_h/max).
 *  Falls back to built-in 14-16h when settings are loading or values are absent. */
export function useFastingTarget(): FastingRange {
  const { data } = useSWR<AppSettings>("settings", getSettings, {
    revalidateOnFocus: false,
  });
  const min = data?.targets?.fasting_min_h;
  const max = data?.targets?.fasting_max_h;
  if (min != null && max != null) return { min, max };
  return { min: DEFAULT_FASTING_TARGET_MIN, max: DEFAULT_FASTING_TARGET_MAX };
}
