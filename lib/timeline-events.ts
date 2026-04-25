import type { OuraRow, SectionEvent, WithingsRow } from "@/lib/api";
import { idealBedtimeFromOura, formatHour } from "@/lib/sleep";

export type TimelineEvent = {
  hour: number | null;
  timeStr: string;
  color: string;
  label: string;
  source: string;
  future?: boolean;
};

export type TimelineColors = {
  nutrition: string;
  cannabis: string;
  caffeine: string;
  training: string;
  habits: string;
  supplements: string;
  sleep: string;
  body: string;
  chores: string;
  gut: string;
};

export type TimelineDayData = {
  nutritionEvents: SectionEvent[];
  cannabis: { entries?: { time: string }[] } | null;
  caffeine: { entries?: { time: string; method?: string }[] } | null;
  training: { date: string; concluded_at?: string | null; exercise?: string }[];
  health: { oura?: OuraRow[] } | null;
  habits: { buckets?: readonly string[]; grouped?: Record<string, { done?: boolean; time?: string; name?: string }[]> } | null;
  chores: { chores?: { last_completed?: string; last_completed_time?: string; name?: string }[] } | null;
  supplements: { items?: { done?: boolean; time?: string; name?: string }[] } | null;
  withings: WithingsRow[];
  oura: OuraRow[];
  gut: { entries?: { time: string; bristol: number }[] } | null;
};

export type ExerciseTaxonomy = {
  aliases?: Record<string, string>;
  exercises?: { name: string; type: string; subgroup?: string }[];
};

export function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h + mm / 60;
}

export function localDay(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Map an event's `source` label to the section page it belongs to. */
export function sourceToPath(source: string): string {
  if (source === "withings") return "/septena/body";
  if (source === "sleep") return "/septena/sleep";
  return `/septena/${source}`;
}

const GROUP_TITLE: Record<string, string> = {
  upper: "Upper",
  lower: "Lower",
  cardio: "Cardio",
  mobility: "Mobility",
  core: "Core",
  strength: "Strength",
};

export function buildEvents(
  date: string,
  data: TimelineDayData | undefined,
  exerciseConfig: ExerciseTaxonomy | undefined,
  colors: TimelineColors,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (!data) return events;

  const exerciseGroup = (name: string): string => {
    const key = name.toLowerCase();
    const resolved = exerciseConfig?.aliases?.[key] ?? key;
    const ex = exerciseConfig?.exercises?.find((x) => x.name.toLowerCase() === resolved);
    if (!ex) return "strength";
    if (ex.type === "strength") return ex.subgroup || "upper";
    return ex.type;
  };

  for (const n of data.nutritionEvents ?? []) {
    events.push({ hour: parseHHMM(n.time), timeStr: n.time ?? "—", color: colors.nutrition, label: n.label, source: n.section });
  }

  for (const c of data.cannabis?.entries ?? []) {
    events.push({ hour: parseHHMM(c.time), timeStr: c.time ?? "—", color: colors.cannabis, label: c.strain ?? "cannabis", source: "cannabis" });
  }

  for (const c of data.caffeine?.entries ?? []) {
    events.push({ hour: parseHHMM(c.time), timeStr: c.time ?? "—", color: colors.caffeine, label: c.beans ?? c.method ?? "caffeine", source: "caffeine" });
  }

  const trainingBySession = new Map<string, { exercises: Set<string> }>();
  for (const e of data.training ?? []) {
    if (e.date !== date || !e.concluded_at) continue;
    const hhmm = e.concluded_at.slice(11, 16);
    const bucket = trainingBySession.get(hhmm) ?? { exercises: new Set() };
    if (e.exercise) bucket.exercises.add(e.exercise);
    trainingBySession.set(hhmm, bucket);
  }
  for (const [hhmm, bucket] of trainingBySession) {
    const counts: Record<string, number> = {};
    for (const ex of bucket.exercises) {
      const g = exerciseGroup(ex);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const n = bucket.exercises.size;
    const base = dominant ? GROUP_TITLE[dominant] ?? "Training" : "Training";
    events.push({
      hour: parseHHMM(hhmm),
      timeStr: hhmm,
      color: colors.training,
      label: `${base} · ${n} ${n === 1 ? "exercise" : "exercises"}`,
      source: "training",
    });
  }

  const buckets = data.habits?.buckets ?? [];
  for (const bucket of buckets) {
    for (const h of data.habits?.grouped?.[bucket] ?? []) {
      if (!h.done || !h.time) continue;
      events.push({ hour: parseHHMM(h.time), timeStr: h.time, color: colors.habits, label: h.name ?? "", source: "habits" });
    }
  }

  for (const s of data.supplements?.items ?? []) {
    if (!s.done || !s.time) continue;
    events.push({ hour: parseHHMM(s.time), timeStr: s.time, color: colors.supplements, label: s.name ?? "", source: "supplements" });
  }

  for (const c of data.chores?.chores ?? []) {
    if (c.last_completed !== date || !c.last_completed_time) continue;
    events.push({ hour: parseHHMM(c.last_completed_time), timeStr: c.last_completed_time, color: colors.chores, label: c.name ?? "", source: "chores" });
  }

  const ouraRows = data.health?.oura ?? data.oura ?? [];
  const dayOura = [...ouraRows].reverse().find((r) => r.date === date && r.wake_time);
  if (dayOura?.wake_time) {
    events.push({ hour: parseHHMM(dayOura.wake_time), timeStr: dayOura.wake_time, color: colors.sleep, label: "woke up ☀️", source: "sleep" });
  }
  const moonHour = idealBedtimeFromOura(ouraRows, { days: 14, before: date });
  if (moonHour != null && moonHour < 24) {
    events.push({ hour: moonHour, timeStr: formatHour(moonHour), color: colors.sleep, label: "ideal bed 🌙", source: "sleep", future: true });
  }

  for (const g of data.gut?.entries ?? []) {
    events.push({ hour: parseHHMM(g.time), timeStr: g.time, color: colors.gut, label: `Bristol ${g.bristol}`, source: "gut" });
  }

  for (const w of data.withings ?? []) {
    if (w.date !== date) continue;
    if (w.weight_kg != null) {
      events.push({ hour: 8, timeStr: "08:00", color: colors.body, label: `${w.weight_kg}kg`, source: "withings" });
    }
    if (w.fat_pct != null) {
      events.push({ hour: 8, timeStr: "08:00", color: colors.body, label: `${w.fat_pct}%bf`, source: "withings" });
    }
  }

  events.sort((a, b) => {
    if (a.hour == null && b.hour == null) return 0;
    if (a.hour == null) return 1;
    if (b.hour == null) return -1;
    return a.hour - b.hour;
  });

  return events;
}
