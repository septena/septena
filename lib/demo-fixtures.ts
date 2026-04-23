/** Demo-mode fixture dispatcher.
 *
 *  When the (demo) layout sets `window.__SEPTENA_DEMO__`, `request()` in
 *  lib/api.ts routes through `matchDemoFixture()` instead of hitting the
 *  FastAPI backend. This lets the Vercel-deployed marketing+demo site reuse
 *  every real dashboard component without a running Python backend.
 *
 *  Sections get wired up incrementally — anything not matched here falls
 *  through to a shape-compatible empty fallback so the dashboard renders
 *  without crashing.
 */

import sectionManifest from "@/sections/manifest.json";

// Fixed "today" for demo mode. Every generated date/entry is anchored here
// so the story stays self-consistent even if the deploy runs for a week.
const DEMO_TODAY = "2026-04-23";

type FixtureHandler = (url: URL, init?: RequestInit) => unknown;

const FIXTURES: Array<{ pattern: RegExp; handler: FixtureHandler }> = [
  // ── Sections registry ────────────────────────────────────────────────
  // Gut is explicitly personal data (not part of the default dataset), so
  // hide it in demo mode. Every other section appears, enabled, so the
  // topnav looks realistic even before its tile has fixtures.
  { pattern: /^\/api\/sections$/, handler: sectionsRegistry },
  // ── Exercise ──────────────────────────────────────────────────────────
  { pattern: /^\/api\/stats$/, handler: exerciseStats },
  { pattern: /^\/api\/next-workout$/, handler: exerciseNextWorkout },
  { pattern: /^\/api\/summary$/, handler: exerciseSummary },
  { pattern: /^\/api\/entries$/, handler: exerciseEntries },
  { pattern: /^\/api\/cardio-history$/, handler: cardioHistory },
  { pattern: /^\/api\/progression\//, handler: exerciseProgression },
  { pattern: /^\/api\/exercise\/config$/, handler: exerciseConfig },
  { pattern: /^\/api\/exercises$/, handler: () => EXERCISE_LIST.map((e) => e.name) },
  { pattern: /^\/api\/sessions\//, handler: exerciseSession },
];

export function matchDemoFixture(path: string, init?: RequestInit): unknown {
  const url = new URL(path, "http://demo.local");
  for (const { pattern, handler } of FIXTURES) {
    if (pattern.test(url.pathname)) return handler(url, init);
  }
  return emptyFallback(url);
}

export function isDemoMode(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __SEPTENA_DEMO__?: boolean }).__SEPTENA_DEMO__)
  );
}

// ─── Fallbacks ─────────────────────────────────────────────────────────────

function emptyFallback(url: URL): unknown {
  const p = url.pathname;
  if (p === "/api/config") {
    return {
      paths: {
        vault: "/demo/septena-data",
        health: "/demo/health",
        integrations: "/demo/integrations",
        cache: "/demo/cache",
      },
      vault_exists: true,
      vault_has_sections: true,
      integrations: { oura: false, withings: false, apple_health: false },
      available_sections: ["exercise"],
    };
  }
  if (p === "/api/sections") return [];
  if (p === "/api/settings") return {};
  if (p === "/api/meta") return { sections: {} };
  // Event-shaped endpoints.
  if (p.endsWith("/events")) return { events: [] };
  // Per-day endpoints return { items/entries: [] } style shapes. Avoid
  // returning a bare Array — `Array.prototype.entries` would shadow the
  // expected `.entries` field in any destructuring that uses optional
  // chaining.
  if (/\/(day|list|cache|summary|config|macros-config|stats|capsule\/active)($|\/)/.test(p)) {
    return {
      items: [],
      entries: [],
      events: [],
      daily: [],
      sessions: [],
      history: [],
      oura: [],
      apple: [],
      withings: [],
      combined: [],
      capsule: null,
    };
  }
  return [];
}

// ─── Sections registry ─────────────────────────────────────────────────────

function sectionsRegistry() {
  const entries = Object.values(sectionManifest) as Array<{
    key: string;
    label: string;
    path: string;
    apiBase: string;
    dataDir: string;
    color: string;
    tagline: string;
    emoji: string;
  }>;
  // Personal-only sections that aren't part of the demo dataset.
  const HIDDEN = new Set(["gut", "air", "cannabis"]);
  return entries
    .filter((s) => !HIDDEN.has(s.key))
    .map((s, idx) => ({ ...s, order: idx, enabled: true }));
}

// ─── Exercise taxonomy ─────────────────────────────────────────────────────

type DemoExercise = { id: string; name: string; type: "strength" | "cardio" | "mobility"; subgroup?: string };

const EXERCISE_LIST: DemoExercise[] = [
  { id: "bench-press", name: "bench press", type: "strength", subgroup: "upper" },
  { id: "overhead-press", name: "overhead press", type: "strength", subgroup: "upper" },
  { id: "pull-ups", name: "pull ups", type: "strength", subgroup: "upper" },
  { id: "barbell-row", name: "barbell row", type: "strength", subgroup: "upper" },
  { id: "squat", name: "squat", type: "strength", subgroup: "lower" },
  { id: "deadlift", name: "deadlift", type: "strength", subgroup: "lower" },
  { id: "romanian-deadlift", name: "romanian deadlift", type: "strength", subgroup: "lower" },
  { id: "rowing", name: "rowing", type: "cardio" },
  { id: "elliptical", name: "elliptical", type: "cardio" },
  { id: "stairs", name: "stairs", type: "cardio" },
  { id: "surya-namaskar", name: "surya namaskar", type: "mobility" },
];

function exerciseConfig() {
  return {
    types: [
      { id: "strength", label: "Strength", fields: ["weight", "sets", "reps"] },
      { id: "cardio", label: "Cardio", fields: ["duration_min", "distance_m"] },
      { id: "mobility", label: "Mobility", fields: ["duration_min"] },
    ],
    exercises: EXERCISE_LIST,
    aliases: {},
  };
}

// ─── Deterministic session log ─────────────────────────────────────────────
// 42 days of workouts, roughly 4–5 sessions/week, alternating upper / lower /
// cardio / mobility. Weights trend up slowly so the chart has a visible
// upward slope. Everything is deterministic — same seed, same shape.

type SessionTemplate = {
  type: "upper" | "lower" | "cardio" | "yoga";
  daysAgo: number;
  entries: Array<{
    exercise: string;
    weight?: number;
    sets?: number;
    reps?: string;
    duration_min?: number;
    distance_m?: number;
  }>;
};

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Gentle linear progression with a tiny saw-tooth for realism. */
function progressWeight(base: number, weeksBack: number, step: number): number {
  const weekly = base - weeksBack * step;
  const jitter = ((weeksBack * 7) % 3) - 1; // -1, 0, 1 kg week-to-week wobble
  return Math.max(0, Math.round((weekly + jitter) * 2) / 2);
}

function buildSessions(): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  // 42 days covers the default 30-day window plus padding.
  for (let daysAgo = 1; daysAgo <= 42; daysAgo++) {
    const day = new Date(DEMO_TODAY + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() - daysAgo);
    const dow = day.getUTCDay(); // 0 = Sun
    const weeksBack = Math.floor(daysAgo / 7);
    // Mon=upper, Tue=cardio, Wed=lower, Thu=rest, Fri=upper, Sat=lower, Sun=yoga.
    // Skip Thursday entirely so "rest day" shows up in the log.
    if (dow === 4) continue;
    if (dow === 1 || dow === 5) {
      sessions.push({
        type: "upper",
        daysAgo,
        entries: [
          { exercise: "bench press", weight: progressWeight(78, weeksBack, 0.5), sets: 4, reps: "6" },
          { exercise: "overhead press", weight: progressWeight(52, weeksBack, 0.25), sets: 4, reps: "6" },
          { exercise: "barbell row", weight: progressWeight(70, weeksBack, 0.5), sets: 4, reps: "8" },
          { exercise: "pull ups", weight: 0, sets: 3, reps: "8" },
        ],
      });
    } else if (dow === 3 || dow === 6) {
      sessions.push({
        type: "lower",
        daysAgo,
        entries: [
          { exercise: "squat", weight: progressWeight(108, weeksBack, 0.75), sets: 4, reps: "5" },
          { exercise: "romanian deadlift", weight: progressWeight(92, weeksBack, 0.5), sets: 3, reps: "8" },
          // Deadlift only once a week.
          ...(dow === 6
            ? [{ exercise: "deadlift", weight: progressWeight(140, weeksBack, 1), sets: 3, reps: "3" }]
            : []),
        ],
      });
    } else if (dow === 2) {
      sessions.push({
        type: "cardio",
        daysAgo,
        entries: [
          { exercise: "rowing", duration_min: 22, distance_m: 5200 + weeksBack * -40 },
        ],
      });
    } else if (dow === 0) {
      sessions.push({
        type: "yoga",
        daysAgo,
        entries: [{ exercise: "surya namaskar", duration_min: 18 }],
      });
    }
  }
  return sessions;
}

const SESSIONS = buildSessions();

type ExerciseEntry = {
  date: string;
  session: string;
  exercise?: string;
  weight: number | null;
  sets: number | string | null;
  reps: number | string | null;
  difficulty: string;
  duration_min?: number | null;
  distance_m?: number | null;
  level?: number | null;
  concluded_at?: string;
  source?: string;
};

function flattenEntries(): ExerciseEntry[] {
  const out: ExerciseEntry[] = [];
  for (const s of SESSIONS) {
    const date = addDays(DEMO_TODAY, -s.daysAgo);
    for (const e of s.entries) {
      out.push({
        date,
        session: s.type,
        exercise: e.exercise,
        weight: e.weight ?? null,
        sets: e.sets ?? null,
        reps: e.reps ?? null,
        difficulty: "medium",
        duration_min: e.duration_min ?? null,
        distance_m: e.distance_m ?? null,
        level: null,
        concluded_at: `${date}T18:30:00`,
      });
    }
  }
  // Backend returns newest-first.
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const ALL_ENTRIES = flattenEntries();

// ─── Handlers ──────────────────────────────────────────────────────────────

function exerciseStats() {
  return {
    total_sessions: SESSIONS.length,
    total_entries: ALL_ENTRIES.length,
    exercises_count: EXERCISE_LIST.length,
    date_range: {
      start: ALL_ENTRIES[ALL_ENTRIES.length - 1]?.date ?? null,
      end: ALL_ENTRIES[0]?.date ?? null,
    },
    last_loaded_at: `${DEMO_TODAY}T09:00:00`,
    last_logged_at: `${ALL_ENTRIES[0]?.date}T18:30:00`,
  };
}

function exerciseNextWorkout() {
  const lastByType: Record<string, number | null> = { upper: null, lower: null, cardio: null, yoga: null };
  for (const s of SESSIONS) {
    if (lastByType[s.type] === null) lastByType[s.type] = s.daysAgo;
  }
  const daysAgoEntry = Object.entries(lastByType) as Array<[keyof typeof lastByType, number | null]>;
  const oldest = daysAgoEntry.reduce((a, b) => ((b[1] ?? 99) > (a[1] ?? 99) ? b : a));
  const emoji: Record<string, string> = { upper: "💪", lower: "🦵", cardio: "🚣", yoga: "🧘" };
  const label: Record<string, string> = { upper: "Upper", lower: "Lower", cardio: "Cardio", yoga: "Yoga" };
  const last_date: Record<string, string | null> = {};
  for (const [k, v] of daysAgoEntry) last_date[k] = v == null ? null : addDays(DEMO_TODAY, -v);
  return {
    suggested: { type: oldest[0], emoji: emoji[oldest[0]], label: label[oldest[0]] },
    days_ago: lastByType,
    last_date,
  };
}

function exerciseSummary() {
  const byName: Record<string, { latest_weight: number | null; latest_date: string | null; count: number; earliest: number | null }> = {};
  for (const e of ALL_ENTRIES) {
    if (!e.exercise) continue;
    const row = byName[e.exercise] ?? { latest_weight: null, latest_date: null, count: 0, earliest: null };
    row.count += 1;
    if (!row.latest_date || e.date > row.latest_date) {
      row.latest_date = e.date;
      row.latest_weight = e.weight;
    }
    if (typeof e.weight === "number" && (row.earliest == null || e.weight < row.earliest)) {
      row.earliest = e.weight;
    }
    byName[e.exercise] = row;
  }
  return Object.entries(byName).map(([name, row]) => {
    const trend = row.latest_weight != null && row.earliest != null && row.latest_weight > row.earliest
      ? "up"
      : row.latest_weight != null && row.earliest != null && row.latest_weight < row.earliest
      ? "down"
      : "flat";
    return {
      name,
      latest_weight: row.latest_weight,
      latest_date: row.latest_date,
      trend,
      count: row.count,
    };
  });
}

function exerciseEntries() {
  return ALL_ENTRIES;
}

function exerciseProgression(url: URL) {
  const name = decodeURIComponent(url.pathname.replace("/api/progression/", ""));
  const data = ALL_ENTRIES
    .filter((e) => e.exercise === name)
    .map((e) => ({
      date: e.date,
      weight: e.weight,
      difficulty: e.difficulty,
      sets: e.sets,
      reps: e.reps,
      duration_min: e.duration_min ?? null,
      distance_m: e.distance_m ?? null,
      level: null as number | null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { exercise: name, data };
}

function exerciseSession(url: URL) {
  const date = url.pathname.replace("/api/sessions/", "");
  const data = ALL_ENTRIES.filter((e) => e.date === date);
  return { date, data };
}

function cardioHistory(url: URL) {
  const days = Number(url.searchParams.get("days") ?? "30");
  const daily: Array<{ date: string; minutes: number; rolling_7d: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(DEMO_TODAY, -i);
    const minutes = ALL_ENTRIES
      .filter((e) => e.date === date && typeof e.duration_min === "number")
      .reduce((acc, e) => acc + (e.duration_min ?? 0), 0);
    daily.push({ date, minutes, rolling_7d: 0 });
  }
  // Compute rolling 7-day window.
  for (let i = 0; i < daily.length; i++) {
    const start = Math.max(0, i - 6);
    daily[i].rolling_7d = daily.slice(start, i + 1).reduce((a, d) => a + d.minutes, 0);
  }
  return { daily, target_weekly_min: 150 };
}
