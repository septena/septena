"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scatter, ScatterChart, CartesianGrid, XAxis, YAxis, ZAxis, ReferenceLine, Tooltip } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  getHealthCombined,
  getEntries,
  getCannabisHistory,
  getNutritionStats,
} from "@/lib/api";
import { SECTIONS } from "@/lib/sections";

const COLOR = SECTIONS.correlations.color;

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return Number(n).toFixed(d);
}

// Pearson r + least-squares linear fit in a single pass. Returns null when
// the x-variance is zero (no line to draw) or the sample is too small. The
// same sums feed both stats, so keeping them together avoids a double loop
// and the risk of the two getting computed off different filtered inputs.
type Fit = { r: number; slope: number; intercept: number; mx: number; my: number };
function linearFit(xs: number[], ys: number[]): Fit | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (dx2 === 0 || denom === 0) return null;
  const slope = num / dx2;
  return {
    r: num / denom,
    slope,
    intercept: my - slope * mx,
    mx,
    my,
  };
}

function CorrelationBadge({ r }: { r: number | null }) {
  if (r === null) return null;
  const abs = Math.abs(r);
  const label = abs < 0.2 ? "weak" : abs < 0.5 ? "moderate" : "strong";
  const dir = r > 0 ? "positive" : "negative";
  const dotColor = abs < 0.2 ? "bg-muted-foreground/40" : abs < 0.5 ? "bg-yellow-500" : r > 0 ? "bg-green-500" : "bg-red-500";
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      r={r.toFixed(2)} · {label} {dir}
    </span>
  );
}

type InsightChartProps = {
  title: string;
  xLabel: string;
  yLabel: string;
  data: { x: number; y: number; date: string }[];
  color: string;
  xUnit?: string;
  yUnit?: string;
  yDomain?: [number | string, number | string];
};

function InsightChart({ title, xLabel, yLabel, data, color, xUnit, yUnit, yDomain }: InsightChartProps) {
  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);
  const fit = linearFit(xs, ys);
  const r = fit?.r ?? null;
  const avgY = fit?.my ?? null;

  // Trendline segment from xMin→xMax on the fitted line. Only show for
  // non-trivial correlations (|r| ≥ 0.2) — at weaker strengths the line is
  // misleading since the scatter cloud is effectively round.
  const trend = useMemo(() => {
    if (!fit || xs.length === 0) return null;
    if (Math.abs(fit.r) < 0.2) return null;
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    return {
      from: { x: xMin, y: fit.slope * xMin + fit.intercept },
      to: { x: xMax, y: fit.slope * xMax + fit.intercept },
    };
  }, [fit, xs]);

  const config = { x: { label: xLabel, color } } satisfies ChartConfig;

  if (data.length < 3) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {title}
          <CorrelationBadge r={r} />
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          {data.length} data points · 30 days
          {fit && trend && (
            <>
              {" · "}
              <span className="text-foreground">
                per +1{xUnit ? ` ${xUnit}` : ""} {xLabel}
                {", "}
                {yLabel} {fit.slope >= 0 ? "↑" : "↓"}
                {" "}
                {Math.abs(fit.slope).toFixed(2)}{yUnit ? ` ${yUnit}` : ""}
              </span>
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden px-4">
        <ChartContainer config={config} className="h-[200px] w-full">
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              domain={["auto", "auto"]}
              label={{ value: `${xLabel}${xUnit ? ` (${xUnit})` : ""}`, position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={{ fontSize: 10 }}
              domain={yDomain ?? ["auto", "auto"]}
              label={{ value: `${yLabel}${yUnit ? ` (${yUnit})` : ""}`, angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <ZAxis type="number" range={[50, 50]} />
            {avgY !== null && (
              <ReferenceLine y={avgY} stroke={color} strokeDasharray="4 3" strokeOpacity={0.25} />
            )}
            {trend && (
              <ReferenceLine
                ifOverflow="extendDomain"
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.9}
                segment={[trend.from, trend.to]}
              />
            )}
            <Tooltip
              cursor={false}
              content={({ payload }) => {
                if (!payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs shadow-sm">
                    <p className="font-medium">{p.date}</p>
                    <p>{xLabel}: {fmt(p.x)}{xUnit ? ` ${xUnit}` : ""}</p>
                    <p>{yLabel}: {fmt(p.y)}{yUnit ? ` ${yUnit}` : ""}</p>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill={color} fillOpacity={0.6} stroke={color} strokeOpacity={0.8} />
          </ScatterChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function InsightsDashboard() {
  const { data, isLoading } = useSWR("insights", async () => {
    const [health, entries, cannabis, nutrition] = await Promise.all([
      getHealthCombined(30),
      getEntries(),
      getCannabisHistory(30),
      getNutritionStats(30),
    ]);
    return { health, entries, cannabis, nutrition };
  }, { refreshInterval: 60_000 });

  const loading = isLoading && !data;

  // Build per-date maps
  const ouraByDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of data?.health?.oura ?? []) map.set(r.date, r);
    return map;
  }, [data?.health?.oura]);

  const withingsByDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of data?.health?.withings ?? []) if (r.weight_kg != null) map.set(r.date, r);
    return map;
  }, [data?.health?.withings]);

  // Training volume per day (total sets × reps × weight for strength)
  const trainingByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data?.entries ?? []) {
      if (!e.date || !e.exercise) continue;
      const w = typeof e.weight === "number" ? e.weight : 0;
      const s = typeof e.sets === "number" ? e.sets : Number(e.sets ?? 0);
      const r = typeof e.reps === "number" ? e.reps : Number(e.reps ?? 0);
      const vol = w * s * r;
      if (vol > 0) map.set(e.date, (map.get(e.date) ?? 0) + vol);
    }
    return map;
  }, [data?.entries]);

  // Cannabis sessions per day
  const cannabisByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data?.cannabis?.daily ?? []) {
      if (d.sessions > 0) map.set(d.date, d.sessions);
    }
    return map;
  }, [data?.cannabis?.daily]);

  // Nutrition protein per day
  const proteinByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data?.nutrition?.daily ?? []) {
      if (d.protein_g > 0) map.set(d.date, d.protein_g);
    }
    return map;
  }, [data?.nutrition?.daily]);

  // 1. Sleep score vs training volume (previous day)
  const sleepVsTraining = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      // Training volume from the day BEFORE this sleep
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const vol = trainingByDate.get(prevISO);
      if (vol != null && vol > 0) {
        points.push({ x: vol / 1000, y: oura.sleep_score, date });
      }
    }
    return points;
  }, [ouraByDate, trainingByDate]);

  // 2. Cannabis sessions vs sleep score (same night)
  const sleepVsCannabis = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      // Cannabis use from the day before (evening use → that night's sleep)
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const sessions = cannabisByDate.get(prevISO) ?? 0;
      points.push({ x: sessions, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, cannabisByDate]);

  // 3. Protein intake vs readiness (next day)
  const readinessVsProtein = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.readiness_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const protein = proteinByDate.get(prevISO);
      if (protein != null && protein > 0) {
        points.push({ x: protein, y: oura.readiness_score, date });
      }
    }
    return points;
  }, [ouraByDate, proteinByDate]);

  // 4. Training volume vs weight change
  const weightVsTraining = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, w] of withingsByDate) {
      if (w.weight_kg == null) continue;
      const vol = trainingByDate.get(date);
      if (vol != null && vol > 0) {
        points.push({ x: vol / 1000, y: w.weight_kg, date });
      }
    }
    return points;
  }, [withingsByDate, trainingByDate]);

  // 5. Sleep total hours vs HRV
  const hrvVsSleep = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.total_h == null || oura.hrv == null) continue;
      points.push({ x: oura.total_h, y: oura.hrv, date });
    }
    return points;
  }, [ouraByDate]);

  // 6. Cannabis vs HRV
  const hrvVsCannabis = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.hrv == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const sessions = cannabisByDate.get(prevISO) ?? 0;
      points.push({ x: sessions, y: oura.hrv, date });
    }
    return points;
  }, [ouraByDate, cannabisByDate]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[280px] animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main data-section="correlations" className="mx-auto min-h-screen w-full min-w-0 max-w-6xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-6">
        <p className="text-sm text-muted-foreground">
          Cross-section correlations over the last 30 days. Each dot is one day.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightChart
          title="Training volume → Sleep score"
          xLabel="Volume"
          yLabel="Sleep"
          xUnit="k"
          data={sleepVsTraining}
          color={SECTIONS.exercise.color}
          yDomain={[50, 100]}
        />

        <InsightChart
          title="Cannabis sessions → Sleep score"
          xLabel="Sessions"
          yLabel="Sleep"
          data={sleepVsCannabis}
          color={SECTIONS.cannabis.color}
          yDomain={[50, 100]}
        />

        <InsightChart
          title="Sleep hours → HRV"
          xLabel="Sleep"
          yLabel="HRV"
          xUnit="hrs"
          yUnit="ms"
          data={hrvVsSleep}
          color={SECTIONS.sleep.color}
        />

        <InsightChart
          title="Cannabis sessions → HRV"
          xLabel="Sessions"
          yLabel="HRV"
          yUnit="ms"
          data={hrvVsCannabis}
          color={SECTIONS.cannabis.color}
        />

        <InsightChart
          title="Protein → Readiness"
          xLabel="Protein"
          yLabel="Readiness"
          xUnit="g"
          data={readinessVsProtein}
          color={SECTIONS.nutrition.color}
          yDomain={[50, 100]}
        />

        <InsightChart
          title="Training volume → Weight"
          xLabel="Volume"
          yLabel="Weight"
          xUnit="k"
          yUnit="kg"
          data={weightVsTraining}
          color={SECTIONS.body.color}
        />
      </div>
    </main>
  );
}
