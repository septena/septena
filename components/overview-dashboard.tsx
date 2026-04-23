"use client";

import Link from "next/link";
import useSWR from "swr";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SECTIONS } from "@/lib/sections";
import { useSections } from "@/hooks/use-sections";
import { useDemoHref } from "@/hooks/use-demo-href";
import { SectionTheme } from "@/components/section-theme";
import { EXTRA_MINIS as LOCAL_EXTRA_MINIS } from "@/components/overview-minis-extra";
import {
  getCardioHistory,
  getEntries,
  getNutritionStats,
  getHabitDay,
  getHabitHistory,
  getSupplementDay,
  getSupplementHistory,
  getHealthCombined,
  getHealthCache,
  getCannabisDay,
  getCannabisHistory,
  getCannabisSessions,
  getCaffeineDay,
  getCaffeineHistory,
  getChores,
  getChoreHistory,
  getGroceries,
  getGroceryHistory,
  getWeather,
  getCalendar,
  getAirSummary,
  getAirHistory,
  getSettings,
} from "@/lib/api";
import { DEFAULT_DAY_PHASES, activePhaseId } from "@/lib/day-phases";
import { weekdayShort, computeStreak } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { computeFastingState, useFastingConfig } from "@/lib/fasting";
import { useMacroTargets, useFastingTarget } from "@/lib/macro-targets";
import { cn } from "@/lib/utils";
import { QuickLogModal } from "@/components/quick-log-modal";
import { TodayTimeline } from "@/components/today-timeline";
import { LoadTimer } from "@/components/load-timer";
import {
  ExerciseQuickLog,
  NutritionQuickLog,
  CaffeineQuickLog,
  CannabisQuickLog,
  HabitsQuickLog,
  SupplementsQuickLog,
  ChoresQuickLog,
  GutQuickLog,
} from "@/components/quick-log-forms";
import type { SectionKey } from "@/lib/sections";
import { useBarAnimation } from "@/hooks/use-bar-animation";

// ── Constants ───────────────────────────────────────────────────────────────

const CHART_HEIGHT = "h-[80px]";
// Cardio uses the lighter shade of the exercise accent. Resolved via the
// section-accent CSS vars so it auto-derives from `--section-accent` inside
// any `<SectionTheme sectionKey="exercise">` subtree.
const CARDIO_COLOR = "var(--section-accent-shade-2)";

// ── Week streak helpers ─────────────────────────────────────────────────────

const CARDIO_SET = new Set(["rowing", "elliptical", "stairs", "cycling", "running", "walking", "swimming"]);
const MOBILITY_SET = new Set(["surya namaskar", "pull up"]);
const CORE_SET = new Set(["ab crunch", "abdominal"]);

type DayKind = "strength" | "cardio" | "mobility" | "rest";

function classifyDay(exercises: string[]): DayKind {
  const groups = new Set<DayKind>();
  for (const ex of exercises) {
    if (!ex || CORE_SET.has(ex)) continue;
    if (CARDIO_SET.has(ex)) groups.add("cardio");
    else if (MOBILITY_SET.has(ex)) groups.add("mobility");
    else groups.add("strength");
  }
  if (groups.has("strength")) return "strength";
  if (groups.has("cardio")) return "cardio";
  if (groups.has("mobility")) return "mobility";
  return "rest";
}

function lastSevenDays() {
  const out: { iso: string; weekday: string; isToday: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      iso,
      weekday: d.toLocaleDateString("en-GB", { weekday: "narrow" }),
      isToday: i === 0,
    });
  }
  return out;
}

// ── Time-aware greeting ─────────────────────────────────────────────────────
// Active phase is picked from settings.day_phases by current time; the
// shown greeting + subtitle is a random pair from that phase's `messages`.

// ── Shared sub-components ───────────────────────────────────────────────────

// Provided by SectionCard so MiniStat values inherit the section accent
// without each tile having to thread `color` through every call.
const SectionColorContext = createContext<string | undefined>(undefined);

function MiniStat({ label, value, color, unit }: {
  label: string;
  value: string | number;
  color?: string;
  unit?: string;
}) {
  const ctxColor = useContext(SectionColorContext);
  const resolved = color ?? ctxColor;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums" style={resolved ? { color: resolved } : undefined}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

function ProgressRow({ label, current, total, unit, color, display }: {
  label: string;
  current: string;
  total: string;
  unit?: string;
  color: string;
  display?: string;
}) {
  const num = parseFloat(current) || 0;
  const den = parseFloat(total) || 1;
  const overTarget = num > den;
  // When over target the bar fills fully and the dot marks where the target
  // line sits relative to today's value — so 2× target lands the dot at 50%.
  const pct = overTarget ? 100 : (num / den) * 100;
  const dotPct = overTarget ? (den / num) * 100 : null;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {display ?? `${current}/${total}${unit ?? ""}`}
        </p>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        {dotPct !== null && (
          <span
            aria-hidden
            title="target"
            className="absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-black/10"
            style={{ left: `${dotPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{children}</p>
  );
}

/** Shell for the 7-day bar chart that appears at the bottom of every tile.
 *  Children are the `<Bar>` elements — lets body pass `<Cell>`s per bar and
 *  exercise stack two series, while the label/axes/container stay shared. */
function MiniBarChart({ label, data, chartConfig, yDomain, children }: {
  label: string;
  data: Array<Record<string, unknown>>;
  chartConfig: ChartConfig;
  yDomain?: [number | string, number | string];
  children: React.ReactNode;
}) {
  const barAnim = useBarAnimation();
  // Inject the raise-from-baseline animation props onto every Bar child so
  // the setting applies uniformly without each tile repeating the spread.
  const animatedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type !== Bar) return child;
    return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, barAnim);
  });
  return (
    <div className="mt-3">
      <ChartLabel>{label}</ChartLabel>
      <ChartContainer config={chartConfig} className={cn(CHART_HEIGHT, "w-full pointer-events-none")}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground" }}
            interval={0}
            height={20}
            tickMargin={6}
          />
          <YAxis hide domain={yDomain ?? [0, "auto"]} />
          {animatedChildren}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ── Exercise Mini ────────────────────────────────────────────────────────────

function ExerciseMini() {
  const { data, isLoading } = useSWR("overview-exercise", async () => {
    const [cardio, entries] = await Promise.all([
      getCardioHistory(7),
      getEntries(),
    ]);
    return { cardio, entries };
  }, { refreshInterval: 60_000 });

  const color = "var(--section-accent)";
  const cardio = data?.cardio;
  const latestRolling = cardio?.daily?.at(-1)?.rolling_7d ?? 0;
  const target = cardio?.target_weekly_min ?? 150;

  const { kinds, volumeData } = useMemo(() => {
    const days = lastSevenDays();
    if (!data?.entries) return { kinds: days.map(() => "rest" as DayKind), volumeData: [] };
    const byDate = new Map<string, string[]>();
    const strengthByDate = new Map<string, number>();
    const cardioByDate = new Map<string, number>();
    for (const e of data.entries) {
      if (!e.date || !e.exercise) continue;
      const bucket = byDate.get(e.date) ?? [];
      bucket.push(e.exercise);
      byDate.set(e.date, bucket);
      if (!CORE_SET.has(e.exercise)) {
        if (CARDIO_SET.has(e.exercise) || MOBILITY_SET.has(e.exercise)) {
          if (typeof e.duration_min === "number") {
            cardioByDate.set(e.date, (cardioByDate.get(e.date) ?? 0) + e.duration_min);
          }
        } else {
          const w = e.weight;
          const s = typeof e.sets === "number" ? e.sets : Number(e.sets ?? 0);
          const r = typeof e.reps === "number" ? e.reps : Number(e.reps ?? 0);
          if (typeof w === "number" && s && r) {
            strengthByDate.set(e.date, (strengthByDate.get(e.date) ?? 0) + w * s * r);
          }
        }
      }
    }
    const maxStrength = Math.max(1, ...days.map(({ iso }) => strengthByDate.get(iso) ?? 0));
    const maxCardio = Math.max(1, ...days.map(({ iso }) => cardioByDate.get(iso) ?? 0));
    // Each series contributes up to 50 of the stacked 0-100 range so a peak
    // strength + peak cardio day fills the chart and a half-sized bar reads
    // as ~half the week's effort.
    const volumeData = days.map(({ iso }) => ({
      date: weekdayShort(iso),
      strength: ((strengthByDate.get(iso) ?? 0) / maxStrength) * 50,
      cardio: ((cardioByDate.get(iso) ?? 0) / maxCardio) * 50,
    }));
    return { kinds: days.map(({ iso }) => classifyDay(byDate.get(iso) ?? [])), volumeData };
  }, [data?.entries]);

  const sessionCount = kinds.filter((k) => k !== "rest").length;

  const chartConfig = {
    strength: { label: "Strength", color },
    cardio: { label: "Cardio", color: CARDIO_COLOR },
  } satisfies ChartConfig;

  return (
    <SectionCard section="exercise" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Sessions" value={`${sessionCount}/7`} color={color} />
        <MiniStat label="Z2 min" value={Math.round(latestRolling)} unit="m" />
      </div>

      <ProgressRow
        label="Z2 Cardio"
        current={String(Math.round(latestRolling))}
        total={String(target)}
        unit="m"
        color={CARDIO_COLOR}
      />

      {/* Stacked strength + cardio effort per day. Each series is normalised
       *  against its own 7-day max (different units) and capped at 50, so a
       *  peak-on-both-axes day fills the 0-100 range. */}
      {volumeData.some((d) => d.strength > 0 || d.cardio > 0) && (
        <MiniBarChart label="7-day effort" data={volumeData} chartConfig={chartConfig} yDomain={[0, 100]}>
          <Bar dataKey="strength" stackId="effort" fill={color} radius={[0, 0, 0, 0]} />
          <Bar dataKey="cardio" stackId="effort" fill={CARDIO_COLOR} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Nutrition Mini ───────────────────────────────────────────────────────────

function NutritionMini() {
  const { date: selectedDate } = useSelectedDate();
  const { data, isLoading } = useSWR(["overview-nutrition", selectedDate], () => getNutritionStats(7), { refreshInterval: 60_000 });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const color = "var(--section-accent)";
  const stats = data;
  const daily = stats?.daily ?? [];
  const todayRow = daily.find((d) => d.date === selectedDate);
  const todayProtein = todayRow?.protein_g ?? 0;
  const target = useMacroTargets().protein.max;
  const fastingTarget = useFastingTarget();
  const fastingConfig = useFastingConfig();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fastingState = useMemo(() => computeFastingState(stats ?? null, fastingConfig), [stats, tick, fastingConfig]);

  const isFasting = fastingState.state === "fasting";
  const proteinChartData = useMemo(
    () => daily.slice(-7).map((d) => ({ date: weekdayShort(d.date), v: d.protein_g })),
    [daily],
  );
  const fastingChartData = useMemo(
    () =>
      (stats?.fasting ?? [])
        .filter((f) => f.hours != null)
        .slice(-7)
        .map((f) => ({ date: weekdayShort(f.date), v: f.hours ?? 0 })),
    [stats],
  );
  const chartData = isFasting ? fastingChartData : proteinChartData;
  const chartConfig = {
    v: { label: isFasting ? "Fasting" : "Protein", color },
  } satisfies ChartConfig;

  const nextMeal = useMemo(() => {
    if (fastingState.state !== "fasting" || !stats?.avg_fast_h) return null;
    const [h, m] = fastingState.sinceTime.split(":").map(Number);
    const d = new Date();
    d.setDate(d.getDate() - (fastingState.sinceDay === "yesterday" ? 1 : 0));
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    d.setMinutes(d.getMinutes() + Math.round(stats.avg_fast_h * 60));
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [fastingState, stats]);

  return (
    <SectionCard section="nutrition" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        {fastingState.state === "fasting" ? (
          <MiniStat label="Next Meal" value={nextMeal ?? "—"} color={color} />
        ) : (
          <MiniStat label="Protein" value={`${Math.round(todayProtein)}g`} color={color} />
        )}
        {fastingState.state === "fasting" ? (
          <MiniStat label="Fasting" value={`${fastingState.hours}h ${fastingState.mins}m`} color={color} />
        ) : (
          <MiniStat label="Avg fast" value={stats ? `${stats.avg_fast_h}h` : "—"} />
        )}
      </div>

      {fastingState.state === "fasting" ? (
        <ProgressRow
          label={`Fasting \u00b7 ${fastingTarget.min}-${fastingTarget.max}h goal`}
          current={String(fastingState.hours)}
          total={String(fastingTarget.max)}
          unit="h"
          color={color}
        />
      ) : (
        <ProgressRow
          label="Today's protein"
          current={String(Math.round(todayProtein))}
          total={String(target)}
          unit="g"
          color={color}
        />
      )}

      {chartData.length > 0 && (
        <MiniBarChart label={isFasting ? "7-day fasting" : "7-day protein"} data={chartData} chartConfig={chartConfig}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Habits Mini ──────────────────────────────────────────────────────────────

function HabitsMini() {
  const { date: today } = useSelectedDate();
  const { data, isLoading } = useSWR(["overview-habits", today], async () => {
    const [day, history] = await Promise.all([getHabitDay(today), getHabitHistory(7)]);
    return { day, history };
  }, { refreshInterval: 60_000 });

  const color = "var(--section-accent)";
  const day = data?.day;
  const history = data?.history;
  const streak = useMemo(() => computeStreak(history?.daily), [history]);

  const chartData = useMemo(
    () => (history?.daily ?? []).slice(-7).map((d) => ({ date: weekdayShort(d.date), v: d.percent })),
    [history],
  );
  const chartConfig = { v: { label: "%", color } } satisfies ChartConfig;

  return (
    <SectionCard section="habits" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Today" value={day ? `${day.done_count}/${day.total}` : "—"} color={color} />
        <MiniStat label="Streak" value={`${streak}d`} />
      </div>

      {day && (
        <ProgressRow
          label="Today's habits"
          current={String(day.done_count)}
          total={String(day.total)}
          color={color}
        />
      )}

      {chartData.length > 0 && (
        <MiniBarChart label="7-day completion" data={chartData} chartConfig={chartConfig} yDomain={[0, 100]}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Chores Mini ──────────────────────────────────────────────────────────────

function ChoresMini() {
  const { data, isLoading } = useSWR("overview-chores", async () => {
    const [list, history] = await Promise.all([getChores(), getChoreHistory(7)]);
    return { list, history };
  }, { refreshInterval: 60_000 });

  const color = "var(--section-accent)";
  const chores = data?.list.chores ?? [];
  const today = data?.list.today ?? "";
  const overdue = chores.filter((c) => c.days_overdue > 0 && c.last_completed !== today).length;
  const dueToday = chores.filter((c) => c.days_overdue === 0).length;
  // Actionable = anything overdue, due today, or already ticked off today —
  // matches ChoresDashboard's todo list so the bar fills as the day progresses.
  const actionable = chores.filter((c) => c.days_overdue >= 0 || c.last_completed === today);
  const doneToday = actionable.filter((c) => c.last_completed === today).length;

  const chartData = useMemo(
    () => (data?.history.daily ?? []).slice(-7).map((d) => ({ date: weekdayShort(d.date), v: d.completed })),
    [data],
  );
  const chartConfig = { v: { label: "done", color } } satisfies ChartConfig;

  return (
    <SectionCard section="chores" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          label="Overdue"
          value={overdue}
          color={overdue > 0 ? "hsl(0,70%,55%)" : color}
        />
        <MiniStat label="Due today" value={dueToday} color={color} />
      </div>

      {actionable.length > 0 && (
        <ProgressRow
          label="Today's chores"
          current={String(doneToday)}
          total={String(actionable.length)}
          color={color}
        />
      )}

      {chartData.length > 0 && (
        <MiniBarChart label="7-day completions" data={chartData} chartConfig={chartConfig}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Groceries Mini ───────────────────────────────────────────────────────────

function GroceriesMini() {
  const { data, isLoading } = useSWR("groceries", getGroceries);
  const { data: history } = useSWR("overview-groceries-history", () => getGroceryHistory(7), {
    refreshInterval: 60_000,
  });
  const color = "var(--section-accent)";
  const items = data?.items ?? [];
  const lowCount = items.filter((i) => i.low).length;

  const chartData = useMemo(
    () =>
      (history?.daily ?? []).slice(-7).map((d) => ({
        date: weekdayShort(d.date),
        bought: d.bought,
        needed: d.needed,
      })),
    [history],
  );
  const weekTotal = chartData.reduce((s, d) => s + d.bought + d.needed, 0);
  // Needed is the darker accent, bought is a lighter tint — reads as
  // "stock running low" vs "restocked" at a glance.
  const chartConfig = {
    needed: { label: "Needed", color },
    bought: { label: "Bought", color },
  } satisfies ChartConfig;

  return (
    <SectionCard section="groceries" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Need" value={lowCount > 0 ? lowCount : "—"} color={color} />
        <MiniStat label="7-day marks" value={weekTotal > 0 ? weekTotal : "—"} />
      </div>

      {weekTotal > 0 && (
        <MiniBarChart label="Needed vs Bought (7d)" data={chartData} chartConfig={chartConfig}>
          <Bar dataKey="needed" stackId="g" fill={color} radius={[0, 0, 0, 0]} />
          <Bar dataKey="bought" stackId="g" fill={color} fillOpacity={0.4} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Supplements Mini ─────────────────────────────────────────────────────────

function SupplementsMini() {
  const { date: today } = useSelectedDate();
  const { data, isLoading } = useSWR(["overview-supplements", today], async () => {
    const [day, history] = await Promise.all([getSupplementDay(today), getSupplementHistory(7)]);
    return { day, history };
  }, { refreshInterval: 60_000 });

  const color = "var(--section-accent)";
  const day = data?.day;
  const history = data?.history;
  const streak = useMemo(() => computeStreak(history?.daily), [history]);

  const chartData = useMemo(
    () => (history?.daily ?? []).slice(-7).map((d) => ({ date: weekdayShort(d.date), v: d.percent })),
    [history],
  );
  const chartConfig = { v: { label: "%", color } } satisfies ChartConfig;

  return (
    <SectionCard section="supplements" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Today" value={day ? `${day.done_count}/${day.total}` : "—"} color={color} />
        <MiniStat label="Streak" value={`${streak}d`} />
      </div>

      {day && (
        <ProgressRow
          label="Today's supplements"
          current={String(day.done_count)}
          total={String(day.total)}
          color={color}
        />
      )}

      {chartData.length > 0 && (
        <MiniBarChart label="7-day completion" data={chartData} chartConfig={chartConfig} yDomain={[0, 100]}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Cannabis Mini ────────────────────────────────────────────────────────────

function CannabisMini() {
  const { date: today } = useSelectedDate();
  const { data, isLoading } = useSWR(["overview-cannabis", today], async () => {
    const [day, history, sessions] = await Promise.all([
      getCannabisDay(today),
      getCannabisHistory(7),
      getCannabisSessions(30),
    ]);
    return { day, history, sessions };
  }, { refreshInterval: 60_000 });

  // Tick once a minute so the "last session" relative time stays live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const color = "var(--section-accent)";
  const day = data?.day;
  const history = data?.history;
  const sessions = data?.sessions?.sessions ?? [];

  const lastSessionLabel = useMemo(() => {
    if (sessions.length === 0) return "—";
    const last = sessions[sessions.length - 1];
    const [y, m, d] = last.date.split("-").map(Number);
    const [hh, mm] = (last.time ?? "00:00").split(":").map(Number);
    const then = new Date(y!, m! - 1, d!, hh ?? 0, mm ?? 0).getTime();
    const diffMin = Math.max(0, Math.floor((Date.now() - then) / 60000));
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  }, [sessions]);

  const chartData = useMemo(
    () => (history?.daily ?? []).slice(-7).map((d) => ({ date: weekdayShort(d.date), v: d.total_g })),
    [history],
  );
  const chartConfig = { v: { label: "g", color } } satisfies ChartConfig;

  // "Today vs 7d avg" — bar reads as today's consumption relative to a
  // typical day. Empty = abstained; full = hit your average; overflow
  // clamps at 100% when over avg. Less-is-better; an empty bar is the win.
  const weekAvg = chartData.length > 0
    ? chartData.reduce((s, d) => s + (d.v ?? 0), 0) / chartData.length
    : 0;
  const todayG = day?.total_g ?? 0;

  return (
    <SectionCard section="cannabis" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Sessions" value={day?.session_count ?? "—"} color={color} />
        <MiniStat label="Last" value={lastSessionLabel} unit={lastSessionLabel !== "—" ? "ago" : undefined} />
      </div>

      {weekAvg > 0 && (
        <ProgressRow
          label="Today vs 7d avg"
          current={todayG.toFixed(1)}
          total={weekAvg.toFixed(1)}
          unit="g"
          color={color}
        />
      )}

      {chartData.length > 0 && (
        <MiniBarChart label="7-day usage" data={chartData} chartConfig={chartConfig}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Caffeine Mini ────────────────────────────────────────────────────────────

function CaffeineMini() {
  const { date: today } = useSelectedDate();
  const { data, isLoading } = useSWR(
    ["overview-caffeine", today],
    async () => {
      const [day, history] = await Promise.all([getCaffeineDay(today), getCaffeineHistory(7)]);
      return { day, history };
    },
    { refreshInterval: 60_000 },
  );

  const color = "var(--section-accent)";
  const day = data?.day;
  const history = data?.history;

  const chartData = useMemo(
    () =>
      (history?.daily ?? [])
        .slice(-7)
        .map((d) => ({ date: weekdayShort(d.date), v: d.total_g ?? 0 })),
    [history],
  );
  const chartConfig = { v: { label: "g", color } } satisfies ChartConfig;

  // Average only over days that actually have a grams log — null means the
  // day wasn't tracked, not that it was zero. 0g is legitimate (abstained).
  const tracked = (history?.daily ?? []).slice(-7).filter((d) => d.total_g != null);
  const weekAvg = tracked.length > 0
    ? tracked.reduce((s, d) => s + (d.total_g as number), 0) / tracked.length
    : 0;
  const todayG = day?.total_g ?? 0;
  const hasAny = weekAvg > 0 || todayG > 0;

  return (
    <SectionCard section="caffeine" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Today" value={day?.session_count ?? "—"} color={color} />
        <MiniStat
          label="Grams"
          value={day && day.total_g != null ? `${day.total_g}` : "—"}
          unit={day && day.total_g != null ? "g" : undefined}
        />
      </div>

      {weekAvg > 0 && (
        <ProgressRow
          label="Today vs 7d avg"
          current={todayG.toFixed(1)}
          total={weekAvg.toFixed(1)}
          unit="g"
          color={color}
        />
      )}

      {hasAny && (
        <MiniBarChart label="7-day grams" data={chartData} chartConfig={chartConfig}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Health Mini ──────────────────────────────────────────────────────────────

function HealthMini() {
  const { data: cached } = useSWR("health-cache-overview", getHealthCache, {
    revalidateOnFocus: false,
  });
  const { data, isLoading } = useSWR("overview-health", () => getHealthCombined(7), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  const color = "var(--section-accent)";
  const oura = data?.oura ?? [];
  const apple = data?.apple ?? [];

  const latestReadiness = [...oura].reverse().find((r) => r.readiness_score != null);
  const latestHRV = [...oura].reverse().find((r) => r.hrv != null);

  const hrvData = useMemo(() => {
    const byDate = new Map(oura.filter((r) => r.hrv != null).map((r) => [r.date, r.hrv as number]));
    const present = [...byDate.values()];
    const placeholder = present.length ? Math.max(...present) : 0;
    return lastSevenDays().map(({ iso, weekday }) => {
      const v = byDate.get(iso);
      return { date: weekday, v: v ?? placeholder, missing: v == null };
    });
  }, [oura]);
  const chartConfig = { v: { label: "HRV", color } } satisfies ChartConfig;

  const readinessScore = latestReadiness?.readiness_score ?? null;

  return (
    <SectionCard section="health" loading={isLoading && !cached}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Readiness" value={readinessScore ?? "—"} color={color} />
        <MiniStat label="HRV" value={latestHRV?.hrv ?? "—"} unit="ms" />
      </div>

      {readinessScore != null && (
        <ProgressRow
          label="Readiness"
          current={String(readinessScore)}
          total="100"
          color={color}
        />
      )}

      {hrvData.length > 0 && (
        <MiniBarChart label="7-day HRV" data={hrvData} chartConfig={chartConfig}>
          <Bar dataKey="v" radius={[3, 3, 0, 0]}>
            {hrvData.map((d, i) => (
              <Cell key={i} fill={color} fillOpacity={d.missing ? 0.15 : 1} />
            ))}
          </Bar>
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Sleep Mini ──────────────────────────────────────────────────────────────

function SleepMini() {
  const { data: cached } = useSWR("health-cache-sleep", getHealthCache, {
    revalidateOnFocus: false,
  });
  const { data, isLoading } = useSWR("overview-sleep", () => getHealthCombined(7), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  const color = "var(--section-accent)";
  const oura = data?.oura ?? [];

  const latestSleep = [...oura].reverse().find((r) => r.sleep_score != null || r.efficiency != null);
  const latestTotal = [...oura].reverse().find((r) => r.total_h != null);
  const totalH = latestTotal?.total_h ?? 0;

  const chartData = useMemo(() => {
    const byDate = new Map(oura.filter((r) => r.total_h != null).map((r) => [r.date, r.total_h as number]));
    return lastSevenDays().map(({ iso, weekday }) => {
      const v = byDate.get(iso);
      return { date: weekday, v: v ?? 8, missing: v == null };
    });
  }, [oura]);
  const chartConfig = { v: { label: "Hours", color } } satisfies ChartConfig;

  return (
    <SectionCard section="sleep" loading={isLoading && !cached}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Score" value={latestSleep?.sleep_score ?? latestSleep?.efficiency ?? "—"} color={color} />
        <MiniStat
          label="Total"
          value={latestTotal?.total_h != null ? `${latestTotal.total_h.toFixed(1)}` : "—"}
          unit="hrs"
        />
      </div>

      <ProgressRow
        label="Sleep target"
        current={totalH.toFixed(1)}
        total="8"
        unit="h"
        color={color}
      />

      {chartData.length > 0 && (
        <MiniBarChart label="7-day sleep" data={chartData} chartConfig={chartConfig} yDomain={[0, 10]}>
          <Bar dataKey="v" radius={[3, 3, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={color} fillOpacity={d.missing ? 0.15 : 1} />
            ))}
          </Bar>
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Body Mini ───────────────────────────────────────────────────────────────

function BodyMini() {
  const { data: cached } = useSWR("health-cache-body", getHealthCache, {
    revalidateOnFocus: false,
  });
  const { data, isLoading } = useSWR("overview-body", () => getHealthCombined(14), {
    fallbackData: cached,
    refreshInterval: 60_000,
  });

  const color = "var(--section-accent)";
  const withings = data?.withings ?? [];

  const latestWeight = [...withings].reverse().find((r) => r.weight_kg != null);
  const latestFat = [...withings].reverse().find((r) => r.fat_pct != null);

  const weightData = useMemo(() => {
    const byDate = new Map(
      withings.filter((r) => r.weight_kg != null).map((r) => [r.date, r.weight_kg as number]),
    );
    const days = lastSevenDays();
    const present = days.map(({ iso }) => byDate.get(iso)).filter((v): v is number => v != null);
    if (present.length === 0) return [];
    const avg = present.reduce((s, v) => s + v, 0) / present.length;
    const maxAbs = Math.max(0.1, ...present.map((v) => Math.abs(v - avg)));
    return days.map(({ iso, weekday }) => {
      const w = byDate.get(iso);
      if (w == null) return { date: weekday, v: Number((maxAbs * 0.4).toFixed(2)), missing: true };
      return { date: weekday, v: Number((w - avg).toFixed(2)), missing: false };
    });
  }, [withings]);
  const chartConfig = { v: { label: "kg", color } } satisfies ChartConfig;
  const LOSS_COLOR = "hsl(145,55%,42%)";
  const GAIN_COLOR = "hsl(0,55%,50%)";

  // "Toward 15% BF" — bar fills as body fat approaches the goal from a
  // ceiling of 25%. Arbitrary goalposts (user can tune in settings later).
  const FAT_GOAL = 15;
  const FAT_CEILING = 25;
  const fatPct = latestFat?.fat_pct ?? null;
  const fatProgress =
    fatPct != null
      ? Math.max(0, Math.min(100, ((FAT_CEILING - fatPct) / (FAT_CEILING - FAT_GOAL)) * 100))
      : 0;

  return (
    <SectionCard section="body" loading={isLoading && !cached}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          label="Weight"
          value={latestWeight?.weight_kg != null ? `${latestWeight.weight_kg.toFixed(1)}` : "—"}
          unit="kg"
          color={color}
        />
        <MiniStat
          label="Body Fat"
          value={fatPct != null ? `${fatPct.toFixed(1)}` : "—"}
          unit="%"
        />
      </div>

      {fatPct != null && (
        <ProgressRow
          label={`Toward ${FAT_GOAL}% BF`}
          current={String(Math.round(fatProgress))}
          total="100"
          color={color}
          display={`${fatPct.toFixed(1)}%`}
        />
      )}

      {weightData.length > 0 && (
        <MiniBarChart label="Weight vs avg (7d)" data={weightData} chartConfig={chartConfig} yDomain={["auto", "auto"]}>
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.3} />
          <Bar dataKey="v" radius={[3, 3, 3, 3]}>
            {weightData.map((d, i) => (
              <Cell
                key={i}
                fill={d.missing ? "hsl(var(--muted-foreground))" : d.v <= 0 ? LOSS_COLOR : GAIN_COLOR}
                fillOpacity={d.missing ? 0.15 : 1}
              />
            ))}
          </Bar>
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Weather Mini ─────────────────────────────────────────────────────────────

function WeatherIconSvg({ icon, color, className = "h-6 w-6" }: { icon: string; color: string; className?: string }) {
  // Single-stroke 24×24 icons matched to the weather code buckets in the
  // backend. Same stroke weight + viewBox as MetaActionBar icons so they
  // sit consistently next to each other on the tile.
  const common = { className, fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };
  switch (icon) {
    case "sun":
      return (<svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
    case "partly":
      return (<svg {...common}><circle cx="8" cy="9" r="3" /><path d="M8 2v1M2 9h1M3.5 4.5l.7.7M11.5 4.5l-.7.7" /><path d="M14 18a4 4 0 1 0-7-2.5A3 3 0 0 0 8 21h9a3 3 0 0 0 0-6 3 3 0 0 0-3 3z" /></svg>);
    case "cloud":
      return (<svg {...common}><path d="M6 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 18 18z" /></svg>);
    case "fog":
      return (<svg {...common}><path d="M3 8h18M5 12h14M3 16h18M5 20h14" /></svg>);
    case "rain":
      return (<svg {...common}><path d="M6 14a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 18 14z" /><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" /></svg>);
    case "snow":
      return (<svg {...common}><path d="M6 14a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 18 14z" /><path d="M8 19h.01M12 21h.01M16 19h.01M10 21h.01M14 19h.01" /></svg>);
    case "storm":
      return (<svg {...common}><path d="M6 14a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 18 14z" /><path d="M11 14l-2 4h3l-2 4" /></svg>);
    default:
      return (<svg {...common}><path d="M6 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 18 18z" /></svg>);
  }
}

function WeatherMini() {
  // Weather refreshes much less aggressively than logged data — every 10
  // minutes is plenty since the backend re-fetches from open-meteo each call.
  const { data, isLoading, error } = useSWR(
    "overview-weather",
    getWeather,
    { refreshInterval: 600_000, shouldRetryOnError: false },
  );

  const color = "var(--section-accent)";

  if (error || (!isLoading && !data)) {
    return (
      <SectionCard section="weather" loading={false}>
        <p className="text-sm text-muted-foreground">
          Set a location in Settings to see weather.
        </p>
      </SectionCard>
    );
  }

  const cur = data?.current;
  const daily = (data?.daily ?? []).slice(0, 7);
  const today = daily[0];

  // Baseline a few degrees below the lowest low so bars don't compress to a
  // flat line when the week's temps are clustered together.
  const lows = daily.map((d) => d.low).filter((v): v is number => typeof v === "number");
  const baseline = lows.length ? Math.floor(Math.min(...lows)) - 2 : 0;
  const chartData = daily.map((d) => ({
    date: d.weekday,
    high: d.high != null ? d.high - baseline : 0,
  }));

  const chartConfig = {
    high: { label: "High", color },
  } satisfies ChartConfig;

  return (
    <SectionCard section="weather" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          label={data?.location?.split(",")[0]?.trim() || "Now"}
          value={cur?.temperature != null ? `${Math.round(cur.temperature)}°` : "—"}
          color={color}
        />
        <MiniStat
          label={cur?.label ?? "Today"}
          value={today ? `${today.high != null ? Math.round(today.high) : "—"}° / ${today.low != null ? Math.round(today.low) : "—"}°` : "—"}
        />
      </div>

      {chartData.length > 0 && (
        <>
          <MiniBarChart label="7-day forecast" data={chartData} chartConfig={chartConfig}>
            <Bar dataKey="high" fill={color} radius={[3, 3, 0, 0]} />
          </MiniBarChart>
          <div className="mt-1 grid grid-cols-7 gap-0.5 text-center">
            {daily.map((d) => (
              <div key={d.date} className="flex flex-col items-center">
                <WeatherIconSvg icon={d.icon} color={color} className="h-4 w-4" />
                <p className="mt-0.5 text-[10px] tabular-nums text-foreground">{d.high != null ? `${Math.round(d.high)}°` : "—"}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── Calendar Mini ────────────────────────────────────────────────────────────

function fmtEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function localDay(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function CalendarMini() {
  const { data, isLoading } = useSWR(
    "overview-calendar",
    getCalendar,
    { refreshInterval: 300_000, shouldRetryOnError: false },
  );

  const color = "var(--section-accent)";
  const today = data?.today ?? "";
  const now = new Date();
  const events = data?.events ?? [];
  const upcomingToday = events.filter(
    (e) => localDay(e.start) === today && (e.all_day || new Date(e.start) >= now),
  );
  const next = events.find((e) => new Date(e.start) >= now);
  const tomorrowDay = (() => {
    const d = new Date(today || now);
    d.setDate(d.getDate() + 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  })();
  const tomorrowEvents = events.filter((e) => localDay(e.start) === tomorrowDay);

  return (
    <SectionCard section="calendar" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Today" value={data?.today_count ?? 0} color={color} />
        <MiniStat label="Next" value={next ? fmtEventTime(next.start) : "—"} />
      </div>

      {data?.error ? (
        <p className="mt-3 text-xs text-muted-foreground">{data.error}</p>
      ) : upcomingToday.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {upcomingToday.slice(0, 4).map((e, i) => (
            <div key={`${e.start}-${i}`} className="flex min-w-0 items-baseline gap-2 text-xs">
              <span className="shrink-0 tabular-nums text-muted-foreground">{fmtEventTime(e.start)}</span>
              <span className="min-w-0 flex-1 overflow-hidden truncate" style={{ color }}>{e.title}</span>
            </div>
          ))}
        </div>
      ) : tomorrowEvents.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tomorrow</p>
          <div className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {tomorrowEvents[0].all_day ? "all-day" : fmtEventTime(tomorrowEvents[0].start)}
            </span>
            <span className="min-w-0 flex-1 overflow-hidden truncate" style={{ color }}>
              {tomorrowEvents[0].title}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No upcoming events</p>
      )}
    </SectionCard>
  );
}

// ── Air Mini ────────────────────────────────────────────────────────────────

function AirMini() {
  const { data: summary, isLoading: sumLoading } = useSWR("overview-air-summary", getAirSummary, { refreshInterval: 60_000 });
  const { data: history, isLoading: hLoading } = useSWR("overview-air-history", () => getAirHistory(7), { refreshInterval: 60_000 });
  const color = "var(--section-accent)";

  const latest = summary?.latest ?? null;

  const chartData = useMemo(() => {
    const daily = history?.daily ?? [];
    const byDate = new Map(daily.map((d) => [d.date, d.co2_max]));
    return lastSevenDays().map(({ iso, weekday }) => {
      const v = byDate.get(iso);
      return {
        date: weekday,
        v: v != null ? Math.round(v) : 0,
        missing: v == null,
      };
    });
  }, [history]);
  const hasData = chartData.some((d) => !d.missing);
  const chartConfig = { v: { label: "ppm", color } } satisfies ChartConfig;

  return (
    <SectionCard section="air" loading={sumLoading || hLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          label="CO₂"
          value={latest?.co2_ppm != null ? `${latest.co2_ppm}` : "—"}
          unit="ppm"
        />
        <MiniStat
          label="Today > 1000"
          value={summary?.today ? `${summary.today.minutes_over_1000}` : "—"}
          unit="m"
        />
      </div>

      {hasData && (
        <MiniBarChart label="7-day peak CO₂" data={chartData} chartConfig={chartConfig} yDomain={[400, "auto"]}>
          <ReferenceLine y={1000} stroke={color} strokeDasharray="3 3" strokeOpacity={0.4} />
          <Bar dataKey="v" radius={[3, 3, 3, 3]}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill={d.missing ? "hsl(var(--muted-foreground))" : color}
                fillOpacity={d.missing ? 0.15 : 1}
              />
            ))}
          </Bar>
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Section card shell ──────────────────────────────────────────────────────

const SECTION_MINI: Record<string, React.FC> = {
  exercise: ExerciseMini,
  nutrition: NutritionMini,
  habits: HabitsMini,
  chores: ChoresMini,
  groceries: GroceriesMini,
  supplements: SupplementsMini,
  health: HealthMini,
  cannabis: CannabisMini,
  caffeine: CaffeineMini,
  sleep: SleepMini,
  body: BodyMini,
  weather: WeatherMini,
  calendar: CalendarMini,
  air: AirMini,
  ...(LOCAL_EXTRA_MINIS ?? {}),
};

// ── Bottom action buttons ──────────────────────────────────────────────────
// Insights, Data sources, and Settings — meta-pages that don't have numbers
// to summarise, so they live as a row of pill buttons beneath the section
// grid instead of taking up a card-sized tile.

function MetaActionBar() {
  const toHref = useDemoHref();
  const ACTIONS: { href: string; label: string; icon: React.ReactNode }[] = [
    {
      href: "/insights",
      label: "Insights",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V5M4 19h16" />
          <path d="m8 15 3-4 3 2 4-7" />
        </svg>
      ),
    },
    {
      href: "/data",
      label: "Data sources",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      ),
    },
    {
      href: "/settings",
      label: "Settings",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      ),
    },
  ];
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={toHref(a.href)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          {a.icon}
          <span>{a.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Icon shown inside the homepage quick-log button.
 *  "plus" reads as "log a new entry" (meals, doses, sessions). "check" reads
 *  as "tick off the next item from a fixed list" (habits, supplements,
 *  chores) — the action there isn't creation, it's completion. */
type QuickLogIcon = "plus" | "check" | "play";

function QuickLogGlyph({ icon }: { icon: QuickLogIcon }) {
  if (icon === "check") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  if (icon === "play") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-[1px]" fill="currentColor">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Sections that expose a quick-log affordance from the homepage tile.
 *  Each entry is (title, component, icon). Component is rendered inside the
 *  shared QuickLogModal; forms call globalMutate() on their own SWR keys. */
const QUICK_LOG: Partial<
  Record<SectionKey, { title: string; Component: React.FC<{ onDone: () => void }>; icon: QuickLogIcon }>
> = {
  exercise:    { title: "Start session",  Component: ExerciseQuickLog,    icon: "play"  },
  nutrition:   { title: "Log meal",       Component: NutritionQuickLog,   icon: "plus"  },
  caffeine:    { title: "Log caffeine",   Component: CaffeineQuickLog,    icon: "plus"  },
  cannabis:    { title: "Log cannabis",   Component: CannabisQuickLog,    icon: "plus"  },
  habits:      { title: "Check habits",   Component: HabitsQuickLog,      icon: "check" },
  supplements: { title: "Supplements",    Component: SupplementsQuickLog, icon: "check" },
  chores:      { title: "Chores",         Component: ChoresQuickLog,      icon: "check" },
  gut:         { title: "Log gut",        Component: GutQuickLog,         icon: "plus"  },
};

const QuickLogContext = createContext<((key: SectionKey) => void) | null>(null);

export function SectionCard({ section, loading, children }: {
  section: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  const s = SECTIONS[section as keyof typeof SECTIONS];
  const color = "var(--section-accent)";
  const toHref = useDemoHref();
  const openQuickLog = useContext(QuickLogContext);
  const quickLog = QUICK_LOG[s.key];
  const hasQuickLog = !!openQuickLog && !!quickLog;
  return (
    <SectionTheme sectionKey={s.key} className="group relative min-w-0 w-full rounded-2xl border border-border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link href={toHref(s.path)} className="block p-5">
        <div
          className="absolute left-0 top-4 h-8 w-1 rounded-r-full"
          style={{ backgroundColor: color }}
        />
        <div className="mb-3 pr-10">
          <h2 className="text-base font-semibold tracking-tight">{s.label}</h2>
        </div>
        {loading ? (
          <div aria-hidden>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i}>
                  <div className="h-[15px] w-12 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between">
                <div className="h-[15px] w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-10 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-3">
              <div className="mb-1 h-[15px] w-24 animate-pulse rounded bg-muted" />
              <div className={cn(CHART_HEIGHT, "w-full animate-pulse rounded bg-muted")} />
            </div>
          </div>
        ) : (
          <SectionColorContext.Provider value={color}>{children}</SectionColorContext.Provider>
        )}
      </Link>
      {hasQuickLog && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openQuickLog!(s.key);
          }}
          aria-label={`Quick log — ${s.label}`}
          title={`Quick log — ${s.label}`}
          // Outer button is 44×44 to meet touch-target guidance — the visible
          // circle is the inner span (32×32). Keeps the tap area generous
          // without making the tile feel dominated by a huge FAB.
          className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center transition-transform active:scale-95"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            <QuickLogGlyph icon={quickLog!.icon} />
          </span>
        </button>
      )}
    </SectionTheme>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function OverviewDashboard() {
  const { data: settings } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  const phases = settings?.day_phases ?? DEFAULT_DAY_PHASES;
  // Pick active phase + random message pair once per mount — re-randomising
  // on every render would make the text flicker on unrelated state changes.
  const { greeting, subtitle } = useMemo(() => {
    const activeId = activePhaseId(phases);
    const phase = phases.find((p) => p.id === activeId) ?? phases[0];
    const messages = phase?.messages?.length ? phase.messages : [{ greeting: phase?.label ?? "", subtitle: "" }];
    return messages[Math.floor(Math.random() * messages.length)];
  }, [phases]);
  const [openKey, setOpenKey] = useState<SectionKey | null>(null);
  const active = openKey ? QUICK_LOG[openKey] : null;
  const allSections = useSections();
  const activeSection = openKey ? allSections.find((s) => s.key === openKey) ?? null : null;
  const toHref = useDemoHref();
  // Home tiles respect user's section_order from settings. Correlations
  // is excluded — it's a meta view on the bottom action row, not a
  // section to log into.
  const visibleSections = allSections.filter(
    (s) => s.enabled && s.key !== "correlations",
  );

  return (
    <QuickLogContext.Provider value={setOpenKey}>
      <>
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <Link href={toHref("/timeline")}><TodayTimeline /></Link>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSections.map((s) => {
            const Mini = SECTION_MINI[s.key];
            return Mini ? <Mini key={s.key} /> : null;
          })}
        </div>

        <MetaActionBar />

        <LoadTimer />

        {active && activeSection && (
          <QuickLogModal
            open
            onClose={() => setOpenKey(null)}
            title={active.title}
            accent={activeSection.color}
          >
            <active.Component onDone={() => setOpenKey(null)} />
          </QuickLogModal>
        )}
      </>
    </QuickLogContext.Provider>
  );
}
