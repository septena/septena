"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  cancelTask,
  completeTask,
  createTask,
  getSettings,
  getTaskAreas,
  getTaskCounts,
  getTaskHistory,
  getTaskProjects,
  getTasks,
  moveTaskToToday,
  scheduleTask,
  uncompleteTask,
  type Task,
  type TaskView,
} from "@/lib/api";
import { useCelebrate } from "@/components/confetti";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_GRID, X_AXIS_DATE, Y_AXIS } from "@/lib/chart-defaults";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import { StatCard } from "@/components/stat-card";
import { TaskGroup, TaskRow, type TaskRowAction } from "@/components/tasks";
import { QuickLogModal } from "@/components/quick-log-modal";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import {
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_STRONG,
} from "@/lib/section-colors";
import { addDaysISO, formatDateShort, shortDate, todayLocalISO } from "@/lib/date-utils";

const VIEWS: { key: TaskView; label: string; emoji: string }[] = [
  { key: "today", label: "Today", emoji: "🌤" },
  { key: "inbox", label: "Inbox", emoji: "📥" },
  { key: "upcoming", label: "Upcoming", emoji: "🗓" },
  { key: "anytime", label: "Anytime", emoji: "🌀" },
  { key: "someday", label: "Someday", emoji: "🌙" },
  { key: "logbook", label: "Logbook", emoji: "📓" },
];

function relativeDateLabel(iso: string | null | undefined, today: string): string {
  if (!iso) return "";
  if (iso === today) return "today";
  if (iso === addDaysISO(today, 1)) return "tomorrow";
  if (iso === addDaysISO(today, -1)) return "yesterday";
  return `scheduled ${formatDateShort(iso)}`;
}

function taskSublabel(t: Task, today: string): string | undefined {
  if (t.status === "done" || t.status === "cancelled") {
    if (t.completed_at) return t.completed_at.slice(0, 10);
    return undefined;
  }
  if (t.scheduled) {
    if (t.scheduled < today) return relativeDateLabel(t.scheduled, today);
    if (t.scheduled === today) return "scheduled today";
    return `scheduled ${formatDateShort(t.scheduled)}`;
  }
  return undefined;
}

export function TasksDashboard() {
  const ACCENT = "var(--section-accent)";
  const [view, setView] = useState<TaskView>("today");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  // Tasks completed/cancelled in this view-session that the API would now
  // exclude — we keep them in the rendered list (struck-through) so the user
  // can undo without hunting for them in Logbook. Cleared on view change.
  // Things 3 calls this "the just-checked items" — they fade away on
  // navigation, not on tap.
  const [stickyDone, setStickyDone] = useState<Map<string, Task>>(new Map());
  const previousView = useRef<TaskView>(view);
  const { celebrate, node: confettiNode } = useCelebrate();
  const { data: settings } = useSWR("settings", getSettings);
  const prevTodayPendingRef = useRef<number | null>(null);

  useEffect(() => {
    if (previousView.current !== view) {
      setStickyDone(new Map());
      previousView.current = view;
    }
  }, [view]);

  const { data, error, isLoading, mutate } = useSWR(
    ["tasks", view],
    async () => {
      const [list, counts, areas, projects, history] = await Promise.all([
        getTasks(view),
        getTaskCounts(),
        getTaskAreas(),
        getTaskProjects(),
        getTaskHistory(30),
      ]);
      return { list, counts, areas: areas.areas, projects: projects.projects, history };
    },
    { refreshInterval: 60_000 },
  );

  const today = data?.list.today ?? todayLocalISO();
  const apiItems = data?.list.items ?? [];
  const review = data?.list.review ?? [];
  const counts = data?.counts;
  const loading = isLoading && !data;

  // Merge: API items + sticky-done items the API now hides. If a sticky id
  // re-appears in apiItems (e.g. user re-uncompleted), the API copy wins.
  const items = useMemo(() => {
    const apiIds = new Set(apiItems.map((t) => t.id));
    const stuck = Array.from(stickyDone.values()).filter((t) => !apiIds.has(t.id));
    return [...apiItems, ...stuck];
  }, [apiItems, stickyDone]);

  // Today inbox-zero: fire confetti when the last open task in the Today view
  // gets checked off. Only the Today view counts — other views can hit zero
  // for unrelated reasons (filtering, navigation).
  const todayPendingCount = useMemo(
    () =>
      view === "today"
        ? items.filter((t) => t.status !== "done" && t.status !== "cancelled").length
        : -1,
    [items, view],
  );
  useEffect(() => {
    if (view !== "today" || loading) {
      prevTodayPendingRef.current = null;
      return;
    }
    const prev = prevTodayPendingRef.current;
    prevTodayPendingRef.current = todayPendingCount;
    if (prev === null) return;
    if (prev > 0 && todayPendingCount === 0) {
      celebrate({
        message: "Today inbox zero",
        description: prev === 1 ? "1 task done" : `${prev} tasks done`,
        confetti: settings?.animations?.tasks_today_zero ?? true,
      });
    }
  }, [todayPendingCount, view, loading, settings, celebrate]);

  async function withPending(id: string, fn: () => Promise<unknown>) {
    if (pending.has(id)) return;
    setPending((p) => new Set(p).add(id));
    try {
      await fn();
      mutate();
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  }

  async function onToggle(t: Task) {
    if (t.status === "done" || t.status === "cancelled") {
      // Undo: drop from sticky set so a fresh load decides where it belongs.
      setStickyDone((prev) => {
        const next = new Map(prev);
        next.delete(t.id);
        return next;
      });
      await withPending(t.id, () => uncompleteTask(t.id));
    } else {
      // Optimistic: pin a done copy locally so the row stays visible until
      // navigation, even after SWR revalidates.
      const stamped: Task = {
        ...t,
        status: "done",
        completed_at: new Date().toISOString().slice(0, 19),
        today: false,
      };
      setStickyDone((prev) => {
        const next = new Map(prev);
        next.set(t.id, stamped);
        return next;
      });
      await withPending(t.id, () => completeTask(t.id));
    }
  }

  async function onAcceptToday(t: Task) {
    await withPending(t.id, () => moveTaskToToday(t.id, true));
  }

  async function onReschedule(t: Task, target: string | null) {
    await withPending(t.id, async () => {
      await scheduleTask(t.id, target);
      // If the task was pinned to Today, scheduling it out also drops the flag
      // so it leaves the Today list rather than stranding it there.
      if (t.today && target !== todayLocalISO()) {
        await moveTaskToToday(t.id, false);
      }
    });
  }

  async function onCancel(t: Task) {
    await withPending(t.id, () => cancelTask(t.id));
  }

  function rowActionsForToday(t: Task): TaskRowAction[] {
    if (t.status === "done" || t.status === "cancelled") return [];
    return [
      { label: "Reschedule to tomorrow", onSelect: () => onReschedule(t, addDaysISO(today, 1)) },
      { label: "Reschedule to next week", onSelect: () => onReschedule(t, addDaysISO(today, 7)) },
      { label: "Move to Someday", onSelect: () => onReschedule(t, null) },
      { label: "Cancel task", tone: "destructive", onSelect: () => onCancel(t) },
    ];
  }

  function rowActionsForReview(t: Task): TaskRowAction[] {
    return [
      { label: "Move to Today", onSelect: () => onAcceptToday(t) },
      { label: "Reschedule to tomorrow", onSelect: () => onReschedule(t, addDaysISO(today, 1)) },
      { label: "Reschedule to next week", onSelect: () => onReschedule(t, addDaysISO(today, 7)) },
      { label: "Move to Someday", onSelect: () => onReschedule(t, null) },
      { label: "Cancel task", tone: "destructive", onSelect: () => onCancel(t) },
    ];
  }

  function rowActionsForOther(t: Task): TaskRowAction[] {
    if (t.status === "done" || t.status === "cancelled") return [];
    const out: TaskRowAction[] = [];
    if (!t.today) out.push({ label: "Move to Today", onSelect: () => onAcceptToday(t) });
    out.push(
      { label: "Reschedule to tomorrow", onSelect: () => onReschedule(t, addDaysISO(today, 1)) },
      { label: "Cancel task", tone: "destructive", onSelect: () => onCancel(t) },
    );
    return out;
  }

  const todayCount = counts?.today_count ?? 0;
  const reviewCount = counts?.review_count ?? 0;
  const openCount = counts?.open_count ?? 0;

  const history = data?.history;

  // 7-day rollups for the stat tiles. Today is the rightmost bucket; we
  // reach back 7 days inclusive so the cards mirror what the histogram is
  // showing on the right edge of the chart.
  const week = useMemo(() => {
    const days = (history?.daily ?? []).slice(-7);
    return {
      made: days.reduce((s, d) => s + d.made, 0),
      done: days.reduce((s, d) => s + d.done, 0),
      deferred: days.reduce((s, d) => s + d.deferred, 0),
      cancelled: days.reduce((s, d) => s + d.cancelled, 0),
    };
  }, [history]);

  const chartData = useMemo(() => {
    return (history?.daily ?? []).map((d) => ({
      date: shortDate(d.date),
      made: d.made,
      done: d.done,
      deferred: d.deferred,
    }));
  }, [history]);

  const chartConfig: ChartConfig = {
    made: { label: "Made", color: "var(--section-accent-shade-3)" },
    done: { label: "Done", color: "var(--section-accent)" },
    deferred: { label: "Deferred", color: "var(--section-accent-shade-2)" },
  };

  const barAnim = useBarAnimation();

  const groupedLogbook = useMemo(() => {
    if (view !== "logbook") return null;
    const by: Record<string, Task[]> = {};
    for (const t of items) {
      const day = (t.completed_at ?? "").slice(0, 10) || "—";
      (by[day] ??= []).push(t);
    }
    return Object.entries(by).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items, view]);

  return (
    <>
      {confettiNode}
      <SectionHeaderAction>
        <SectionHeaderActionButton onClick={() => setCreating(true)}>
          + Add
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open"
          value={openCount}
          sublabel={todayCount ? `${todayCount} pulled into today` : "nothing in today"}
          color={ACCENT}
        />
        <StatCard
          label="Made (7d)"
          value={week.made}
          sublabel="created this week"
          color={ACCENT}
        />
        <StatCard
          label="Done (7d)"
          value={week.done}
          sublabel="completed this week"
          color={ACCENT}
        />
        <StatCard
          label="To review"
          value={reviewCount}
          sublabel={reviewCount === 0 ? "nothing carried over" : "scheduled earlier"}
          color={reviewCount > 0 ? SECTION_ACCENT_STRONG : ACCENT}
        />
      </div>

      <SubNav view={view} setView={setView} counts={counts} />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : view === "today" ? (
        <div className="space-y-4">
          {review.length > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Scheduled earlier</p>
                  <span className="text-xs text-muted-foreground">{review.length}</span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  These were scheduled for today or earlier. Pull what you'll actually do today; let the rest wait.
                </p>
                <div className="space-y-2">
                  {review.map((t) => (
                    <TaskRow
                      key={t.id}
                      label={t.title}
                      sublabel={taskSublabel(t, today)}
                      sublabelTone="warn"
                      done={t.status === "done"}
                      pending={pending.has(t.id)}
                      accent={ACCENT}
                      onClick={() => onToggle(t)}
                      actions={rowActionsForReview(t)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <TaskGroup
            title="Today"
            emoji="🌤"
            accent={ACCENT}
            doneCount={0}
            totalCount={items.length}
            emptyHint={review.length > 0 ? "Pull anything you'll actually do today from above." : "Nothing for today."}
          >
            {items.map((t) => (
              <TaskRow
                key={t.id}
                label={t.title}
                emoji={undefined}
                sublabel={taskSublabel(t, today)}
                done={t.status === "done"}
                pending={pending.has(t.id)}
                accent={ACCENT}
                onClick={() => onToggle(t)}
                actions={rowActionsForToday(t)}
              />
            ))}
          </TaskGroup>

          {todayCount === 0 && review.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Today is a verb — pull what you'll do, don't let it pile up.
            </p>
          )}
        </div>
      ) : view === "logbook" ? (
        <div className="space-y-4">
          {(groupedLogbook ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Nothing in the logbook yet.
              </CardContent>
            </Card>
          ) : (
            (groupedLogbook ?? []).map(([day, tasks]) => (
              <TaskGroup
                key={day}
                title={day === today ? "Today" : day === "—" ? "Older" : formatDateShort(day)}
                accent={ACCENT}
                doneCount={tasks.length}
                totalCount={tasks.length}
                emptyHint=""
              >
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    label={t.title}
                    sublabel={t.status === "cancelled" ? "cancelled" : undefined}
                    done={true}
                    pending={pending.has(t.id)}
                    accent={ACCENT}
                    muted={t.status === "cancelled"}
                    onClick={() => withPending(t.id, () => uncompleteTask(t.id))}
                  />
                ))}
              </TaskGroup>
            ))
          )}
        </div>
      ) : (
        <TaskGroup
          title={VIEWS.find((v) => v.key === view)?.label ?? view}
          emoji={VIEWS.find((v) => v.key === view)?.emoji}
          accent={ACCENT}
          doneCount={0}
          totalCount={items.length}
          emptyHint={emptyHintFor(view)}
        >
          {items.map((t) => (
            <TaskRow
              key={t.id}
              label={t.title}
              sublabel={taskSublabel(t, today)}
              done={t.status === "done"}
              pending={pending.has(t.id)}
              accent={ACCENT}
              onClick={() => onToggle(t)}
              actions={rowActionsForOther(t)}
            />
          ))}
        </TaskGroup>
      )}

      {chartData.length > 0 && (week.made + week.done + week.deferred > 0) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis {...X_AXIS_DATE} interval={3} />
                <YAxis {...Y_AXIS} width={30} allowDecimals={false} />
                <Bar dataKey="made" stackId="a" fill="var(--color-made)" radius={[0, 0, 0, 0]} {...barAnim} />
                <Bar dataKey="deferred" stackId="a" fill="var(--color-deferred)" radius={[0, 0, 0, 0]} {...barAnim} />
                <Bar dataKey="done" stackId="a" fill="var(--color-done)" radius={[4, 4, 0, 0]} {...barAnim} />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <LegendDot color="var(--color-made)" label={`Made (${week.made})`} />
              <LegendDot color="var(--color-done)" label={`Done (${week.done})`} />
              <LegendDot color="var(--color-deferred)" label={`Deferred (${week.deferred})`} />
              {week.cancelled > 0 && (
                <span className="text-muted-foreground">{week.cancelled} cancelled</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {history && history.by_area.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>This week, by area</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4">
            {history.by_area.map((row) => (
              <AreaBalanceRow key={row.area} row={row} accent={ACCENT} />
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Are you living all your areas this week, or only some?
            </p>
          </CardContent>
        </Card>
      )}

      <CreateTaskModal
        open={creating}
        onClose={() => setCreating(false)}
        accent={ACCENT}
        defaultView={view}
        areas={data?.areas ?? []}
        projects={data?.projects ?? []}
        onCreated={() => {
          mutate();
          setCreating(false);
        }}
      />
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function AreaBalanceRow({
  row,
  accent,
}: {
  row: { area: string; made: number; done: number; deferred: number };
  accent: string;
}) {
  const total = row.made + row.done + row.deferred || 1;
  const donePct = (row.done / total) * 100;
  const madePct = (row.made / total) * 100;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="w-24 shrink-0 truncate text-sm">{row.area === "—" ? "(no area)" : row.area}</div>
      <div className="flex-1 overflow-hidden rounded-full bg-muted">
        <div className="flex h-2">
          <div style={{ width: `${donePct}%`, backgroundColor: accent }} />
          <div style={{ width: `${madePct}%`, backgroundColor: "var(--section-accent-shade-3)" }} />
        </div>
      </div>
      <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {row.done}/{total}
      </div>
    </div>
  );
}

function emptyHintFor(view: TaskView): string {
  switch (view) {
    case "inbox":
      return "Inbox is empty.";
    case "upcoming":
      return "Nothing scheduled.";
    case "anytime":
      return "Nothing in your areas or projects right now.";
    case "someday":
      return "Nothing parked for someday.";
    default:
      return "Nothing here.";
  }
}

function SubNav({
  view,
  setView,
  counts,
}: {
  view: TaskView;
  setView: (v: TaskView) => void;
  counts:
    | {
        today_count: number;
        review_count: number;
        inbox_count: number;
        upcoming_count: number;
        anytime_count: number;
        someday_count: number;
      }
    | undefined;
}) {
  const countFor = (key: TaskView): number | undefined => {
    if (!counts) return undefined;
    if (key === "today") return counts.today_count + counts.review_count;
    if (key === "inbox") return counts.inbox_count;
    if (key === "upcoming") return counts.upcoming_count;
    if (key === "anytime") return counts.anytime_count;
    if (key === "someday") return counts.someday_count;
    return undefined;
  };

  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {VIEWS.map((v) => {
        const active = v.key === view;
        const c = countFor(v.key);
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              active
                ? {
                    borderColor: "var(--section-accent)",
                    backgroundColor: "var(--section-accent)",
                    color: "white",
                  }
                : { borderColor: "var(--border)", color: "var(--foreground)" }
            }
          >
            <span aria-hidden>{v.emoji}</span>
            <span>{v.label}</span>
            {c !== undefined && c > 0 && (
              <span
                className="rounded-full px-1.5 text-[10px] tabular-nums"
                style={
                  active
                    ? { backgroundColor: "rgba(255,255,255,0.2)" }
                    : { color: "var(--muted-foreground)" }
                }
              >
                {c}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CreateTaskModal({
  open,
  onClose,
  accent,
  defaultView,
  areas,
  projects,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  accent: string;
  defaultView: TaskView;
  areas: { id: string; title: string; emoji: string }[];
  projects: { id: string; title: string }[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<string>("");
  const [project, setProject] = useState<string>("");
  const [scheduled, setScheduled] = useState<string>("");
  const [today, setToday] = useState<boolean>(defaultView === "today");
  const [someday, setSomeday] = useState<boolean>(defaultView === "someday");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try {
      await createTask({
        title: t,
        area: area || null,
        project: project || null,
        scheduled: scheduled || null,
        today,
        status: someday ? "someday" : "open",
      });
      setTitle("");
      setArea("");
      setProject("");
      setScheduled("");
      setToday(false);
      setSomeday(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <QuickLogModal open={open} onClose={onClose} title="New Task" accent={accent}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 px-5 py-4">
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-[var(--section-accent)]"
          style={{ ["--section-accent" as string]: accent } as React.CSSProperties}
        />

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Area</span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji ? `${a.emoji} ` : ""}
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Project</span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Scheduled</span>
          <input
            type="date"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={today}
              onChange={(e) => {
                setToday(e.target.checked);
                if (e.target.checked) setSomeday(false);
              }}
            />
            Move to Today
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={someday}
              onChange={(e) => {
                setSomeday(e.target.checked);
                if (e.target.checked) setToday(false);
              }}
            />
            Someday
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || submitting}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </QuickLogModal>
  );
}
