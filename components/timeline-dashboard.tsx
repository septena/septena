"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { useSectionColor } from "@/hooks/use-sections";
import {
  getSectionEvents,
  getCannabisDay,
  getCaffeineDay,
  getEntries,
  getHealthCache,
  getHabitDay,
  getChores,
  getSupplementDay,
  getHealthWithings,
  getHealthOura,
  getWeather,
  getCalendar,
  getAirDay,
} from "@/lib/api";
import type { CalendarEvent, OuraRow, SectionEvent, WithingsRow } from "@/lib/api";
import { getGutDay } from "@/lib/api-gut";

type Event = {
  hour: number | null;
  timeStr: string;
  color: string;
  label: string;
  source: string;
  future?: boolean;
};

function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h + mm / 60;
}

/** Map an event's `source` label to the section page it belongs to.
 *  Most sources are section keys already; sleep → /sleep, withings → /body. */
function sourceToPath(source: string): string {
  if (source === "withings") return "/body";
  if (source === "sleep") return "/sleep";
  return `/${source}`;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function TimelineDashboard() {
  const { date: today } = useSelectedDate();
  const nutritionColor = useSectionColor("nutrition");
  const cannabisColor = useSectionColor("cannabis");
  const caffeineColor = useSectionColor("caffeine");
  const exerciseColor = useSectionColor("exercise");
  const habitsColor = useSectionColor("habits");
  const supplementsColor = useSectionColor("supplements");
  const sleepColor = "hsl(220,60%,60%)";
  const bodyColor = "hsl(33,60%,50%)";
  const choresColor = useSectionColor("chores");
  const calendarColor = useSectionColor("calendar");
  const gutColor = useSectionColor("gut");

  const { data, isLoading } = useSWR(
    ["timeline-dashboard", today],
    async () => {
      const results = await Promise.allSettled([
        getSectionEvents("nutrition", today),
        getCannabisDay(today),
        getCaffeineDay(today),
        getEntries(today),
        getHealthCache(),
        getHabitDay(today),
        getChores(),
        getSupplementDay(today),
        getHealthWithings(1, today),
        getHealthOura(1, today),
        getWeather(),
        getCalendar(),
        getAirDay(today),
        getGutDay(today),
      ]);
      return {
        nutritionEvents: results[0].status === "fulfilled" ? (results[0].value as { events: SectionEvent[] }).events : [],
        cannabis: results[1].status === "fulfilled" ? results[1].value : { entries: [] },
        caffeine: results[2].status === "fulfilled" ? results[2].value : { entries: [] },
        exercise: results[3].status === "fulfilled" ? results[3].value : [],
        health: results[4].status === "fulfilled" ? results[4].value : { oura: [], apple: [], withings: [] },
        habits: results[5].status === "fulfilled" ? results[5].value : null,
        chores: results[6].status === "fulfilled" ? results[6].value : null,
        supplements: results[7].status === "fulfilled" ? results[7].value : null,
        withings: results[8].status === "fulfilled" ? (results[8].value as { withings: WithingsRow[] }).withings : [],
        oura: results[9].status === "fulfilled" ? (results[9].value as { oura: OuraRow[] }).oura : [],
        weather: results[10].status === "fulfilled" ? results[10].value : null,
        calendar: results[11].status === "fulfilled" ? results[11].value : null,
        air: results[12].status === "fulfilled" ? results[12].value : null,
        gut: results[13].status === "fulfilled" ? results[13].value : null,
      };
    },
    { refreshInterval: 30_000 },
  );

  const events: Event[] = [];

  // Nutrition — via universal /events contract
  for (const n of data?.nutritionEvents ?? []) {
    const h = parseHHMM(n.time);
    events.push({ hour: h, timeStr: n.time ?? "—", color: nutritionColor, label: n.label, source: n.section });
  }

  // Cannabis
  for (const c of (data?.cannabis as { entries?: { time: string }[] } | null)?.entries ?? []) {
    const h = parseHHMM(c.time);
    events.push({ hour: h, timeStr: c.time ?? "—", color: cannabisColor, label: "cannabis", source: "cannabis" });
  }

  // Caffeine
  for (const c of (data?.caffeine as { entries?: { time: string; method?: string }[] } | null)?.entries ?? []) {
    const h = parseHHMM(c.time);
    events.push({ hour: h, timeStr: c.time ?? "—", color: caffeineColor, label: c.method ?? "caffeine", source: "caffeine" });
  }

  // Exercise
  const seenExerciseTimes = new Set<string>();
  for (const e of Array.isArray(data?.exercise) ? data!.exercise : []) {
    if (e.date !== today || !e.concluded_at) continue;
    const hhmm = e.concluded_at.slice(11, 16);
    if (seenExerciseTimes.has(hhmm)) continue;
    seenExerciseTimes.add(hhmm);
    const h = parseHHMM(hhmm);
    events.push({ hour: h, timeStr: hhmm, color: exerciseColor, label: e.session || e.exercise || "exercise", source: "exercise" });
  }

  // Habits
  const buckets = (data?.habits as { buckets?: string[]; grouped?: Record<string, { done?: boolean; time?: string; name?: string }[]> } | null)?.buckets ?? [];
  const grouped = (data?.habits as { grouped?: Record<string, { done?: boolean; time?: string; name?: string }[]> } | null)?.grouped;
  for (const bucket of buckets) {
    for (const h of grouped?.[bucket] ?? []) {
      if (!h.done || !h.time) continue;
      const hr = parseHHMM(h.time);
      events.push({ hour: hr, timeStr: h.time, color: habitsColor, label: h.name ?? "", source: "habits" });
    }
  }

  // Supplements
  for (const s of (data?.supplements as { items?: { done?: boolean; time?: string; name?: string }[] } | null)?.items ?? []) {
    if (!s.done || !s.time) continue;
    const hr = parseHHMM(s.time);
    events.push({ hour: hr, timeStr: s.time, color: supplementsColor, label: s.name ?? "", source: "supplements" });
  }

  // Chores
  for (const c of (data?.chores as { chores?: { last_completed?: string; last_completed_time?: string; name?: string }[] } | null)?.chores ?? []) {
    if (c.last_completed !== today || !c.last_completed_time) continue;
    const hr = parseHHMM(c.last_completed_time);
    events.push({ hour: hr, timeStr: c.last_completed_time, color: choresColor, label: c.name ?? "", source: "chores" });
  }

  // Calendar
  for (const ev of (data?.calendar as { events?: CalendarEvent[] } | null)?.events ?? []) {
    if (localDay(ev.start) !== today) continue;
    if (ev.all_day) {
      events.push({ hour: -0.5, timeStr: "all-day", color: calendarColor, label: ev.title, source: "calendar" });
      continue;
    }
    const timeStr = localTime(ev.start);
    const h = parseHHMM(timeStr);
    events.push({ hour: h, timeStr, color: calendarColor, label: ev.title, source: "calendar" });
  }

  // Sleep (Oura) — matches today-timeline widget: use latest Oura row with
  // wake_time for `today` as "woke up", and compute target bedtime as wake+16h.
  // Read from /api/health/cache (merged sources) — the live /oura endpoint
  // returns nulls for wake_time on recent days.
  const ouraRows = (data?.health as { oura?: OuraRow[] } | null)?.oura ?? [];
  const todayOura = [...ouraRows].reverse().find((r) => r.date === today && r.wake_time);
  if (todayOura?.wake_time) {
    const wakeHour = parseHHMM(todayOura.wake_time);
    events.push({ hour: wakeHour, timeStr: todayOura.wake_time, color: sleepColor, label: "woke up ☀️", source: "sleep" });
    if (wakeHour != null) {
      const moonHour = wakeHour + 16;
      if (moonHour < 24) {
        const hh = Math.floor(moonHour) % 24;
        const mm = Math.round((moonHour % 1) * 60);
        const bedStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        events.push({ hour: moonHour, timeStr: bedStr, color: sleepColor, label: "target bed 🌙", source: "sleep", future: true });
      }
    }
  }

  // Gut — one event per bowel movement (matches widget)
  for (const g of (data?.gut as { entries?: { time: string; bristol: number }[] } | null)?.entries ?? []) {
    const h = parseHHMM(g.time);
    events.push({ hour: h, timeStr: g.time, color: gutColor, label: `Bristol ${g.bristol}`, source: "gut" });
  }

  // Body (Withings)
  for (const w of (data?.withings as WithingsRow[] | null) ?? []) {
    if (w.date !== today) continue;
    if (w.weight_kg != null) {
      events.push({ hour: 8, timeStr: "08:00", color: bodyColor, label: `${w.weight_kg}kg`, source: "withings" });
    }
    if (w.fat_pct != null) {
      events.push({ hour: 8, timeStr: "08:00", color: bodyColor, label: `${w.fat_pct}%bf`, source: "withings" });
    }
  }

  // Sort by hour (nulls last)
  events.sort((a, b) => {
    if (a.hour == null && b.hour == null) return 0;
    if (a.hour == null) return 1;
    if (b.hour == null) return -1;
    return a.hour - b.hour;
  });

  return (
    <main className="mx-auto min-h-screen w-full min-w-0 max-w-2xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Timeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
        </div>
        <span className="text-xs text-muted-foreground">{events.length} events</span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && events.length === 0 && (
        <p className="text-sm text-muted-foreground">No events logged for {today}</p>
      )}

      <div className="space-y-1">
        {events.map((ev, i) => {
          const prev = events[i - 1];
          const showFutureGap = ev.future && !prev?.future;
          const href = `${sourceToPath(ev.source)}?date=${today}`;
          return (
            <div key={i}>
              {showFutureGap && (
                <div
                  className="mx-auto my-3 h-6 w-px border-l border-dashed border-border/60"
                  aria-hidden
                />
              )}
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 hover:border-border hover:bg-muted/40 transition-colors ${ev.future ? "opacity-60" : ""}`}
              >
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                <span className="w-12 text-xs text-muted-foreground font-mono">{ev.timeStr}</span>
                <span className="text-sm font-medium text-foreground flex-1">{ev.label}</span>
                <span className="text-xs text-muted-foreground">{ev.source}</span>
              </Link>
            </div>
          );
        })}
      </div>
    </main>
  );
}
