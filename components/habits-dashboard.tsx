"use client";

import { useMemo, useState } from "react";
import { useSelectedDate } from "@/hooks/use-selected-date";
import useSWR from "swr";

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
import { Card, CardContent } from "@/components/ui/card";
import { TaskGroup, TaskRow } from "@/components/tasks";
import { ChecklistStats, ChecklistChart } from "@/components/checklist-primitives";
import { shortDate, computeStreak } from "@/lib/date-utils";

const HABITS_COLOR = "hsl(220, 60%, 55%)";

const HAPTIC = () => {
  try {
    navigator.vibrate?.(8);
  } catch {}
};

export function HabitsDashboard() {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const { date: selectedDate } = useSelectedDate();
  const [optimisticDay, setOptimisticDay] = useState<HabitDay | null>(null);

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
    <>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <ChecklistStats
        day={day}
        history={history?.daily}
        streak={streak}
        color={HABITS_COLOR}
        avgSublabel="of habits completed"
      />

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

      <ChecklistChart data={chartData} title="Last 30 days" color={HABITS_COLOR} xAxis="date" interval={3} />
    </>
  );
}
