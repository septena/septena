import type { AppSettings } from "@/lib/api";
import { group, rangeField, type Infer } from "../schema";

/**
 * Daily macro targets.
 *
 * Storage is currently flat (`protein_min_g`, `protein_max_g`, …) for
 * backward compat with `Settings/settings.yaml`. The schema describes the
 * logical shape — one min/max range per macro — and `toView`/`applyChange`
 * bridge the two until the YAML is migrated.
 */
export const macrosSchema = group(
  "Macros",
  {
    protein: rangeField({ label: "Protein", unit: "g", default: [120, 180] }),
    fat: rangeField({ label: "Fat", unit: "g", default: [50, 90] }),
    carbs: rangeField({ label: "Carbs", unit: "g", default: [150, 250] }),
    kcal: rangeField({ label: "Kcal", unit: "kcal", step: 10, default: [1800, 2400] }),
  },
  { description: "daily min–max" },
);

export type MacrosView = Infer<typeof macrosSchema>;

type Targets = AppSettings["targets"];

/** Project the flat `targets` slice into the schema's tuple shape. */
export function toMacrosView(t: Targets): MacrosView {
  return {
    protein: [t.protein_min_g, t.protein_max_g],
    fat: [t.fat_min_g, t.fat_max_g],
    carbs: [t.carbs_min_g, t.carbs_max_g],
    kcal: [t.kcal_min, t.kcal_max],
  };
}

/**
 * Translate a leaf change at `path` (relative to MacrosView) back into a
 * partial Targets patch the existing `patchTargets` helper understands.
 * Returns `null` for paths the schema doesn't own.
 */
export function macrosPatch(
  path: readonly (string | number)[],
  next: unknown,
): Partial<Targets> | null {
  if (path.length !== 1) return null;
  const [lo, hi] = next as [number, number];
  switch (path[0]) {
    case "protein":
      return { protein_min_g: lo, protein_max_g: hi };
    case "fat":
      return { fat_min_g: lo, fat_max_g: hi };
    case "carbs":
      return { carbs_min_g: lo, carbs_max_g: hi };
    case "kcal":
      return { kcal_min: lo, kcal_max: hi };
    default:
      return null;
  }
}
