// Shared live-fasting state machine. The backend chart already uses a
// "prev day's last eating event → today's first eating event" rule — this
// module answers the *live* question: "am I fasting right now?"
//
// Three states:
//   - "fasting" (overnight): no food logged today yet, yesterday had a
//     plausible last meal. Timer runs from that last meal.
//   - "fasting" (new window):  it's past EVENING_HOUR, last eating event
//     was ≥ POST_MEAL_GRACE_MIN minutes ago. Timer runs from that event.
//   - "fed": in-between. Eaten today, pre-evening (or within grace). No
//     timer — the user is not fasting in the dashboard sense.
//
// The thresholds mirror main.py:_fasting_windows so live state and the
// chart agree on what a "last meal of the day" looks like.

import { todayLocalISO } from "@/lib/date-utils";

export const EVENING_HOUR = 19;
export const POST_MEAL_GRACE_MIN = 30;

// Fasting window targets. Backend config in macros-config.yaml overrides
// these when present (min = floor for "good", max = ceiling for "ideal").
export const FASTING_TARGET_MIN = 14;
export const FASTING_TARGET_MAX = 16;

export type FastingStateInputs = {
  today_latest_meal: string | null;
  today_meal_count: number;
  yesterday_last_meal: string | null;
};

export type FastingState =
  | { state: "fed" }
  | {
      state: "fasting";
      /** When the current fast started. */
      sinceDay: "today" | "yesterday";
      sinceTime: string; // HH:MM
      hours: number;
      mins: number;
      totalMin: number;
    };

/** Parse a local-time HH:MM into a Date anchored to `dayOffset` days ago. */
function parseHM(hm: string, dayOffset: 0 | 1, now: Date): Date {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(now);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export function computeFastingState(
  inputs: FastingStateInputs | null | undefined,
  now: Date = new Date(),
): FastingState {
  if (!inputs) return { state: "fed" };
  const { today_latest_meal, today_meal_count, yesterday_last_meal } = inputs;

  // Case A: overnight fast still running — nothing eaten today yet.
  if (today_meal_count === 0 && yesterday_last_meal) {
    const then = parseHM(yesterday_last_meal, 1, now);
    const diffMs = now.getTime() - then.getTime();
    if (diffMs > 0) {
      const totalMin = Math.floor(diffMs / 60000);
      return {
        state: "fasting",
        sinceDay: "yesterday",
        sinceTime: yesterday_last_meal,
        hours: Math.floor(totalMin / 60),
        mins: totalMin % 60,
        totalMin,
      };
    }
  }

  // Case B: post-dinner, new fast window beginning.
  if (now.getHours() >= EVENING_HOUR && today_latest_meal) {
    const then = parseHM(today_latest_meal, 0, now);
    const diffMs = now.getTime() - then.getTime();
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin >= POST_MEAL_GRACE_MIN) {
      return {
        state: "fasting",
        sinceDay: "today",
        sinceTime: today_latest_meal,
        hours: Math.floor(totalMin / 60),
        mins: totalMin % 60,
        totalMin,
      };
    }
  }

  return { state: "fed" };
}

/** True iff the given entry, saved now, would be the first eating event
 *  of the user's current day (i.e. "breaking the fast"). Pass in the
 *  count of today's meal+snack entries *before* the save. */
export function isBreakingFast(
  todayMealCountBeforeSave: number,
  savingForDate: string,
): boolean {
  return todayMealCountBeforeSave === 0 && savingForDate === todayLocalISO();
}
