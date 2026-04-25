"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { useSectionColor } from "@/hooks/use-sections";
import { useDemoHref } from "@/hooks/use-demo-href";
import {
  getSectionEvents,
  getCannabisDay,
  getCaffeineDay,
  getEntries,
  getExerciseConfig,
  getHealthCache,
  getHabitDay,
  getChores,
  getSupplementDay,
  getHealthWithings,
  getHealthOura,
  getAirDay,
} from "@/lib/api";
import type { OuraRow, SectionEvent, WithingsRow } from "@/lib/api";
import { getGutDay } from "@/lib/api-gut";
import {
  buildEvents,
  sourceToPath,
  type TimelineColors,
  type TimelineDayData,
} from "@/lib/timeline-events";
import { TimelineWeekView } from "@/components/timeline-week-view";

export function TimelineDashboard() {
  const { date: today } = useSelectedDate();
  const toHref = useDemoHref();
  const colors: TimelineColors = {
    nutrition: useSectionColor("nutrition"),
    cannabis: useSectionColor("cannabis"),
    caffeine: useSectionColor("caffeine"),
    training: useSectionColor("training"),
    habits: useSectionColor("habits"),
    supplements: useSectionColor("supplements"),
    sleep: useSectionColor("sleep"),
    body: useSectionColor("body"),
    chores: useSectionColor("chores"),
    gut: useSectionColor("gut"),
  };

  const { data, isLoading } = useSWR(
    ["timeline-dashboard", today],
    async (): Promise<TimelineDayData> => {
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
        getAirDay(today),
        getGutDay(today),
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
        gut: results[11].status === "fulfilled" ? (results[11].value as TimelineDayData["gut"]) : null,
      };
    },
    { refreshInterval: 30_000 },
  );

  const { data: exerciseConfig } = useSWR("training-config", getExerciseConfig, {
    revalidateOnFocus: false,
  });

  const events = buildEvents(today, data, exerciseConfig, colors);

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
          const href = toHref(`${sourceToPath(ev.source)}?date=${today}`);
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

      <TimelineWeekView endDate={today} colors={colors} exerciseConfig={exerciseConfig} />
    </main>
  );
}
