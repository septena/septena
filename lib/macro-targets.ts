// Daily macro target helpers.
//
// Numeric ranges (min/max) come from the backend (`/api/nutrition/macros-config`),
// which merges the user's `Nutrition/macros-config.yaml` over shipped defaults.
// Labels and colors stay here — they're design, not user preferences.

import useSWR from "swr";
import { getMacrosConfig, getSettings, type MacrosConfig, type MacroRange, type AppSettings } from "@/lib/api";
import { FASTING_TARGET_MIN, FASTING_TARGET_MAX } from "@/lib/fasting";

export type MacroKey = "protein" | "fat" | "carbs" | "kcal";

export type MacroTarget = MacroRange & {
  label: string;
  color: string;
};

export type MacroTargets = Record<MacroKey, MacroTarget>;

const META: Record<MacroKey, { label: string; color: string }> = {
  protein: { label: "Protein", color: "hsl(45,90%,48%)" },
  fat:     { label: "Fat",     color: "hsl(30,60%,50%)" },
  carbs:   { label: "Carbs",  color: "hsl(200,70%,50%)" },
  kcal:    { label: "Kcal",   color: "hsl(0,60%,55%)" },
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

function buildTargets(ranges: Record<MacroKey, MacroRange>): MacroTargets {
  return {
    protein: { ...ranges.protein, ...META.protein },
    fat:     { ...ranges.fat,     ...META.fat },
    carbs:   { ...ranges.carbs,   ...META.carbs },
    kcal:    { ...ranges.kcal,    ...META.kcal },
  };
}

export const FALLBACK_MACRO_TARGETS: MacroTargets = buildTargets(FALLBACK_RANGES);

/** SWR-backed macro targets. Returns the fallback while loading or on
 *  error — rendering never has to branch on `undefined`. */
export function useMacroTargets(): MacroTargets {
  const { data } = useSWR<MacrosConfig>("macros-config", getMacrosConfig, {
    revalidateOnFocus: false,
  });
  if (!data) return FALLBACK_MACRO_TARGETS;
  return buildTargets(data);
}

/** Format a target range for display: "130-150g". */
export function formatRange(t: MacroRange): string {
  return `${t.min}-${t.max}${t.unit}`;
}

/** Progress fraction against the midpoint of the range — gives a useful
 *  "close to target" feel without penalising overshoot within the band. */
export function progressTowardRange(value: number, t: MacroRange): number {
  return Math.min(1, value / ((t.min + t.max) / 2));
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
  return {
    min: min ?? 25,
    max: max ?? 35,
    unit: "g",
    label: "Fiber",
    color: "hsl(142, 55%, 38%)",
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
  return { min: FASTING_TARGET_MIN, max: FASTING_TARGET_MAX };
}
