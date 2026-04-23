"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  getSupplementDay,
  getSupplementHistory,
  toggleSupplement,
  type SupplementDay,
  type SupplementItem,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { TaskGroup, TaskRow } from "@/components/tasks";
import { ChecklistStats, ChecklistChart } from "@/components/checklist-primitives";
import { computeStreak } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";

export function SupplementsDashboard() {
  const SUPPLEMENTS_COLOR = "var(--section-accent)";
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [optimisticDay, setOptimisticDay] = useState<SupplementDay | null>(null);

  const { date: selectedDate } = useSelectedDate();

  const { data, error, isLoading, mutate } = useSWR(
    ["supplements", selectedDate],
    async () => {
      const [d, h] = await Promise.all([getSupplementDay(selectedDate), getSupplementHistory(7)]);
      return { day: d, history: h };
    },
    { refreshInterval: 60_000 },
  );

  const day = optimisticDay ?? data?.day ?? null;
  const history = data?.history ?? null;
  const loading = isLoading && !data;

  if (optimisticDay && data?.day && data.day !== optimisticDay) {
    setOptimisticDay(null);
  }

  async function onToggle(item: SupplementItem) {
    if (pending.has(item.id) || !day) return;
    const nextDone = !item.done;
    const prevDay = day;
    const nextItems = day.items.map((s) => (s.id === item.id ? { ...s, done: nextDone } : s));
    const done_count = nextDone ? day.done_count + 1 : day.done_count - 1;
    setOptimisticDay({
      ...day,
      items: nextItems,
      done_count,
      percent: day.total ? Math.round((100 * done_count) / day.total) : 0,
    });
    setPending((p) => new Set(p).add(item.id));

    try {
      await toggleSupplement(selectedDate, item.id, nextDone);
      mutate();
    } catch {
      setOptimisticDay(prevDay);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(item.id);
        return next;
      });
    }
  }

  const chartData = useMemo(
    () => (history?.daily ?? []).map((d) => ({ date: d.date, metric: d.percent })),
    [history],
  );
  const streak = useMemo(() => computeStreak(history?.daily), [history]);

  return (
    <>
      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      <ChecklistStats
        day={day}
        history={history?.daily}
        streak={streak}
        color={SUPPLEMENTS_COLOR}
        avgSublabel="of supplements taken"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          {loading && !day ? (
            <p className="text-sm text-muted-foreground">Loading supplements…</p>
          ) : day && day.total === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No supplements configured. Add some in{" "}
                <a href="/settings/supplements" className="underline">
                  Settings → Supplements
                </a>
                .
              </CardContent>
            </Card>
          ) : (
            <TaskGroup
              accent={SUPPLEMENTS_COLOR}
              doneCount={day?.done_count ?? 0}
              totalCount={day?.total ?? 0}
            >
              {day?.items.map((item) => (
                <TaskRow
                  key={item.id}
                  label={item.name}
                  emoji={item.emoji}
                  sublabel={item.done && item.time ? item.time : undefined}
                  done={item.done}
                  pending={pending.has(item.id)}
                  accent={SUPPLEMENTS_COLOR}
                  onClick={() => onToggle(item)}
                />
              ))}
            </TaskGroup>
          )}
        </div>

        <ChecklistChart data={chartData} title="Last 7 days" color={SUPPLEMENTS_COLOR} xAxis="weekday" interval={0} />
      </div>
    </>
  );
}
