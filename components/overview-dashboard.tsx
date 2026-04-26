"use client";

import Link from "next/link";
import useSWR from "swr";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  getTaskCounts,
  getTaskHistory,
  getAirSummary,
  getAirHistory,
  getSettings,
} from "@/lib/api";
import {
  DEFAULT_DAY_PHASES,
  DEFAULT_DAY_PHASE_BOUNDARIES,
  DEFAULT_DAY_END,
  activePhaseId,
  resolvePhases,
} from "@/lib/day-phases";
import { formatWeekdayTick, computeStreak, lastSevenDaysISO } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { computeFastingState, useFastingConfig } from "@/lib/fasting";
import { useMacroTargets, useFastingTarget } from "@/lib/macro-targets";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/progress-bar";
import { QuickLogModal } from "@/components/quick-log-modal";
import { TodayTimeline } from "@/components/today-timeline";
import { NextWidget } from "@/components/next-widget";
import { LoadTimer } from "@/components/load-timer";
import { QUICK_LOG, type QuickLogIcon } from "@/lib/quick-log-registry";
import type { SectionKey } from "@/lib/sections";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import {
  SECTION_ACCENT,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_STRONG,
} from "@/lib/section-colors";

// ── Constants ───────────────────────────────────────────────────────────────

const CHART_HEIGHT = "h-[80px]";
// Every tile inherits its color from the active SectionTheme via this CSS
// var, so tiles never hardcode a hex. Cardio gets the lighter shade.
export const ACCENT = "var(--section-accent)";
const CARDIO_COLOR = "var(--section-accent-shade-2)";

/** Standard single-series chart config — every mini bar chart uses this. */
function simpleChartConfig(label: string): ChartConfig {
  return { v: { label, color: ACCENT } };
}

/** Map a 7-day daily history into `{ date, v }` chart rows using the
 *  shared Title Case 3-letter weekday tick. `field` picks which numeric
 *  property of the daily row becomes `v`. */
function weekChartData<T extends { date: string }>(
  daily: T[] | undefined,
  field: keyof T,
): { date: string; v: number }[] {
  return (daily ?? []).slice(-7).map((d) => ({
    date: formatWeekdayTick(d.date),
    v: Number(d[field] ?? 0),
  }));
}

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
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {display ?? `${current}/${total}${unit ?? ""}`}
        </p>
      </div>
      <ProgressBar value={num / den} color={color} />
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
  const { data, isLoading } = useSWR("overview-training", async () => {
    const [cardio, entries] = await Promise.all([
      getCardioHistory(7),
      getEntries(),
    ]);
    return { cardio, entries };
  }, { refreshInterval: 60_000 });

  const color = ACCENT;
  const cardio = data?.cardio;
  const latestRolling = cardio?.daily?.at(-1)?.rolling_7d ?? 0;
  const target = cardio?.target_weekly_min ?? 150;

  const { kinds, volumeData } = useMemo(() => {
    const days = lastSevenDaysISO();
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
      date: formatWeekdayTick(iso),
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
    <SectionCard section="training" loading={isLoading}>
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

  const color = ACCENT;
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
    () => daily.slice(-7).map((d) => ({ date: formatWeekdayTick(d.date), v: d.protein_g })),
    [daily],
  );
  const liveFastHours = fastingState.state === "fasting" ? fastingState.totalMin / 60 : 0;
  const fastingChartData = useMemo(
    () =>
      (stats?.fasting ?? [])
        .slice(-7)
        .map((f) => ({ date: formatWeekdayTick(f.date), v: f.hours ?? (f.date === selectedDate ? liveFastHours : 0) })),
    [stats, selectedDate, liveFastHours],
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

  const color = ACCENT;
  const day = data?.day;
  const history = data?.history;
  const streak = useMemo(() => computeStreak(history?.daily), [history]);

  const chartData = useMemo(() => weekChartData(history?.daily, "percent"), [history]);
  const chartConfig = simpleChartConfig("%");

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

  const color = ACCENT;
  const chores = data?.list.chores ?? [];
  const today = data?.list.today ?? "";
  const overdue = chores.filter((c) => c.days_overdue > 0 && c.last_completed !== today).length;
  const dueToday = chores.filter((c) => c.days_overdue === 0).length;
  // Actionable = anything overdue, due today, or already ticked off today —
  // matches ChoresDashboard's todo list so the bar fills as the day progresses.
  const actionable = chores.filter((c) => c.days_overdue >= 0 || c.last_completed === today);
  const doneToday = actionable.filter((c) => c.last_completed === today).length;

  const chartData = useMemo(() => weekChartData(data?.history.daily, "completed"), [data]);
  const chartConfig = simpleChartConfig("done");

  return (
    <SectionCard section="chores" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          label="Overdue"
          value={overdue}
          color={overdue > 0 ? SECTION_ACCENT_STRONG : color}
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
  const color = ACCENT;
  const items = data?.items ?? [];
  const lowCount = items.filter((i) => i.low).length;

  const chartData = useMemo(
    () =>
      (history?.daily ?? []).slice(-7).map((d) => ({
        date: formatWeekdayTick(d.date),
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

      {items.length > 0 && (
        <ProgressRow
          label="Stocked"
          current={String(items.length - lowCount)}
          total={String(items.length)}
          color={color}
        />
      )}

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

  const color = ACCENT;
  const day = data?.day;
  const history = data?.history;
  const streak = useMemo(() => computeStreak(history?.daily), [history]);

  const chartData = useMemo(() => weekChartData(history?.daily, "percent"), [history]);
  const chartConfig = simpleChartConfig("%");

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

  const color = ACCENT;
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

  const chartData = useMemo(() => weekChartData(history?.daily, "total_g"), [history]);
  const chartConfig = simpleChartConfig("g");

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

  const color = ACCENT;
  const day = data?.day;
  const history = data?.history;

  const chartData = useMemo(() => weekChartData(history?.daily, "total_g"), [history]);
  const chartConfig = simpleChartConfig("g");

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

  const color = ACCENT;
  const oura = data?.oura ?? [];
  const apple = data?.apple ?? [];

  const latestReadiness = [...oura].reverse().find((r) => r.readiness_score != null);
  const latestHRV = [...oura].reverse().find((r) => r.hrv != null);

  const hrvData = useMemo(() => {
    const byDate = new Map(oura.filter((r) => r.hrv != null).map((r) => [r.date, r.hrv as number]));
    const present = [...byDate.values()];
    const placeholder = present.length ? Math.max(...present) : 0;
    return lastSevenDaysISO().map(({ iso, weekday }) => {
      const v = byDate.get(iso);
      return { date: weekday, v: v ?? placeholder, missing: v == null };
    });
  }, [oura]);
  const chartConfig = simpleChartConfig("HRV");

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

  const color = ACCENT;
  const oura = data?.oura ?? [];

  const latestSleep = [...oura].reverse().find((r) => r.sleep_score != null || r.efficiency != null);
  const latestTotal = [...oura].reverse().find((r) => r.total_h != null);
  const totalH = latestTotal?.total_h ?? 0;

  const chartData = useMemo(() => {
    const byDate = new Map(oura.filter((r) => r.total_h != null).map((r) => [r.date, r.total_h as number]));
    return lastSevenDaysISO().map(({ iso, weekday }) => {
      const v = byDate.get(iso);
      return { date: weekday, v: v ?? 8, missing: v == null };
    });
  }, [oura]);
  const chartConfig = simpleChartConfig("Hours");

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

  const color = ACCENT;
  const withings = data?.withings ?? [];

  const latestWeight = [...withings].reverse().find((r) => r.weight_kg != null);
  const latestFat = [...withings].reverse().find((r) => r.fat_pct != null);

  const weightData = useMemo(() => {
    const byDate = new Map(
      withings.filter((r) => r.weight_kg != null).map((r) => [r.date, r.weight_kg as number]),
    );
    const days = lastSevenDaysISO();
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
  const chartConfig = simpleChartConfig("kg");
  const LOSS_COLOR = SECTION_ACCENT_SHADE_3;
  const GAIN_COLOR = SECTION_ACCENT_STRONG;

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
          <ReferenceLine y={0} stroke={SECTION_ACCENT} strokeOpacity={0.2} />
          <Bar dataKey="v" radius={[3, 3, 3, 3]}>
            {weightData.map((d, i) => (
              <Cell
                key={i}
                fill={d.missing ? SECTION_ACCENT_SHADE_3 : d.v <= 0 ? LOSS_COLOR : GAIN_COLOR}
                fillOpacity={d.missing ? 0.15 : 1}
              />
            ))}
          </Bar>
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Air Mini ────────────────────────────────────────────────────────────────

function AirMini() {
  const { data: summary, isLoading: sumLoading } = useSWR("overview-air-summary", getAirSummary, { refreshInterval: 60_000 });
  const { data: history, isLoading: hLoading } = useSWR("overview-air-history", () => getAirHistory(7), { refreshInterval: 60_000 });
  const color = ACCENT;

  const latest = summary?.latest ?? null;

  const chartData = useMemo(() => {
    const daily = history?.daily ?? [];
    const byDate = new Map(daily.map((d) => [d.date, d.co2_max]));
    return lastSevenDaysISO().map(({ iso, weekday }) => {
      const v = byDate.get(iso);
      return {
        date: weekday,
        v: v != null ? Math.round(v) : 0,
        missing: v == null,
      };
    });
  }, [history]);
  const hasData = chartData.some((d) => !d.missing);
  const chartConfig = simpleChartConfig("ppm");

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
                fill={d.missing ? SECTION_ACCENT_SHADE_3 : color}
                fillOpacity={d.missing ? 0.15 : 1}
              />
            ))}
          </Bar>
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Tasks Mini ──────────────────────────────────────────────────────────────

function TasksMini() {
  const { data, isLoading } = useSWR("overview-tasks", async () => {
    const [counts, history] = await Promise.all([getTaskCounts(), getTaskHistory(7)]);
    return { counts, history };
  }, { refreshInterval: 60_000 });

  const color = ACCENT;
  const counts = data?.counts;
  const todayCount = counts?.today_count ?? 0;
  const reviewCount = counts?.review_count ?? 0;
  const openCount = counts?.open_count ?? 0;

  // 7-day "done" counts feed the tile's bar chart so it matches the
  // chores/habits pattern: bars climb as the user completes things.
  const chartData = useMemo(() => weekChartData(data?.history.daily, "done"), [data]);
  const chartConfig = simpleChartConfig("done");

  const doneThisWeek = (data?.history.daily ?? []).reduce((s, d) => s + d.done, 0);

  return (
    <SectionCard section="tasks" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          label="Today"
          value={todayCount || "—"}
          color={color}
        />
        <MiniStat
          label="To review"
          value={reviewCount}
          color={reviewCount > 0 ? SECTION_ACCENT_STRONG : color}
        />
      </div>

      {openCount > 0 && (
        <ProgressRow
          label={`Open (${openCount})`}
          current={String(todayCount)}
          total={String(openCount)}
          color={color}
          display={`${todayCount}/${openCount} in today`}
        />
      )}

      {chartData.length > 0 && (
        <MiniBarChart label={`7-day done (${doneThisWeek})`} data={chartData} chartConfig={chartConfig}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
        </MiniBarChart>
      )}
    </SectionCard>
  );
}

// ── Section card shell ──────────────────────────────────────────────────────

const SECTION_MINI: Record<string, React.FC> = {
  training: ExerciseMini,
  nutrition: NutritionMini,
  habits: HabitsMini,
  chores: ChoresMini,
  tasks: TasksMini,
  groceries: GroceriesMini,
  supplements: SupplementsMini,
  health: HealthMini,
  cannabis: CannabisMini,
  caffeine: CaffeineMini,
  sleep: SleepMini,
  body: BodyMini,
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
      href: "/septena/next",
      label: "Next",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 5v14" />
          <path d="m10 7 6 5-6 5V7Z" />
          <path d="m17 7 3 5-3 5V7Z" />
        </svg>
      ),
    },
    {
      href: "/septena/insights",
      label: "Insights",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V5M4 19h16" />
          <path d="m8 15 3-4 3 2 4-7" />
        </svg>
      ),
    },
    {
      href: "/septena/timeline",
      label: "Timeline",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      ),
    },
    {
      href: "/septena/week",
      label: "Week",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      ),
    },
    {
      href: "/septena/data",
      label: "Data",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      ),
    },
    {
      href: "/septena/settings",
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
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
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


const QuickLogContext = createContext<((key: SectionKey) => void) | null>(null);

export function SectionCard({ section, loading, children }: {
  section: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  const s = SECTIONS[section as keyof typeof SECTIONS];
  const color = ACCENT;
  const toHref = useDemoHref();
  const openQuickLog = useContext(QuickLogContext);
  const quickLog = QUICK_LOG[s.key];
  const hasQuickLog = !!openQuickLog && !!quickLog;
  return (
    <SectionTheme sectionKey={s.key} className="group relative min-w-0 w-full rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link href={toHref(s.path)} className="block p-5">
        <div
          className="absolute left-0 top-4 h-8 w-1 rounded-r-full"
          style={{ backgroundColor: color }}
        />
        <div className="mb-3 pr-10">
          <h2 className="text-lg font-semibold tracking-tight">{s.label}</h2>
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
  const phases = useMemo(
    () => resolvePhases(
      settings?.day_phases ?? DEFAULT_DAY_PHASES,
      settings?.day_phase_boundaries ?? DEFAULT_DAY_PHASE_BOUNDARIES,
      settings?.day_end ?? DEFAULT_DAY_END,
    ),
    [settings],
  );
  // Pick active phase + random subtitle once per mount — re-randomising
  // on every render would make the text flicker on unrelated state changes.
  const { greeting, subtitle } = useMemo(() => {
    const activeId = activePhaseId(phases);
    const phase = phases.find((p) => p.id === activeId) ?? phases[0];
    const subs = phase?.subtitles?.length ? phase.subtitles : [""];
    return {
      greeting: phase?.greeting ?? phase?.label ?? "",
      subtitle: subs[Math.floor(Math.random() * subs.length)],
    };
  }, [phases]);
  const router = useRouter();
  const [openKey, setOpenKey] = useState<SectionKey | null>(null);
  const active = openKey ? QUICK_LOG[openKey] : null;
  const allSections = useSections();
  const activeSection = openKey ? allSections.find((s) => s.key === openKey) ?? null : null;
  const toHref = useDemoHref();
  const handleQuickLog = useCallback((key: SectionKey) => {
    const entry = QUICK_LOG[key];
    if (entry && "href" in entry) {
      router.push(toHref(entry.href));
      return;
    }
    setOpenKey(key);
  }, [router, toHref]);
  // Home tiles respect user's section_order from settings. Each section's
  // `show_on_dashboard` flag controls visibility — toggle in Settings.
  const visibleSections = allSections.filter((s) => s.show_on_dashboard);

  return (
    <QuickLogContext.Provider value={handleQuickLog}>
      <>
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <Link href={toHref("/septena/timeline")}><TodayTimeline /></Link>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NextWidget />
          {visibleSections.map((s) => {
            const Mini = SECTION_MINI[s.key];
            return Mini ? <Mini key={s.key} /> : null;
          })}
        </div>

        <MetaActionBar />

        <LoadTimer />

        {active && activeSection && "Component" in active && (
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
