"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  getSupplementDay,
  getSupplementHistory,
  toggleSupplement,
  type SupplementDay,
  type SupplementHistory,
  type SupplementItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionStatusBar } from "@/components/section-status-bar";
import { TaskGroup, TaskRow } from "@/components/tasks";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { useSectionColor } from "@/hooks/use-sections";

import { computeStreak, formatWeekdayTick } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { StatCard } from "@/components/stat-card";

export function SupplementsDashboard() {
  const SUPPLEMENTS_COLOR = useSectionColor("supplements");
  const chartConfig = {
    metric: { label: "Completion", color: SUPPLEMENTS_COLOR },
  } satisfies ChartConfig;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [optimisticDay, setOptimisticDay] = useState<SupplementDay | null>(null);
  const barAnim = useBarAnimation();

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
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      <div className="mb-6 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Today"
          value={day ? `${day.done_count}/${day.total}` : "—"}
          sublabel={day ? `${day.percent}% complete` : ""}
          progress={day ? day.done_count / Math.max(1, day.total) : 0}
          color={SUPPLEMENTS_COLOR}
        />
        <StatCard label="Streak" value={`${streak}d`} sublabel="consecutive days with activity" />
        <StatCard
          label="30-day avg"
          value={
            history && history.daily.length
              ? `${Math.round(history.daily.reduce((s, d) => s + d.percent, 0) / history.daily.length)}%`
              : "—"
          }
          sublabel="of supplements taken"
        />
      </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0}
                  tickFormatter={(v: string) => formatWeekdayTick(v)} tick={{ fontSize: 10 }} />
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
      </div>
      <SectionStatusBar section="supplements" />
    </main>
  );
}
