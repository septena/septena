"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageHeader } from "@/components/page-header-context";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine, ReferenceArea } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionStatusBar } from "@/components/section-status-bar";
import {
  getAirSummary,
  getAirReadings,
  getAirHistory,
  type AirTimeSeriesPoint,
} from "@/lib/api";
import { useSectionColor } from "@/hooks/use-sections";
import { formatWeekdayTick } from "@/lib/date-utils";
import { StatCard } from "@/components/stat-card";

const CO2_BAND_COLOR: Record<string, string> = {
  good: "hsl(150,55%,45%)",
  ok:   "hsl(45,80%,50%)",
  poor: "hsl(25,85%,55%)",
  bad:  "hsl(0,70%,52%)",
};

const tempConfig = {
  temp_c: { label: "Temp (°C)", color: "hsl(15,75%,55%)" },
} satisfies ChartConfig;

const humConfig = {
  humidity_pct: { label: "Humidity (%)", color: "hsl(220,60%,55%)" },
} satisfies ChartConfig;

function formatHourTick(iso: string) {
  // iso: "YYYY-MM-DDTHH:MM"
  return iso.slice(11, 16);
}

export function AirDashboard() {
  const COLOR = useSectionColor("air");
  const co2Config = {
    co2_ppm: { label: "CO₂ (ppm)", color: COLOR },
  } satisfies ChartConfig;
  const { data: summary, isLoading: sumLoading } = useSWR("air-summary", getAirSummary, { refreshInterval: 60_000 });
  const { data: readings, isLoading: rLoading } = useSWR("air-readings-1", () => getAirReadings(1), { refreshInterval: 60_000 });
  const { data: history, isLoading: hLoading } = useSWR("air-history-7", () => getAirHistory(7), { refreshInterval: 60_000 });

  usePageHeader("air", sumLoading || rLoading || hLoading);

  const today = summary?.today;
  const latest = summary?.latest ?? null;
  const band = summary?.co2_band ?? null;
  const bandColor = band ? CO2_BAND_COLOR[band] : COLOR;

  const todaySeries = useMemo<AirTimeSeriesPoint[]>(() => readings?.readings ?? [], [readings]);
  const hasCo2 = todaySeries.some(p => p.co2_ppm != null);

  const loading = sumLoading && !summary;

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
        <div className="h-[240px] animate-pulse rounded-xl border border-border bg-muted/30" />
      </main>
    );
  }

  const noData = !latest;

  return (
    <main data-section="air" className="mx-auto min-h-screen w-full min-w-0 max-w-6xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      {noData && (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/10">
          <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300">
            No Aranet readings yet. Run{" "}
            <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">scripts/aranet_poller.py</code>{" "}
            to do an initial backfill.
          </CardContent>
        </Card>
      )}

      {/* Headline stats */}
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 [&>*]:min-w-0">
        <StatCard
          label="CO₂ Now"
          value={latest?.co2_ppm ?? null}
          unit="ppm"
          color={bandColor}
          sublabel={band ? band.toUpperCase() : undefined}
          direction="down"
          target="< 1000"
        />
        <StatCard
          label="Temp"
          value={latest?.temp_c != null ? latest.temp_c.toFixed(1) : null}
          unit="°C"
          color="hsl(15,75%,55%)"
        />
        <StatCard
          label="Humidity"
          value={latest?.humidity_pct ?? null}
          unit="%"
          color="hsl(220,60%,55%)"
          target="40–60%"
        />
        <StatCard
          label="Today > 1000"
          value={today?.minutes_over_1000 ?? 0}
          unit="min"
          color={today && today.minutes_over_1000 > 0 ? "hsl(0,70%,52%)" : COLOR}
          direction="down"
        />
      </div>

      {/* CO2 today */}
      {hasCo2 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              CO₂ Today{" "}
              <span className="text-xs font-normal" style={{ color: COLOR }}>
                {today?.co2_avg ? `avg ${today.co2_avg} / max ${today.co2_max} ppm` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-4">
            <ChartContainer config={co2Config} className="h-[240px] w-full">
              <LineChart data={todaySeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="datetime"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatHourTick(v as string)}
                  tick={{ fontSize: 10 }}
                  minTickGap={32}
                />
                <YAxis tickLine={false} axisLine={false} domain={[400, "auto"]} width={40} tickFormatter={(v: number) => `${Math.round(v)}`} />
                {/* Health bands */}
                <ReferenceArea y1={1000} y2={1400} fill="hsl(25,85%,55%)" fillOpacity={0.06} />
                <ReferenceArea y1={1400} y2={5000} fill="hsl(0,70%,52%)" fillOpacity={0.08} />
                <ReferenceLine y={1000} stroke="hsl(25,85%,55%)" strokeDasharray="6 3" strokeOpacity={0.6} />
                <ReferenceLine y={1400} stroke="hsl(0,70%,52%)" strokeDasharray="6 3" strokeOpacity={0.6} />
                <Line
                  type="monotone"
                  dataKey="co2_ppm"
                  stroke="var(--color-co2_ppm)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Temp + humidity side-by-side */}
      {todaySeries.length > 0 && (
        <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>Temperature <span className="text-xs font-normal text-muted-foreground">today</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={tempConfig} className="h-[160px] w-full">
                <LineChart data={todaySeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="datetime" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatHourTick(v as string)} tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis tickLine={false} axisLine={false} domain={["dataMin - 0.5", "dataMax + 0.5"]} width={36}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`} />
                  <Line type="monotone" dataKey="temp_c" stroke="var(--color-temp_c)"
                    strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Humidity <span className="text-xs font-normal text-muted-foreground">today</span></CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={humConfig} className="h-[160px] w-full">
                <LineChart data={todaySeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="datetime" tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatHourTick(v as string)} tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 100]} width={36}
                    tickFormatter={(v: number) => `${v}%`} />
                  <ReferenceLine y={40} stroke="hsl(220,40%,55%)" strokeDasharray="6 3" strokeOpacity={0.4} />
                  <ReferenceLine y={60} stroke="hsl(220,40%,55%)" strokeDasharray="6 3" strokeOpacity={0.4} />
                  <Line type="monotone" dataKey="humidity_pct" stroke="var(--color-humidity_pct)"
                    strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 7-day daily CO2 max */}
      {history && history.daily.some(d => d.co2_max != null) && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>CO₂ 7-Day Max <span className="text-xs font-normal text-muted-foreground">daily peak</span></CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-4">
            <ChartContainer config={co2Config} className="h-[180px] w-full">
              <LineChart data={history.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} domain={[400, "auto"]} width={40}
                  tickFormatter={(v: number) => `${Math.round(v)}`} />
                <ReferenceLine y={1000} stroke="hsl(25,85%,55%)" strokeDasharray="6 3" strokeOpacity={0.6} />
                <Line type="monotone" dataKey="co2_max" stroke="var(--color-co2_ppm)"
                  strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <SectionStatusBar section="air" />
    </main>
  );
}
