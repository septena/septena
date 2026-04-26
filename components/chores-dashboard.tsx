"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CHART_GRID, X_AXIS_DATE, Y_AXIS } from "@/lib/chart-defaults";

import {
  completeChore,
  deferChore,
  uncompleteChore,
  getChores,
  getChoreHistory,
  getSettings,
  type Chore,
} from "@/lib/api";
import { useCelebrate } from "@/components/confetti";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { StatCard } from "@/components/stat-card";
import { TaskGroup, TaskRow, type TaskRowAction } from "@/components/tasks";
import { shortDate } from "@/lib/date-utils";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { SECTION_ACCENT_STRONG } from "@/lib/section-colors";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { QuickLogModal } from "@/components/quick-log-modal";
import { ChoresQuickLog } from "@/components/quick-log-forms";
import { haptic } from "@/lib/haptics";

function relativeDate(iso: string | null | undefined, today: string): string {
  if (!iso) return "—";
  const [ty, tm, td] = today.split("-").map(Number);
  const [dy, dm, dd] = iso.split("-").map(Number);
  const t = new Date(ty!, tm! - 1, td!);
  const d = new Date(dy!, dm! - 1, dd!);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff}d`;
  return `${-diff}d ago`;
}

function pendingDaysLabel(days: number): string {
  if (days <= 0) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

function choreSublabel(chore: Chore, today: string): { text?: string; tone?: "warn" } {
  const done = chore.last_completed === today;
  if (done) return chore.last_completed_time ? { text: chore.last_completed_time } : {};
  const overdueLabel = pendingDaysLabel(chore.days_overdue);
  if (overdueLabel) return { text: overdueLabel, tone: "warn" };
  if (chore.days_overdue < 0) return { text: `due ${relativeDate(chore.due_date, today)}` };
  return {};
}

export function ChoresDashboard() {
  const CHORES_COLOR = "var(--section-accent)";
  const chartConfig = {
    metric: { label: "Completions", color: CHORES_COLOR },
  } satisfies ChartConfig;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [logOpen, setLogOpen] = useState(false);
  const barAnim = useBarAnimation();
  const { celebrate, node: confettiNode } = useCelebrate();
  const { data: settings } = useSWR("settings", getSettings);
  const prevDoneRef = useRef<{ done: number; total: number } | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    ["chores"],
    async () => {
      const [list, history] = await Promise.all([getChores(), getChoreHistory(30)]);
      return { list, history };
    },
    { refreshInterval: 60_000 },
  );

  const chores = data?.list.chores ?? [];
  const today = data?.list.today ?? "";
  const loading = isLoading && !data;

  const { todoList, next7, later, overdueCount, doneTodayCount } = useMemo(() => {
    const todo: Chore[] = [];
    const next7: Chore[] = [];
    const later: Chore[] = [];
    let overdueCount = 0;
    let doneTodayCount = 0;
    for (const c of chores) {
      const doneToday = c.last_completed === today;
      if (doneToday) doneTodayCount += 1;
      // Anything actionable today (overdue / due / just-completed today) stays
      // in the to-do list until midnight. Matches supplements/habits behaviour.
      if (c.days_overdue >= 0 || doneToday) {
        todo.push(c);
        if (c.days_overdue > 0 && !doneToday) overdueCount += 1;
      } else if (c.days_overdue >= -7) {
        next7.push(c);
      } else {
        later.push(c);
      }
    }
    // Undone first (most overdue at top), done items sink to the bottom.
    todo.sort((a, b) => {
      const aDone = a.last_completed === today ? 1 : 0;
      const bDone = b.last_completed === today ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return b.days_overdue - a.days_overdue;
    });
    next7.sort((a, b) => a.due_date.localeCompare(b.due_date));
    later.sort((a, b) => a.due_date.localeCompare(b.due_date));
    return { todoList: todo, next7, later, overdueCount, doneTodayCount };
  }, [chores, today]);

  const total = chores.length;
  const todoTotal = todoList.length;

  useEffect(() => {
    if (loading) return;
    const prev = prevDoneRef.current;
    prevDoneRef.current = { done: doneTodayCount, total: todoTotal };
    if (!prev) return;
    if (todoTotal > 0 && prev.done < prev.total && doneTodayCount === todoTotal) {
      celebrate({
        message: "Chores complete",
        description: `${todoTotal} of ${todoTotal} done for today`,
        confetti: settings?.animations?.chores_complete ?? true,
      });
    }
  }, [doneTodayCount, todoTotal, loading, settings, celebrate]);

  async function onToggle(choreId: string, isDone: boolean) {
    if (pending.has(choreId)) return;
    setPending((p) => new Set(p).add(choreId));
    haptic();
    try {
      if (isDone) {
        await uncompleteChore(choreId);
      } else {
        await completeChore(choreId);
      }
      haptic();
      mutate();
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(choreId);
        return next;
      });
    }
  }

  async function onDefer(choreId: string, mode: "day" | "weekend") {
    if (pending.has(choreId)) return;
    setPending((p) => new Set(p).add(choreId));
    haptic();
    try {
      await deferChore(choreId, mode);
      mutate();
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(choreId);
        return next;
      });
    }
  }

  function rowActionsFor(c: Chore, done: boolean): TaskRowAction[] {
    if (done) return [];
    return [
      { label: "Defer to tomorrow", onSelect: () => onDefer(c.id, "day") },
      { label: "Defer to weekend", onSelect: () => onDefer(c.id, "weekend") },
    ];
  }

  const chartData = useMemo(
    () =>
      (data?.history.daily ?? []).map((d) => ({ date: shortDate(d.date), metric: d.completed })),
    [data],
  );
  const completions30d = useMemo(
    () => (data?.history.daily ?? []).reduce((s, d) => s + d.completed, 0),
    [data],
  );

  return (
    <>
      {confettiNode}
      <SectionHeaderAction>
        <SectionHeaderActionButton color={CHORES_COLOR} onClick={() => setLogOpen(true)}>
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      <QuickLogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Chores"
        accent={CHORES_COLOR}
      >
        <ChoresQuickLog />
      </QuickLogModal>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-3">
        <StatCard
          label="Today"
          value={todoTotal ? `${doneTodayCount}/${todoTotal}` : "—"}
          sublabel={
            todoTotal ? `${Math.round((doneTodayCount / todoTotal) * 100)}% complete` : "nothing due"
          }
          progress={todoTotal ? doneTodayCount / todoTotal : 0}
          color={CHORES_COLOR}
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          sublabel={overdueCount === 0 ? "all caught up" : "past their due date"}
          color={overdueCount > 0 ? SECTION_ACCENT_STRONG : CHORES_COLOR}
        />
        <StatCard label="Last 30 days" value={completions30d} sublabel="completions logged" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading chores…</p>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No chores configured. Add some in{" "}
            <a href="/septena/settings/chores" className="underline">
              Settings → Chores
            </a>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              {
                key: "today",
                title: "Today",
                emoji: "📋",
                items: todoList,
                doneCount: doneTodayCount,
                collapsible: false,
                nowBadge: true,
                emptyHint: "All caught up ✨",
              },
              {
                key: "week",
                title: "This Week",
                emoji: "🗓️",
                items: next7,
                doneCount: 0,
                collapsible: true,
                nowBadge: false,
                emptyHint: "Nothing due in the next 7 days.",
              },
              {
                key: "later",
                title: "Later",
                emoji: "🕰️",
                items: later,
                doneCount: 0,
                collapsible: true,
                nowBadge: false,
                emptyHint: "Nothing scheduled further out.",
              },
            ] as const
          ).map((group) => (
            <TaskGroup
              key={group.key}
              title={group.title}
              emoji={group.emoji}
              accent={CHORES_COLOR}
              doneCount={group.doneCount}
              totalCount={group.items.length}
              collapsible={group.collapsible}
              defaultCollapsed={false}
              nowBadge={group.nowBadge}
              emptyHint={group.emptyHint}
            >
              {group.items.map((c) => {
                const done = c.last_completed === today;
                const { text, tone } = choreSublabel(c, today);
                return (
                  <TaskRow
                    key={c.id}
                    label={c.name}
                    emoji={c.emoji}
                    sublabel={text}
                    sublabelTone={tone}
                    done={done}
                    pending={pending.has(c.id)}
                    accent={CHORES_COLOR}
                    onClick={() => onToggle(c.id, done)}
                    actions={rowActionsFor(c, done)}
                  />
                );
              })}
            </TaskGroup>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis {...X_AXIS_DATE} interval={3} />
              <YAxis
                {...Y_AXIS}
                width={30}
                allowDecimals={false}
              />
              <Bar dataKey="metric" fill="var(--color-metric)" radius={[4, 4, 0, 0]} {...barAnim} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

    </>
  );
}
