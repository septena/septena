/** Universal event contract — mirrors api/events.py:SectionEvent.
 *  Each section's /api/{section}/events?date= endpoint returns these,
 *  so cross-section views (timeline, etc.) don't need per-section quirks. */
export type SectionEvent = {
  section: string;
  date: string;
  time: string | null;
  label: string;
  sublabel?: string | null;
  icon?: string | null;
  id?: string | null;
};

export type Stats = {
  total_sessions: number;
  total_entries: number;
  exercises_count: number;
  date_range: {
    start: string | null;
    end: string | null;
  };
  last_loaded_at?: string | null;
  /** ISO timestamp of the most-recently-modified .md file in the vault.
   *  Frontmatter has date-only, so this comes from file mtime. */
  last_logged_at?: string | null;
};

export type ExerciseEntry = {
  date: string;
  session: string;
  exercise?: string;
  weight: number | null;
  sets: number | string | null;
  reps: number | string | null;
  difficulty: string;
  source?: string;
  file?: string;
  // Cardio-only (present on row/elliptical entries; undefined for strength).
  duration_min?: number | null;
  distance_m?: number | null;
  level?: number | null;
  // ISO timestamp "YYYY-MM-DDTHH:MM:SS" of session end (written by POST
  // /api/training/sessions). Empty string on legacy entries without a recorded time.
  concluded_at?: string;
};

export type ProgressionPoint = {
  date: string;
  weight: number | null;
  difficulty: string;
  sets: number | string | null;
  reps: number | string | null;
  // Cardio-only fields (new schema). Strength entries leave these null.
  duration_min: number | null;
  distance_m: number | null;
  level: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Thrown when the FastAPI backend on :7000 is unreachable, or when the
 *  Next.js proxy returns a 502/503/504 (which usually means the same).
 *  Lets UI components show a "backend missing" banner instead of a generic
 *  error and silently swallowed promises. */
export class BackendUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnreachableError";
  }
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  if (
    typeof window !== "undefined" &&
    (window as unknown as { __SEPTENA_DEMO__?: boolean }).__SEPTENA_DEMO__
  ) {
    const { matchDemoFixture } = await import("./demo-fixtures");
    return matchDemoFixture(path, opts) as T;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, opts);
  } catch (err) {
    // fetch() only rejects on network failure / DNS / connection refused.
    // Next.js's proxy turns a refused upstream into a 502, but if the proxy
    // itself is down (or we hit the API directly) we land here.
    throw new BackendUnreachableError(
      err instanceof Error ? err.message : "Network error",
    );
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new BackendUnreachableError(`Backend returned ${response.status}`);
  }
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function postJSON<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putJSON<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del<T>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

export type AppConfig = {
  paths: {
    data: string;
    health: string;
    integrations: string;
    cache: string;
  };
  /** Whether the data folder resolves to an existing directory. False on
   *  first install when the user hasn't created one yet. */
  data_exists: boolean;
  /** Whether the data folder has any section folders (e.g. Nutrition/, Habits/).
   *  An empty-but-existing data folder still triggers onboarding. */
  data_has_sections: boolean;
  integrations: {
    oura: boolean;
    withings: boolean;
    apple_health: boolean;
  };
  /** Section keys the UI should show in nav/launcher/FAB. Derived from
   *  data folder presence + integration tokens — see the backend
   *  _available_sections for the exact rules. */
  available_sections: string[];
};

export async function getAppConfig() {
  return request<AppConfig>("/api/config");
}

export type BootstrapRequest = {
  sections: string[];
};

export type BootstrapResponse = {
  created: string[];
  skipped: string[];
  data_dir: string;
};

export async function bootstrapDataFolder(body: BootstrapRequest) {
  return request<BootstrapResponse>("/api/bootstrap", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getStats() {
  return request<Stats>("/api/training/stats");
}

export async function getExercises() {
  return request<string[]>("/api/training/exercises");
}

// Re-exported for pages that already import from lib/api and want the list.

export async function getProgression(exercise: string) {
  return request<{ exercise: string; data: ProgressionPoint[] }>(
    `/api/training/progression/${encodeURIComponent(exercise)}`,
  );
}

export type ExerciseSummary = {
  name: string;
  latest_weight: number | null;
  latest_date: string | null;
  trend: string;
  count: number;
};

export async function getSummary(since?: string) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return request<ExerciseSummary[]>(`/api/training/summary${qs}`);
}

export async function getSession(date: string) {
  return request<{ date: string; data: ExerciseEntry[] }>(`/api/training/sessions/${date}`);
}

// ── Exercise config (types + exercises) ─────────────────────────────────────

export type ExerciseType = {
  id: string;
  label: string;
  fields: string[];
  shade?: string;
  is_finisher?: boolean;
};

export type ExerciseConfigItem = {
  id: string;
  name: string;
  type: string;
  subgroup?: string;
};

export type ExerciseConfig = {
  types: ExerciseType[];
  exercises: ExerciseConfigItem[];
  aliases: Record<string, string>;
};

export async function getExerciseConfig() {
  return request<ExerciseConfig>("/api/training/config");
}

export async function addExercise(name: string, type: string, subgroup?: string) {
  return postJSON<ExerciseConfigItem>("/api/training/exercises", { name, type, subgroup });
}

export async function updateExercise(
  id: string,
  patch: { name?: string; type?: string; subgroup?: string },
) {
  return putJSON<ExerciseConfigItem>(`/api/training/exercises/${encodeURIComponent(id)}`, patch);
}

export async function deleteExercise(id: string) {
  return del<{ ok: boolean }>(`/api/training/exercises/${encodeURIComponent(id)}`);
}

// ── Cardio history ──────────────────────────────────────────────────────────

export type CardioDay = { date: string; minutes: number; rolling_7d: number };
export type CardioHistory = { daily: CardioDay[]; target_weekly_min: number };

export async function getCardioHistory(days = 30) {
  return request<CardioHistory>(`/api/training/cardio-history?days=${days}`);
}

// ── Session logger API ──────────────────────────────────────────────────────

export type SessionEntryPayload = {
  exercise: string;
  weight: number | null;
  sets: number | null;
  reps: string | null;
  difficulty: string;
  duration_min: number | null;
  distance_m: number | null;
  level: number | null;
  skipped: boolean;
  note: string;
  /** Optional: filename of a prior save for this entry. Backend will
   *  overwrite that file instead of creating a sibling. */
  replace_file?: string;
};

export type SessionWritePayload = {
  date: string;
  time: string;
  session_type: string;
  entries: SessionEntryPayload[];
};

export async function postSession(payload: SessionWritePayload) {
  return postJSON<{ written: string[]; concluded_at: string }>("/api/training/sessions", payload);
}

export async function getLastSession(type: string) {
  return request<{ session_type: string; date: string; entries: ExerciseEntry[] }>(
    `/api/training/sessions/last?type=${encodeURIComponent(type)}`,
  );
}

export type NextWorkoutResponse = {
  suggested: { type: "upper" | "lower" | "cardio" | "yoga"; emoji: string; label: string };
  days_ago: { upper: number | null; lower: number | null; cardio: number | null; yoga: number | null };
  last_date: { upper: string | null; lower: string | null; cardio: string | null; yoga: string | null };
};

export async function getNextWorkout() {
  return request<NextWorkoutResponse>("/api/training/next-workout");
}

export type LastEntryValues = ProgressionPoint & {
  avg_pace_m_per_min: number | null;
  history: ProgressionPoint[];
};

export async function getEntries(since?: string) {
  const qs = since ? `?since=${since}` : "";
  return request<ExerciseEntry[]>(`/api/training/entries${qs}`);
}

export async function getLastEntries(exercises: string[]) {
  return postJSON<Record<string, LastEntryValues | null>>("/api/training/last-entries", { exercises });
}

// ── Nutrition ───────────────────────────────────────────────────────────
export type NutritionType = "meal" | "supplement" | "snack";

export type NutritionEntry = {
  date: string;
  time: string;
  emoji: string;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g?: number;
  kcal: number;
  foods: string[];
  file: string;
};

export type NutritionDailyPoint = {
  date: string;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g?: number;
  kcal: number;
};

export type FastingWindow = {
  date: string;
  hours: number | null;
  last_meal: string | null;
  first_meal: string | null;
  // "gap" when the server suppressed an implausible window (missed meal
  // logs). null otherwise. Distinguishes "no data at all" (no entries on
  // either side) from "data was there but it doesn't make sense".
  note: "gap" | null;
};

export type NutritionStats = {
  daily: NutritionDailyPoint[];
  fasting: FastingWindow[];
  total_g: number;
  total_fat: number;
  total_carbs: number;
  total_kcal: number;
  avg_g: number;
  avg_fat: number;
  avg_carbs: number;
  avg_kcal: number;
  avg_fast_h: number;
  // Live fasting-state inputs. `today_latest_meal` / `yesterday_last_meal`
  // are HH:MM strings; null means no eating event logged on that day.
  today_latest_meal: string | null;
  today_meal_count: number;
  yesterday_last_meal: string | null;
};

export type NutritionPayload = {
  date: string;
  time: string;
  emoji: string;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g?: number;
  kcal: number;
  foods: string[];
  note?: string;
};

export type MacroRange = { min: number; max: number; unit: string };
export type MacrosConfig = {
  protein: MacroRange;
  fat: MacroRange;
  carbs: MacroRange;
  kcal: MacroRange;
  fasting?: MacroRange;
};

export async function getMacrosConfig() {
  return request<MacrosConfig>("/api/nutrition/macros-config");
}

export async function getNutritionEntries(since?: string) {
  const qs = since ? `?since=${since}` : "";
  return request<NutritionEntry[]>(`/api/nutrition/entries${qs}`);
}

export async function getSectionEvents(section: string, date: string) {
  return request<{ events: SectionEvent[] }>(`/api/${section}/events?date=${date}`);
}

export async function getNutritionStats(days = 30, end?: string) {
  const qs = new URLSearchParams({ days: String(days) });
  if (end) qs.set("end", end);
  return request<NutritionStats>(`/api/nutrition/stats?${qs}`);
}

export async function saveNutritionEntry(payload: NutritionPayload) {
  return postJSON<{ ok: boolean; file: string }>("/api/nutrition/sessions", payload);
}

export async function updateNutritionEntry(payload: NutritionPayload & { file: string }) {
  return putJSON<{ ok: boolean; file: string }>("/api/nutrition/sessions", payload);
}

export async function deleteNutritionEntry(file: string) {
  return request<{ ok: boolean }>("/api/nutrition/sessions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file }),
  });
}

// ── Habits ──────────────────────────────────────────────────────────────
// Bucket ids are user-configurable via settings.day_phases, so this is a
// free-form string. Default ids shipped with the app are morning |
// afternoon | evening, but users may rename/add/remove them.
export type HabitBucket = string;

export type HabitConfigItem = {
  id: string;
  name: string;
  bucket: HabitBucket;
};

export type HabitDayItem = HabitConfigItem & {
  done: boolean;
  /** HH:MM wall-clock at which the habit was completed. Stamped server-side
   *  only when the event is logged on today's date — historical backfills
   *  stay null. */
  time?: string | null;
};

export type HabitDay = {
  date: string;
  buckets: readonly HabitBucket[];
  grouped: Record<HabitBucket, HabitDayItem[]>;
  done_count: number;
  total: number;
  percent: number;
};

export type HabitHistoryPoint = {
  date: string;
  done: number;
  total: number;
  percent: number;
};

export type HabitHistory = {
  daily: HabitHistoryPoint[];
  total: number;
};

export async function getHabitDay(day: string) {
  return request<HabitDay>(`/api/habits/day/${day}`);
}

export async function getHabitConfig() {
  return request<{
    buckets: readonly HabitBucket[];
    grouped: Record<HabitBucket, HabitConfigItem[]>;
    total: number;
  }>("/api/habits/config");
}

export async function addHabit(name: string, bucket: string) {
  return postJSON<{ ok: boolean; id: string; name: string; bucket: string; skipped?: boolean }>("/api/habits/new", { name, bucket });
}

export async function updateHabit(id: string, patch: { name?: string; bucket?: string }) {
  return putJSON<{ ok: boolean }>("/api/habits/update", { id, ...patch });
}

export async function deleteHabit(id: string) {
  return del<{ ok: boolean; id: string }>(`/api/habits/delete/${encodeURIComponent(id)}`);
}

export async function toggleHabit(day: string, habitId: string, done: boolean) {
  return postJSON<{ ok: boolean; completed: string[] }>("/api/habits/toggle", { date: day, habit_id: habitId, done });
}

export async function getHabitHistory(days = 30) {
  return request<HabitHistory>(`/api/habits/history?days=${days}`);
}

// ── Supplements ─────────────────────────────────────────────────────────
export type SupplementItem = {
  id: string;
  name: string;
  emoji: string;
  done: boolean;
  /** HH:MM wall-clock at which the supplement was taken, when recorded. */
  time?: string | null;
};

export type SupplementDay = {
  date: string;
  items: SupplementItem[];
  done_count: number;
  total: number;
  percent: number;
};

export type SupplementHistoryPoint = {
  date: string;
  done: number;
  total: number;
  percent: number;
};

export type SupplementHistory = {
  daily: SupplementHistoryPoint[];
  total: number;
};

export async function getSupplementDay(day: string) {
  return request<SupplementDay>(`/api/supplements/day/${day}`);
}

export async function toggleSupplement(day: string, supplementId: string, done: boolean) {
  return postJSON<{ ok: boolean; taken: string[] }>("/api/supplements/toggle", { date: day, supplement_id: supplementId, done });
}

export async function getSupplementHistory(days = 30) {
  return request<SupplementHistory>(`/api/supplements/history?days=${days}`);
}

export type SupplementHistoryByIdDay = { date: string; taken: string[] };
export type SupplementHistoryByIdResponse = {
  daily: SupplementHistoryByIdDay[];
  supplements: Array<{ id: string; name: string; emoji: string }>;
};

export async function getSupplementHistoryById(days = 30) {
  return request<SupplementHistoryByIdResponse>(`/api/supplements/history-by-id?days=${days}`);
}

export async function addSupplement(name: string, emoji?: string) {
  return postJSON<{ ok: boolean; id: string; name: string; emoji: string; skipped?: boolean }>("/api/supplements/new", { name, emoji: emoji ?? "" });
}

export async function updateSupplement(id: string, patch: { name?: string; emoji?: string }) {
  return putJSON<{ ok: boolean }>("/api/supplements/update", { id, ...patch });
}

export async function deleteSupplement(id: string) {
  return del<{ ok: boolean; id: string }>(`/api/supplements/delete/${encodeURIComponent(id)}`);
}

// ── Cannabis ────────────────────────────────────────────────────────────
export type CannabisEntry = {
  id: string;
  time: string;
  method: "vape" | "edible";
  strain: string | null;
  capsule_id?: string | null;
  grams?: number | null;
  note: string | null;
  effect: string | null;
  created_at?: string;
};

export type CannabisCapsule = {
  id: string;
  strain: string | null;
  started_at: string;
  use_count: number;
};

export type CannabisCapsuleState = {
  active: CannabisCapsule | null;
  uses_per_capsule: number;
};

export type CannabisDay = {
  date: string;
  entries: CannabisEntry[];
  total_g: number;
  session_count: number;
  methods: { vape: number; edible: number };
};

export type CannabisHistoryPoint = {
  date: string;
  sessions: number;
  total_g: number;
};

export type CannabisHistory = {
  daily: CannabisHistoryPoint[];
};

export async function getCannabisConfig() {
  return request<{
    strains: { id: string; name: string }[];
    capsule_g: number;
    uses_per_capsule: number;
  }>("/api/cannabis/config");
}

export async function getCannabisDay(day: string) {
  return request<CannabisDay>(`/api/cannabis/day/${day}`);
}

export async function addCannabisEntry(payload: {
  date: string;
  time: string;
  method?: "vape" | "edible";
  notes?: string | null;
  effect?: string | null;
}) {
  return postJSON<{ ok: boolean; entry: CannabisEntry }>("/api/cannabis/entry", payload);
}

export async function getCannabisActiveCapsule() {
  return request<CannabisCapsuleState>("/api/cannabis/capsule/active");
}

export async function startCannabisCapsule(strain: string | null) {
  return postJSON<{ ok: boolean; active: CannabisCapsule }>("/api/cannabis/capsule/start", { strain });
}

export async function endCannabisCapsule() {
  return postJSON<{ ok: boolean }>("/api/cannabis/capsule/end", {});
}

export async function deleteCannabisEntry(entryId: string, date: string) {
  return del<{ ok: boolean }>(`/api/cannabis/entry/${entryId}?date=${date}`);
}

export async function updateCannabisEntry(
  entryId: string,
  date: string,
  patch: { time?: string; method?: "vape" | "edible"; note?: string | null; effect?: string | null },
) {
  return putJSON<{ ok: boolean; entry: CannabisEntry }>(
    `/api/cannabis/entry/${entryId}?date=${date}`,
    patch,
  );
}

export async function getCannabisHistory(days = 30) {
  return request<CannabisHistory>(`/api/cannabis/history?days=${days}`);
}

export type CannabisSession = {
  date: string;
  time: string;
  hour: number;
  method: "vape" | "edible";
  strain: string | null;
};

export type CannabisSessions = { sessions: CannabisSession[] };

export async function getCannabisSessions(days = 30) {
  return request<CannabisSessions>(`/api/cannabis/sessions?days=${days}`);
}

// ── Groceries ──────────────────────────────────────────────────────────

export type GroceryItem = {
  id: string;
  name: string;
  category: string;
  emoji: string;
  low: boolean;
  last_bought: string | null;
};

export type GroceriesData = {
  items: GroceryItem[];
};

export async function getGroceries() {
  return request<GroceriesData>("/api/groceries");
}

export async function addGroceryItem(name: string, category?: string, emoji?: string) {
  return postJSON<GroceryItem>("/api/groceries/item", { name, category, emoji });
}

export async function patchGroceryItem(itemId: string, patch: Partial<GroceryItem>) {
  return request<GroceryItem>(`/api/groceries/item/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteGroceryItem(itemId: string) {
  return del<{ ok: boolean }>(`/api/groceries/item/${itemId}`);
}

export type GroceryHistory = {
  daily: Array<{ date: string; bought: number; needed: number }>;
};

export async function getGroceryHistory(days = 30) {
  return request<GroceryHistory>(`/api/groceries/history?days=${days}`);
}

// ── Caffeine ────────────────────────────────────────────────────────────
export type CaffeineMethod = "v60" | "matcha" | "other";

export type CaffeineEntry = {
  id: string;
  time: string;
  method: CaffeineMethod;
  beans: string | null;
  grams: number | null;
  note: string | null;
  created_at?: string;
};

export type CaffeineDay = {
  date: string;
  entries: CaffeineEntry[];
  session_count: number;
  methods: Record<CaffeineMethod, number>;
  total_g: number | null;
};

export type CaffeineHistoryPoint = {
  date: string;
  sessions: number;
  total_g: number | null;
};

export type CaffeineHistory = { daily: CaffeineHistoryPoint[] };

export type CaffeineSession = {
  date: string;
  time: string;
  hour: number;
  method: CaffeineMethod;
  beans: string | null;
  grams: number | null;
};

export type CaffeineSessions = { sessions: CaffeineSession[] };

export async function getCaffeineConfig() {
  return request<{ beans: { id: string; name: string }[] }>("/api/caffeine/config");
}

export async function getCaffeineDay(day: string) {
  return request<CaffeineDay>(`/api/caffeine/day/${day}`);
}

export async function addCaffeineEntry(payload: {
  date: string;
  time: string;
  method: CaffeineMethod;
  beans?: string | null;
  grams?: number | null;
  notes?: string | null;
}) {
  return postJSON<{ ok: boolean; entry: CaffeineEntry }>("/api/caffeine/entry", payload);
}

export async function deleteCaffeineEntry(entryId: string, date: string) {
  return del<{ ok: boolean }>(`/api/caffeine/entry/${entryId}?date=${date}`);
}

export async function updateCaffeineEntry(
  entryId: string,
  date: string,
  patch: {
    time?: string;
    method?: CaffeineMethod;
    beans?: string | null;
    grams?: number | null;
    note?: string | null;
  },
) {
  return putJSON<{ ok: boolean }>(
    `/api/caffeine/entry/${entryId}?date=${date}`,
    patch,
  );
}

export async function getCaffeineHistory(days = 30) {
  return request<CaffeineHistory>(`/api/caffeine/history?days=${days}`);
}

export async function getCaffeineSessions(days = 30) {
  return request<CaffeineSessions>(`/api/caffeine/sessions?days=${days}`);
}

// ── Air (Aranet4) ────────────────────────────────────────────────────────
export type AirReading = {
  date: string;
  time: string;
  id?: string;
  co2_ppm: number | null;
  temp_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
};

export type AirDayStats = {
  readings: number;
  co2_avg: number | null;
  co2_max: number | null;
  co2_min: number | null;
  temp_avg: number | null;
  humidity_avg: number | null;
  minutes_over_1000: number;
};

export type AirCo2Band = "good" | "ok" | "poor" | "bad";

export type AirSummary = {
  latest: AirReading | null;
  last_reading_at: string | null;
  co2_band: AirCo2Band | null;
  today: AirDayStats;
};

export type AirDay = {
  date: string;
  readings: AirReading[];
  stats: AirDayStats;
};

export type AirHistoryPoint = { date: string } & AirDayStats;
export type AirHistory = { daily: AirHistoryPoint[] };

export type AirTimeSeriesPoint = {
  datetime: string;
  date: string;
  time: string;
  co2_ppm: number | null;
  temp_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
};
export type AirReadings = { readings: AirTimeSeriesPoint[] };

export async function getAirSummary() {
  return request<AirSummary>("/api/air/summary");
}

export async function getAirDay(day: string) {
  return request<AirDay>(`/api/air/day/${day}`);
}

export async function getAirHistory(days = 7) {
  return request<AirHistory>(`/api/air/history?days=${days}`);
}

export async function getAirReadings(days = 1) {
  return request<AirReadings>(`/api/air/readings?days=${days}`);
}

export type AirOvernightPoint = {
  date: string;
  readings: number;
  co2_avg: number | null;
  co2_max: number | null;
  co2_min: number | null;
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  humidity_avg: number | null;
};
export type AirOvernight = { nights: AirOvernightPoint[] };

export async function getAirOvernight(days = 30) {
  return request<AirOvernight>(`/api/air/overnight?days=${days}`);
}

// ── Health (Oura + Withings) ──────────────────────────────────────────────
export type OuraRow = {
  date: string;
  sleep_score: number | null;
  total_h: number | null;
  deep_h: number | null;
  rem_h: number | null;
  light_h: number | null;
  awake_h: number | null;
  efficiency: number | null;
  hrv: number | null;
  resting_hr: number | null;
  bedtime: string | null;
  wake_time: string | null;
  readiness_score: number | null;
  activity_score: number | null;
  steps: number | null;
  active_cal: number | null;
};

export type WithingsRow = {
  date: string;
  weight_kg: number | null;
  fat_pct: number | null;
  fat_ratio_pct?: number | null;
  bone_mineral_kg?: number | null;
  pulse_wave_mps?: number | null;
  vascular_age?: number | null;
  spo2_pct?: number | null;
};

export type HealthSummary = {
  oura: {
    sleep_score: number | null;
    readiness_score: number | null;
    total_h: number | null;
    deep_h: number | null;
    rem_h: number | null;
    hrv: number | null;
    resting_hr: number | null;
    bedtime: string | null;
    wake_time: string | null;
    steps: number | null;
  } | null;
  withings: {
    weight_kg: number | null;
    fat_pct: number | null;
  } | null;
};

export async function getHealthSummary() {
  return request<HealthSummary>("/api/health/summary");
}

export async function getHealthOura(days = 30, end?: string) {
  const qs = new URLSearchParams({ days: String(days) });
  if (end) qs.set("end", end);
  return request<{ oura: OuraRow[] }>(`/api/health/oura?${qs}`);
}

export async function getHealthWithings(days = 30, end?: string) {
  const qs = new URLSearchParams({ days: String(days) });
  if (end) qs.set("end", end);
  return request<{ withings: WithingsRow[] }>(`/api/health/withings?${qs}`);
}

export type AppleRow = {
  date: string;
  steps: number | null;
  active_cal: number | null;
  vo2_max: number | null;
  hrv: number | null;
  resting_heart_rate: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  cardio_recovery: number | null;
  flights_climbed: number | null;
  distance_km: number | null;
  exercise_min: number | null;
  apple_total_h: number | null;
  apple_deep_h: number | null;
  apple_rem_h: number | null;
  apple_core_h: number | null;
  apple_awake_h: number | null;
  apple_bedtime: string | null;
  apple_wake_time: string | null;
};

export async function getHealthApple(days = 30, end?: string) {
  const qs = new URLSearchParams({ days: String(days) });
  if (end) qs.set("end", end);
  return request<{ apple: AppleRow[] }>(`/api/health/apple?${qs}`);
}

export type HealthCombined = { apple: AppleRow[]; oura: OuraRow[]; withings: WithingsRow[] };

export async function getHealthCombined(days = 7, end?: string) {
  const qs = new URLSearchParams({ days: String(days) });
  if (end) qs.set("end", end);
  return request<HealthCombined>(`/api/health/combined?${qs}`);
}

export async function getHealthCache() {
  return request<HealthCombined>("/api/health/cache");
}

// ── Chores ──────────────────────────────────────────────────────────────
export type ChoreDeferMode = "day" | "weekend";

export type Chore = {
  id: string;
  name: string;
  cadence_days: number;
  emoji: string;
  /** ISO date (YYYY-MM-DD) when the chore is currently due. */
  due_date: string;
  /** ISO date of last completion, or null if never completed. */
  last_completed: string | null;
  /** HH:MM of the last completion, if recorded. Only populated for events
   *  logged on their own date (not back-dated completions). */
  last_completed_time?: string | null;
  /** Positive = overdue, 0 = due today, negative = upcoming. */
  days_overdue: number;
};

export type ChoresList = {
  chores: Chore[];
  total: number;
  today: string;
};

export type ChoreHistoryPoint = {
  date: string;
  completed: number;
  total: number;
};

export type ChoreHistory = {
  daily: ChoreHistoryPoint[];
  total: number;
};

export async function getChores() {
  return request<ChoresList>("/api/chores/list");
}

export async function completeChore(choreId: string, opts?: { date?: string; note?: string }) {
  return postJSON<{ ok: boolean; date: string; chore_id: string; action: "complete" }>(
    "/api/chores/complete",
    { chore_id: choreId, date: opts?.date, note: opts?.note },
  );
}

export async function deferChore(choreId: string, mode: ChoreDeferMode) {
  return postJSON<{
    ok: boolean;
    date: string;
    chore_id: string;
    action: "defer";
    mode: ChoreDeferMode;
    new_due_date: string;
  }>("/api/chores/defer", { chore_id: choreId, mode });
}

export async function getChoreHistory(days = 30) {
  return request<ChoreHistory>(`/api/chores/history?days=${days}`);
}

export type NewChoreInput = {
  name: string;
  cadence_days: number;
  emoji?: string;
  id?: string;
};

export async function createChoreDefinition(input: NewChoreInput) {
  return postJSON<{ ok: boolean; id: string; name: string; cadence_days: number }>("/api/chores/definitions", input);
}

export type UpdateChoreInput = Partial<Omit<NewChoreInput, "id">>;

export async function updateChoreDefinition(choreId: string, input: UpdateChoreInput) {
  return putJSON<{ ok: boolean }>(`/api/chores/definitions/${encodeURIComponent(choreId)}`, input);
}

export async function deleteChoreDefinition(choreId: string) {
  return del<{ ok: boolean; id: string }>(`/api/chores/definitions/${encodeURIComponent(choreId)}`);
}

export async function getSupplementConfig() {
  return request<{ supplements: Array<{ id: string; name: string; emoji: string }>; total: number }>(
    "/api/supplements/config",
  );
}

// ── Meta / Data Quality ─────────────────────────────────────────────────────

export type SourceMeta = {
  label: string;
  files?: number;
  newest?: string | null;
  oldest?: string | null;
  last_modified?: string | null;
  dir?: string;
  /** Set to "live" for sections that fetch live data (calendar, weather). */
  status?: string;
  sources?: Record<string, {
    label: string;
    status?: string;
    last_modified?: string | null;
    size_mb?: number;
    detail?: string | null;
  }>;
};

export type MetaResponse = {
  sources: Record<string, SourceMeta>;
};

export async function getMeta() {
  return request<MetaResponse>("/api/meta");
}

// ── Settings ────────────────────────────────────────────────────────────
export type AppTheme = "system" | "light" | "dark" | "eink";
export type WeightUnit = "kg" | "lb";
export type DistanceUnit = "km" | "mi";

export type Targets = {
  protein_min_g: number;
  protein_max_g: number;
  fat_min_g: number;
  fat_max_g: number;
  carbs_min_g: number;
  carbs_max_g: number;
  fiber_min_g: number;
  fiber_max_g: number;
  kcal_min: number;
  kcal_max: number;
  z2_weekly_min: number;
  sleep_target_h: number;
  fasting_min_h: number;
  fasting_max_h: number;
  evening_hour_24h: number;
  post_meal_grace_min: number;
  weight_min_kg: number;
  weight_max_kg: number;
  fat_min_pct: number;
  fat_max_pct: number;
};

export type AppAnimations = {
  training_complete: boolean;
  first_meal: boolean;
  histograms_raise: boolean;
};

export type SectionSetting = {
  label: string;
  emoji: string;
  color: string;
  tagline: string;
  /** Legacy single-flag visibility. New code should set
   *  `show_in_nav` / `show_on_dashboard`; `enabled` is still accepted
   *  as a fallback for both. */
  enabled?: boolean;
  show_in_nav?: boolean;
  show_on_dashboard?: boolean;
};

export type WeatherUnits = "celsius" | "fahrenheit";

export type WeatherSettings = {
  location: string;
  units: WeatherUnits;
};

export type CalendarSettings = {
  show_all_day: boolean;
  enabled_calendars: string[] | null;
};

export type PhaseMessage = {
  greeting: string;
  subtitle: string;
};

export type DayPhase = {
  id: string;
  label: string;
  emoji: string;
  /** HH:MM — when the phase becomes "current". */
  start: string;
  /** HH:MM — after this, habits in the phase read as overdue. */
  cutoff: string;
  /** Greeting + subtitle pairs shown on the overview; one is picked at random. */
  messages: PhaseMessage[];
};

export type AppSettings = {
  section_order: string[];
  sections: Record<string, SectionSetting>;
  targets: Targets;
  units: { weight: WeightUnit; distance: DistanceUnit };
  theme: AppTheme;
  icon_color: string;
  animations: AppAnimations;
  weather: WeatherSettings;
  calendar: CalendarSettings;
  day_phases: DayPhase[];
};

export async function getSettings() {
  return request<AppSettings>("/api/settings");
}

export async function saveSettings(patch: Partial<AppSettings>) {
  return putJSON<AppSettings>("/api/settings", patch);
}

// ── Sections ────────────────────────────────────────────────────────────────
// Merged view returned by GET /api/sections. Wiring fields come from code,
// metadata fields from settings.yaml. Consume via useSections() rather than
// calling this directly so the static registry fallback kicks in when the
// backend is unreachable.

export type SectionMeta = {
  key: string;
  label: string;
  emoji: string;
  color: string;
  tagline: string;
  /** True iff visible on either nav or dashboard. Prefer the split flags. */
  enabled: boolean;
  show_in_nav: boolean;
  show_on_dashboard: boolean;
  order: number;
  path: string;
  apiBase: string;
  dataDir: string;
};

export async function getSections(): Promise<SectionMeta[]> {
  return request<SectionMeta[]>("/api/sections");
}

// ── Weather ─────────────────────────────────────────────────────────────────

export type WeatherIcon =
  | "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

export type WeatherDay = {
  date: string;
  weekday: string;
  high: number | null;
  low: number | null;
  label: string;
  icon: WeatherIcon;
  precip_pct: number | null;
};

export type WeatherResponse = {
  location: string;
  units: WeatherUnits;
  temp_unit: string;
  current: {
    temperature: number | null;
    humidity: number | null;
    wind_kmh: number | null;
    code: number;
    label: string;
    icon: WeatherIcon;
  };
  daily: WeatherDay[];
};

export async function getWeather() {
  return request<WeatherResponse>("/api/weather");
}

// ── Calendar ────────────────────────────────────────────────────────────────

export type CalendarEvent = {
  title: string;
  start: string;
  end: string;
  calendar: string;
  all_day: boolean;
  location: string;
};

export type CalendarInfo = {
  title: string;
  source: string;
};

export type CalendarResponse = {
  today: string;
  today_count: number;
  events: CalendarEvent[];
  calendars: CalendarInfo[];
  error: string | null;
};

export async function getCalendar() {
  return request<CalendarResponse>("/api/calendar");
}
