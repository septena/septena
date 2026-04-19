"use client";

import { useMemo, useState } from "react";
import { useSelectedDate } from "@/hooks/use-selected-date";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  getHabitDay,
  getHabitHistory,
  getSettings,
  toggleHabit,
  type HabitDay,
  type HabitDayItem,
} from "@/lib/api";
import {
  DEFAULT_DAY_PHASES,
  isPastCutoff as isPhaseCutoffPast,
  isPastPhase,
  isFuturePhase,
  timeLeftInPhase,
} from "@/lib/day-phases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionStatusBar } from "@/components/section-status-bar";
import { TaskGroup, TaskRow } from "@/components/tasks";
import { useBarAnimation } from "@/hooks/use-bar-animation";

// Blue for habits — matches sections.ts registry.
const HABITS_COLOR = "hsl(220, 60%, 55%)";

const chartConfig = {
  metric: { label: "Completion", color: HABITS_COLOR },
} satisfies ChartConfig;

const HAPTIC = () => {
  try {
    navigator.vibrate?.(8);
  } catch {}
};

import { shortDate, computeStreak } from "@/lib/date-utils";
import { StatCard } from "@/components/stat-card";

export function HabitsDashboard() {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const { date: selectedDate } = useSelectedDate();
  const [optimisticDay, setOptimisticDay] = useState<HabitDay | null>(null);
  const barAnim = useBarAnimation();

  const { data, error, isLoading, mutate } = useSWR(
    ["habits", selectedDate],
    async () => {
      const [d, h] = await Promise.all([getHabitDay(selectedDate), getHabitHistory(30)]);
      return { day: d, history: h };
    },
    { refreshInterval: 60_000 },
  );

  const { data: settings } = useSWR("settings", getSettings);
  const phases = settings?.day_phases ?? DEFAULT_DAY_PHASES;
  const phaseById = useMemo(
    () => Object.fromEntries(phases.map((p) => [p.id, p])),
    [phases],
  );

  const day = optimisticDay ?? data?.day ?? null;
  const history = data?.history ?? null;
  const loading = isLoading && !data;

  if (optimisticDay && data?.day && data.day !== optimisticDay) {
    setOptimisticDay(null);
  }

  async function onToggle(habit: HabitDayItem) {
    if (pending.has(habit.id) || !day) return;
    const nextDone = !habit.done;
    const prevDay = day;
    const nextGrouped = { ...day.grouped };
    nextGrouped[habit.bucket] = day.grouped[habit.bucket].map((h) =>
      h.id === habit.id ? { ...h, done: nextDone } : h,
    );
    const delta = nextDone ? 1 : -1;
    const done_count = day.done_count + delta;
    setOptimisticDay({
      ...day,
      grouped: nextGrouped,
      done_count,
      percent: day.total ? Math.round((100 * done_count) / day.total) : 0,
    });
    HAPTIC();
    setPending((p) => new Set(p).add(habit.id));

    try {
      await toggleHabit(selectedDate, habit.id, nextDone);
      HAPTIC();
      mutate();
    } catch {
      setOptimisticDay(prevDay);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(habit.id);
        return next;
      });
    }
  }

  const chartData = useMemo(
    () => (history?.daily ?? []).map((d) => ({ date: shortDate(d.date), metric: d.percent })),
    [history],
  );
  const streak = useMemo(() => computeStreak(history?.daily), [history]);

  return (
    <main
      data-section="habits"
      className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
      style={{ overflowX: "hidden" }}
    >

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Today"
          value={day ? `${day.done_count}/${day.total}` : "—"}
          sublabel={day ? `${day.percent}% complete` : ""}
          progress={day ? day.done_count / Math.max(1, day.total) : 0}
          color={HABITS_COLOR}
        />
        <StatCard label="Streak" value={`${streak}d`} sublabel="consecutive days with activity" color={HABITS_COLOR} />
        <StatCard
          label="30-day avg"
          value={
            history && history.daily.length
              ? `${Math.round(history.daily.reduce((s, d) => s + d.percent, 0) / history.daily.length)}%`
              : "—"
          }
          sublabel="of habits completed"
          color={HABITS_COLOR}
        />
      </div>

      {loading && !day ? (
        <p className="text-sm text-muted-foreground">Loading habits…</p>
      ) : day && day.total === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No habits configured. Add some in{" "}
            <a href="/settings/habits" className="underline">
              Settings → Habits
            </a>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {day &&
            day.buckets.map((bucket) => {
              const items = day.grouped[bucket] ?? [];
              const doneCount = items.filter((i) => i.done).length;
              const isPast = isPastPhase(phases, bucket);
              const isFuture = isFuturePhase(phases, bucket);
              const timeLeft = !isPast && !isFuture ? timeLeftInPhase(phases, bucket) : null;
              const meta = phaseById[bucket] ?? { label: bucket, emoji: "" };
              return (
                <TaskGroup
                  key={bucket}
                  title={meta.label}
                  emoji={meta.emoji}
                  accent={HABITS_COLOR}
                  doneCount={doneCount}
                  totalCount={items.length}
                  collapsible={isPast || isFuture}
                  defaultCollapsed={false}
                  nowBadge={!isPast && !isFuture}
                  statusLabel={timeLeft ?? undefined}
                  statusColor="hsl(24,100%,50%)"
                  emptyHint="No habits in this bucket."
                >
                  {items.map((h) => (
                    <TaskRow
                      key={h.id}
                      label={h.name}
                      sublabel={h.done && h.time ? h.time : undefined}
                      done={h.done}
                      pending={pending.has(h.id)}
                      accent={HABITS_COLOR}
                      muted={isPhaseCutoffPast(phases, bucket, h.done)}
                      onClick={() => onToggle(h)}
                    />
                  ))}
                </TaskGroup>
              );
            })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} interval={3} />
              <YAxis
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                width={40}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Bar dataKey="metric" fill="var(--color-metric)" radius={[4, 4, 0, 0]} {...barAnim} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <SectionStatusBar section="habits" />
    </main>
  );
}
