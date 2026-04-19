"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import {
  getEntries,
  getProgression,
  getStats,
  getNextWorkout,
  getSummary,
  getCardioHistory,
  type ExerciseEntry,
  type ProgressionPoint,
  type Stats,
  type CardioHistory,
} from "@/lib/api";
import { computePRs } from "@/lib/pr";
import { cn } from "@/lib/utils";
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
import { SectionStatusBar } from "@/components/section-status-bar";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { SECTIONS, EXERCISE_SHADES } from "@/lib/sections";
import { relativeTime, formatDateLong as formatDate, addDaysISO, formatWeekdayTick } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { StatCard } from "@/components/stat-card";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { useBarAnimation } from "@/hooks/use-bar-animation";

const EXERCISE_COLOR = SECTIONS.exercise.color;

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
const CORE_EXERCISES = new Set(["ab crunch", "abdominal"]);

function isMeta(name: string): name is typeof META_STRENGTH | typeof META_CARDIO {
  return name === META_STRENGTH || name === META_CARDIO;
}

function isStrengthExercise(name: string | undefined): boolean {
  if (!name) return false;
  if (CORE_EXERCISES.has(name)) return false;
  return !CARDIO_EXERCISES.has(name) && !MOBILITY_EXERCISES.has(name);
}

const chartConfig = {
  metric: {
    label: "Metric",
    color: EXERCISE_SHADES.strength,
  },
} satisfies ChartConfig;

// Default visible window in days. The dropdown lets the user widen it.
const DEFAULT_WINDOW_DAYS = 30;
const WINDOW_OPTIONS = [30, 60, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

// Canonical exercise sets for the new schema. Anything not listed is treated
// as strength (weight in kg). Legacy `row` entries from the old schema lack
// duration_min and will fall through to the strength path until sync removes
// them.
const CARDIO_EXERCISES = new Set(["rowing", "elliptical", "stairs"]);
const MOBILITY_EXERCISES = new Set(["surya namaskar", "pull up"]);

type MetricKind = "pace" | "duration" | "weight" | "binary" | "volume" | "cardioTotal";

function metricKind(exercise: string): MetricKind {
  if (exercise === META_STRENGTH) return "volume";
  if (exercise === META_CARDIO) return "cardioTotal";
  if (exercise === "rowing" || exercise === "elliptical") return "pace";
  if (exercise === "stairs") return "duration";
  // Binary: duration is irrelevant, only "did it / didn't" matters.
  if (exercise === "surya namaskar") return "binary";
  if (MOBILITY_EXERCISES.has(exercise)) return "duration";
  return "weight";
}

function metricUnit(exercise: string): string {
  const k = metricKind(exercise);
  if (k === "pace") return "m/min";
  if (k === "duration") return "min";
  if (k === "binary") return "";
  if (k === "volume") return "kg";
  if (k === "cardioTotal") return "min";
  return "kg";
}

function metricValue(exercise: string, point: ProgressionPoint): number | null {
  const kind = metricKind(exercise);
  if (kind === "pace") {
    if (point.distance_m != null && point.duration_min != null && point.duration_min > 0) {
      return Math.round((point.distance_m / point.duration_min) * 10) / 10;
    }
    return null;
  }
  if (kind === "duration") return point.duration_min ?? null;
  if (kind === "binary") return 1; // presence; nulls = "not done that day"
  return point.weight ?? null;
}

function formatValue(value: number | null | undefined, exercise: string): string {
  if (typeof value !== "number") return "—";
  const kind = metricKind(exercise);
  if (kind === "binary") return "✓ done";
  if (kind === "volume") return `${Math.round(value).toLocaleString("en-GB")} kg`;
  if (kind === "cardioTotal") return `${Math.round(value).toLocaleString("en-GB")} min`;
  const unit = metricUnit(exercise);
  if (unit === "kg") return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${unit}`;
}

function chartSubtitle(exercise: string): string {
  const kind = metricKind(exercise);
  if (kind === "pace") return "Pace (m/min) per session";
  if (kind === "duration") return "Duration (min) per session";
  if (kind === "binary") return "Days logged";
  if (kind === "volume") return "Total volume per session — sum of weight × sets × reps";
  if (kind === "cardioTotal") return "Total cardio minutes per session";
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
  const [nextWorkout, setNextWorkout] = useState<{ type: string; emoji: string; label: string } | null>(null);
  const [lastWorkoutDate, setLastWorkoutDate] = useState<string | null>(null);

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
    if (bulk.next.suggested) setNextWorkout(bulk.next.suggested);
    const lastStrength = bulk.next.last_date.upper || bulk.next.last_date.lower;
    setLastWorkoutDate(lastStrength ?? null);
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
          if (!isStrengthExercise(e.exercise)) continue;
          const w = e.weight;
          const s = typeof e.sets === "number" ? e.sets : Number(e.sets ?? 0);
          const r = repsAsNumber(e.reps);
          if (typeof w !== "number" || !s || r == null) continue;
          const vol = w * s * r;
          const bucket = byDate.get(e.date) ?? [];
          bucket.push(vol);
          byDate.set(e.date, bucket);
        } else {
          // META_CARDIO
          if (!e.exercise || !(CARDIO_EXERCISES.has(e.exercise) || MOBILITY_EXERCISES.has(e.exercise))) continue;
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
        const v = metricValue(exercise, item);
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
  }, [state.progression, state.selectedExercise, state.allEntries, windowDays, selectedDate]);

  /** All-time PRs for the currently-selected strength exercise. Used to
   *  draw a larger accent dot at the PR date. Skipped entirely for meta,
   *  cardio, mobility, and binary views. */
  const prDates = useMemo(() => {
    const ex = state.selectedExercise;
    if (isMeta(ex) || CARDIO_EXERCISES.has(ex) || MOBILITY_EXERCISES.has(ex)) {
      return { weightDate: null as string | null, volumeDate: null as string | null };
    }
    const relevant = state.allEntries.filter((e) => e.exercise === ex);
    const prs = computePRs(relevant);
    const pr = prs.get(ex);
    return {
      weightDate: pr?.maxWeightEntry?.date ?? null,
      volumeDate: pr?.maxVolumeEntry?.date ?? null,
    };
  }, [state.selectedExercise, state.allEntries]);

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

  const yAxisFormatter = useMemo(() => {
    const kind = metricKind(state.selectedExercise);
    if (kind === "binary") {
      return (value: number) => (value === 1 ? "✓" : "");
    }
    const unit = metricUnit(state.selectedExercise);
    // Locale-formatted with thousand separators. Decimals stay for kg/min so
    // small values like "5.5 kg" survive, but volumes like "12,000 kg total"
    // become readable instead of a 5-digit blob.
    const fmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
    return (value: number) => `${fmt.format(value)} ${unit}`;
  }, [state.selectedExercise]);

  const isBinaryView = metricKind(state.selectedExercise) === "binary";

  const isCardioView =
    CARDIO_EXERCISES.has(state.selectedExercise) || MOBILITY_EXERCISES.has(state.selectedExercise);

  /** Stroke color for the chart line — sourced from the shared
   *  EXERCISE_SHADES palette so the line matches the week-streak dots,
   *  pills, and homepage week strip pixel-for-pixel. */
  const lineColor = useMemo(() => {
    const ex = state.selectedExercise;
    if (ex === META_CARDIO) return EXERCISE_SHADES.cardio;
    if (ex === META_STRENGTH) return EXERCISE_SHADES.strength;
    if (MOBILITY_EXERCISES.has(ex)) return EXERCISE_SHADES.mobility;
    if (CARDIO_EXERCISES.has(ex)) return EXERCISE_SHADES.cardio;
    return EXERCISE_SHADES.strength;
  }, [state.selectedExercise]);

  if (isLoading && !bulk) return <DashboardSkeleton title="Exercise" />;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <SectionHeaderAction>
        <SectionHeaderActionButton color={EXERCISE_COLOR} href="/exercise/session/start">
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
                    <span className={cn(
                      "text-2xl font-bold tabular-nums",
                      pct >= 100 ? "text-orange-500" : pct >= 60 ? "text-orange-400" : "text-red-400",
                    )}>
                      {Math.round(latest.rolling_7d)}m
                    </span>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent className="min-w-0 px-4">
              <ChartContainer config={{
                z2_today: { label: "Z2 cardio", color: EXERCISE_SHADES.cardio },
                rolling_7d: { label: "7-day sum", color: EXERCISE_SHADES.mobility },
              }} className="h-[200px] w-full">
                <BarChart
                  data={cardioData.daily.slice(-7).map((d) => ({
                    ...d,
                    z2_today: d.minutes,
                    rolling_7d: d.rolling_7d,
                  }))}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0}
                    tickFormatter={(v) => formatWeekdayTick(v as string)} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={36}
                    domain={[0, (max: number) => Math.max(max, Math.ceil(cardioData.target_weekly_min / 0.9))]}
                    tickFormatter={(v: number) => `${v}m`} />
                  <ReferenceLine y={cardioData.target_weekly_min} stroke={EXERCISE_SHADES.strength} strokeDasharray="6 3"
                    label={{ value: `${cardioData.target_weekly_min}m target`, position: "right", fontSize: 10, fill: EXERCISE_SHADES.strength }} />
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
                <CardTitle className="text-base">{META_LABEL[state.selectedExercise] ?? state.selectedExercise ?? "Select an exercise"}</CardTitle>
                <CardDescription>{chartSubtitle(state.selectedExercise)}</CardDescription>
              </div>
              <select
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value) as WindowDays)}
                className="rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                    <CartesianGrid vertical={false} />
                    {dayGridlines.map((iso) => (
                      <ReferenceLine
                        key={`d-${iso}`}
                        x={iso}
                        stroke="#94a3b8"
                        strokeOpacity={0.1}
                      />
                    ))}
                    {weekGridlines.map((iso) => (
                      <ReferenceLine
                        key={`w-${iso}`}
                        x={iso}
                        stroke="#94a3b8"
                        strokeOpacity={0.45}
                      />
                    ))}
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                      tickMargin={8}
                      tickFormatter={(val) => formatWeekdayTick(val as string)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      domain={isBinaryView ? [0, 1.2] : [0, "auto"]}
                      ticks={isBinaryView ? [0, 1] : undefined}
                      tickFormatter={yAxisFormatter}
                    />
                    <Tooltip
                      cursor={{ stroke: "#94a3b8", strokeOpacity: 0.35 }}
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
                              {formatValue(p.metric, state.selectedExercise)}
                            </p>
                            {(isWeightPR || isVolumePR) && (
                              <p className="mt-1 flex gap-1">
                                {isWeightPR && (
                                  <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                                    PR kg
                                  </span>
                                )}
                                {isVolumePR && (
                                  <span className="rounded-full bg-purple-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
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
                                stroke="#eab308" /* yellow-500 */
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

              <div className="mt-4 flex flex-col gap-4 border-t pt-4">
                {(() => {
                  const cardio = pillButtons.filter(({ name }) => CARDIO_EXERCISES.has(name) || MOBILITY_EXERCISES.has(name));
                  const strength = pillButtons.filter(({ name }) => !CARDIO_EXERCISES.has(name) && !MOBILITY_EXERCISES.has(name));
                  // Prepend the meta "All …" pill at the head of each category.
                  // Count = number of distinct exercises that contribute to it,
                  // so the badge means "this aggregate covers N exercises".
                  const metaStrength = { name: META_STRENGTH, count: strength.length };
                  const metaCardio = { name: META_CARDIO, count: cardio.length };
                  const categories: Array<{ title: string; accent: "cardio" | "orange"; items: typeof pillButtons }> = [
                    { title: "Cardio & mobility", accent: "cardio", items: [metaCardio, ...cardio] },
                    { title: "Strength", accent: "orange", items: [metaStrength, ...strength] },
                  ];
                  return categories.map(({ title, accent, items }) =>
                    items.length === 0 ? null : (
                      <div key={title}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
                        <div className="flex flex-wrap gap-2">
                          {items.map(({ name, count }) => {
                            const selected = state.selectedExercise === name;
                            return (
                              <button
                                key={name}
                                onClick={() => { void onSelectExercise(name); }}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                                  selected
                                    ? accent === "cardio"
                                      ? "border-orange-400 bg-orange-400 text-white"
                                      : "border-orange-500 bg-orange-500 text-white"
                                    : accent === "cardio"
                                      ? "border-border bg-card text-muted-foreground hover:border-orange-300 hover:text-foreground"
                                      : "border-border bg-card text-muted-foreground hover:border-orange-400 hover:text-foreground",
                                )}
                              >
                                {META_LABEL[name] ?? name}
                                <span
                                  className={cn(
                                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs",
                                    selected
                                      ? "bg-black/30 text-black dark:bg-white/30 dark:text-white"
                                      : "bg-muted text-muted-foreground",
                                  )}
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

          <Card>
            <CardHeader>
              <CardTitle>
                {isMeta(state.selectedExercise)
                  ? `Per-session totals (${metaRows.length})`
                  : `All sessions (${state.progression.length})`}
              </CardTitle>
              <CardDescription>
                {isMeta(state.selectedExercise)
                  ? "Aggregate per training day, newest first."
                  : "Every logged entry for this exercise, newest first."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                {isMeta(state.selectedExercise) ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>{state.selectedExercise === META_STRENGTH ? "Total volume" : "Total minutes"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metaRows.length > 0 ? (
                        metaRows.map((row) => (
                          <TableRow key={row.date}>
                            <TableCell>{formatDate(row.date)}</TableCell>
                            <TableCell>{formatValue(row.total, state.selectedExercise)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">
                            {state.loading ? "Loading…" : "No sessions in this window."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                ) : (
                <Table>
                  <TableHeader>
                    {isCardioView ? (
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>{metricKind(state.selectedExercise) === "pace" ? "Pace" : "Duration"}</TableHead>
                        <TableHead>Distance</TableHead>
                        <TableHead>Level</TableHead>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Sets</TableHead>
                        <TableHead>Reps</TableHead>
                        <TableHead>Difficulty</TableHead>
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {recentSessions.length > 0 ? (
                      recentSessions.map((item, i) => {
                        const value = metricValue(state.selectedExercise, item);
                        if (isCardioView) {
                          return (
                            <TableRow key={`${item.date}-${i}`}>
                              <TableCell>{formatDate(item.date)}</TableCell>
                              <TableCell>{formatValue(value, state.selectedExercise)}</TableCell>
                              <TableCell>{item.distance_m != null ? `${item.distance_m} m` : "—"}</TableCell>
                              <TableCell>{item.level ?? "—"}</TableCell>
                            </TableRow>
                          );
                        }
                        return (
                          <TableRow key={`${item.date}-${item.weight}-${i}`}>
                            <TableCell>{formatDate(item.date)}</TableCell>
                            <TableCell>{formatValue(value, state.selectedExercise)}</TableCell>
                            <TableCell>{item.sets ?? "—"}</TableCell>
                            <TableCell>{item.reps ?? "—"}</TableCell>
                            <TableCell>{item.difficulty || "medium"}</TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={isCardioView ? 4 : 5} className="text-center text-muted-foreground">
                          {state.loading ? "Loading sessions…" : "No sessions found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <SectionStatusBar section="exercise" />
      </main>
    );
  }
