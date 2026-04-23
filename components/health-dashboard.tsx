"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageHeader } from "@/components/page-header-context";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis, Tooltip } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  getHealthCombined,
  getHealthCache,
  type OuraRow,
  type AppleRow,
} from "@/lib/api";
import { formatDateShort as formatDate } from "@/lib/date-utils";
import { CHART_GRID, WEEKDAY_X_AXIS, Y_AXIS } from "@/lib/chart-defaults";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { useSelectedDate } from "@/hooks/use-selected-date";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}

function ScoreRing({ value, label, color, max = 100, unit = "", subtitle, direction, target }: {
  value: number | null;
  label: string;
  color: string;
  max?: number;
  unit?: string;
  subtitle?: string;
  direction?: "up" | "down";
  target?: string;
}) {
  if (value === null && !subtitle) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-4">
        <p className="text-3xl font-semibold" style={{ color }}>—</p>
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
          {value !== null ? value : "—"}{unit && value !== null && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}
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

const stepsConfig = {
  steps: { label: "Steps", color: "hsl(270,60%,55%)" },
} satisfies ChartConfig;

const calConfig = {
  active_cal: { label: "Active Cal", color: "hsl(30,80%,50%)" },
} satisfies ChartConfig;

const vo2Config = {
  vo2_max: { label: "VO2 Max", color: "hsl(280,60%,55%)" },
} satisfies ChartConfig;

const hrvConfig = {
  hrv: { label: "HRV (ms)", color: "hsl(270,60%,55%)" },
  resting_heart_rate: { label: "Resting HR", color: "hsl(0,70%,50%)" },
} satisfies ChartConfig;


function LoadingSkeleton() {
  return (
    <>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/30" />
        ))}
      </div>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/30" />
        ))}
      </div>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="mb-4 h-[180px] animate-pulse rounded-xl border border-border bg-muted/30" />
      ))}
    </>
  );
}

export function HealthDashboard() {
  const barAnim = useBarAnimation();
  // Load cache instantly, then revalidate with fresh API data
  const { data: cached } = useSWR("health-cache", getHealthCache, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const { date: selectedDate, isToday } = useSelectedDate();
  const { data, error, isLoading } = useSWR(["health", selectedDate], () => getHealthCombined(7, isToday ? undefined : selectedDate), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  usePageHeader("health", isLoading);
  const appleRows = data?.apple ?? cached?.apple ?? [];
  const ouraRows = data?.oura ?? cached?.oura ?? [];
  const withingsRows = data?.withings ?? cached?.withings ?? [];
  const loading = isLoading && appleRows.length === 0 && ouraRows.length === 0;


  // Find the most recent row that has each specific metric (not just any data).
  // This avoids today\'s sparse row hiding yesterday\'s complete data.
  const getLatest = <T,>(rows: T[], predicate: (r: T) => boolean): T | undefined =>
    [...rows].reverse().find(predicate);

  const latestOuraReadiness = getLatest(ouraRows, r => r.readiness_score != null) ?? ({} as OuraRow);
  const latestOuraHRV = getLatest(ouraRows, r => r.hrv != null) ?? ({} as OuraRow);
  const latestAppleVO2 = getLatest(appleRows, r => r.vo2_max != null) ?? ({} as AppleRow);
  const latestAppleSpO2 = getLatest(appleRows, r => r.spo2 != null) ?? ({} as AppleRow);
  const latestAppleRHR = getLatest(appleRows, r => r.resting_heart_rate != null) ?? ({} as AppleRow);
  const latestAppleResp = getLatest(appleRows, r => r.respiratory_rate != null) ?? ({} as AppleRow);
  const latestAppleCardio = getLatest(appleRows, r => r.cardio_recovery != null) ?? ({} as AppleRow);
  const latestAppleSteps = getLatest(appleRows, r => r.steps != null) ?? ({} as AppleRow);
  const today = new Date().toISOString().slice(0, 10);
  const appleDate = latestAppleSteps.date ?? null;
  const ouraDate = latestOuraReadiness.date ?? null;
  const appleSubtitle = appleDate && appleDate !== today ? formatDate(appleDate) : undefined;
  const ouraSubtitle = ouraDate && ouraDate !== today ? formatDate(ouraDate) : undefined;

  // Slice all data to last 7 entries for charts
  const apple7 = useMemo(() => appleRows.slice(-7), [appleRows]);
  const oura7 = useMemo(() => ouraRows.slice(-7), [ouraRows]);

  if (loading) return <LoadingSkeleton />;

  return (
    <>





      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      {/* Source scores */}
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
        <ScoreRing value={latestOuraReadiness.readiness_score ?? null} label="Readiness" color="hsl(140,60%,45%)" subtitle={ouraSubtitle} direction="up" target="85+" />
        <ScoreRing value={latestAppleVO2.vo2_max ?? null} label="VO2 Max" color="hsl(280,60%,55%)" max={60} subtitle={appleSubtitle} direction="up" target="40+" />
        <ScoreRing value={latestAppleSpO2.spo2 ?? null} label="SpO2 %" color="hsl(270,60%,55%)" max={100} subtitle={appleSubtitle} direction="up" target="95–100%" />
        <ScoreRing value={latestAppleCardio.cardio_recovery ?? null} label="Cardio Rec." color="hsl(330,60%,50%)" max={40} subtitle={appleSubtitle} direction="up" target="25+" />
      </div>

      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>*]:min-w-0">
        <ScoreRing value={latestOuraHRV.hrv ?? null} label="HRV (ms)" color="hsl(270,60%,55%)" max={150} subtitle={ouraSubtitle} direction="up" target="50+" />
        <ScoreRing value={latestAppleRHR.resting_heart_rate ?? null} label="Resting HR" color="hsl(0,70%,50%)" max={100} subtitle={appleSubtitle} direction="down" target="50–60" />
        <ScoreRing value={latestAppleResp.respiratory_rate ?? null} label="Resp Rate" color="hsl(150,60%,40%)" max={30} subtitle={appleSubtitle} direction="down" target="12–18" />
      </div>

      {/* Key stats */}
      <div className="mb-4 grid min-w-0 gap-2 sm:grid-cols-2 sm:gap-3 [&>*]:min-w-0">
        <StatCard label="Steps" value={latestAppleSteps.steps != null ? fmt(latestAppleSteps.steps) : null} unit="" color="hsl(270,60%,55%)" sublabel={appleSubtitle} direction="up" target="10k+" />
      </div>


      {/* Charts — 2-col on lg */}
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Steps */}
        {apple7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Steps <span className="text-xs font-normal" style={{ color: "hsl(270,60%,55%)" }}>↑ 10k+</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-4">
              <ChartContainer config={stepsConfig} className="h-[160px] w-full overflow-hidden">
                <BarChart data={apple7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={0} />
                  <YAxis {...Y_AXIS} width={44}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <ReferenceLine y={10000} stroke="hsl(270,40%,50%)" strokeDasharray="6 3" strokeOpacity={0.5} />
                  <Tooltip cursor={false} formatter={(v) => [fmt(v as number), "Steps"]} />
                  <Bar dataKey="steps" fill="var(--color-steps)" radius={[2, 2, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Active calories */}
        {apple7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active Calories <span className="text-xs font-normal" style={{ color: "hsl(30,80%,50%)" }}>↑</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-4">
              <ChartContainer config={calConfig} className="h-[160px] w-full overflow-hidden">
                <BarChart data={apple7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={0} />
                  <YAxis {...Y_AXIS} tickFormatter={(v: number) => fmt(v)} />
                  <Tooltip cursor={false} formatter={(v) => [fmt(v as number), "kcal"]} />
                  <Bar dataKey="active_cal" fill="var(--color-active_cal)" radius={[2, 2, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* VO2 Max */}
        {apple7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>VO2 Max <span className="text-xs font-normal" style={{ color: "hsl(280,60%,55%)" }}>↑ 40+</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-4">
              <ChartContainer config={vo2Config} className="h-[160px] w-full overflow-hidden">
                <LineChart data={apple7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={0} />
                  <YAxis {...Y_AXIS} domain={[30, 45]} width={28} />
                  <ReferenceLine y={40} stroke="hsl(280,40%,50%)" strokeDasharray="6 3" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="vo2_max" stroke="var(--color-vo2_max)"
                    strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* HRV + Resting HR */}
        {oura7.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>HRV <span className="text-xs font-normal" style={{ color: "hsl(270,60%,55%)" }}>↑</span> & Resting HR <span className="text-xs font-normal" style={{ color: "hsl(0,70%,50%)" }}>↓</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-4">
              <ChartContainer config={hrvConfig} className="h-[160px] w-full overflow-hidden">
                <LineChart data={oura7} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={0} />
                  <YAxis {...Y_AXIS} domain={["auto", "auto"]} width={28} />
                  <Line type="monotone" dataKey="hrv" stroke="var(--color-hrv)"
                    strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="resting_hr" stroke="var(--color-resting_heart_rate)"
                    strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

      </div>


      {/* All Apple Health metrics table */}
      {apple7.length > 0 && (
        <Card className="mb-4 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Apple Health — All Metrics</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 overflow-x-auto px-4">
            <table className="min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="whitespace-nowrap pb-2 pr-3">Date</th>
                  <th className="whitespace-nowrap pb-2 pr-3">Steps</th>
                  <th className="whitespace-nowrap pb-2 pr-3">Cal</th>
                  <th className="whitespace-nowrap pb-2 pr-3">VO2</th>
                  <th className="whitespace-nowrap pb-2 pr-3">HRV</th>
                  <th className="whitespace-nowrap pb-2 pr-3">RHR</th>
                  <th className="hidden pb-2 pr-3 sm:table-cell">Resp</th>
                  <th className="hidden pb-2 pr-3 sm:table-cell">SpO2</th>
                  <th className="hidden pb-2 pr-3 sm:table-cell">CRec</th>
                </tr>
              </thead>
              <tbody>
                {[...apple7].reverse().map((row) => (
                  <tr key={row.date} className="border-b border-border/50">
                    <td className="whitespace-nowrap py-2 pr-3">{formatDate(row.date)}</td>
                    <td className="py-2 pr-3">{fmt(row.steps)}</td>
                    <td className="py-2 pr-3">{fmt(row.active_cal)}</td>
                    <td className="py-2 pr-3">{row.vo2_max ?? "—"}</td>
                    <td className="py-2 pr-3">{row.hrv ?? "—"}</td>
                    <td className="py-2 pr-3">{row.resting_heart_rate ?? "—"}</td>
                    <td className="hidden py-2 pr-3 sm:table-cell">{row.respiratory_rate ?? "—"}</td>
                    <td className="hidden py-2 pr-3 sm:table-cell">{row.spo2 != null ? `${row.spo2}%` : "—"}</td>
                    <td className="hidden py-2 pr-3 sm:table-cell">{row.cardio_recovery ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

    </>
  );
}
