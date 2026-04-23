"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { getExerciseConfig } from "@/lib/api";

/** The four exercise types defined in the backend config
 *  (api/routers/exercise/taxonomy.py:_DEFAULT_TYPES). "unknown" is returned
 *  when the name isn't in the config yet (first paint, offline, or brand-new
 *  exercise not yet added). Callers decide how to treat unknown — the
 *  training dashboard falls back to the strength path. */
export type ExerciseKind = "strength" | "cardio" | "mobility" | "core" | "unknown";

export type ExerciseTaxonomy = {
  classify: (name: string | undefined | null) => ExerciseKind;
  /** True once the backend config has loaded. Lets callers distinguish
   *  "unknown because still loading" from "unknown because truly absent". */
  ready: boolean;
};

const UNREADY: ExerciseTaxonomy = { classify: () => "unknown", ready: false };

/** Single source of truth for exercise classification on the frontend.
 *  Reads from /api/exercise/config — the backend's authoritative taxonomy
 *  loaded from Bases/Exercise/exercise-config.yaml. Aliases are honored.
 *
 *  Before this hook existed, each dashboard kept its own hardcoded
 *  `CARDIO_EXERCISES`/`MOBILITY_EXERCISES`/`CORE_EXERCISES` Sets that
 *  silently drifted from the backend seed when the user added a new
 *  exercise through Settings. */
export function useExerciseTaxonomy(): ExerciseTaxonomy {
  const { data } = useSWR("exercise-config", getExerciseConfig, {
    revalidateOnFocus: false,
  });

  return useMemo<ExerciseTaxonomy>(() => {
    if (!data) return UNREADY;
    const byName: Record<string, ExerciseKind> = {};
    for (const ex of data.exercises ?? []) {
      if (!ex.name || !ex.type) continue;
      const t = ex.type as ExerciseKind;
      if (t === "strength" || t === "cardio" || t === "mobility" || t === "core") {
        byName[ex.name.toLowerCase()] = t;
      }
    }
    // Aliases inherit the target's type (e.g. legacy "row" → "rowing" → cardio).
    for (const [alias, target] of Object.entries(data.aliases ?? {})) {
      const key = String(target).toLowerCase();
      const t = byName[key];
      if (t) byName[alias.toLowerCase()] = t;
    }
    return {
      ready: true,
      classify: (name) => byName[(name ?? "").toLowerCase()] ?? "unknown",
    };
  }, [data]);
}
