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
  getSettings,
  type WithingsRow,
} from "@/lib/api";
import { useSectionColor } from "@/hooks/use-sections";
import { formatDateShort as formatDate, formatWeekdayTick } from "@/lib/date-utils";
import { StatCard } from "@/components/stat-card";
import { useSelectedDate } from "@/hooks/use-selected-date";

const fatConfig = {
  fat_pct: { label: "Body Fat (%)", color: "hsl(340,60%,50%)" },
} satisfies ChartConfig;

const boneConfig = {
  bone_mineral_kg: { label: "Bone (kg)", color: "hsl(33,60%,50%)" },
} satisfies ChartConfig;

const vascularConfig = {
  vascular_age: { label: "Vascular Age", color: "hsl(200,60%,50%)" },
} satisfies ChartConfig;

const spo2Config = {
  spo2_pct: { label: "SpO2 (%)", color: "hsl(200,70%,50%)" },
} satisfies ChartConfig;

const pulseConfig = {
  pulse_wave_mps: { label: "Pulse Wave (m/s)", color: "hsl(270,60%,50%)" },
} satisfies ChartConfig;

const fatRatioConfig = {
  fat_ratio_pct: { label: "Fat Ratio (%)", color: "hsl(142,55%,40%)" },
} satisfies ChartConfig;

export function BodyDashboard() {
  const COLOR = useSectionColor("body");
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
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7 [&>*]:min-w-0">
        <StatCard label="Weight" value={latestWeight.weight_kg ?? null} unit="kg" color={COLOR} sublabel={subtitle} direction="down" />
        <StatCard label="Body Fat" value={latestFat.fat_pct ?? null} unit="%" color="hsl(340,60%,50%)" sublabel={subtitle} direction="down" target={targets?.fat_min_pct && targets?.fat_max_pct ? `${targets.fat_min_pct}–${targets.fat_max_pct}%` : undefined} />
        <StatCard
          label="Weekly Δ"
          value={weightDelta !== null ? `${weightDelta > 0 ? "+" : ""}${weightDelta}` : null}
          unit="kg"
          color={weightDelta !== null && weightDelta <= 0 ? COLOR : "hsl(0,60%,50%)"}
          sublabel="7d avg vs prior 7d"
          direction="down"
        />
        {latestBone.bone_mineral_kg != null && (
          <StatCard label="Bone" value={latestBone.bone_mineral_kg} unit="kg" color="hsl(33,60%,50%)" sublabel={latestBone.date ? formatDate(latestBone.date) : undefined} />
        )}
        {latestVascular.vascular_age != null && (
          <StatCard label="Vascular Age" value={latestVascular.vascular_age} unit="" color="hsl(200,60%,50%)" sublabel={latestVascular.date ? formatDate(latestVascular.date) : undefined} />
        )}
        {latestSpo2.spo2_pct != null && (
          <StatCard label="SpO2" value={latestSpo2.spo2_pct} unit="%" color="hsl(210,60%,50%)" sublabel={latestSpo2.date ? formatDate(latestSpo2.date) : undefined} />
        )}
        {latestPulse.pulse_wave_mps != null && (
          <StatCard label="Pulse Wave" value={latestPulse.pulse_wave_mps} unit="m/s" color="hsl(270,60%,50%)" sublabel={latestPulse.date ? formatDate(latestPulse.date) : undefined} />
        )}
      </div>

      {/* Charts */}
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {withingsWithWeight.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Weight <span className="text-xs font-normal" style={{ color: COLOR }}>{targets?.weight_min_kg && targets?.weight_max_kg ? `${targets.weight_min_kg}–${targets.weight_max_kg} kg` : ""}</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={weightConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithWeight} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={["dataMin - 0.5", "dataMax + 0.5"]} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="weight_kg" stroke="var(--color-weight_kg)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
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
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}%`} />
                  <ReferenceLine y={15} stroke="hsl(340,40%,50%)" strokeDasharray="6 3" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="fat_pct" stroke="var(--color-fat_pct)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithBone.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bone <span className="text-xs font-normal" style={{ color: "hsl(33,60%,50%)" }}>mineral kg</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={boneConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithBone} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="bone_mineral_kg" stroke="hsl(33,60%,50%)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithVascular.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Vascular Age <span className="text-xs font-normal" style={{ color: "hsl(200,60%,50%)" }}></span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={vascularConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithVascular} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="vascular_age" stroke="hsl(200,60%,50%)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithSpo2.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>SpO2 <span className="text-xs font-normal" style={{ color: "hsl(200,70%,50%)" }}></span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={spo2Config} className="h-[200px] w-full">
                <LineChart data={withingsWithSpo2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="spo2_pct" stroke="hsl(200,70%,50%)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithPulse.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pulse Wave <span className="text-xs font-normal" style={{ color: "hsl(270,60%,50%)" }}>m/s</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={pulseConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithPulse} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="pulse_wave_mps" stroke="hsl(270,60%,50%)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {withingsWithFatRatio.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Fat Ratio <span className="text-xs font-normal" style={{ color: "hsl(142,55%,40%)" }}></span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={fatRatioConfig} className="h-[200px] w-full">
                <LineChart data={withingsWithFatRatio} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={36}
                    tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Line type="monotone" dataKey="fat_ratio_pct" stroke="hsl(142,55%,40%)"
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  {weekDividers.map((iso) => (
                    <ReferenceLine key={`w-${iso}`} x={iso} stroke="#94a3b8" strokeOpacity={0.45} />
                  ))}
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
