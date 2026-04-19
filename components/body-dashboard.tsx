"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageHeader } from "@/components/page-header-context";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionStatusBar } from "@/components/section-status-bar";
import {
  getHealthCombined,
  getHealthCache,
  type WithingsRow,
} from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { formatDateShort as formatDate, formatWeekdayTick } from "@/lib/date-utils";
import { StatCard } from "@/components/stat-card";
import { useSelectedDate } from "@/hooks/use-selected-date";

const BODY = SECTIONS.body;
const COLOR = BODY.color;

const weightConfig = {
  weight_kg: { label: "Weight (kg)", color: COLOR },
} satisfies ChartConfig;

const fatConfig = {
  fat_pct: { label: "Body Fat (%)", color: "hsl(340,60%,50%)" },
} satisfies ChartConfig;

export function BodyDashboard() {
  const { data: cached } = useSWR("health-cache", getHealthCache, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const { date: selectedDate, isToday } = useSelectedDate();
  const { data, error, isLoading } = useSWR(["body", selectedDate], () => getHealthCombined(30, isToday ? undefined : selectedDate), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  usePageHeader("body", isLoading);
  const withingsRows = data?.withings ?? cached?.withings ?? [];
  const loading = isLoading && withingsRows.length === 0;

  const latestWeight: WithingsRow = [...withingsRows].reverse().find(r => r.weight_kg != null) ?? ({} as WithingsRow);
  const latestFat: WithingsRow = [...withingsRows].reverse().find(r => r.fat_pct != null) ?? ({} as WithingsRow);

  const today = new Date().toISOString().slice(0, 10);
  const weightDate = latestWeight.date ?? null;
  const subtitle = weightDate && weightDate !== today ? formatDate(weightDate) : undefined;

  const withingsWithWeight = useMemo(() => withingsRows.filter(r => r.weight_kg != null), [withingsRows]);
  const withingsWithFat = useMemo(() => withingsRows.filter(r => r.fat_pct != null), [withingsRows]);

  // Compute rate of change (last 7 days vs previous 7 days)
  const weightDelta = useMemo(() => {
    const recent = withingsWithWeight.slice(-7);
    const prior = withingsWithWeight.slice(-14, -7);
    if (recent.length === 0 || prior.length === 0) return null;
    const recentAvg = recent.reduce((s, r) => s + (r.weight_kg ?? 0), 0) / recent.length;
    const priorAvg = prior.reduce((s, r) => s + (r.weight_kg ?? 0), 0) / prior.length;
    return Number((recentAvg - priorAvg).toFixed(1));
  }, [withingsWithWeight]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>*]:min-w-0">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="mb-4 h-[200px] animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </main>
    );
  }

  return (
    <main data-section="body" className="mx-auto min-h-screen w-full min-w-0 max-w-6xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8">





      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="mb-4 grid min-w-0 gap-2 sm:grid-cols-3 sm:gap-3 [&>*]:min-w-0">
        <StatCard label="Weight" value={latestWeight.weight_kg ?? null} unit="kg" color={COLOR} sublabel={subtitle} direction="down" />
        <StatCard label="Body Fat" value={latestFat.fat_pct ?? null} unit="%" color="hsl(340,60%,50%)" sublabel={subtitle} direction="down" target="10–15%" />
        <StatCard
          label="Weekly Δ"
          value={weightDelta !== null ? `${weightDelta > 0 ? "+" : ""}${weightDelta}` : null}
          unit="kg"
          color={weightDelta !== null && weightDelta <= 0 ? COLOR : "hsl(0,60%,50%)"}
          sublabel="7d avg vs prior 7d"
          direction="down"
        />
      </div>

      {/* Weight chart — 30 days */}
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {withingsWithWeight.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Weight <span className="text-xs font-normal" style={{ color: COLOR }}>30 days</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={weightConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithWeight} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(withingsWithWeight.length / 6))}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={["dataMin - 0.5", "dataMax + 0.5"]} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="weight_kg" stroke="var(--color-weight_kg)"
                    strokeWidth={2} dot={{ r: 2.5 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithFat.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Body Fat <span className="text-xs font-normal" style={{ color: "hsl(340,60%,50%)" }}>↓ 10–15%</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={fatConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithFat} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(withingsWithFat.length / 6))}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}%`} />
                  <ReferenceLine y={15} stroke="hsl(340,40%,50%)" strokeDasharray="6 3" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="fat_pct" stroke="var(--color-fat_pct)"
                    strokeWidth={2} dot={{ r: 2.5 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <SectionStatusBar section="body" />
    </main>
  );
}
