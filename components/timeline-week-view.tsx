"use client";

import useSWR from "swr";
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
} from "@/lib/api";
import type { OuraRow, SectionEvent, WithingsRow } from "@/lib/api";
import { getGutDay } from "@/lib/api-gut";
import {
  buildEvents,
  type ExerciseTaxonomy,
  type TimelineColors,
  type TimelineDayData,
  type TimelineEvent,
} from "@/lib/timeline-events";

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

function dayNum(iso: string): string {
  return iso.slice(8, 10);
}

async function fetchDayData(date: string): Promise<TimelineDayData> {
  const results = await Promise.allSettled([
    getSectionEvents("nutrition", date),
    getCannabisDay(date),
    getCaffeineDay(date),
    getEntries(date),
    getHealthCache(),
    getHabitDay(date),
    getChores(),
    getSupplementDay(date),
    getHealthWithings(1, date),
    getHealthOura(1, date),
    getGutDay(date),
  ]);
  return {
    nutritionEvents: results[0].status === "fulfilled" ? (results[0].value as { events: SectionEvent[] }).events : [],
    cannabis: results[1].status === "fulfilled" ? (results[1].value as TimelineDayData["cannabis"]) : { entries: [] },
    caffeine: results[2].status === "fulfilled" ? (results[2].value as TimelineDayData["caffeine"]) : { entries: [] },
    training: results[3].status === "fulfilled" ? (results[3].value as TimelineDayData["training"]) : [],
    health: results[4].status === "fulfilled" ? (results[4].value as TimelineDayData["health"]) : { oura: [] },
    habits: results[5].status === "fulfilled" ? (results[5].value as TimelineDayData["habits"]) : null,
    chores: results[6].status === "fulfilled" ? (results[6].value as TimelineDayData["chores"]) : null,
    supplements: results[7].status === "fulfilled" ? (results[7].value as TimelineDayData["supplements"]) : null,
    withings: results[8].status === "fulfilled" ? (results[8].value as { withings: WithingsRow[] }).withings : [],
    oura: results[9].status === "fulfilled" ? (results[9].value as { oura: OuraRow[] }).oura : [],
    gut: results[10].status === "fulfilled" ? (results[10].value as TimelineDayData["gut"]) : null,
  };
}

function DayColumn({
  date,
  colors,
  exerciseConfig,
  isToday,
}: {
  date: string;
  colors: TimelineColors;
  exerciseConfig: ExerciseTaxonomy | undefined;
  isToday: boolean;
}) {
  const { data } = useSWR(["timeline-week", date], () => fetchDayData(date), {
    revalidateOnFocus: false,
  });
  const events = buildEvents(date, data, exerciseConfig, colors);
  const timed = events.filter((e): e is TimelineEvent & { hour: number } => e.hour != null && e.hour >= 0);

  return (
    <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
      <div className="text-center">
        <div className={`text-[10px] uppercase tracking-wide ${isToday ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          {weekdayShort(date)}
        </div>
        <div className={`text-xs font-mono ${isToday ? "text-foreground" : "text-muted-foreground"}`}>
          {dayNum(date)}
        </div>
      </div>
      <div className="relative h-48 w-full rounded border border-border/40 bg-muted/20 overflow-hidden">
        {timed.map((ev, i) => (
          <div
            key={i}
            title={`${ev.timeStr} ${ev.label}`}
            className="absolute left-1 right-1 h-1.5 rounded-sm"
            style={{
              top: `calc(${(ev.hour / 24) * 100}% - 3px)`,
              backgroundColor: ev.color,
              opacity: ev.future ? 0.4 : 0.85,
            }}
          />
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums">{events.length}</div>
    </div>
  );
}

export function TimelineWeekView({
  endDate,
  colors,
  exerciseConfig,
}: {
  endDate: string;
  colors: TimelineColors;
  exerciseConfig: ExerciseTaxonomy | undefined;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(endDate, i - 6));

  return (
    <section className="mt-10 border-t border-border/40 pt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">Last 7 days</h2>
        <span className="text-xs text-muted-foreground">00 → 24h</span>
      </div>
      <div className="flex items-stretch gap-1.5">
        {dates.map((d) => (
          <DayColumn
            key={d}
            date={d}
            colors={colors}
            exerciseConfig={exerciseConfig}
            isToday={d === endDate}
          />
        ))}
      </div>
    </section>
  );
}
