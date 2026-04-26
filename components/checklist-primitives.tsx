"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { CHART_GRID, WEEKDAY_X_AXIS, X_AXIS_DATE, Y_AXIS } from "@/lib/chart-defaults";

type DayLike = { done_count: number; total: number; percent: number } | null;
type HistoryDaily = { date: string; percent: number }[] | null | undefined;

export function ChecklistStats({
  day,
  history,
  streak,
  color,
  avgSublabel,
}: {
  day: DayLike;
  history: HistoryDaily;
  streak: number;
  color: string;
  avgSublabel: string;
}) {
  const avg = history && history.length
    ? `${Math.round(history.reduce((s, d) => s + d.percent, 0) / history.length)}%`
    : "—";

  return (
    <div className="mb-6 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3">
      <StatCard
        label="Today"
        value={day ? `${day.done_count}/${day.total}` : "—"}
        sublabel={day ? `${day.percent}% complete` : ""}
        progress={day ? day.done_count / Math.max(1, day.total) : 0}
        color={color}
      />
      <StatCard label="Streak" value={`${streak}d`} sublabel="consecutive days with activity" color={color} />
      <StatCard label="30-day avg" value={avg} sublabel={avgSublabel} color={color} />
    </div>
  );
}

export function ChecklistChart({
  data,
  title,
  color,
  xAxis,
  interval,
}: {
  data: { date: string; metric: number }[];
  title: string;
  color: string;
  xAxis: "date" | "weekday";
  interval: number;
}) {
  const barAnim = useBarAnimation();
  const config = { metric: { label: "Completion", color } } satisfies ChartConfig;
  const xProps = xAxis === "weekday" ? WEEKDAY_X_AXIS : X_AXIS_DATE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...xProps} interval={interval} />
            <YAxis {...Y_AXIS} domain={[0, 100]} width={40} tickFormatter={(v: number) => `${v}%`} />
            <Bar dataKey="metric" fill="var(--color-metric)" radius={[4, 4, 0, 0]} {...barAnim} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
