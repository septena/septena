// Session draft helpers — wraps lib/idb.ts with domain-level operations.
// Source of truth during an active gym session. Every mutation hits IDB
// synchronously-enough (awaited) so closing the tab mid-set loses nothing.

import { idb, type DraftEntry, type DraftSession } from "@/lib/idb";
import {
  isCardio,
  SESSION_META,
  TEMPLATES,
  type SessionType,
  type TemplateItem,
} from "@/lib/session-templates";
import { postSession, type LastEntryValues, type ProgressionPoint, type SessionEntryPayload } from "@/lib/api";

export type ActiveEntry = DraftEntry & {
  // UI-only state, not persisted.
  status: "pending" | "saving" | "done" | "failed" | "skipped";
  // Prefill metadata shown below the inputs.
  last_summary: string;
  // Recent history for this exercise (newest first, up to 5 entries).
  // Frozen at session start. Not persisted to IDB (rehydrate = empty).
  history: ProgressionPoint[];
};

export type ActiveSession = Omit<DraftSession, "entries"> & {
  type: SessionType;
  entries: ActiveEntry[];
};

function todayLocalISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function currentLocalTime(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

function summarize(exercise: string, last: LastEntryValues | null): string {
  if (!last) return "No prior data";
  if (isCardio(exercise)) {
    const parts: string[] = [];
    if (last.duration_min != null) parts.push(`${last.duration_min} min`);
    if (last.distance_m != null) parts.push(`${last.distance_m} m`);
    if (last.level != null) parts.push(`level ${last.level}`);
    if (last.avg_pace_m_per_min != null) parts.push(`avg ${last.avg_pace_m_per_min} m/min`);
    return parts.length ? `${parts.join(" · ")} (${last.date})` : `(${last.date})`;
  }
  const parts: string[] = [];
  if (last.sets != null && last.reps != null) parts.push(`${last.sets} × ${last.reps}`);
  if (last.weight != null) parts.push(`@ ${last.weight} kg`);
  parts.push(`(${last.difficulty || "medium"})`);
  return `${parts.join(" ")} — ${last.date}`;
}

/** Build a single entry from an exercise name, its last-known values, and
 *  an optional template item (which may carry target_duration_min / level).
 *  Used both by buildDraft and by `addExercise` when the user adds a
 *  missing machine mid-session. */
export function buildEntry(
  exercise: string,
  last: LastEntryValues | null,
  templateItem?: Pick<TemplateItem, "target_duration_min" | "target_level">,
): ActiveEntry {
  const cardio = isCardio(exercise);
  const target_duration_min = templateItem?.target_duration_min;
  const target_level = templateItem?.target_level;

  // Duration: prefer the template's target (that's the plan for today).
  const durationPrefill = cardio
    ? target_duration_min ?? last?.duration_min ?? null
    : null;

  // Level: template can force lower intensity. Otherwise use the per-exercise mode.
  const levelPrefill = cardio ? target_level ?? last?.level ?? null : null;

  // Distance: extrapolate from avg pace × target duration.
  let distancePrefill: number | null = null;
  if (cardio && durationPrefill != null) {
    if (last?.avg_pace_m_per_min != null) {
      distancePrefill = Math.round(last.avg_pace_m_per_min * durationPrefill);
    } else if (last?.distance_m != null) {
      distancePrefill = last.distance_m;
    }
  }

  return {
    exercise,
    is_cardio: cardio,
    status: "pending",
    last_summary: summarize(exercise, last),
    history: last?.history ?? [],
    dirty: false,
    weight: !cardio ? last?.weight ?? null : null,
    sets: !cardio ? (typeof last?.sets === "number" ? last.sets : 3) : null,
    reps: !cardio ? (last?.reps != null ? String(last.reps) : "12") : null,
    // Strength difficulty defaults to "medium" unless the user taps easy/hard.
    difficulty: !cardio ? (last?.difficulty || "medium") : "",
    duration_min: durationPrefill,
    distance_m: distancePrefill,
    level: levelPrefill,
    skipped: false,
    note: "",
  };
}

/** Build a fresh draft for the given session type, prefilled from last values. */
export function buildDraft(
  type: SessionType,
  lastByExercise: Record<string, LastEntryValues | null>,
): ActiveSession {
  const template = TEMPLATES[type];
  const entries: ActiveEntry[] = template.map((item) =>
    buildEntry(item.exercise, lastByExercise[item.exercise] ?? null, item),
  );

  const now = new Date().toISOString();
  return {
    id: "current",
    date: todayLocalISO(),
    time: currentLocalTime(),
    session_type: type,
    type,
    entries,
    status: "draft",
    started_at: now,
    updated_at: now,
  };
}

/** Persist the active session to IDB. Stores the full per-entry status so
 *  that a mid-session reload — and critically, the next markDone call that
 *  re-reads IDB — sees the current done/failed/skipped marks. */
async function persist(session: ActiveSession): Promise<void> {
  const draft: DraftSession = {
    id: session.id,
    date: session.date,
    time: session.time,
    session_type: session.session_type,
    entries: session.entries.map((e) => ({
      exercise: e.exercise,
      weight: e.weight,
      sets: e.sets,
      reps: e.reps,
      difficulty: e.difficulty,
      duration_min: e.duration_min,
      distance_m: e.distance_m,
      level: e.level,
      skipped: e.skipped,
      note: e.note,
      is_cardio: e.is_cardio,
      dirty: e.status === "failed", // legacy field; still written for compat
      status: e.status,
      history: e.history,
    })),
    status: session.status,
    started_at: session.started_at,
    concluded_at: session.concluded_at,
    updated_at: new Date().toISOString(),
  };
  await idb.saveDraft(draft);
}

export const draft = {
  async start(type: SessionType, lastByExercise: Record<string, LastEntryValues | null>): Promise<ActiveSession> {
    const s = buildDraft(type, lastByExercise);
    await persist(s);
    return s;
  },

  async load(): Promise<ActiveSession | null> {
    const d = await idb.getDraft();
    if (!d) return null;
    // Rehydrate status. We persisted `dirty=true` for failed entries; treat
    // everything else as pending on cold load unless already concluded.
    const entries: ActiveEntry[] = d.entries.map((e) => ({
      ...e,
      // Prefer persisted status; fall back to dirty for drafts predating it.
      status: e.status ?? (e.dirty ? "failed" : "pending"),
      last_summary: "",
      history: (e.history ?? []) as ActiveEntry["history"],
    }));
    const type = (d.session_type as SessionType) ?? "upper";
    return {
      ...d,
      type,
      entries,
    };
  },

  /** Replace the exercise at `index` with a freshly-built entry for `name`,
   *  prefilled from its last known values. Preserves position in the list
   *  so the session structure stays stable. */
  async swapExercise(
    session: ActiveSession,
    index: number,
    name: string,
    last: LastEntryValues | null,
  ): Promise<ActiveSession> {
    const entry = buildEntry(name, last);
    const next: ActiveSession = {
      ...session,
      entries: session.entries.map((e, i) => (i === index ? entry : e)),
    };
    await persist(next);
    return next;
  },

  /** Mutate an entry and persist. Used for in-progress edits (weight, reps, etc.). */
  async update(session: ActiveSession, index: number, patch: Partial<ActiveEntry>): Promise<ActiveSession> {
    const next: ActiveSession = {
      ...session,
      entries: session.entries.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    };
    await persist(next);
    return next;
  },

  /** Mark entry Done, persist, then POST to backend. On failure entry stays
   *  in IDB with status="failed"; caller decides whether to show an error.
   *  If the entry was previously saved (has `saved_file`), the backend
   *  overwrites that file instead of creating a duplicate. */
  async markDone(session: ActiveSession, index: number): Promise<{ session: ActiveSession; ok: boolean; error?: string }> {
    const entry = session.entries[index];
    let next = await this.update(session, index, { status: "saving" });

    // Difficulty default: if the user didn't explicitly tap easy/hard on a
    // strength entry, it's medium. Cardio entries don't track difficulty.
    const difficulty = !entry.is_cardio && !entry.difficulty ? "medium" : entry.difficulty;

    const payload: SessionEntryPayload = {
      exercise: entry.exercise,
      weight: entry.weight,
      sets: entry.sets,
      reps: entry.reps,
      difficulty,
      duration_min: entry.duration_min,
      distance_m: entry.distance_m,
      level: entry.level,
      skipped: false,
      note: entry.note,
      ...(entry.saved_file ? { replace_file: entry.saved_file } : {}),
    };
    try {
      const response = await postSession({
        date: session.date,
        time: session.time,
        session_type: session.type,
        entries: [payload],
      });
      const savedFile = response.written[0] ?? entry.saved_file ?? undefined;
      next = await this.update(next, index, { status: "done", saved_file: savedFile, difficulty });
      return { session: next, ok: true };
    } catch (err) {
      next = await this.update(next, index, { status: "failed" });
      return { session: next, ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  },

  async markSkipped(session: ActiveSession, index: number): Promise<ActiveSession> {
    return this.update(session, index, { status: "skipped", skipped: true });
  },

  /** Retry all failed entries in a session. */
  async retryFailed(session: ActiveSession): Promise<ActiveSession> {
    let current = session;
    for (let i = 0; i < current.entries.length; i++) {
      if (current.entries[i].status === "failed") {
        const r = await this.markDone(current, i);
        current = r.session;
      }
    }
    return current;
  },

  /** Mark the draft concluded but keep it in IDB so the done page can read
   *  stats. Call `clear()` once the user dismisses the done page. */
  async finish(): Promise<void> {
    await idb.concludeDraft();
  },

  async clear(): Promise<void> {
    await idb.clearDraft();
  },
};

export { SESSION_META };
