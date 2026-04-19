import type { ExerciseEntry, ProgressionPoint } from "@/lib/api";

/** Personal records for a single strength exercise.
 *  - `maxWeight`  — highest single-set weight ever logged
 *  - `maxVolume`  — highest per-entry volume (weight × sets × reps). Avoids
 *    the "big warm-up set counts as PR" failure mode by taking the top
 *    single entry, not a summed-day total.
 *  Both `*Entry` fields point at the entry the PR came from so callers can
 *  show the date or flag it. */
export type ExercisePR = {
  maxWeight: number | null;
  maxWeightEntry: { date: string; weight: number } | null;
  maxVolume: number | null;
  maxVolumeEntry: { date: string; volume: number } | null;
};

function repsAsNumber(reps: number | string | null | undefined): number | null {
  if (typeof reps === "number") return reps;
  if (typeof reps === "string" && reps.trim() && reps.toUpperCase() !== "AMRAP") {
    const n = Number(reps);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Compute per-exercise PRs from a flat list of entries. Returns a map
 *  keyed by exercise name. Cardio exercises are skipped — weight/volume
 *  PRs only apply to strength. */
export function computePRs(entries: ExerciseEntry[]): Map<string, ExercisePR> {
  const prs = new Map<string, ExercisePR>();
  for (const e of entries) {
    if (!e.exercise || !e.date) continue;
    const w = e.weight;
    if (typeof w !== "number") continue; // strength-only
    const sets = typeof e.sets === "number" ? e.sets : Number(e.sets ?? 0);
    const reps = repsAsNumber(e.reps);
    const volume = sets && reps ? w * sets * reps : null;

    const current = prs.get(e.exercise) ?? {
      maxWeight: null,
      maxWeightEntry: null,
      maxVolume: null,
      maxVolumeEntry: null,
    };
    if (current.maxWeight == null || w > current.maxWeight) {
      current.maxWeight = w;
      current.maxWeightEntry = { date: e.date, weight: w };
    }
    if (volume != null && (current.maxVolume == null || volume > current.maxVolume)) {
      current.maxVolume = volume;
      current.maxVolumeEntry = { date: e.date, volume };
    }
    prs.set(e.exercise, current);
  }
  return prs;
}

export type PRFlags = { weightPR: boolean; volumePR: boolean };

/** Does the given point tie/break the PR for its exercise? Called after
 *  computePRs — if `point.date` matches the PR date and value matches the
 *  PR value, the PR is on this point. */
export function isPointPR(
  pr: ExercisePR | undefined,
  point: Pick<ProgressionPoint, "date" | "weight" | "sets" | "reps">,
): PRFlags {
  if (!pr) return { weightPR: false, volumePR: false };
  const w = point.weight;
  const sets = typeof point.sets === "number" ? point.sets : Number(point.sets ?? 0);
  const reps = repsAsNumber(point.reps);
  const volume = typeof w === "number" && sets && reps ? w * sets * reps : null;
  const weightPR =
    pr.maxWeightEntry?.date === point.date &&
    typeof w === "number" &&
    w === pr.maxWeight;
  const volumePR =
    pr.maxVolumeEntry?.date === point.date &&
    volume != null &&
    volume === pr.maxVolume;
  return { weightPR, volumePR };
}
