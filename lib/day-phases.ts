/**
 * Day phases — user-configurable morning/afternoon/evening buckets.
 *
 * Source of truth is settings.day_phases (see api/routers/settings.py).
 * This module centralises the derivation logic so components don't
 * reimplement parsing of HH:MM strings or "which phase is now".
 */

import type { DayPhase } from "@/lib/api";

export const DEFAULT_DAY_PHASES: DayPhase[] = [
  {
    id: "morning", label: "Morning", emoji: "🌅",
    start: "00:00", cutoff: "11:00",
    messages: [{ greeting: "Good morning", subtitle: "Start your day strong — check habits and supplements" }],
  },
  {
    id: "afternoon", label: "Afternoon", emoji: "☀️",
    start: "11:00", cutoff: "17:00",
    messages: [{ greeting: "Good afternoon", subtitle: "Midday check-in — how's nutrition and training?" }],
  },
  {
    id: "evening", label: "Evening", emoji: "🌙",
    start: "17:00", cutoff: "22:00",
    messages: [{ greeting: "Good evening", subtitle: "Wind down — review the day and prep for tomorrow" }],
  },
];

function parseHm(hm: string): { h: number; m: number } {
  const [hRaw, mRaw] = String(hm || "").split(":");
  const h = Math.max(0, Math.min(23, parseInt(hRaw, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mRaw, 10) || 0));
  return { h, m };
}

export function phaseStartMinutes(p: DayPhase): number {
  const { h, m } = parseHm(p.start);
  return h * 60 + m;
}

export function phaseCutoffMinutes(p: DayPhase): number {
  const { h, m } = parseHm(p.cutoff);
  return h * 60 + m;
}

/** Which phase is "current" right now (by start-time boundaries). */
export function activePhaseId(phases: DayPhase[], now: Date = new Date()): string | null {
  if (!phases.length) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let active = phases[0].id;
  for (const p of phases) {
    if (nowMin >= phaseStartMinutes(p)) active = p.id;
  }
  return active;
}

export function isPastPhase(phases: DayPhase[], id: string, now: Date = new Date()): boolean {
  const active = activePhaseId(phases, now);
  if (!active) return false;
  const i = phases.findIndex((p) => p.id === id);
  const j = phases.findIndex((p) => p.id === active);
  return i >= 0 && j >= 0 && i < j;
}

export function isFuturePhase(phases: DayPhase[], id: string, now: Date = new Date()): boolean {
  const active = activePhaseId(phases, now);
  if (!active) return false;
  const i = phases.findIndex((p) => p.id === id);
  const j = phases.findIndex((p) => p.id === active);
  return i >= 0 && j >= 0 && i > j;
}

/** True when `done=false` and the cutoff has passed for this phase. */
export function isPastCutoff(phases: DayPhase[], id: string, done: boolean, now: Date = new Date()): boolean {
  if (done) return false;
  const p = phases.find((x) => x.id === id);
  if (!p) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= phaseCutoffMinutes(p);
}

/** Human-readable "Xh Ym left" until cutoff, when we're inside the phase. */
export function timeLeftInPhase(phases: DayPhase[], id: string, now: Date = new Date()): string | null {
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
export function orderPhasesByCurrent(phases: DayPhase[], now: Date = new Date()): DayPhase[] {
  if (!phases.length) return phases;
  const active = activePhaseId(phases, now);
  const i = phases.findIndex((p) => p.id === active);
  if (i <= 0) return [...phases];
  return [...phases.slice(i), ...phases.slice(0, i)];
}
