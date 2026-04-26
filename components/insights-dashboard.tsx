"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { Scatter, ScatterChart, CartesianGrid, XAxis, YAxis, ZAxis, ReferenceLine, Tooltip } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_GRID_FULL } from "@/lib/chart-defaults";
import {
  getHealthCombined,
  getEntries,
  getCannabisHistory,
  getNutritionStats,
  getCaffeineSessions,
  getHabitHistory,
  getAirOvernight,
  getSupplementHistoryById,
} from "@/lib/api";
import { getGutHistory } from "@/lib/api-gut";
import { SECTIONS } from "@/lib/sections";
import { useSectionColor } from "@/hooks/use-sections";

// Exercise taxonomy — mirrors components/training-dashboard.tsx. Kept in
// sync with api/routers/exercise/taxonomy.py. See CLAUDE.md "Hardcoded
// taxonomies" for the canonical list.
const CARDIO_EXERCISES = new Set(["rowing", "elliptical", "stairs"]);
const MOBILITY_EXERCISES = new Set(["surya namaskar", "pull up"]);
const CORE_EXERCISES = new Set(["ab crunch", "abdominal"]);
function isCardio(name: string): boolean { return CARDIO_EXERCISES.has(name); }
function isMobility(name: string): boolean { return MOBILITY_EXERCISES.has(name); }
function isStrength(name: string): boolean {
  return !CARDIO_EXERCISES.has(name) && !MOBILITY_EXERCISES.has(name) && !CORE_EXERCISES.has(name);
}

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

function CorrelationBadge({ r, n }: { r: number | null; n: number }) {
  if (r === null) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        n={n} · not enough data
      </span>
    );
  }
  const abs = Math.abs(r);
  const label = abs < 0.2 ? "weak" : abs < 0.5 ? "moderate" : "strong";
  const dir = r > 0 ? "positive" : "negative";
  const dotColor = abs < 0.2 ? "bg-muted-foreground/40" : abs < 0.5 ? "bg-yellow-500" : r > 0 ? "bg-green-500" : "bg-red-500";
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      r={r.toFixed(2)} · {label} {dir} · n={n}
    </span>
  );
}

// Tertile-bucket summary: split the x-sorted data into 3 equal-count
// buckets, report mean x and mean y per bucket. Replaces the linear
// trendline — catches threshold and plateau effects that a straight line
// smears over. Returns null when there aren't enough points for at least
// two per bucket (n < 6).
type Bucket = { centerX: number; meanY: number; n: number; xMin: number; xMax: number };
function tertileBuckets(xs: number[], ys: number[]): Bucket[] | null {
  const n = xs.length;
  if (n < 6) return null;
  const paired = xs.map((x, i) => ({ x, y: ys[i] })).sort((a, b) => a.x - b.x);
  const distinct = new Set(xs).size;
  if (distinct < 3) return null;
  const third = Math.floor(n / 3);
  const parts = [
    paired.slice(0, third),
    paired.slice(third, n - third),
    paired.slice(n - third),
  ];
  return parts.map(b => ({
    centerX: b.reduce((s, p) => s + p.x, 0) / b.length,
    meanY: b.reduce((s, p) => s + p.y, 0) / b.length,
    n: b.length,
    xMin: b[0]?.x ?? 0,
    xMax: b[b.length - 1]?.x ?? 0,
  }));
}

// Sample-size and correlation thresholds below which a chart is too noisy
// to put in front of the user. The effective n in each pair is much smaller
// than the 30-day window, so the floor sits high.
const MIN_N = 15;
const STRONG_R = 0.35;

function isMonotonic(buckets: Bucket[]): boolean {
  return (
    (buckets[0].meanY <= buckets[1].meanY && buckets[1].meanY <= buckets[2].meanY) ||
    (buckets[0].meanY >= buckets[1].meanY && buckets[1].meanY >= buckets[2].meanY)
  );
}

type Tier = "trusted" | "exploratory" | "insufficient";

type ChartSpec = {
  title: string;
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  yDomain?: [number | string, number | string];
  data: { x: number; y: number; date: string }[];
  color: string;
  // Direction physiology would predict: "+" = higher x should raise y,
  // "-" = higher x should lower y. Used to flag counterintuitive findings.
  expected?: "+" | "-";
};

// Classify a chart into a tier based on sample size, correlation strength,
// bucket monotonicity, and agreement with the physiological prior. A result
// that contradicts the prior is demoted regardless of r magnitude — the
// likely explanation is a confound or reverse causation, not a real signal.
function classifySpec(spec: ChartSpec): { tier: Tier; warning: string | null; r: number | null; n: number } {
  const n = spec.data.length;
  if (n < MIN_N) return { tier: "insufficient", warning: null, r: null, n };
  const xs = spec.data.map(d => d.x);
  const ys = spec.data.map(d => d.y);
  const fit = linearFit(xs, ys);
  const buckets = tertileBuckets(xs, ys);
  const r = fit?.r ?? null;
  const monotonic = !!buckets && isMonotonic(buckets);
  let warning: string | null = null;
  if (r !== null && spec.expected && Math.abs(r) >= 0.2) {
    const actual = r >= 0 ? "+" : "-";
    if (actual !== spec.expected) {
      warning = "Direction contradicts physiology — likely confound or reverse causation.";
    }
  }
  const trusted = r !== null && Math.abs(r) >= STRONG_R && monotonic && !warning;
  return { tier: trusted ? "trusted" : "exploratory", warning, r, n };
}

// Plain-text report builder for one chart — same math as InsightChart, but
// emits markdown instead of SVG. Used by the "Copy report" button so the
// user can paste the numbers into a chat for deeper interpretation.
type ChartReport = { title: string; absR: number; text: string };
function chartReport(
  title: string,
  xUnit: string,
  yUnit: string,
  data: { x: number; y: number; date: string }[],
): ChartReport {
  if (data.length < 3) {
    return { title, absR: -1, text: `### ${title}\n- n=${data.length} — not enough data\n` };
  }
  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);
  const fit = linearFit(xs, ys);
  const buckets = tertileBuckets(xs, ys);
  const lines: string[] = [`### ${title}`];
  if (!fit) {
    lines.push(`- n=${data.length}, r=n/a (no x-variance)`);
  } else {
    const strength = Math.abs(fit.r) < 0.2 ? "weak" : Math.abs(fit.r) < 0.5 ? "moderate" : "strong";
    const dir = fit.r >= 0 ? "positive" : "negative";
    lines.push(`- n=${data.length}, r=${fit.r >= 0 ? "+" : ""}${fit.r.toFixed(2)} (${strength} ${dir})`);
    const slopeStr = `${fit.slope >= 0 ? "+" : ""}${fit.slope.toFixed(3)}${yUnit ? ` ${yUnit}` : ""}/${xUnit || "unit"}`;
    lines.push(`- slope: ${slopeStr}; x̄=${fit.mx.toFixed(1)}${xUnit ? ` ${xUnit}` : ""}; ȳ=${fit.my.toFixed(1)}${yUnit ? ` ${yUnit}` : ""}`);
    lines.push(`- range: x∈[${Math.min(...xs).toFixed(1)}, ${Math.max(...xs).toFixed(1)}]${xUnit ? ` ${xUnit}` : ""}, y∈[${Math.min(...ys).toFixed(1)}, ${Math.max(...ys).toFixed(1)}]${yUnit ? ` ${yUnit}` : ""}`);
  }
  if (buckets) {
    const b0 = buckets[0], b1 = buckets[1], b2 = buckets[2];
    lines.push(
      `- buckets: Low(x̄=${b0.centerX.toFixed(1)}${xUnit ? ` ${xUnit}` : ""}, n=${b0.n}) → ȳ=${b0.meanY.toFixed(1)}${yUnit ? ` ${yUnit}` : ""}`
      + ` · Mid(x̄=${b1.centerX.toFixed(1)}, n=${b1.n}) → ȳ=${b1.meanY.toFixed(1)}`
      + ` · High(x̄=${b2.centerX.toFixed(1)}, n=${b2.n}) → ȳ=${b2.meanY.toFixed(1)}`
    );
  }
  return { title, absR: fit ? Math.abs(fit.r) : -1, text: lines.join("\n") + "\n" };
}

// Clipboard copy with transient "copied" affordance. Falls back to a
// hidden textarea + document.execCommand when navigator.clipboard is
// unavailable (non-HTTPS contexts, older browsers).
function CopyReportButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <SectionHeaderActionButton onClick={onClick}>
      {copied ? "Copied ✓" : "Copy Report"}
    </SectionHeaderActionButton>
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
  warning?: string | null;
};

function InsightChart({ title, xLabel, yLabel, data, color, xUnit, yUnit, yDomain, warning }: InsightChartProps) {
  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);
  const fit = linearFit(xs, ys);
  const r = fit?.r ?? null;
  const avgY = fit?.my ?? null;

  const buckets = useMemo(() => tertileBuckets(xs, ys), [xs, ys]);

  const config = { x: { label: xLabel, color } } satisfies ChartConfig;

  if (data.length < 3) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {title}
          <CorrelationBadge r={r} n={data.length} />
          {warning && (
            <span
              title={warning}
              className="ml-2 inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:text-amber-400"
            >
              confound risk
            </span>
          )}
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          30 days
          {fit && (
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
        {buckets && (
          <p className="text-[10px] text-muted-foreground">
            buckets: {(["Low", "Mid", "High"] as const).map((label, i) => {
              const b = buckets[i];
              return (
                <span key={label} className="mr-2">
                  {label} ({fmt(b.centerX)}{xUnit ? ` ${xUnit}` : ""}): <span className="text-foreground">{fmt(b.meanY)}{yUnit ? ` ${yUnit}` : ""}</span>
                </span>
              );
            })}
          </p>
        )}
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden px-4">
        <ChartContainer config={config} className="h-[200px] w-full">
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid {...CHART_GRID_FULL} />
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
            {buckets && (
              <>
                <ReferenceLine
                  ifOverflow="extendDomain"
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.9}
                  segment={[{ x: buckets[0].centerX, y: buckets[0].meanY }, { x: buckets[1].centerX, y: buckets[1].meanY }]}
                />
                <ReferenceLine
                  ifOverflow="extendDomain"
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.9}
                  segment={[{ x: buckets[1].centerX, y: buckets[1].meanY }, { x: buckets[2].centerX, y: buckets[2].meanY }]}
                />
              </>
            )}
            <Tooltip
              cursor={false}
              content={({ payload }) => {
                if (!payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
                    <p className="font-medium">{p.date}</p>
                    <p>{xLabel}: {fmt(p.x)}{xUnit ? ` ${xUnit}` : ""}</p>
                    <p>{yLabel}: {fmt(p.y)}{yUnit ? ` ${yUnit}` : ""}</p>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill={color} fillOpacity={0.5} stroke={color} strokeOpacity={0.7} />
          </ScatterChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function InsightsDashboard() {
  // Live color from /api/sections, not the static SECTIONS fallback —
  // honors user customisation in settings.yaml.
  const trainingColor = useSectionColor("training");
  const cannabisColor = useSectionColor("cannabis");
  const sleepColor = useSectionColor("sleep");
  const nutritionColor = useSectionColor("nutrition");
  const caffeineColor = useSectionColor("caffeine");
  const habitsColor = useSectionColor("habits");
  const airColor = useSectionColor("air");
  const gutColor = useSectionColor("gut");
  const { data, isLoading } = useSWR("insights", async () => {
    const [health, entries, cannabis, nutrition, caffeine, habits, air, suppsById, gut] = await Promise.all([
      getHealthCombined(30),
      getEntries(),
      getCannabisHistory(30),
      getNutritionStats(30),
      getCaffeineSessions(30),
      getHabitHistory(30),
      getAirOvernight(30).catch(() => ({ nights: [] })),
      getSupplementHistoryById(30).catch(() => ({ daily: [], supplements: [] })),
      getGutHistory(30).catch(() => ({ daily: [] as Array<{ date: string; avg_bristol: number | null; movements: number }> })),
    ]);
    return { health, entries, cannabis, nutrition, caffeine, habits, air, suppsById, gut };
  }, { refreshInterval: 60_000 });

  const loading = isLoading && !data;

  // Build per-date maps
  const ouraByDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of data?.health?.oura ?? []) map.set(r.date, r);
    return map;
  }, [data?.health?.oura]);

  const appleByDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of data?.health?.apple ?? []) map.set(r.date, r);
    return map;
  }, [data?.health?.apple]);

  // Last caffeine hour per day (decimal hours). Days without a logged
  // session are absent — don't coerce to 0.
  const lastCaffeineHourByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data?.caffeine?.sessions ?? []) {
      const [hh, mm] = s.time.split(":").map(Number);
      const hr = hh + (mm || 0) / 60;
      const cur = map.get(s.date);
      if (cur == null || hr > cur) map.set(s.date, hr);
    }
    return map;
  }, [data?.caffeine?.sessions]);

  // Last-meal hour per day from nutrition fasting windows.
  const lastMealHourByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of data?.nutrition?.fasting ?? []) {
      if (!f.last_meal) continue;
      const [hh, mm] = f.last_meal.split(":").map(Number);
      map.set(f.date, hh + (mm || 0) / 60);
    }
    return map;
  }, [data?.nutrition?.fasting]);

  // Fasting window hours per day.
  const fastingHoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of data?.nutrition?.fasting ?? []) {
      if (f.hours != null && f.note !== "gap") map.set(f.date, f.hours);
    }
    return map;
  }, [data?.nutrition?.fasting]);

  // Habit completion percent per day.
  const habitPctByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data?.habits?.daily ?? []) {
      if (d.total > 0) map.set(d.date, d.percent);
    }
    return map;
  }, [data?.habits?.daily]);

  // Training volume per day (total sets × reps × weight for strength).
  // Kept for back-compat with the aggregate training→sleep chart; the
  // per-type splits below separate the modalities so opposing effects
  // stop cancelling out.
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

  // Per-modality training load. Strength uses kg-reps volume; cardio and
  // mobility use duration_min since weight is null for those.
  const strengthByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data?.entries ?? []) {
      if (!e.date || !e.exercise) continue;
      if (!isStrength(e.exercise)) continue;
      const w = typeof e.weight === "number" ? e.weight : 0;
      const s = Number(e.sets ?? 0);
      const r = Number(e.reps ?? 0);
      const vol = w * s * r;
      if (vol > 0) map.set(e.date, (map.get(e.date) ?? 0) + vol);
    }
    return map;
  }, [data?.entries]);

  const cardioMinByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data?.entries ?? []) {
      if (!e.date || !e.exercise) continue;
      if (!isCardio(e.exercise)) continue;
      const m = Number(e.duration_min ?? 0);
      if (m > 0) map.set(e.date, (map.get(e.date) ?? 0) + m);
    }
    return map;
  }, [data?.entries]);

  const mobilityMinByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data?.entries ?? []) {
      if (!e.date || !e.exercise) continue;
      if (!isMobility(e.exercise)) continue;
      const m = Number(e.duration_min ?? 0);
      const reps = Number(e.reps ?? 0);
      // surya namaskar style has reps but no duration — use reps as a proxy.
      const v = m > 0 ? m : reps;
      if (v > 0) map.set(e.date, (map.get(e.date) ?? 0) + v);
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

  // Fiber per day + 3-day rolling average (transit-time window). 3-day
  // avg is the more defensible predictor for Bristol since food from 24–48h
  // ago is what you're actually seeing today.
  const fiberByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data?.nutrition?.daily ?? []) {
      if ((d as { fiber_g?: number }).fiber_g != null) {
        map.set(d.date, (d as { fiber_g: number }).fiber_g);
      }
    }
    return map;
  }, [data?.nutrition?.daily]);

  const fiberAvg3dByDate = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...fiberByDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 0; i < sorted.length; i++) {
      const window = sorted.slice(Math.max(0, i - 2), i + 1);
      if (window.length < 2) continue;
      const avg = window.reduce((s, [, v]) => s + v, 0) / window.length;
      map.set(sorted[i][0], avg);
    }
    return map;
  }, [fiberByDate]);

  // Caffeine total grams per day (sum of brewed dose across sessions).
  const caffeineGramsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data?.caffeine?.sessions ?? []) {
      const g = Number((s as { grams?: number }).grams ?? 0);
      if (g > 0) map.set(s.date, (map.get(s.date) ?? 0) + g);
    }
    return map;
  }, [data?.caffeine?.sessions]);

  // Gut — average Bristol per day (1-7). Days with no entry are absent,
  // not zero.
  const bristolByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data?.gut?.daily ?? []) {
      const v = (d as { avg_bristol?: number | null }).avg_bristol;
      if (v != null) map.set(d.date, v);
    }
    return map;
  }, [data?.gut?.daily]);

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

  // 2. Cannabis sessions vs sleep score (same night). Only include days
  // where cannabis was actually logged — tracking is sparse, so a missing
  // entry means "unknown", not zero. Collapsing the unknowns to x=0 used to
  // pile up a false zero-cluster and bias the regression.
  const sleepVsCannabis = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const sessions = cannabisByDate.get(prevISO);
      if (sessions == null) continue;
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

  // 4. Sleep score → next-day training volume. Flip of chart 1 — tests the
  // recovery→output direction which is the more actionable framing.
  const trainingVsSleep = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const next = new Date(date + "T00:00:00");
      next.setDate(next.getDate() + 1);
      const nextISO = next.toISOString().slice(0, 10);
      const vol = trainingByDate.get(nextISO);
      if (vol != null && vol > 0) {
        points.push({ x: oura.sleep_score, y: vol / 1000, date: nextISO });
      }
    }
    return points;
  }, [ouraByDate, trainingByDate]);

  // 5. Sleep total hours vs HRV
  const hrvVsSleep = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.total_h == null || oura.hrv == null) continue;
      points.push({ x: oura.total_h, y: oura.hrv, date });
    }
    return points;
  }, [ouraByDate]);

  // 6. Cannabis vs HRV — same zero-inflation fix as sleepVsCannabis.
  const hrvVsCannabis = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.hrv == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const sessions = cannabisByDate.get(prevISO);
      if (sessions == null) continue;
      points.push({ x: sessions, y: oura.hrv, date });
    }
    return points;
  }, [ouraByDate, cannabisByDate]);

  // 7. Last-caffeine hour → sleep score (same night). Later last-dose
  // should tank sleep if the signal is there.
  const sleepVsCaffeineHour = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const hr = lastCaffeineHourByDate.get(prevISO);
      if (hr == null) continue;
      points.push({ x: hr, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, lastCaffeineHourByDate]);

  // 8. Fasting window hours → readiness.
  const readinessVsFasting = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.readiness_score == null) continue;
      const hrs = fastingHoursByDate.get(date);
      if (hrs == null) continue;
      points.push({ x: hrs, y: oura.readiness_score, date });
    }
    return points;
  }, [ouraByDate, fastingHoursByDate]);

  // 9. Apple exercise minutes → resting HR (next day). Zone-2/cardio
  // adaptation shows up as lower morning RHR.
  const rhrVsTraining = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.resting_hr == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const apple = appleByDate.get(prevISO);
      const mins = apple?.exercise_min;
      if (mins == null || mins <= 0) continue;
      points.push({ x: mins, y: oura.resting_hr, date });
    }
    return points;
  }, [ouraByDate, appleByDate]);

  // 10. Last-meal hour → sleep score.
  const sleepVsLastMeal = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const prevISO = prev.toISOString().slice(0, 10);
      const hr = lastMealHourByDate.get(prevISO);
      if (hr == null) continue;
      points.push({ x: hr, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, lastMealHourByDate]);

  // Overnight air maps — labeled by wake date (matches Oura sleep_score).
  const airByDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const n of data?.air?.nights ?? []) map.set(n.date, n);
    return map;
  }, [data?.air?.nights]);

  // 12. Overnight CO₂ (avg) → sleep score. Higher bedroom CO₂ is a
  // plausible sleep-quality disruptor — the canonical ask here.
  const sleepVsCo2 = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const night = airByDate.get(date);
      if (!night || night.co2_avg == null) continue;
      points.push({ x: night.co2_avg, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, airByDate]);

  // 13. Overnight CO₂ peak → HRV.
  const hrvVsCo2Peak = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.hrv == null) continue;
      const night = airByDate.get(date);
      if (!night || night.co2_max == null) continue;
      points.push({ x: night.co2_max, y: oura.hrv, date });
    }
    return points;
  }, [ouraByDate, airByDate]);

  // 14. Overnight temperature → sleep score. Bedroom too warm tanks deep
  // sleep — sweet spot is ~16-19°C.
  const sleepVsTemp = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const night = airByDate.get(date);
      if (!night || night.temp_avg == null) continue;
      points.push({ x: night.temp_avg, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, airByDate]);

  // 11. Habit completion % → readiness.
  const readinessVsHabits = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.readiness_score == null) continue;
      const pct = habitPctByDate.get(date);
      if (pct == null) continue;
      points.push({ x: pct, y: oura.readiness_score, date });
    }
    return points;
  }, [ouraByDate, habitPctByDate]);

  // Training split → sleep score. Each modality uses its own prev-day
  // load: strength in kg-reps (shown as k), cardio/mobility in minutes.
  const sleepVsStrength = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const v = strengthByDate.get(prev.toISOString().slice(0, 10));
      if (v != null && v > 0) points.push({ x: v / 1000, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, strengthByDate]);

  const sleepVsCardio = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const v = cardioMinByDate.get(prev.toISOString().slice(0, 10));
      if (v != null && v > 0) points.push({ x: v, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, cardioMinByDate]);

  const sleepVsMobility = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const v = mobilityMinByDate.get(prev.toISOString().slice(0, 10));
      if (v != null && v > 0) points.push({ x: v, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, mobilityMinByDate]);

  // Caffeine total grams (same day) → sleep score. Total dose — a better
  // test than last-caffeine-hour when you care about total stimulant load.
  const sleepVsCaffeineGrams = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, oura] of ouraByDate) {
      if (oura.sleep_score == null) continue;
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const g = caffeineGramsByDate.get(prev.toISOString().slice(0, 10));
      if (g == null) continue;
      points.push({ x: g, y: oura.sleep_score, date });
    }
    return points;
  }, [ouraByDate, caffeineGramsByDate]);

  // Fiber (previous day) → Bristol (today). Fiber bumps Bristol upward
  // toward 3–4 (healthy). Food takes ~24h to transit so we lag by a day.
  const bristolVsFiber = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, bristol] of bristolByDate) {
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const fiber = fiberByDate.get(prev.toISOString().slice(0, 10));
      if (fiber == null) continue;
      points.push({ x: fiber, y: bristol, date });
    }
    return points;
  }, [bristolByDate, fiberByDate]);

  // Fiber 3-day rolling avg (ending yesterday) → Bristol (today). Smooths
  // out single-day spikes; often a cleaner signal than same-day fiber.
  const bristolVsFiber3d = useMemo(() => {
    const points: { x: number; y: number; date: string }[] = [];
    for (const [date, bristol] of bristolByDate) {
      const prev = new Date(date + "T00:00:00");
      prev.setDate(prev.getDate() - 1);
      const avg = fiberAvg3dByDate.get(prev.toISOString().slice(0, 10));
      if (avg == null) continue;
      points.push({ x: avg, y: bristol, date });
    }
    return points;
  }, [bristolByDate, fiberAvg3dByDate]);

  // Supplements → sleep. For each supplement, split days into taken/not
  // and compute mean sleep score in each state. Surfaces the melatonin /
  // sleep-gummy question the user asked.
  const supplementSleepRows = useMemo(() => {
    const supps = data?.suppsById?.supplements ?? [];
    const daily = data?.suppsById?.daily ?? [];
    const rows: { id: string; name: string; emoji: string; takenMean: number; notMean: number; delta: number; takenN: number; notN: number }[] = [];
    for (const s of supps) {
      const taken: number[] = [];
      const notTaken: number[] = [];
      for (const day of daily) {
        // Supplements are taken through the day; same-night sleep (=
        // following morning's wake date = day+1).
        const wake = new Date(day.date + "T00:00:00");
        wake.setDate(wake.getDate() + 1);
        const oura = ouraByDate.get(wake.toISOString().slice(0, 10));
        if (!oura || oura.sleep_score == null) continue;
        if (day.taken.includes(s.id)) taken.push(oura.sleep_score);
        else notTaken.push(oura.sleep_score);
      }
      if (taken.length < 3 || notTaken.length < 3) continue;
      const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      const takenMean = mean(taken);
      const notMean = mean(notTaken);
      rows.push({
        id: s.id,
        name: s.name,
        emoji: s.emoji,
        takenMean,
        notMean,
        delta: takenMean - notMean,
        takenN: taken.length,
        notN: notTaken.length,
      });
    }
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows;
  }, [data?.suppsById, ouraByDate]);

  // Unified chart spec list. Drives both the rendered grid and the copy-
  // to-clipboard report so the two stay in sync. `expected` encodes the
  // physiological prior; classifySpec flags r-values that contradict it.
  const chartSpecs = useMemo<ChartSpec[]>(() => [
    { title: "Training volume → Sleep score", xLabel: "Volume", yLabel: "Sleep", xUnit: "k", data: sleepVsTraining, color: trainingColor, yDomain: [50, 100], expected: "+" },
    { title: "Cannabis sessions → Sleep score", xLabel: "Sessions", yLabel: "Sleep", data: sleepVsCannabis, color: cannabisColor, yDomain: [50, 100], expected: "-" },
    { title: "Sleep hours → HRV", xLabel: "Sleep", yLabel: "HRV", xUnit: "hrs", yUnit: "ms", data: hrvVsSleep, color: sleepColor, expected: "+" },
    { title: "Cannabis sessions → HRV", xLabel: "Sessions", yLabel: "HRV", yUnit: "ms", data: hrvVsCannabis, color: cannabisColor, expected: "-" },
    { title: "Protein → Readiness", xLabel: "Protein", yLabel: "Readiness", xUnit: "g", data: readinessVsProtein, color: nutritionColor, yDomain: [50, 100], expected: "+" },
    { title: "Sleep score → Next-day training", xLabel: "Sleep", yLabel: "Volume", yUnit: "k", data: trainingVsSleep, color: trainingColor, expected: "+" },
    { title: "Last caffeine (hr) → Sleep score", xLabel: "Last caffeine", yLabel: "Sleep", xUnit: "h", data: sleepVsCaffeineHour, color: caffeineColor, yDomain: [50, 100], expected: "-" },
    { title: "Fasting window → Readiness", xLabel: "Fasting", yLabel: "Readiness", xUnit: "h", data: readinessVsFasting, color: nutritionColor, yDomain: [50, 100] },
    { title: "Training minutes → Resting HR", xLabel: "Training", yLabel: "RHR", xUnit: "min", yUnit: "bpm", data: rhrVsTraining, color: trainingColor, expected: "-" },
    { title: "Last meal (hr) → Sleep score", xLabel: "Last meal", yLabel: "Sleep", xUnit: "h", data: sleepVsLastMeal, color: nutritionColor, yDomain: [50, 100], expected: "-" },
    { title: "Overnight CO₂ → Sleep score", xLabel: "CO₂", yLabel: "Sleep", xUnit: "ppm", data: sleepVsCo2, color: airColor, yDomain: [50, 100], expected: "-" },
    { title: "Overnight CO₂ peak → HRV", xLabel: "CO₂ peak", yLabel: "HRV", xUnit: "ppm", yUnit: "ms", data: hrvVsCo2Peak, color: airColor, expected: "-" },
    { title: "Bedroom temp → Sleep score", xLabel: "Temp", yLabel: "Sleep", xUnit: "°C", data: sleepVsTemp, color: airColor, yDomain: [50, 100] },
    { title: "Habit completion → Readiness", xLabel: "Habits", yLabel: "Readiness", xUnit: "%", data: readinessVsHabits, color: habitsColor, yDomain: [50, 100], expected: "+" },
    { title: "Strength volume → Sleep score", xLabel: "Strength", yLabel: "Sleep", xUnit: "k", data: sleepVsStrength, color: trainingColor, yDomain: [50, 100], expected: "+" },
    { title: "Cardio minutes → Sleep score", xLabel: "Cardio", yLabel: "Sleep", xUnit: "min", data: sleepVsCardio, color: trainingColor, yDomain: [50, 100], expected: "+" },
    { title: "Mobility minutes → Sleep score", xLabel: "Mobility", yLabel: "Sleep", xUnit: "min", data: sleepVsMobility, color: trainingColor, yDomain: [50, 100], expected: "+" },
    { title: "Caffeine total (g) → Sleep score", xLabel: "Caffeine", yLabel: "Sleep", xUnit: "g", data: sleepVsCaffeineGrams, color: caffeineColor, yDomain: [50, 100], expected: "-" },
    { title: "Fiber (prev day) → Bristol", xLabel: "Fiber", yLabel: "Bristol", xUnit: "g", data: bristolVsFiber, color: gutColor, yDomain: [1, 7], expected: "+" },
    { title: "Fiber 3-day avg → Bristol", xLabel: "Fiber", yLabel: "Bristol", xUnit: "g/d", data: bristolVsFiber3d, color: gutColor, yDomain: [1, 7], expected: "+" },
  ], [
    sleepVsTraining, sleepVsCannabis, hrvVsSleep, hrvVsCannabis, readinessVsProtein,
    trainingVsSleep, sleepVsCaffeineHour, readinessVsFasting, rhrVsTraining,
    sleepVsLastMeal, sleepVsCo2, hrvVsCo2Peak, sleepVsTemp, readinessVsHabits,
    sleepVsStrength, sleepVsCardio, sleepVsMobility, sleepVsCaffeineGrams,
    bristolVsFiber, bristolVsFiber3d,
    trainingColor, cannabisColor, sleepColor, nutritionColor, caffeineColor,
    habitsColor, airColor, gutColor,
  ]);

  const classified = useMemo(
    () => chartSpecs.map(spec => ({ spec, ...classifySpec(spec) })),
    [chartSpecs],
  );
  const trustedCharts = useMemo(() => classified.filter(c => c.tier === "trusted"), [classified]);
  const exploratoryCharts = useMemo(() => classified.filter(c => c.tier === "exploratory"), [classified]);
  const insufficientCharts = useMemo(() => classified.filter(c => c.tier === "insufficient"), [classified]);

  // Markdown report — tier-grouped to match the rendered UI. Paste target
  // is a chat for interpretation, so section ordering (Trusted →
  // Exploratory → Insufficient) is load-bearing: it tells the reader
  // which signals should carry weight before they see the numbers.
  const reportText = useMemo(() => {
    const toReport = (c: typeof classified[number]) => {
      const report = chartReport(c.spec.title, c.spec.xUnit ?? "", c.spec.yUnit ?? "", c.spec.data);
      return c.warning ? { ...report, text: report.text + `- ⚠ ${c.warning}\n` } : report;
    };
    const trustedReports = trustedCharts.map(toReport).sort((a, b) => b.absR - a.absR);
    const exploratoryReports = exploratoryCharts.map(toReport).sort((a, b) => b.absR - a.absR);
    const insufficientReports = insufficientCharts.map(c => ({
      title: c.spec.title,
      n: c.spec.data.length,
    }));

    const todayISO = new Date().toISOString().slice(0, 10);
    const dates = Array.from(ouraByDate.keys()).sort();
    const windowStart = dates[0] ?? "—";
    const windowEnd = dates[dates.length - 1] ?? todayISO;

    const header = [
      `# Septena Insights — correlation dump`,
      `Generated: ${todayISO}`,
      `Window: ${windowStart} → ${windowEnd} (last 30 days)`,
      ``,
      `## Context`,
      `- User does not drink alcohol — don't suggest it as a confound.`,
      `- User's days are largely identical (low day-of-week variance).`,
      `- Charts are tiered: Trusted (n≥${MIN_N}, |r|≥${STRONG_R}, monotonic buckets, sign matches physiology) vs. Exploratory (everything else with n≥${MIN_N}) vs. Insufficient (n<${MIN_N}).`,
      `- Trend summaries use tertile buckets (Low/Mid/High by x-count), not linear fits.`,
      `- Running ~20 correlations on a 30-day window → expect 1-2 to clear |r|=0.4 by chance; weight Trusted tier accordingly.`,
      ``,
    ].join("\n");

    const trustedSection = trustedReports.length
      ? `## Trusted signals (${trustedReports.length})\n\n` + trustedReports.map(r => r.text).join("\n")
      : `## Trusted signals\n- none yet — no chart clears n≥${MIN_N} + |r|≥${STRONG_R} + monotonic + prior-matching.\n`;

    const exploratorySection = exploratoryReports.length
      ? `\n## Exploratory (${exploratoryReports.length})\n` + `(n≥${MIN_N} but weak r, non-monotonic buckets, or direction contradicts physiology)\n\n`
        + exploratoryReports.map(r => r.text).join("\n")
      : "";

    const insufficientSection = insufficientReports.length
      ? `\n## Insufficient data (n<${MIN_N}) — do not rank\n\n`
        + insufficientReports.map(r => `- ${r.title} (n=${r.n})`).join("\n") + "\n"
      : "";

    const supplementsSection = (() => {
      if (!supplementSleepRows.length) return `\n## Supplements → Sleep score\n- no supplement meets the ≥3-days-in-each-state threshold yet\n`;
      const lines = [
        `\n## Supplements → Sleep score`,
        `(mean sleep score: nights taken vs. nights off; ranked by |Δ|)`,
        `Caveat: supplement-taking correlates with other good-day behaviors (training, eating, organization) — this table measures "conscientious day" as much as any single supplement.`,
        ``,
      ];
      for (const row of supplementSleepRows) {
        const absDelta = Math.abs(row.delta);
        const meetsBar = absDelta >= 3 && row.takenN >= 10 && row.notN >= 10;
        const strength = meetsBar ? (row.delta > 0 ? "above bar" : "above bar (negative)") : "below bar";
        lines.push(`- **${row.name}**: taken ${row.takenMean.toFixed(1)} (n=${row.takenN}) vs off ${row.notMean.toFixed(1)} (n=${row.notN}) → Δ=${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)} (${strength})`);
      }
      const supps = data?.suppsById?.supplements ?? [];
      const skipped = supps.filter(s => !supplementSleepRows.find(r => r.id === s.id));
      if (skipped.length) {
        lines.push(``);
        lines.push(`Supplements below the 3-day threshold (not enough data yet):`);
        for (const s of skipped) lines.push(`- ${s.name}`);
      }
      return lines.join("\n") + "\n";
    })();

    const asks = [
      ``,
      `---`,
      `## What I'd like help with`,
      `1. Do the Trusted signals actually hold up, or are they artifacts I missed?`,
      `2. For Exploratory items, which are worth collecting more data on vs. dropping?`,
      `3. Rank the top 3 actionable levers given the Trusted tier.`,
      ``,
    ].join("\n");

    return header + trustedSection + exploratorySection + insufficientSection + supplementsSection + asks;
  }, [trustedCharts, exploratoryCharts, insufficientCharts, classified, supplementSleepRows, data?.suppsById, ouraByDate]);

  if (loading) {
    return (
      <>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[280px] animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeaderAction>
        <CopyReportButton text={reportText} />
      </SectionHeaderAction>

      <p className="mb-6 text-sm text-muted-foreground">
        Cross-section correlations over the last 30 days. Each dot is one day.
        Charts are tiered by confidence: Trusted signals clear n≥{MIN_N},
        |r|≥{STRONG_R}, monotonic buckets, and match the physiological prior.
        Everything else is Exploratory — read it, don&apos;t act on it yet.
      </p>

      {supplementSleepRows.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Supplements → Sleep score</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Mean sleep score on nights a supplement was taken vs. not. Colored dot
              requires Δ≥3 points with ≥10 days in each state — otherwise the effect
              is within night-to-night noise.
            </p>
            <p className="text-[10px] text-muted-foreground">
              Caveat: supplement-taking correlates with other good-day behaviors
              (training, eating, being organized) — this table partly measures
              &quot;conscientious day,&quot; not the supplement itself.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {supplementSleepRows.map(row => {
                const absDelta = Math.abs(row.delta);
                const meetsBar = absDelta >= 3 && row.takenN >= 10 && row.notN >= 10;
                const label = !meetsBar ? "below bar" : absDelta < 5 ? "moderate" : "strong";
                const dotColor = !meetsBar
                  ? "bg-muted-foreground/40"
                  : row.delta > 0 ? "bg-green-500" : "bg-red-500";
                return (
                  <div key={row.id} className="flex items-center gap-3 text-xs">
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                    <span className="w-40 truncate font-medium">
                      {row.emoji ? `${row.emoji} ` : ""}{row.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      taken: <span className="text-foreground">{row.takenMean.toFixed(1)}</span>
                      {" "}({row.takenN}d)
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      off: <span className="text-foreground">{row.notMean.toFixed(1)}</span>
                      {" "}({row.notN}d)
                    </span>
                    <span className={`tabular-nums ${meetsBar ? (row.delta > 0 ? "text-green-600" : "text-red-600") : "text-muted-foreground"}`}>
                      {row.delta > 0 ? "+" : ""}{row.delta.toFixed(1)} · {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="mb-6">
        <header className="mb-2">
          <h2 className="text-sm font-medium">Trusted signals</h2>
          <p className="text-[11px] text-muted-foreground">
            n≥{MIN_N}, |r|≥{STRONG_R}, monotonic bucket progression, direction matches physiology.
          </p>
        </header>
        {trustedCharts.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No charts clear the bar yet. More data needed.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {trustedCharts.map(c => (
              <InsightChart key={c.spec.title} {...c.spec} warning={c.warning} />
            ))}
          </div>
        )}
      </section>

      {exploratoryCharts.length > 0 && (
        <section className="mb-6">
          <header className="mb-2">
            <h2 className="text-sm font-medium">Exploratory</h2>
            <p className="text-[11px] text-muted-foreground">
              Enough data to plot, but weak correlation, non-monotonic buckets, or a
              direction that contradicts the physiological prior. Read for patterns, don&apos;t act yet.
            </p>
          </header>
          <div className="grid gap-4 lg:grid-cols-2">
            {exploratoryCharts.map(c => (
              <InsightChart key={c.spec.title} {...c.spec} warning={c.warning} />
            ))}
          </div>
        </section>
      )}

      {insufficientCharts.length > 0 && (
        <details className="mb-6 rounded-md border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="mr-2">▸</span>
            Not enough data yet ({insufficientCharts.length})
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              n &lt; {MIN_N} — too noisy to plot
            </span>
          </summary>
          <ul className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {insufficientCharts.map(c => (
              <li key={c.spec.title} className="flex justify-between py-0.5">
                <span>{c.spec.title}</span>
                <span className="tabular-nums">n={c.spec.data.length}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
