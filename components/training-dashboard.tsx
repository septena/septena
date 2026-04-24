"use client";

import { type CSSProperties, useMemo, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import {
  getEntries,
  getExerciseConfig,
  getProgression,
  getStats,
  getNextWorkout,
  getSummary,
  getCardioHistory,
  type ExerciseEntry,
  type ExerciseConfig,
  type ProgressionPoint,
  type Stats,
} from "@/lib/api";
import { computePRs } from "@/lib/pr";
import { cn, titleCase } from "@/lib/utils";
import { DifficultyGlyph, LevelGlyph } from "@/components/intensity-glyph";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WeekStreak } from "@/components/week-streak";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { useExerciseTaxonomy, type ExerciseKind } from "@/hooks/use-exercise-taxonomy";
import { formatDateLong as formatDate, addDaysISO } from "@/lib/date-utils";
import { CHART_GRID, WEEKDAY_X_AXIS, Y_AXIS } from "@/lib/chart-defaults";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { useDemoHref } from "@/hooks/use-demo-href";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import {
  EXERCISE_TONE_COLOR,
  exerciseToneColor,
  SECTION_ACCENT_SHADE_1,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_STRONG,
} from "@/lib/section-colors";

type DashboardState = {
  stats: Stats | null;
  exercises: string[];
  selectedExercise: string;
  progression: ProgressionPoint[];
  /** All entries across all exercises. Used by the two "meta" pseudo-pills
   *  ("All strength" / "All cardio") to compute per-session totals without
   *  per-exercise round-trips. Fetched once on mount. */
  allEntries: ExerciseEntry[];
  loading: boolean;
  error: string | null;
};

// Pseudo-exercise IDs for the meta volume charts. Picked to be impossible
// real exercise names so they can't collide with the live taxonomy.
const META_STRENGTH = "__all_strength__";
const META_CARDIO = "__all_cardio__";
const META_LABEL: Record<string, string> = {
  [META_STRENGTH]: "All strength",
  [META_CARDIO]: "All cardio",
};
function isMeta(name: string): name is typeof META_STRENGTH | typeof META_CARDIO {
  return name === META_STRENGTH || name === META_CARDIO;
}

// Color flows from --section-accent (set by <SectionThemeRoot> in the root
// layout based on pathname). Strength is the headline shade; cardio &
// mobility derive from it via color-mix() in globals.css.
const chartConfig = {
  metric: {
    label: "Metric",
    color: SECTION_ACCENT_SHADE_1,
  },
} satisfies ChartConfig;

// Default visible window in days. The dropdown lets the user widen it.
const DEFAULT_WINDOW_DAYS = 30;
const WINDOW_OPTIONS = [30, 60, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

type MetricKind = "pace" | "duration" | "weight" | "binary" | "volume" | "cardioTotal";

/** Translate an exercise name + its taxonomy classification into the chart
 *  metric kind used for rendering. The classification comes from
 *  `useExerciseTaxonomy()` so there's no hardcoded cardio/mobility Set —
 *  config edits in Bases/Training/training-config.yaml take effect
 *  automatically. A few exercise names still hardcode their metric shape
 *  (rowing/elliptical → pace, stairs → duration, surya namaskar → binary)
 *  because those are display choices not type choices. Anything we don't
 *  recognise falls through to the strength path — same behaviour as the
 *  backend's `exercise_group` default. */
function metricKind(exercise: string, kind: ExerciseKind): MetricKind {
  if (exercise === META_STRENGTH) return "volume";
  if (exercise === META_CARDIO) return "cardioTotal";
  if (exercise === "rowing" || exercise === "elliptical") return "pace";
  if (exercise === "stairs") return "duration";
  // Binary: duration is irrelevant, only "did it / didn't" matters.
  if (exercise === "surya namaskar") return "binary";
  if (kind === "mobility") return "duration";
  return "weight";
}

function metricUnit(exercise: string, kind: ExerciseKind): string {
  const k = metricKind(exercise, kind);
  if (k === "pace") return "m/min";
  if (k === "duration") return "min";
  if (k === "binary") return "";
  if (k === "volume") return "kg";
  if (k === "cardioTotal") return "min";
  return "kg";
}

function metricValue(exercise: string, kind: ExerciseKind, point: ProgressionPoint): number | null {
  const mk = metricKind(exercise, kind);
  if (mk === "pace") {
    if (point.distance_m != null && point.duration_min != null && point.duration_min > 0) {
      return Math.round((point.distance_m / point.duration_min) * 10) / 10;
    }
    return null;
  }
  if (mk === "duration") return point.duration_min ?? null;
  if (mk === "binary") return 1; // presence; nulls = "not done that day"
  return point.weight ?? null;
}

function formatValue(value: number | null | undefined, exercise: string, kind: ExerciseKind): string {
  if (typeof value !== "number") return "—";
  const mk = metricKind(exercise, kind);
  if (mk === "binary") return "✓ done";
  if (mk === "volume") return `${Math.round(value).toLocaleString("en-GB")} kg`;
  if (mk === "cardioTotal") return `${Math.round(value).toLocaleString("en-GB")} min`;
  const unit = metricUnit(exercise, kind);
  if (unit === "kg") return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${unit}`;
}

function chartSubtitle(exercise: string, kind: ExerciseKind): string {
  const mk = metricKind(exercise, kind);
  if (mk === "pace") return "Pace (m/min) per session";
  if (mk === "duration") return "Duration (min) per session";
  if (mk === "binary") return "Days logged";
  if (mk === "volume") return "Total volume per session — sum of weight × sets × reps";
  if (mk === "cardioTotal") return "Total cardio minutes per session";
  return "Weight (kg) over time";
}

/** Parses reps which may be a number, a numeric string, or "AMRAP".
 *  AMRAP returns null — those entries don't contribute to volume. */
function repsAsNumber(reps: number | string | null | undefined): number | null {
  if (typeof reps === "number") return reps;
  if (typeof reps === "string" && reps.trim() && reps.toUpperCase() !== "AMRAP") {
    const n = Number(reps);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function TrainingDashboard() {
  const { classify } = useExerciseTaxonomy();
  const [windowDays, setWindowDays] = useState<WindowDays>(DEFAULT_WINDOW_DAYS);
  const barAnim = useBarAnimation();
  const { date: selectedDate } = useSelectedDate();

  // SWR: single combined fetch for all dashboard data.
  const { data: bulk, error: swrError, isLoading } = useSWR(
    ["training-dashboard", windowDays, selectedDate],
    async () => {
      const cutoff = addDaysISO(selectedDate, -windowDays);
      const [stats, next, summary, allEntries] = await Promise.all([
        getStats(),
        getNextWorkout(),
        getSummary(cutoff),
        getEntries(),
      ]);
      const exercises = summary.map((row) => row.name);
      const counts: Record<string, number> = {};
      for (const row of summary) counts[row.name] = row.count;
      return { stats, next, exercises, allEntries, counts };
    },
    { refreshInterval: 60_000 },
  );

  const [state, setState] = useState<DashboardState>({
    stats: null,
    exercises: [],
    selectedExercise: META_STRENGTH,
    progression: [],
    allEntries: [],
    loading: true,
    error: null,
  });
  const [pillCounts, setPillCounts] = useState<Record<string, number>>({});
  // Sync SWR data into existing state shape.
  if (bulk && state.stats !== bulk.stats) {
    setState((current) => ({
      ...current,
      stats: bulk.stats,
      exercises: bulk.exercises,
      allEntries: bulk.allEntries,
      loading: false,
      error: null,
    }));
    setPillCounts(bulk.counts);
  }
  if (swrError && state.error !== (swrError instanceof Error ? swrError.message : "Failed to load dashboard")) {
    setState((current) => ({
      ...current,
      loading: false,
      error: swrError instanceof Error ? swrError.message : "Failed to load dashboard",
    }));
  }
  if (isLoading && !bulk) {
    state.loading = true;
  }

  // Cardio rolling history
  const { data: cardioData } = useSWR("cardio-history", () => getCardioHistory(30), { refreshInterval: 60_000 });

  async function onSelectExercise(exercise: string | null) {
    if (!exercise) return;
    // Meta charts don't fetch per-exercise progression — chartData is built
    // from `allEntries` which is already in state.
    if (isMeta(exercise)) {
      setState((current) => ({
        ...current,
        selectedExercise: exercise,
        progression: [],
        loading: false,
        error: null,
      }));
      return;
    }
    setState((current) => ({ ...current, selectedExercise: exercise, loading: true }));
    try {
      const response = await getProgression(exercise);
      setState((current) => ({
        ...current,
        selectedExercise: exercise,
        progression: response.data,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load progression",
      }));
    }
  }

  const chartData = useMemo(() => {
    const cutoff = addDaysISO(selectedDate, -windowDays);
    const today = selectedDate;
    const exercise = state.selectedExercise;

    // For meta charts: aggregate ALL entries (across exercises) per date.
    // Strength volume = Σ(weight × sets × reps) for all strength entries that
    // day. Cardio total = Σ(duration_min) for all cardio entries that day.
    // AMRAP reps don't contribute to volume (no numeric reps to multiply).
    const byDate = new Map<string, number[]>();
    if (isMeta(exercise)) {
      for (const e of state.allEntries) {
        if (!e.date || e.date < cutoff || e.date > today) continue;
        if (exercise === META_STRENGTH) {
          // Strength = anything classified `strength`. Unknown exercises
          // (not yet in config) fall through to the strength path too,
          // matching the backend's `exercise_group` default — prevents
          // brand-new entries from vanishing before config is updated.
          const k = classify(e.exercise);
          if (k !== "strength" && k !== "unknown") continue;
          const w = e.weight;
          const s = typeof e.sets === "number" ? e.sets : Number(e.sets ?? 0);
          const r = repsAsNumber(e.reps);
          if (typeof w !== "number" || !s || r == null) continue;
          const vol = w * s * r;
          const bucket = byDate.get(e.date) ?? [];
          bucket.push(vol);
          byDate.set(e.date, bucket);
        } else {
          // META_CARDIO — includes mobility, matching the original behaviour.
          const k = classify(e.exercise);
          if (k !== "cardio" && k !== "mobility") continue;
          const dur = e.duration_min;
          if (typeof dur !== "number") continue;
          const bucket = byDate.get(e.date) ?? [];
          bucket.push(dur);
          byDate.set(e.date, bucket);
        }
      }
    } else {
      // One dot per date — aggregate multiple entries on the same day to their average.
      for (const item of state.progression) {
        if (item.date < cutoff || item.date > today) continue;
        const v = metricValue(exercise, classify(exercise), item);
        const bucket = byDate.get(item.date) ?? [];
        if (typeof v === "number") bucket.push(v);
        byDate.set(item.date, bucket);
      }
    }

    // Reduction per date: meta charts SUM (total volume), per-exercise charts AVERAGE.
    const reduce = (values: number[]): number | null => {
      if (values.length === 0) return null;
      if (isMeta(exercise)) return values.reduce((a, b) => a + b, 0);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    // Fill ALL calendar days so gaps are visible.
    const result: { date: string; label: string; metric: number | null }[] = [];
    const [y0, m0, d0] = cutoff.split("-").map(Number);
    const [y1, m1, d1] = today.split("-").map(Number);
    const start = new Date(y0, m0 - 1, d0);
    const end = new Date(y1, m1 - 1, d1);
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      result.push({
        date: ds,
        label: formatDate(ds),
        metric: reduce(byDate.get(ds) ?? []),
      });
    }
    return result;
  }, [state.progression, state.selectedExercise, state.allEntries, windowDays, selectedDate, classify]);

  /** All-time PRs for the currently-selected strength exercise. Used to
   *  draw a larger accent dot at the PR date. Skipped entirely for meta,
   *  cardio, mobility, and binary views. */
  const prDates = useMemo(() => {
    const ex = state.selectedExercise;
    const k = classify(ex);
    if (isMeta(ex) || k === "cardio" || k === "mobility") {
      return { weightDate: null as string | null, volumeDate: null as string | null };
    }
    const relevant = state.allEntries.filter((e) => e.exercise === ex);
    const prs = computePRs(relevant);
    const pr = prs.get(ex);
    return {
      weightDate: pr?.maxWeightEntry?.date ?? null,
      volumeDate: pr?.maxVolumeEntry?.date ?? null,
    };
  }, [state.selectedExercise, state.allEntries, classify]);

  /** Daily and weekly vertical gridlines for the chart. Daily lines are
   *  the sub-grid (very faint). Weekly lines (Mondays) are drawn on top at
   *  a higher opacity so the eye can lock onto week boundaries while still
   *  being able to count individual days. */
  const dayGridlines = useMemo(() => chartData.map((p) => p.date), [chartData]);
  const weekGridlines = useMemo(() => {
    const out: string[] = [];
    for (const p of chartData) {
      const [y, m, d] = p.date.split("-").map(Number);
      if (new Date(y, m - 1, d).getDay() === 1) out.push(p.date);
    }
    return out;
  }, [chartData]);

  const pillButtons = useMemo(() => {
    return state.exercises
      .map((exercise) => ({ name: exercise, count: pillCounts[exercise] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [state.exercises, pillCounts]);

  const recentSessions = useMemo(() => {
    const cutoff = addDaysISO(selectedDate, -windowDays);
    return [...state.progression]
      .filter((item) => item.date >= cutoff && item.date <= selectedDate)
      .reverse();
  }, [state.progression, windowDays, selectedDate]);

  /** Per-day rows for the meta charts' table view: date, total volume,
   *  and how many entries contributed. Newest first. */
  const metaRows = useMemo(() => {
    if (!isMeta(state.selectedExercise)) return [];
    return [...chartData]
      .filter((p) => p.metric != null)
      .reverse()
      .map((p) => ({ date: p.date, total: p.metric as number }));
  }, [chartData, state.selectedExercise]);

  const selectedKind = classify(state.selectedExercise);

  const yAxisFormatter = useMemo(() => {
    const mk = metricKind(state.selectedExercise, selectedKind);
    if (mk === "binary") {
      return (value: number) => (value === 1 ? "✓" : "");
    }
    const unit = metricUnit(state.selectedExercise, selectedKind);
    // Locale-formatted with thousand separators. Decimals stay for kg/min so
    // small values like "5.5 kg" survive, but volumes like "12,000 kg total"
    // become readable instead of a 5-digit blob.
    const fmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
    return (value: number) => `${fmt.format(value)} ${unit}`;
  }, [state.selectedExercise, selectedKind]);

  const isBinaryView = metricKind(state.selectedExercise, selectedKind) === "binary";

  const isCardioView = selectedKind === "cardio" || selectedKind === "mobility";

  /** Stroke color for the chart line — pulled from the three section
   *  accent shades declared in globals.css. Shade-1 is the full section
   *  accent (strength); shade-2 and shade-3 are progressively lighter
   *  derivations for cardio and mobility. Changing the section color in
   *  settings.yaml cascades through all three shades automatically. */
  const lineColor = useMemo(() => {
    const ex = state.selectedExercise;
    if (ex === META_CARDIO) return EXERCISE_TONE_COLOR.cardio;
    if (ex === META_STRENGTH) return EXERCISE_TONE_COLOR.strength;
    return exerciseToneColor(selectedKind);
  }, [state.selectedExercise, selectedKind]);

  const demoHref = useDemoHref();
  const startHref = demoHref("/septena/training/session/start");

  if (isLoading && !bulk) return <DashboardSkeleton title="Training" />;

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton href={startHref}>
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      {state.error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{state.error}</CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="rounded-2xl">
          <WeekStreak />
        </Card>
        {cardioData && cardioData.daily.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Zone 2 Cardio</CardTitle>
                  <CardDescription>Rolling 7-day total · {cardioData.target_weekly_min}min weekly target</CardDescription>
                </div>
                {(() => {
                  const latest = cardioData.daily.at(-1);
                  if (!latest) return null;
                  const pct = Math.round((latest.rolling_7d / cardioData.target_weekly_min) * 100);
                  return (
                    <span
                      className="text-2xl font-bold tabular-nums"
                      style={{
                        color:
                          pct >= 100
                            ? "var(--section-accent-shade-1)"
                            : pct >= 60
                              ? "var(--section-accent-shade-2)"
                              : "var(--destructive)",
                      }}
                    >
                      {Math.round(latest.rolling_7d)}m
                    </span>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent className="min-w-0 px-4">
              <ChartContainer config={{
                z2_today: { label: "Z2 cardio", color: "var(--section-accent-shade-2)" },
                rolling_7d: { label: "7-day sum", color: "var(--section-accent-shade-3)" },
              }} className="h-[200px] w-full">
                <BarChart
                  data={cardioData.daily.slice(-7).map((d) => ({
                    ...d,
                    z2_today: d.minutes,
                    rolling_7d: d.rolling_7d,
                  }))}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={0} />
                  <YAxis {...Y_AXIS}
                    domain={[0, (max: number) => Math.max(max, Math.ceil(cardioData.target_weekly_min / 0.9))]}
                    tickFormatter={(v: number) => `${v}m`} />
                  <ReferenceLine y={cardioData.target_weekly_min} stroke="var(--section-accent-shade-1)" strokeDasharray="6 3"
                    label={{ value: `${cardioData.target_weekly_min}m target`, position: "right", fontSize: 10, fill: "var(--section-accent-shade-1)" }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="z2_today" stackId="a" fill="var(--color-z2_today)" {...barAnim} />
                  <Bar dataKey="rolling_7d" stackId="a" fill="var(--color-rolling_7d)" opacity={0.3} radius={[4, 4, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{META_LABEL[state.selectedExercise] ?? (state.selectedExercise ? titleCase(state.selectedExercise) : "Select an exercise")}</CardTitle>
                <CardDescription>{chartSubtitle(state.selectedExercise, selectedKind)}</CardDescription>
              </div>
              <select
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value) as WindowDays)}
                className="rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--section-accent)]"
                aria-label="Time window"
              >
                {WINDOW_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </select>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[320px] w-full">
                  <LineChart
                    accessibilityLayer
                    data={chartData}
                    margin={{ left: 12, right: 12, top: 12 }}
                  >
                    <CartesianGrid {...CHART_GRID} />
                    {dayGridlines.map((iso) => (
                      <ReferenceLine
                        key={`d-${iso}`}
                        x={iso}
                        stroke="var(--section-accent)"
                        strokeOpacity={0.08}
                      />
                    ))}
                    {weekGridlines.map((iso) => (
                      <ReferenceLine
                        key={`w-${iso}`}
                        x={iso}
                        stroke="var(--section-accent)"
                        strokeOpacity={0.35}
                      />
                    ))}
                    <XAxis {...WEEKDAY_X_AXIS} minTickGap={24} tickMargin={8} />
                    <YAxis {...Y_AXIS}
                      width={72}
                      domain={isBinaryView ? [0, 1.2] : [0, "auto"]}
                      ticks={isBinaryView ? [0, 1] : undefined}
                      tickFormatter={yAxisFormatter}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--section-accent)", strokeOpacity: 0.4 }}
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload[0]) return null;
                        const p = payload[0].payload as { date: string; metric: number | null };
                        if (p.metric == null) return null;
                        const isWeightPR = p.date === prDates.weightDate;
                        const isVolumePR = p.date === prDates.volumeDate;
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                            <p className="font-medium">{formatDate(p.date)}</p>
                            <p className="tabular-nums text-muted-foreground">
                              {formatValue(p.metric, state.selectedExercise, selectedKind)}
                            </p>
                            {(isWeightPR || isVolumePR) && (
                              <p className="mt-1 flex gap-1">
                            {isWeightPR && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                                    style={{ backgroundColor: SECTION_ACCENT_SHADE_1 }}
                                  >
                                    PR kg
                                  </span>
                                )}
                                {isVolumePR && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                                    style={{ backgroundColor: SECTION_ACCENT_SHADE_2 }}
                                  >
                                    PR vol
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Line
                      dataKey="metric"
                      stroke={lineColor}
                      strokeWidth={isBinaryView ? 0 : 2}
                      // Custom dot renderer: a PR date renders as a slightly
                      // larger filled circle with a gold ring. Non-PR dots
                      // keep the stock appearance.
                      dot={(props) => {
                        const { cx, cy, payload, key } = props as {
                          cx?: number;
                          cy?: number;
                          key?: string;
                          payload?: { date?: string };
                        };
                        if (cx == null || cy == null) {
                          return <g key={key} />;
                        }
                        const d = payload?.date;
                        const isWeightPR = d != null && d === prDates.weightDate;
                        const isVolumePR = d != null && d === prDates.volumeDate;
                        const isPR = isWeightPR || isVolumePR;
                        const r = isBinaryView ? 5 : isPR ? 6 : 3;
                        return (
                          <g key={key}>
                            {isPR && (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r + 3}
                                fill="none"
                                stroke={SECTION_ACCENT_STRONG}
                                strokeWidth={2}
                              />
                            )}
                            <circle cx={cx} cy={cy} r={r} fill={lineColor} stroke={lineColor} />
                          </g>
                        );
                      }}
                      activeDot={false}
                      connectNulls={!isBinaryView}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  {state.loading ? "Loading chart…" : "No data available for this exercise yet."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exercise Type</CardTitle>
              <CardDescription>Pick an exercise to chart</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {(() => {
                  // Pill grouping mirrors the backend classification. Unknown
                  // (not yet in config) falls into Strength, same as the
                  // chart's strength path.
                  const cardio = pillButtons.filter(({ name }) => {
                    const k = classify(name);
                    return k === "cardio" || k === "mobility";
                  });
                  const strength = pillButtons.filter(({ name }) => {
                    const k = classify(name);
                    return k !== "cardio" && k !== "mobility";
                  });
                  // Prepend the meta "All …" pill at the head of each category.
                  // Count = number of distinct exercises that contribute to it,
                  // so the badge means "this aggregate covers N exercises".
                  const metaStrength = { name: META_STRENGTH, count: strength.length };
                  const metaCardio = { name: META_CARDIO, count: cardio.length };
                  const categories: Array<{ title: string; tone: "cardio" | "strength"; items: typeof pillButtons }> = [
                    { title: "Cardio & mobility", tone: "cardio", items: [metaCardio, ...cardio] },
                    { title: "Strength", tone: "strength", items: [metaStrength, ...strength] },
                  ];
                  return categories.map(({ title, tone, items }) =>
                    items.length === 0 ? null : (
                      <div key={title}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
                        <div className="flex flex-wrap gap-2">
                          {items.map(({ name, count }) => {
                            const selected = state.selectedExercise === name;
                            // Cardio category uses shade-2 (lighter), strength uses
                            // shade-1 (full accent). Hover uses one shade lighter than
                            // the selected state. Driven entirely off the section
                            // accent so the user's exercise color cascades through.
                            const fillVar = EXERCISE_TONE_COLOR[tone];
                            const hoverVar =
                              tone === "cardio"
                                ? SECTION_ACCENT_SHADE_3
                                : SECTION_ACCENT_SHADE_2;
                            const idleStyle: CSSProperties = {
                              borderColor: `color-mix(in oklab, ${fillVar} 30%, var(--border))`,
                              backgroundColor: `color-mix(in oklab, ${fillVar} 8%, var(--background))`,
                              color: fillVar,
                            };
                            const selectedStyle: CSSProperties = {
                              borderColor: fillVar,
                              backgroundColor: fillVar,
                            };
                            return (
                              <button
                                key={name}
                                onClick={() => { void onSelectExercise(name); }}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                                  selected ? "text-white" : "",
                                )}
                                style={selected ? selectedStyle : idleStyle}
                                onMouseEnter={(e) => {
                                  if (!selected) {
                                    e.currentTarget.style.borderColor = hoverVar;
                                    e.currentTarget.style.backgroundColor = `color-mix(in oklab, ${hoverVar} 12%, var(--background))`;
                                    e.currentTarget.style.color = hoverVar;
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!selected) {
                                    e.currentTarget.style.borderColor = idleStyle.borderColor as string;
                                    e.currentTarget.style.backgroundColor = idleStyle.backgroundColor as string;
                                    e.currentTarget.style.color = idleStyle.color as string;
                                  }
                                }}
                              >
                                {META_LABEL[name] ?? titleCase(name)}
                                <span
                                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs"
                                  style={
                                    selected
                                      ? { backgroundColor: "rgb(255 255 255 / 0.24)", color: "white" }
                                      : {
                                          backgroundColor: `color-mix(in oklab, ${fillVar} 12%, var(--background))`,
                                          color: fillVar,
                                        }
                                  }
                                >
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <RecentTrainingSessions entries={state.allEntries} />
        </div>
      </>
    );
  }

// ── Recent sessions list ─────────────────────────────────────────────────────
// Mirrors the nutrition RecentEntriesList: sessions grouped by day, with the
// contained exercises as sub-items. Session time comes from concluded_at.
// Session title is inferred from the dominant group among the session's
// exercises (same logic as the timeline event label).

type SessionGroup = {
  concludedAt: string;   // "YYYY-MM-DDTHH:MM:SS" (or date when time missing)
  date: string;
  time: string | null;   // "HH:MM"
  entries: ExerciseEntry[];
};

const GROUP_TITLE: Record<string, string> = {
  upper: "Upper",
  lower: "Lower",
  cardio: "Cardio",
  mobility: "Mobility",
  core: "Core",
  strength: "Strength",
};

function groupByConcluded(entries: ExerciseEntry[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  for (const e of entries) {
    const key = e.concluded_at || e.date;
    const bucket = map.get(key) ?? {
      concludedAt: key,
      date: e.date,
      time: e.concluded_at ? e.concluded_at.slice(11, 16) : null,
      entries: [],
    };
    bucket.entries.push(e);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.concludedAt.localeCompare(a.concludedAt));
}

function inferSessionTitle(entries: ExerciseEntry[], config: ExerciseConfig | undefined): string {
  if (!config) return "Training";
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const raw = (e.exercise ?? "").toLowerCase();
    const resolved = config.aliases?.[raw] ?? raw;
    const ex = config.exercises?.find((x) => x.name.toLowerCase() === resolved);
    let group = "strength";
    if (ex) {
      if (ex.type === "strength") group = ex.subgroup || "upper";
      else group = ex.type;
    }
    counts[group] = (counts[group] ?? 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return dominant ? GROUP_TITLE[dominant] ?? "Training" : "Training";
}

function RecentTrainingSessions({ entries }: { entries: ExerciseEntry[] }) {
  const { data: config } = useSWR("training-config", getExerciseConfig, {
    revalidateOnFocus: false,
  });
  const sessions = useMemo(() => groupByConcluded(entries), [entries]);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
        <CardDescription>{sessions.length} sessions · grouped by day</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {sessions.reduce<React.ReactNode[]>((rows, s, i) => {
            const prev = sessions[i - 1];
            if (i === 0 || (prev && prev.date !== s.date)) {
              const [y, m, d] = s.date.split("-").map(Number);
              const dayLabel = new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              });
              rows.push(
                <li key={`sep-${s.date}`} className="flex justify-center py-2">
                  <span className="text-xs font-medium text-muted-foreground">{dayLabel}</span>
                </li>,
              );
            }
            const title = inferSessionTitle(s.entries, config);
            // Sort sub-items chronologically by logged_at (set when each
            // entry is POSTed individually during the live session). Falls
            // back to alphabetical for legacy entries without logged_at.
            const sortedEntries = [...s.entries].sort((a, b) => {
              const la = a.logged_at || "";
              const lb = b.logged_at || "";
              if (la && lb) return la.localeCompare(lb);
              if (la) return -1;
              if (lb) return 1;
              return (a.exercise ?? "").localeCompare(b.exercise ?? "");
            });
            const exerciseGroups = new Map<string, ExerciseEntry[]>();
            for (const e of sortedEntries) {
              const name = e.exercise ?? "—";
              const arr = exerciseGroups.get(name) ?? [];
              arr.push(e);
              exerciseGroups.set(name, arr);
            }
            // Session totals — volume for strength (sum of weight×sets×reps),
            // minutes and distance for cardio entries.
            let volume = 0;
            let cardioMin = 0;
            let cardioM = 0;
            for (const e of s.entries) {
              const reps = typeof e.reps === "number" ? e.reps : Number(e.reps) || 0;
              const sets = typeof e.sets === "number" ? e.sets : Number(e.sets) || 0;
              const w = e.weight ?? 0;
              if (w && sets && reps) volume += w * sets * reps;
              if (e.duration_min) cardioMin += e.duration_min;
              if (e.distance_m) cardioM += e.distance_m;
            }
            // Session duration: first-to-last logged_at. Only meaningful
            // when at least two entries have logged_at timestamps.
            const stamps = s.entries.map((e) => e.logged_at).filter((x): x is string => !!x).sort();
            let durationMin: number | null = null;
            if (stamps.length >= 2) {
              const ms = new Date(stamps[stamps.length - 1]!).getTime() - new Date(stamps[0]!).getTime();
              durationMin = Math.round(ms / 60_000);
            }
            const totals: string[] = [];
            if (durationMin != null && durationMin > 0) totals.push(`${durationMin}min session`);
            if (volume > 0) totals.push(`${Math.round(volume).toLocaleString()}kg volume`);
            if (cardioMin > 0) totals.push(`${Math.round(cardioMin)}min cardio`);
            if (cardioM > 0) totals.push(`${(cardioM / 1000).toFixed(cardioM >= 10000 ? 0 : 1)}km`);
            rows.push(
              <li key={s.concludedAt} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {title}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {s.time ?? "—"} · {exerciseGroups.size} {exerciseGroups.size === 1 ? "exercise" : "exercises"}
                    </span>
                  </p>
                </div>
                {totals.length > 0 && (
                  <p className="mt-0.5 text-xs font-medium tabular-nums" style={{ color: "var(--section-accent)" }}>
                    {totals.join(" · ")}
                  </p>
                )}
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {[...exerciseGroups.entries()].map(([name, items]) => {
                    const first = items[0]!;
                    const isCardio = first.duration_min != null || first.distance_m != null;
                    return (
                      <li key={name} className="flex items-center justify-between gap-2">
                        <span className="truncate">{titleCase(name)}</span>
                        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                          {isCardio ? (
                            <>
                              {first.duration_min != null && <span>{first.duration_min}min</span>}
                              {first.distance_m != null && <span>{first.distance_m}m</span>}
                              <LevelGlyph level={first.level} />
                            </>
                          ) : (
                            <>
                              {first.weight != null && <span>{first.weight}kg</span>}
                              {first.sets != null && (
                                <span>{first.sets}×{first.reps ?? "?"}</span>
                              )}
                              <DifficultyGlyph difficulty={first.difficulty} />
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>,
            );
            return rows;
          }, [])}
        </ul>
      </CardContent>
    </Card>
  );
}
