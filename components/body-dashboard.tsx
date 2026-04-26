"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageHeader } from "@/components/page-header-context";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  getHealthCombined,
  getHealthCache,
  getSettings,
  type WithingsRow,
} from "@/lib/api";
import { formatDateShort as formatDate } from "@/lib/date-utils";
import { CHART_GRID, WEEKDAY_X_AXIS, Y_AXIS } from "@/lib/chart-defaults";
import {
  SECTION_ACCENT,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_STRONG,
} from "@/lib/section-colors";
import { StatCard } from "@/components/stat-card";
import { useSelectedDate } from "@/hooks/use-selected-date";

const fatConfig = {
  fat_pct: { label: "Body Fat (%)", color: SECTION_ACCENT_SHADE_2 },
} satisfies ChartConfig;

function linearTrend(rows: WithingsRow[], key: "weight_kg" | "fat_pct", projectDays = 7) {
  if (rows.length === 0) return null;
  const pts = rows
    .map((r, i) => ({ i, y: r[key] as number | null }))
    .filter((p): p is { i: number; y: number } => p.y != null);
  if (pts.length < 3) return null;
  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.i, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.i * p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.i * p.i, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const last = rows[rows.length - 1].date;
  const [y, m, d] = last.split("-").map(Number);
  const future: string[] = [];
  for (let k = 1; k <= projectDays; k++) {
    const dt = new Date(y, m - 1, d + k);
    future.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }
  return { slope, intercept, lastIndex: rows.length - 1, future };
}

function buildTrendData(rows: WithingsRow[], key: "weight_kg" | "fat_pct", trendKey: string, projectDays = 7) {
  const trend = linearTrend(rows, key, projectDays);
  if (!trend) return { data: rows as Array<Record<string, unknown>>, hasTrend: false, projectedValue: null as number | null, slope: 0, projectDays };
  const actuals = rows.map((r, i) => ({
    ...r,
    [trendKey]: trend.slope * i + trend.intercept,
  }));
  const projected = trend.future.map((date, k) => ({
    date,
    [key]: null,
    [trendKey]: trend.slope * (trend.lastIndex + 1 + k) + trend.intercept,
  }));
  const projectedValue = trend.slope * (trend.lastIndex + projectDays) + trend.intercept;
  return { data: [...actuals, ...projected], hasTrend: true, projectedValue, slope: trend.slope, projectDays };
}

function targetEta(current: number | null, slope: number, min: number | undefined, max: number | undefined): string | null {
  if (current == null || min == null || max == null || !isFinite(slope) || Math.abs(slope) < 1e-4) return null;
  if (current >= min && current <= max) return "in target";
  const goal = current > max ? max : min;
  const days = (goal - current) / slope;
  if (days <= 0 || !isFinite(days)) return null;
  if (days > 365) return ">1y to target";
  if (days < 14) return `${Math.round(days)}d to target`;
  if (days < 90) return `${Math.round(days / 7)}w to target`;
  return `${Math.round(days / 30)}mo to target`;
}

const boneConfig = {
  bone_mineral_kg: { label: "Bone (kg)", color: SECTION_ACCENT_SHADE_3 },
} satisfies ChartConfig;

const vascularConfig = {
  vascular_age: { label: "Vascular Age", color: SECTION_ACCENT_STRONG },
} satisfies ChartConfig;

const spo2Config = {
  spo2_pct: { label: "SpO2 (%)", color: SECTION_ACCENT },
} satisfies ChartConfig;

const pulseConfig = {
  pulse_wave_mps: { label: "Pulse Wave (m/s)", color: SECTION_ACCENT_STRONG },
} satisfies ChartConfig;

const fatRatioConfig = {
  fat_ratio_pct: { label: "Fat Ratio (%)", color: SECTION_ACCENT_SHADE_2 },
} satisfies ChartConfig;

export function BodyDashboard() {
  const COLOR = SECTION_ACCENT;
  const weightConfig = {
    weight_kg: { label: "Weight (kg)", color: COLOR },
  } satisfies ChartConfig;
  const { data: settings } = useSWR("settings", getSettings);
  const targets = settings?.targets;
  const { data: cached } = useSWR("health-cache", getHealthCache, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const { date: selectedDate, isToday } = useSelectedDate();
  const { data, error, isLoading } = useSWR(["body", selectedDate], () => getHealthCombined(21, isToday ? undefined : selectedDate), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  usePageHeader("body", isLoading);
  const withingsRows = data?.withings ?? cached?.withings ?? [];
  const loading = isLoading && withingsRows.length === 0;

  const latestWeight: WithingsRow = [...withingsRows].reverse().find(r => r.weight_kg != null) ?? ({} as WithingsRow);
  const latestFat: WithingsRow = [...withingsRows].reverse().find(r => r.fat_pct != null) ?? ({} as WithingsRow);
  const latestBone: WithingsRow = [...withingsRows].reverse().find(r => r.bone_mineral_kg != null) ?? ({} as WithingsRow);
  const latestVascular: WithingsRow = [...withingsRows].reverse().find(r => r.vascular_age != null) ?? ({} as WithingsRow);
  const latestSpo2: WithingsRow = [...withingsRows].reverse().find(r => r.spo2_pct != null) ?? ({} as WithingsRow);
  const latestPulse: WithingsRow = [...withingsRows].reverse().find(r => r.pulse_wave_mps != null) ?? ({} as WithingsRow);

  const today = new Date().toISOString().slice(0, 10);
  const weightDate = latestWeight.date ?? null;
  const subtitle = weightDate && weightDate !== today ? formatDate(weightDate) : undefined;

  const withingsWithWeight = useMemo(() => withingsRows.filter(r => r.weight_kg != null), [withingsRows]);
  const withingsWithFat = useMemo(() => withingsRows.filter(r => r.fat_pct != null), [withingsRows]);
  const withingsWithBone = useMemo(() => withingsRows.filter(r => r.bone_mineral_kg != null), [withingsRows]);
  const withingsWithVascular = useMemo(() => withingsRows.filter(r => r.vascular_age != null), [withingsRows]);
  const withingsWithSpo2 = useMemo(() => withingsRows.filter(r => r.spo2_pct != null), [withingsRows]);
  const withingsWithPulse = useMemo(() => withingsRows.filter(r => r.pulse_wave_mps != null), [withingsRows]);
  const withingsWithFatRatio = useMemo(() => withingsRows.filter(r => r.fat_ratio_pct != null), [withingsRows]);
  const weightChart = useMemo(() => buildTrendData(withingsWithWeight, "weight_kg", "weight_kg_trend"), [withingsWithWeight]);
  const fatChart = useMemo(() => buildTrendData(withingsWithFat, "fat_pct", "fat_pct_trend"), [withingsWithFat]);
  const weekDividers = useMemo(() => {
    const out: string[] = [];
    for (const r of withingsWithWeight) {
      const [y, m, d] = r.date.split("-").map(Number);
      if (new Date(y, m - 1, d).getDay() === 1) out.push(r.date);
    }
    return out;
  }, [withingsWithWeight]);

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
      <>
        <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>*]:min-w-0">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="mb-4 h-[200px] animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </>
    );
  }

  return (
    <>





      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7 [&>*]:min-w-0">
        <StatCard label="Weight" value={latestWeight.weight_kg ?? null} unit="kg" color={COLOR} sublabel={subtitle} direction="down" />
        <StatCard label="Body Fat" value={latestFat.fat_pct ?? null} unit="%" color={SECTION_ACCENT_SHADE_2} sublabel={subtitle} direction="down" target={targets?.fat_min_pct && targets?.fat_max_pct ? `${targets.fat_min_pct}–${targets.fat_max_pct}%` : undefined} />
        <StatCard
          label="Weekly Δ"
          value={weightDelta !== null ? `${weightDelta > 0 ? "+" : ""}${weightDelta}` : null}
          unit="kg"
          color={weightDelta !== null && weightDelta <= 0 ? COLOR : SECTION_ACCENT_STRONG}
          sublabel="7d avg vs prior 7d"
          direction="down"
        />
        {latestBone.bone_mineral_kg != null && (
          <StatCard label="Bone" value={latestBone.bone_mineral_kg} unit="kg" color={SECTION_ACCENT_SHADE_3} sublabel={latestBone.date ? formatDate(latestBone.date) : undefined} />
        )}
        {latestVascular.vascular_age != null && (
          <StatCard label="Vascular Age" value={latestVascular.vascular_age} unit="" color={SECTION_ACCENT_STRONG} sublabel={latestVascular.date ? formatDate(latestVascular.date) : undefined} />
        )}
        {latestSpo2.spo2_pct != null && (
          <StatCard label="SpO2" value={latestSpo2.spo2_pct} unit="%" color={SECTION_ACCENT} sublabel={latestSpo2.date ? formatDate(latestSpo2.date) : undefined} />
        )}
        {latestPulse.pulse_wave_mps != null && (
          <StatCard label="Pulse Wave" value={latestPulse.pulse_wave_mps} unit="m/s" color={SECTION_ACCENT_STRONG} sublabel={latestPulse.date ? formatDate(latestPulse.date) : undefined} />
        )}
      </div>

      {/* Charts */}
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {withingsWithWeight.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                Weight{" "}
                <span className="text-xs font-normal" style={{ color: COLOR }}>{targets?.weight_min_kg && targets?.weight_max_kg ? `${targets.weight_min_kg}–${targets.weight_max_kg} kg` : ""}</span>
                {weightChart.hasTrend && weightChart.projectedValue != null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    → {weightChart.projectedValue.toFixed(1)} kg in {weightChart.projectDays}d
                    {(() => {
                      const eta = targetEta(latestWeight.weight_kg ?? null, weightChart.slope, targets?.weight_min_kg, targets?.weight_max_kg);
                      return eta ? ` · ${eta}` : "";
                    })()}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={weightConfig} className="h-[200px] w-full">
                <LineChart data={weightChart.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS} domain={["dataMin - 0.5", "dataMax + 0.5"]}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="weight_kg" stroke="var(--color-weight_kg)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weightChart.hasTrend && (
                    <Line type="linear" dataKey="weight_kg_trend" stroke="var(--color-weight_kg)"
                      strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4"
                      dot={false} isAnimationActive={false} />
                  )}
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithFat.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                Body Fat{" "}
                <span className="text-xs font-normal" style={{ color: SECTION_ACCENT_SHADE_2 }}>↓ 10–15%</span>
                {fatChart.hasTrend && fatChart.projectedValue != null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    → {fatChart.projectedValue.toFixed(1)}% in {fatChart.projectDays}d
                    {(() => {
                      const eta = targetEta(latestFat.fat_pct ?? null, fatChart.slope, targets?.fat_min_pct, targets?.fat_max_pct);
                      return eta ? ` · ${eta}` : "";
                    })()}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={fatConfig} className="h-[200px] w-full">
                <LineChart data={fatChart.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS} domain={["dataMin - 1", "dataMax + 1"]}
                    tickFormatter={(v: number) => `${Math.round(v)}%`} />
                  <ReferenceLine y={15} stroke={SECTION_ACCENT_SHADE_2} strokeDasharray="6 3" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="fat_pct" stroke="var(--color-fat_pct)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {fatChart.hasTrend && (
                    <Line type="linear" dataKey="fat_pct_trend" stroke="var(--color-fat_pct)"
                      strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4"
                      dot={false} isAnimationActive={false} />
                  )}
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithBone.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bone <span className="text-xs font-normal" style={{ color: SECTION_ACCENT_SHADE_3 }}>mineral kg</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={boneConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithBone} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="bone_mineral_kg" stroke="var(--color-bone_mineral_kg)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithVascular.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Vascular Age</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={vascularConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithVascular} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="vascular_age" stroke="var(--color-vascular_age)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithSpo2.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>SpO2</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={spo2Config} className="h-[200px] w-full">
                <LineChart data={withingsWithSpo2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="spo2_pct" stroke="var(--color-spo2_pct)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithPulse.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pulse Wave <span className="text-xs font-normal" style={{ color: SECTION_ACCENT_STRONG }}>m/s</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={pulseConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithPulse} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="pulse_wave_mps" stroke="var(--color-pulse_wave_mps)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithFatRatio.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Fat Ratio</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={fatRatioConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithFatRatio} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} />
                  <YAxis {...Y_AXIS}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="fat_ratio_pct" stroke="var(--color-fat_ratio_pct)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke={SECTION_ACCENT_SHADE_3} strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

      </div>

    </>
  );
}
