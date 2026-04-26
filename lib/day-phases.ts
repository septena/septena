/**
 * Day phases — user-configurable morning/afternoon/evening buckets.
 *
 * Source of truth is settings.day_phases + settings.day_phase_boundaries +
 * settings.day_end. This module centralises derivation: phases store labels
 * and messages, boundaries are owned by the parent so the same time isn't
 * entered twice and adjacent phases can't drift apart.
 */

import type { DayPhase } from "@/lib/api";

export const DEFAULT_DAY_PHASES: DayPhase[] = [
  {
    id: "morning",
    label: "Morning",
    emoji: "🌅",
    greeting: "Good morning",
    subtitles: ["Start your day strong — check habits and supplements"],
  },
  {
    id: "afternoon",
    label: "Afternoon",
    emoji: "☀️",
    greeting: "Good afternoon",
    subtitles: ["Midday check-in — how's nutrition and training?"],
  },
  {
    id: "evening",
    label: "Evening",
    emoji: "🌙",
    greeting: "Good evening",
    subtitles: ["Wind down — review the day and prep for tomorrow"],
  },
];

/** Internal dividers between phases — N-1 entries for N phases. */
export const DEFAULT_DAY_PHASE_BOUNDARIES = ["11:00", "17:00"];
/** Trailing cutoff (bedtime) for the final phase. */
export const DEFAULT_DAY_END = "22:00";

/** Derived phase with computed start/cutoff times. */
export type PhaseRange = DayPhase & { start: string; cutoff: string };

function parseHm(hm: string): { h: number; m: number } {
  const [hRaw, mRaw] = String(hm || "").split(":");
  const h = Math.max(0, Math.min(23, parseInt(hRaw, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mRaw, 10) || 0));
  return { h, m };
}

export function hmToMinutes(hm: string): number {
  const { h, m } = parseHm(hm);
  return h * 60 + m;
}

/** Attach derived start/cutoff to each phase from the boundaries array. */
export function resolvePhases(
  phases: DayPhase[],
  boundaries: string[] = DEFAULT_DAY_PHASE_BOUNDARIES,
  dayEnd: string = DEFAULT_DAY_END,
): PhaseRange[] {
  return phases.map((p, i) => ({
    ...p,
    start: i === 0 ? "00:00" : boundaries[i - 1] ?? "00:00",
    cutoff: i === phases.length - 1 ? dayEnd : boundaries[i] ?? dayEnd,
  }));
}

export function phaseStartMinutes(p: PhaseRange): number {
  return hmToMinutes(p.start);
}

export function phaseCutoffMinutes(p: PhaseRange): number {
  return hmToMinutes(p.cutoff);
}

/** Which phase is "current" right now (by start-time boundaries). */
export function activePhaseId(
  phases: PhaseRange[],
  now: Date = new Date(),
): string | null {
  if (!phases.length) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let active = phases[0].id;
  for (const p of phases) {
    if (nowMin >= phaseStartMinutes(p)) active = p.id;
  }
  return active;
}

export function isPastPhase(
  phases: PhaseRange[],
  id: string,
  now: Date = new Date(),
): boolean {
  const active = activePhaseId(phases, now);
  if (!active) return false;
  const i = phases.findIndex((p) => p.id === id);
  const j = phases.findIndex((p) => p.id === active);
  return i >= 0 && j >= 0 && i < j;
}

export function isFuturePhase(
  phases: PhaseRange[],
  id: string,
  now: Date = new Date(),
): boolean {
  const active = activePhaseId(phases, now);
  if (!active) return false;
  const i = phases.findIndex((p) => p.id === id);
  const j = phases.findIndex((p) => p.id === active);
  return i >= 0 && j >= 0 && i > j;
}

/** True when `done=false` and the cutoff has passed for this phase. */
export function isPastCutoff(
  phases: PhaseRange[],
  id: string,
  done: boolean,
  now: Date = new Date(),
): boolean {
  if (done) return false;
  const p = phases.find((x) => x.id === id);
  if (!p) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= phaseCutoffMinutes(p);
}

/** Human-readable "Xh Ym left" until cutoff, when we're inside the phase. */
export function timeLeftInPhase(
  phases: PhaseRange[],
  id: string,
  now: Date = new Date(),
): string | null {
  const p = phases.find((x) => x.id === id);
  if (!p) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = phaseStartMinutes(p);
  const cutoffMin = phaseCutoffMinutes(p);
  if (nowMin < startMin || nowMin >= cutoffMin) return null;
  const remaining = cutoffMin - nowMin;
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

/** Order phases so the current one comes first, past phases wrap to the
 *  end (they already happened today and the user may still mark them
 *  done). Future phases follow the active one. */
export function orderPhasesByCurrent(
  phases: PhaseRange[],
  now: Date = new Date(),
): PhaseRange[] {
  if (!phases.length) return phases;
  const active = activePhaseId(phases, now);
  const i = phases.findIndex((p) => p.id === active);
  if (i <= 0) return [...phases];
  return [...phases.slice(i), ...phases.slice(0, i)];
}
