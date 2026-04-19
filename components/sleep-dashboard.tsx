"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageHeader } from "@/components/page-header-context";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionStatusBar } from "@/components/section-status-bar";
import {
  getHealthCombined,
  getHealthCache,
  type OuraRow,
  type AppleRow,
} from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { formatDateShort as formatDate, formatWeekdayTick } from "@/lib/date-utils";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { useSelectedDate } from "@/hooks/use-selected-date";

const SLEEP = SECTIONS.sleep;
const COLOR = SLEEP.color;

function ScoreRing({ value, label, color, max = 100, subtitle, direction, target }: {
  value: number | null;
  label: string;
  color: string;
  max?: number;
  subtitle?: string;
  direction?: "up" | "down";
  target?: string;
}) {
  if (value === null && !subtitle) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-4">
        <p className="text-3xl font-semibold" style={{ color: COLOR }}>—</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    );
  }
  const pct = value !== null ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-4">
      <div className="relative flex items-center justify-center">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3"
            className="text-muted" />
          <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeDasharray={`${pct} 100`}
            strokeDashoffset="0" strokeLinecap="round" style={{ stroke: color }} />
        </svg>
        <span className="absolute text-xl font-semibold">
          {value !== null ? value : "—"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {label}
        {direction && (
          <span className="ml-1 text-[10px] text-muted-foreground/60" title={direction === "up" ? "Higher is better" : "Lower is better"}>
            {direction === "up" ? "↑" : "↓"}
          </span>
        )}
      </p>
      {target && <p className="mt-0.5 text-[10px] text-muted-foreground/60">{target}</p>}
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground italic">{subtitle}</p>}
    </div>
  );
}

const sleepScoreConfig = {
  sleep_score: { label: "Sleep Score", color: COLOR },
  readiness_score: { label: "Readiness", color: "hsl(140,60%,45%)" },
} satisfies ChartConfig;

const sleepStagesConfig = {
  deep_h: { label: "Deep", color: "hsl(250,65%,25%)" },
  rem_h: { label: "REM", color: "hsl(275,50%,55%)" },
  light_h: { label: "Light", color: "hsl(230,35%,68%)" },
} satisfies ChartConfig;

const totalConfig = {
  total_h: { label: "Total Sleep", color: COLOR },
} satisfies ChartConfig;

export function SleepDashboard() {
  const barAnim = useBarAnimation();
  const { data: cached } = useSWR("health-cache", getHealthCache, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const { date: selectedDate, isToday } = useSelectedDate();
  const { data, error, isLoading } = useSWR(["sleep", selectedDate], () => getHealthCombined(7, isToday ? undefined : selectedDate), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  usePageHeader("sleep", isLoading);
  const ouraRows = data?.oura ?? cached?.oura ?? [];
  const appleRows = data?.apple ?? cached?.apple ?? [];
  const loading = isLoading && ouraRows.length === 0 && appleRows.length === 0;

  const getLatest = <T,>(rows: T[], predicate: (r: T) => boolean): T | undefined =>
    [...rows].reverse().find(predicate);

  const latestOuraSleep = getLatest(ouraRows, r => r.sleep_score != null || r.efficiency != null) ?? ({} as OuraRow);
  const latestOuraTotal = getLatest(ouraRows, r => r.total_h != null) ?? ({} as OuraRow);
  const latestOuraDeep = getLatest(ouraRows, r => r.deep_h != null) ?? ({} as OuraRow);
  const latestOuraREM = getLatest(ouraRows, r => r.rem_h != null) ?? ({} as OuraRow);
  const latestOuraReadiness = getLatest(ouraRows, r => r.readiness_score != null) ?? ({} as OuraRow);
  const latestAppleTotalSleep = getLatest(appleRows, r => r.apple_total_h != null) ?? ({} as AppleRow);
  const latestAppleDeepSleep = getLatest(appleRows, r => r.apple_deep_h != null) ?? ({} as AppleRow);
  const latestAppleREMSleep = getLatest(appleRows, r => r.apple_rem_h != null) ?? ({} as AppleRow);

  const today = new Date().toISOString().slice(0, 10);
  const ouraDate = latestOuraSleep.date ?? null;
  const ouraSubtitle = ouraDate && ouraDate !== today ? formatDate(ouraDate) : undefined;

  const oura7 = useMemo(() => ouraRows.slice(-7), [ouraRows]);

  // Bedtime / wake time from latest
  const latestBedtime = getLatest(ouraRows, r => r.bedtime != null);
  const latestWake = getLatest(ouraRows, r => r.wake_time != null);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/30" />
          ))}
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="mb-4 h-[180px] animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </main>
    );
  }

  return (
    <main data-section="sleep" className="mx-auto min-h-screen w-full min-w-0 max-w-6xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8">





      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      {/* Scores */}
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
        <ScoreRing value={latestOuraSleep.sleep_score ?? latestOuraSleep.efficiency ?? null} label="Sleep Score" color={COLOR} subtitle={ouraSubtitle} direction="up" target="85+" />
        <ScoreRing value={latestOuraReadiness.readiness_score ?? null} label="Readiness" color="hsl(140,60%,45%)" subtitle={ouraSubtitle} direction="up" target="85+" />
        <ScoreRing value={latestOuraSleep.efficiency ?? null} label="Efficiency" color="hsl(220,40%,65%)" subtitle={ouraSubtitle} direction="up" target="85%+" />
        <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card p-4">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bedtime</p>
            <p className="text-lg font-semibold">{latestBedtime?.bedtime ?? "—"}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Wake</p>
            <p className="text-lg font-semibold">{latestWake?.wake_time ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Duration stats */}
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>*]:min-w-0">
        <StatCard label="Total Sleep" value={latestOuraTotal.total_h ?? latestAppleTotalSleep.apple_total_h ?? null} unit="hrs" color={COLOR} sublabel={ouraSubtitle} direction="up" target="7–9 hrs" />
        <StatCard label="Deep Sleep" value={latestOuraDeep.deep_h ?? latestAppleDeepSleep.apple_deep_h ?? null} unit="hrs" sublabel={ouraSubtitle} direction="up" target="1–2 hrs" />
        <StatCard label="REM Sleep" value={latestOuraREM.rem_h ?? latestAppleREMSleep.apple_rem_h ?? null} unit="hrs" sublabel={ouraSubtitle} direction="up" target="1.5–2 hrs" />
      </div>

      {/* Charts */}
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Sleep & Readiness score trend */}
        {oura7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sleep <span className="text-xs font-normal" style={{ color: COLOR }}>↑</span> & Readiness <span className="text-xs font-normal" style={{ color: "hsl(140,60%,45%)" }}>↑ 85+</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={sleepScoreConfig} className="h-[160px] w-full">
                <LineChart data={oura7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0}
                    tickFormatter={(v) => formatWeekdayTick(v)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 100]} width={28} />
                  <ReferenceLine y={85} stroke="hsl(140,40%,45%)" strokeDasharray="6 3" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="sleep_score" stroke="var(--color-sleep_score)"
                    strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="readiness_score" stroke="var(--color-readiness_score)"
                    strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Sleep stages */}
        {oura7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sleep Stages</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={sleepStagesConfig} className="h-[160px] w-full">
                <BarChart data={oura7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0}
                    tickFormatter={(v) => formatWeekdayTick(v)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 10]} width={28} />
                  <Bar dataKey="deep_h" stackId="a" fill="var(--color-deep_h)" radius={[0, 0, 0, 0]} {...barAnim} />
                  <Bar dataKey="rem_h" stackId="a" fill="var(--color-rem_h)" radius={[0, 0, 0, 0]} {...barAnim} />
                  <Bar dataKey="light_h" stackId="a" fill="var(--color-light_h)" radius={[2, 2, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Total sleep duration trend */}
        {oura7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Total Sleep <span className="text-xs font-normal" style={{ color: COLOR }}>↑ 7–9h</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={totalConfig} className="h-[160px] w-full">
                <LineChart data={oura7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0}
                    tickFormatter={(v) => formatWeekdayTick(v)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 10]} width={28} />
                  <ReferenceLine y={7} stroke={COLOR} strokeDasharray="6 3" strokeOpacity={0.4} />
                  <Line type="monotone" dataKey="total_h" stroke="var(--color-total_h)"
                    strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <SectionStatusBar section="sleep" />
    </main>
  );
}
