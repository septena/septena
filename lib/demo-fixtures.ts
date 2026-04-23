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
  // ── Nutrition ────────────────────────────────────────────────────────
  { pattern: /^\/api\/nutrition\/macros-config$/, handler: nutritionMacrosConfig },
  { pattern: /^\/api\/nutrition\/entries$/, handler: nutritionEntries },
  { pattern: /^\/api\/nutrition\/stats$/, handler: nutritionStats },
  // ── Habits ───────────────────────────────────────────────────────────
  { pattern: /^\/api\/habits\/config$/, handler: habitsConfig },
  { pattern: /^\/api\/habits\/day\//, handler: habitsDay },
  { pattern: /^\/api\/habits\/history$/, handler: habitsHistory },
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
  // Always seed a short cardio session for today so the timeline/overview
  // dot shows a same-day workout regardless of DEMO_TODAY's weekday.
  sessions.push({
    type: "cardio",
    daysAgo: 0,
    entries: [{ exercise: "elliptical", duration_min: 20, distance_m: 4200 }],
  });
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

// ─── Nutrition fixtures ────────────────────────────────────────────────────

const MEAL_TEMPLATES: Array<{
  time: string;
  emoji: string;
  foods: string[];
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  kcal: number;
}> = [
  {
    time: "08:30",
    emoji: "🍳",
    foods: ["Breakfast", "2 eggs scrambled", "Sourdough toast", "Coffee with milk"],
    protein_g: 22, fat_g: 16, carbs_g: 32, kcal: 370,
  },
  {
    time: "13:00",
    emoji: "🥗",
    foods: ["Lunch", "Chicken bowl", "Brown rice", "Tahini sauce"],
    protein_g: 42, fat_g: 18, carbs_g: 58, kcal: 580,
  },
  {
    time: "16:30",
    emoji: "🥜",
    foods: ["Snack", "Greek yoghurt", "Walnuts", "Honey"],
    protein_g: 18, fat_g: 14, carbs_g: 20, kcal: 280,
  },
  {
    time: "20:00",
    emoji: "🍝",
    foods: ["Dinner", "Pasta bolognese", "Parmesan", "Side salad"],
    protein_g: 38, fat_g: 22, carbs_g: 72, kcal: 660,
  },
];

type NutritionEntryFixture = {
  date: string;
  time: string;
  emoji: string;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  kcal: number;
  foods: string[];
  file: string;
};

function buildNutritionEntries(): NutritionEntryFixture[] {
  const out: NutritionEntryFixture[] = [];
  // 35 days of meals so a 30-day nutrition window always has content.
  // On today we skip the dinner entry so fasting window looks live.
  for (let daysAgo = 35; daysAgo >= 0; daysAgo--) {
    const date = addDays(DEMO_TODAY, -daysAgo);
    const todaysMeals = daysAgo === 0 ? MEAL_TEMPLATES.slice(0, 3) : MEAL_TEMPLATES;
    for (let i = 0; i < todaysMeals.length; i++) {
      const m = todaysMeals[i];
      // Sprinkle deterministic ±10% jitter so daily bars aren't identical.
      const j = ((daysAgo * 7 + i * 3) % 21) - 10; // -10..+10 %
      const mul = 1 + j / 100;
      out.push({
        date,
        time: m.time,
        emoji: m.emoji,
        protein_g: Math.round(m.protein_g * mul),
        fat_g: Math.round(m.fat_g * mul),
        carbs_g: Math.round(m.carbs_g * mul),
        kcal: Math.round(m.kcal * mul),
        foods: m.foods,
        file: `${date}--${m.time.replace(":", "")}--01.md`,
      });
    }
  }
  return out;
}

const NUTRITION_ENTRIES = buildNutritionEntries();

function nutritionMacrosConfig() {
  return {
    protein: { min: 120, max: 180, unit: "g" },
    fat: { min: 60, max: 100, unit: "g" },
    carbs: { min: 150, max: 300, unit: "g" },
    kcal: { min: 1800, max: 2400, unit: "kcal" },
    fasting: { min: 14, max: 18, unit: "h" },
  };
}

function nutritionEntries(url: URL) {
  const since = url.searchParams.get("since");
  if (!since) return NUTRITION_ENTRIES;
  return NUTRITION_ENTRIES.filter((e) => e.date >= since);
}

function nutritionStats(url: URL) {
  const days = Number(url.searchParams.get("days") ?? "30");
  const end = url.searchParams.get("end") ?? DEMO_TODAY;
  const startISO = addDays(end, -(days - 1));
  const daily: Array<{ date: string; protein_g: number; fat_g: number; carbs_g: number; kcal: number }> = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(startISO, i);
    const meals = NUTRITION_ENTRIES.filter((e) => e.date === date);
    daily.push({
      date,
      protein_g: meals.reduce((a, m) => a + m.protein_g, 0),
      fat_g: meals.reduce((a, m) => a + m.fat_g, 0),
      carbs_g: meals.reduce((a, m) => a + m.carbs_g, 0),
      kcal: meals.reduce((a, m) => a + m.kcal, 0),
    });
  }
  const fasting = daily.map((d) => ({
    date: d.date,
    hours: 14 + ((parseInt(d.date.slice(-2), 10) % 5) * 0.5),
    last_meal: "20:00",
    first_meal: "08:30",
    note: null as null,
  }));
  const totals = daily.reduce(
    (acc, d) => ({
      g: acc.g + d.protein_g,
      f: acc.f + d.fat_g,
      c: acc.c + d.carbs_g,
      k: acc.k + d.kcal,
    }),
    { g: 0, f: 0, c: 0, k: 0 },
  );
  const todayMeals = NUTRITION_ENTRIES.filter((e) => e.date === DEMO_TODAY);
  const yesterdayMeals = NUTRITION_ENTRIES.filter((e) => e.date === addDays(DEMO_TODAY, -1));
  return {
    daily,
    fasting,
    total_g: totals.g,
    total_fat: totals.f,
    total_carbs: totals.c,
    total_kcal: totals.k,
    avg_g: Math.round(totals.g / days),
    avg_fat: Math.round(totals.f / days),
    avg_carbs: Math.round(totals.c / days),
    avg_kcal: Math.round(totals.k / days),
    avg_fast_h: 15.5,
    today_latest_meal: todayMeals[todayMeals.length - 1]?.time ?? null,
    today_meal_count: todayMeals.length,
    yesterday_last_meal: yesterdayMeals[yesterdayMeals.length - 1]?.time ?? null,
  };
}

// ─── Habits fixtures ───────────────────────────────────────────────────────

type HabitDef = { id: string; name: string; bucket: "morning" | "afternoon" | "evening" };

const HABIT_DEFS: HabitDef[] = [
  { id: "meditation", name: "Meditation 10min", bucket: "morning" },
  { id: "sunlight", name: "Morning sunlight", bucket: "morning" },
  { id: "creatine", name: "Creatine 5g", bucket: "morning" },
  { id: "walk", name: "30min walk", bucket: "afternoon" },
  { id: "reading", name: "Read 20min", bucket: "afternoon" },
  { id: "stretch", name: "Evening stretch", bucket: "evening" },
  { id: "journal", name: "Journal 5min", bucket: "evening" },
];

const HABIT_BUCKETS = ["morning", "afternoon", "evening"] as const;

/** Deterministic "was this habit done on this date?" — each habit has its
 *  own skip rhythm so the history grid isn't uniform. Today skips the
 *  evening habits so there's a visible incomplete state live. */
function habitDone(habitId: string, daysAgo: number): boolean {
  if (daysAgo === 0) {
    // Mid-day shape: morning and one afternoon done, evening pending.
    const def = HABIT_DEFS.find((h) => h.id === habitId);
    if (!def) return false;
    if (def.bucket === "evening") return false;
    if (def.id === "reading") return false;
    return true;
  }
  const hash = habitId.charCodeAt(0) + habitId.charCodeAt(1);
  // Skip every 5th / 7th day for variety.
  if ((daysAgo + hash) % 7 === 0) return false;
  if ((daysAgo + hash) % 11 === 0) return false;
  return true;
}

function habitsConfig() {
  const grouped: Record<string, HabitDef[]> = { morning: [], afternoon: [], evening: [] };
  for (const h of HABIT_DEFS) grouped[h.bucket].push(h);
  return { buckets: HABIT_BUCKETS, grouped, total: HABIT_DEFS.length };
}

function habitsDay(url: URL) {
  const day = url.pathname.replace("/api/habits/day/", "");
  const daysAgo = Math.round(
    (new Date(DEMO_TODAY + "T00:00:00Z").getTime() - new Date(day + "T00:00:00Z").getTime()) /
      (24 * 3600_000),
  );
  const grouped: Record<string, Array<HabitDef & { done: boolean; time: string | null }>> = {
    morning: [], afternoon: [], evening: [],
  };
  let doneCount = 0;
  for (const h of HABIT_DEFS) {
    const done = habitDone(h.id, daysAgo);
    if (done) doneCount++;
    grouped[h.bucket].push({
      ...h,
      done,
      time: done && daysAgo === 0
        ? (h.bucket === "morning" ? "07:45" : h.bucket === "afternoon" ? "14:10" : "22:00")
        : null,
    });
  }
  const total = HABIT_DEFS.length;
  return {
    date: day,
    buckets: HABIT_BUCKETS,
    grouped,
    done_count: doneCount,
    total,
    percent: Math.round((doneCount / total) * 100),
  };
}

function habitsHistory(url: URL) {
  const days = Number(url.searchParams.get("days") ?? "30");
  const daily: Array<{ date: string; done: number; total: number; percent: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(DEMO_TODAY, -i);
    let done = 0;
    for (const h of HABIT_DEFS) if (habitDone(h.id, i)) done++;
    daily.push({
      date,
      done,
      total: HABIT_DEFS.length,
      percent: Math.round((done / HABIT_DEFS.length) * 100),
    });
  }
  return { daily, total: HABIT_DEFS.length };
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
