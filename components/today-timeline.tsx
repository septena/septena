"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { useSectionColor } from "@/hooks/use-sections";
import {
  getNutritionEntries,
  getCannabisDay,
  getCaffeineDay,
  getEntries,
  getHealthCache,
  getHabitDay,
  getChores,
  getSupplementDay,
  getCalendar,
} from "@/lib/api";
import { getGutDay } from "@/lib/api-gut";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { relativeDayLabel } from "@/lib/date-utils";

type Dot = { hour: number; color: string; label: string };

function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h + mm / 60;
}

export function TodayTimeline() {
  const { date: today, isToday } = useSelectedDate();
  // Pull from the live registry (`/api/sections`) not the static
  // `SECTIONS[key].color` fallback — the static map is the first-paint
  // default; users can override per-section in settings.yaml. Reading
  // statically here meant the timeline dots stayed default-colored even
  // after the user customised a section's accent.
  const nutritionColor = useSectionColor("nutrition");
  const cannabisColor = useSectionColor("cannabis");
  const caffeineColor = useSectionColor("caffeine");
  const trainingColor = useSectionColor("training");
  const habitsColor = useSectionColor("habits");
  const supplementsColor = useSectionColor("supplements");
  const choresColor = useSectionColor("chores");
  const gutColor = useSectionColor("gut");
  const calendarColor = useSectionColor("calendar");

  const { data } = useSWR(
    ["today-timeline", today],
    async () => {
      // Scope each fetch to today where possible:
      //   - getEntries(today) sends `?since=today`, so the payload is a few
      //     rows instead of every exercise entry ever logged.
      //   - getHealthCache() serves the on-disk snapshot with no upstream API
      //     calls, so it returns instantly — we only need the latest oura row
      //     for wake_time.
      const [nutrition, cannabis, caffeine, training, health, habits, chores, supplements, gut, calendar] = await Promise.all([
        getNutritionEntries(today).catch(() => []),
        getCannabisDay(today).catch(() => ({ entries: [] as { time: string }[] })),
        getCaffeineDay(today).catch(() => ({ entries: [] as { time: string; method: string }[] })),
        getEntries(today).catch(() => []),
        getHealthCache().catch(() => ({ oura: [], apple: [], withings: [] })),
        getHabitDay(today).catch(() => null),
        getChores().catch(() => null),
        getSupplementDay(today).catch(() => null),
        getGutDay(today).catch(() => null),
        getCalendar().catch(() => null),
      ]);
      return { nutrition, cannabis, caffeine, training, health, habits, chores, supplements, gut, calendar };
    },
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  // Re-render every minute so the "now" indicator advances.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const dots: Dot[] = [];
  for (const n of data?.nutrition ?? []) {
    if (n.date !== today) continue;
    const h = parseHHMM(n.time);
    if (h == null) continue;
    dots.push({ hour: h, color: nutritionColor, label: `${n.time} · ${n.foods[0] ?? "meal"}` });
  }
  for (const c of data?.cannabis?.entries ?? []) {
    const h = parseHHMM(c.time);
    if (h == null) continue;
    dots.push({ hour: h, color: cannabisColor, label: `${c.time} · cannabis` });
  }
  for (const c of data?.caffeine?.entries ?? []) {
    const h = parseHHMM(c.time);
    if (h == null) continue;
    dots.push({ hour: h, color: caffeineColor, label: `${c.time} · ${c.method}` });
  }
  // Training — one dot per session (dedupe on concluded_at time).
  const seenExerciseTimes = new Set<string>();
  for (const e of data?.training ?? []) {
    if (e.date !== today || !e.concluded_at) continue;
    const hhmm = e.concluded_at.slice(11, 16);
    if (seenExerciseTimes.has(hhmm)) continue;
    seenExerciseTimes.add(hhmm);
    const h = parseHHMM(hhmm);
    if (h == null) continue;
    dots.push({ hour: h, color: trainingColor, label: `${hhmm} · ${e.session || e.exercise || "training"}` });
  }
  // Habits — one dot per completed habit with a recorded time.
  for (const bucket of data?.habits?.buckets ?? []) {
    for (const h of data?.habits?.grouped?.[bucket] ?? []) {
      if (!h.done || !h.time) continue;
      const hr = parseHHMM(h.time);
      if (hr == null) continue;
      dots.push({ hour: hr, color: habitsColor, label: `${h.time} · ${h.name}` });
    }
  }
  // Supplements — one dot per supplement taken with a recorded time.
  for (const s of data?.supplements?.items ?? []) {
    if (!s.done || !s.time) continue;
    const hr = parseHHMM(s.time);
    if (hr == null) continue;
    dots.push({ hour: hr, color: supplementsColor, label: `${s.time} · ${s.name}` });
  }
  // Chores — dot for each chore completed today, keyed on last_completed_time.
  for (const c of data?.chores?.chores ?? []) {
    if (c.last_completed !== today || !c.last_completed_time) continue;
    const hr = parseHHMM(c.last_completed_time);
    if (hr == null) continue;
    dots.push({ hour: hr, color: choresColor, label: `${c.last_completed_time} · ${c.name}` });
  }
  // Gut — dot per bowel movement.
  for (const g of data?.gut?.entries ?? []) {
    const h = parseHHMM(g.time);
    if (h == null) continue;
    dots.push({ hour: h, color: gutColor, label: `${g.time} · Bristol ${g.bristol}` });
  }
  // Calendar — dot at each event start, merged into the main dot stream.
  for (const ev of data?.calendar?.events ?? []) {
    if (ev.all_day) continue;
    if (!ev.start?.startsWith(today)) continue;
    const sh = parseHHMM(ev.start.slice(11, 16));
    if (sh == null) continue;
    dots.push({ hour: sh, color: calendarColor, label: `${ev.start.slice(11, 16)} · ${ev.title}` });
  }

  // Cluster dots by (color, ~10min bucket) so multiple entries of the same
  // section close in time render as a single larger dot (e.g. a meal logged as
  // several food items). Different sections at the same time stay separate.
  type Cluster = { hour: number; color: string; labels: string[] };
  const clusterMap = new Map<string, Cluster>();
  for (const d of dots) {
    const key = `${d.color}:${Math.floor(d.hour * 6)}`;
    const existing = clusterMap.get(key);
    if (existing) {
      existing.labels.push(d.label);
      existing.hour = (existing.hour * existing.labels.length + d.hour) / (existing.labels.length + 1);
    } else {
      clusterMap.set(key, { hour: d.hour, color: d.color, labels: [d.label] });
    }
  }
  const clusters = [...clusterMap.values()].sort((a, b) => a.hour - b.hour);

  // Wake time — latest Oura row's wake_time. The row keyed to today's date
  // corresponds to last night's sleep that ended this morning.
  const ouraRows = data?.health?.oura ?? [];
  const todayOura = [...ouraRows].reverse().find((r) => r.date === today && r.wake_time);
  const wakeHour = todayOura ? parseHHMM(todayOura.wake_time) : null;
  // Target bedtime = 16h awake window. Only render if it lands today.
  const moonHour = wakeHour != null ? wakeHour + 16 : null;
  const moonInRange = moonHour != null && moonHour < 24;
  const moonHHMM =
    moonHour != null
      ? `${String(Math.floor(moonHour) % 24).padStart(2, "0")}:${String(Math.round((moonHour % 1) * 60)).padStart(2, "0")}`
      : null;

  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const pct = (h: number) => (h / 24) * 100;

  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{relativeDayLabel(today)}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {wakeHour != null && todayOura?.wake_time ? `woke ${todayOura.wake_time} · ` : ""}
          {dots.length} {dots.length === 1 ? "event" : "events"}
        </p>
      </div>
      <div className="relative h-10 rounded-full border border-border bg-muted/40">
        {/* Hour ticks */}
        {[6, 12, 18].map((h) => (
          <div
            key={h}
            className="absolute top-1 bottom-1 w-px bg-border"
            style={{ left: `${pct(h)}%` }}
          />
        ))}
        {/* Wake marker — shaded band from midnight to wake, plus a small sun emoji at the wake point */}
        {wakeHour != null && (
          <>
            <div
              className="absolute top-1 bottom-1 rounded-l-full bg-muted-foreground/10"
              style={{ left: "4px", width: `calc(${pct(wakeHour)}% - 4px)` }}
              title={`Asleep until ${todayOura?.wake_time}`}
            />
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none"
              style={{ left: `${pct(wakeHour)}%` }}
              title={`Woke up at ${todayOura?.wake_time}`}
            >
              {"\u2600\uFE0F"}
            </div>
          </>
        )}
        {/* Target bedtime — 16h after wake */}
        {moonInRange && moonHour != null && (
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none opacity-70"
            style={{ left: `${pct(moonHour)}%` }}
            title={`Target bedtime ${moonHHMM} (16h after wake)`}
          >
            {"\u{1F319}"}
          </div>
        )}
        {/* Now marker — only meaningful when viewing today */}
        {isToday && (
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/60"
            style={{ left: `${pct(nowHour)}%` }}
            title={`Now · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}
          />
        )}
        {/* Dots — one per (section, ~10min bucket). Size grows with count. */}
        {clusters.map((c, i) => {
          const size = Math.min(14, 8 + (c.labels.length - 1) * 2);
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background"
              style={{
                left: `${pct(c.hour)}%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: c.color,
              }}
              title={c.labels.join("\n")}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between px-1 text-[9px] tabular-nums text-muted-foreground">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}
