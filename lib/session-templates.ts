// Session templates — one source of truth for what "upper" / "lower" /
// "cardio" / "yoga" day means. Cardio goes first as warmup, ab crunch last
// as finisher.
//
// This file is intentionally user-editable: the values below reflect one
// specific gym routine (Basic Fit machines, 2 cardio warmup + 8 strength
// machines per day). Change TEMPLATES / BASIC_FIT_MACHINES to match your
// own split and equipment.
//
// TODO(oss): move to a vault YAML (Exercise/templates-config.yaml) so
// users don't need to edit TypeScript to customize their routine. Blocked
// on a bigger refactor — this touches ~11 consumer files and would need
// SWR-backed loading everywhere. Tracked for a v0.2 quality-of-life pass.

export type SessionType = "upper" | "lower" | "cardio" | "yoga";

export type TemplateItem = {
  exercise: string;
  // For cardio/mobility exercises: the target duration in minutes. The user
  // still inputs actual values; this is a prompt only.
  target_duration_min?: number;
  // Override the per-exercise prefilled level. Used on the cardio (Z2) day
  // to force lower intensity than the user's usual working level, so the
  // session stays in zone 2.
  target_level?: number;
};

// 10 items per strength day (2 cardio warmup + 8 strength machines) → ~50 min.
// Cardio day is the long Z2 day and stays at elliptical 30 + rowing 20 + core.
export const TEMPLATES: Record<SessionType, TemplateItem[]> = {
  upper: [
    { exercise: "elliptical", target_duration_min: 10 },
    { exercise: "rowing", target_duration_min: 10 },
    { exercise: "chest press" },
    { exercise: "diverging seated row" },
    { exercise: "lat pull" },
    { exercise: "shoulder press" },
    { exercise: "triceps extension" },
    { exercise: "biceps" },
    { exercise: "rear delt" },
    { exercise: "ab crunch" },
  ],
  lower: [
    { exercise: "elliptical", target_duration_min: 10 },
    { exercise: "rowing", target_duration_min: 10 },
    { exercise: "leg press" },
    { exercise: "leg extension" },
    { exercise: "leg curl" },
    { exercise: "abduction" },
    { exercise: "adduction" },
    { exercise: "calf press" },
    { exercise: "squat" },
    { exercise: "ab crunch" },
  ],
  // Cardio (Z2) day: only the two machines at lower intensity. No strength.
  cardio: [
    { exercise: "elliptical", target_duration_min: 30, target_level: 4 },
    { exercise: "rowing", target_duration_min: 20, target_level: 1 },
  ],

  // Yoga day: sun salutations as a continuous flow.
  yoga: [{ exercise: "surya namaskar", target_duration_min: 45 }],
};

export const CARDIO_EXERCISES = new Set(["elliptical", "rowing", "stairs"]);
export const MOBILITY_EXERCISES = new Set(["surya namaskar", "pull up"]);

export function isCardio(exercise: string): boolean {
  return CARDIO_EXERCISES.has(exercise) || MOBILITY_EXERCISES.has(exercise);
}

export const SESSION_META: Record<SessionType, { emoji: string; label: string }> = {
  upper: { emoji: "💪", label: "Upper" },
  lower: { emoji: "🦵", label: "Lower" },
  cardio: { emoji: "🫁", label: "Cardio" },
  yoga: { emoji: "🧘", label: "Yoga" },
};

// Full list of machines available at the gym, mapped to canonical lowercase
// names. Used to populate the "Add missing exercise" dropdown so the user
// can add anything, not just exercises already in their history.
//
// Aliases used for uppercase machine names that map to existing canonical
// exercises in the vault: CROSSTRAINER→elliptical, ROWER→rowing,
// STAIRCLIMBER→stairs, LAT PULLDOWN→lat pull, ABDOMINAL CRUNCH→ab crunch.
export const BASIC_FIT_MACHINES: string[] = [
  // Cardio
  "elliptical",
  "rowing",
  "stairs",
  "treadmill",
  "stationary bike",
  "recumbent bike",
  // Chest
  "chest press",
  "converging chest press",
  "plate vertical chest press",
  "chest fly",
  // Back / pull
  "lat pull",
  "diverging lat pull",
  "plate lat pull",
  "seated row",
  "diverging seated row",
  "plate seated row",
  // Shoulders
  "shoulder press",
  "converging shoulder press",
  "plate shoulder press",
  "rear delt",
  // Arms
  "triceps extension",
  "triceps dips",
  "arm curl",
  // Legs — quads
  "leg press",
  "plate leg press",
  "leg extension",
  "hack squat",
  "perfect squat",
  // Legs — hams
  "leg curl",
  "prone leg curl",
  // Legs — glute
  "glute trainer",
  // Legs — abductors / calves
  "calf press",
  "plate calf",
  "abduction",
  "adduction",
  // Core
  "ab crunch",
  "abdominal",
  "back extension",
  "rotary torso",
  // Bodyweight / assisted
  "pull up",
  "assisted pull up",
  "chin assist",
  // Mobility
  "surya namaskar",
];
