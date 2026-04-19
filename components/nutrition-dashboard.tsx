"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Pencil, Copy } from "lucide-react";

import {
  getNutritionEntries,
  getNutritionStats,
  getSettings,
  saveNutritionEntry,
  updateNutritionEntry,
  deleteNutritionEntry,
  type FastingWindow,
  type NutritionEntry,
  type NutritionPayload,
  type NutritionStats,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInput } from "@/components/time-input";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionStatusBar } from "@/components/section-status-bar";
import { showToast, showError } from "@/lib/toast";
import { todayLocalISO, daysAgoLocalISO, addDaysISO, nowHHMM, shortDate, formatWeekdayTickNarrow } from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { computeFastingState, isBreakingFast, useFastingConfig } from "@/lib/fasting";
import { useMacroTargets, useFastingTarget, useFiberTarget, formatRange, progressTowardRange, type MacroKey, type MacroTarget } from "@/lib/macro-targets";
import { StatCard } from "@/components/stat-card";
import { SECTIONS } from "@/lib/sections";
import { useBarAnimation } from "@/hooks/use-bar-animation";

const NUTRITION_COLOR = SECTIONS.nutrition.color;

export function NutritionDashboard() {
  return <NutritionDashboardInner />;
}

function NutritionDashboardInner() {
  const { date: selectedDate } = useSelectedDate();
  // Fetch a 7-day window ending at the selected date — covers both the day's
  // cards and the RecentEntries list.
  const since = useMemo(() => {
    const t = todayLocalISO();
    const windowStart = addDaysISO(selectedDate, -7);
    return windowStart < daysAgoLocalISO(7) ? windowStart : daysAgoLocalISO(7);
  }, [selectedDate]);
  const { data, error, isLoading, mutate } = useSWR(
    ["nutrition", since, selectedDate],
    async () => {
      const [entries, stats] = await Promise.all([getNutritionEntries(since), getNutritionStats(30, selectedDate)]);
      return { entries, stats };
    },
    { refreshInterval: 60_000 },
  );
  const targets = useMacroTargets();
  const fiberTarget = useFiberTarget();
  const entries = data?.entries ?? [];
  const stats = data?.stats ?? null;
  const loading = isLoading && !data;
  const [celebrating, setCelebrating] = useState(false);
  const { data: settings } = useSWR("settings", getSettings);
  const firstMealAnimationEnabled = settings?.animations?.first_meal ?? true;

  const todayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [entries, selectedDate],
  );
  const todayProtein = useMemo(() => todayEntries.reduce((s, e) => s + (e.protein_g || 0), 0), [todayEntries]);
  const todayFat = useMemo(() => todayEntries.reduce((s, e) => s + (e.fat_g || 0), 0), [todayEntries]);
  const todayCarbs = useMemo(() => todayEntries.reduce((s, e) => s + (e.carbs_g || 0), 0), [todayEntries]);
  const todayKcal = useMemo(() => todayEntries.reduce((s, e) => s + (e.kcal || 0), 0), [todayEntries]);
  const todayFiber = useMemo(() => todayEntries.reduce((s, e) => s + (e.fiber_g || 0), 0), [todayEntries]);
  const recentEntries = useMemo(
    () => [...entries].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    [entries],
  );

  // Targets are fixed ranges now — no more adaptive rolling averages.
  // See lib/macro-targets.ts for the single source of truth.

  const chartData = useMemo(
    () =>
      (stats?.daily ?? []).map((d) => ({
        date: d.date,
        protein: d.protein_g,
        fat: d.fat_g,
        carbs: d.carbs_g,
        fiber: d.fiber_g ?? 0,
        kcal: d.kcal,
      })),
    [stats],
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      {!loading && (
        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard
          label="Protein"
          value={todayProtein > 0 ? Math.round(todayProtein) : null}
          unit="g"
          progress={progressTowardRange(todayProtein, targets.protein)}
          color={targets.protein.color}
        />
        <StatCard
          label="Fat"
          value={todayFat > 0 ? Math.round(todayFat) : null}
          unit="g"
          progress={progressTowardRange(todayFat, targets.fat)}
          color={targets.fat.color}
        />
        <StatCard
          label="Carbs"
          value={todayCarbs > 0 ? Math.round(todayCarbs) : null}
          unit="g"
          progress={progressTowardRange(todayCarbs, targets.carbs)}
          color={targets.carbs.color}
        />
        <StatCard
          label="Fiber"
          value={todayFiber > 0 ? Math.round(todayFiber) : null}
          unit="g"
          progress={progressTowardRange(todayFiber, fiberTarget)}
          color={fiberTarget.color}
        />
        <StatCard
          label="Kcal"
          value={todayKcal > 0 ? Math.round(todayKcal) : null}
          progress={progressTowardRange(todayKcal, targets.kcal)}
          color={targets.kcal.color}
        />
        <FastingStatCard stats={stats} />
        </div>
      )}

      {/* Macro + fasting charts */}
      {!loading && (
        <div className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-3">
        <MacroChartCard macroKey="protein" dataKey="protein" chartData={chartData} />
        <MacroChartCard macroKey="fat" dataKey="fat" chartData={chartData} />
        <MacroChartCard macroKey="carbs" dataKey="carbs" chartData={chartData} />
        <FiberChartCard dataKey="fiber" chartData={chartData} />
        <MacroChartCard macroKey="kcal" dataKey="kcal" chartData={chartData} />
        <FastingCard stats={stats} />
        </div>
      )}

      <RecentEntriesList
        entries={recentEntries}
        fasting={stats?.fasting ?? []}
        loading={loading}
        todayMealCount={todayEntries.length}
        onDuplicated={() => mutate()}
        onBreakFast={() => {
          if (firstMealAnimationEnabled) setCelebrating(true);
        }}
      />

      <SectionStatusBar section="nutrition" />

      {celebrating && <BreakFastCelebration onDone={() => setCelebrating(false)} />}
    </main>
  );
}

// ── Break-fast celebration ────────────────────────────────────────────────────
// Fires when the user logs today's first meal/snack. Mirrors the post-exercise
// confetti style but scoped to a local overlay (no full-page takeover) and
// tinted with the fasting-chart's purple-to-green palette.

function BreakFastCelebration({ onDone }: { onDone: () => void }) {
  const particles = useMemo(() => {
    const colors = [NUTRITION_COLOR, NUTRITION_COLOR, "hsl(45,90%,55%)", NUTRITION_COLOR, "#ffedd5"];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 2.0 + Math.random() * 1.6,
      drift: (Math.random() - 0.5) * 140,
      rotate: (Math.random() - 0.5) * 720,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 8,
    }));
  }, []);

  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes breakfast-fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rot)); opacity: 0; }
        }
        @keyframes breakfast-pop {
          0%   { transform: scale(0.6) translateY(8px); opacity: 0; }
          20%  { transform: scale(1.08) translateY(0); opacity: 1; }
          80%  { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(0.95) translateY(-4px); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute block rounded-sm"
            style={{
              left: `${p.left}vw`,
              top: 0,
              width: `${p.size}px`,
              height: `${p.size * 0.4}px`,
              backgroundColor: p.color,
              animation: `breakfast-fall ${p.duration}s ${p.delay}s cubic-bezier(.2,.6,.3,1) forwards`,
              ["--drift" as string]: `${p.drift}px`,
              ["--rot" as string]: `${p.rotate}deg`,
            }}
          />
        ))}
        <div
          className="absolute left-1/2 top-[34%] -translate-x-1/2 rounded-full border border-border bg-background/95 px-6 py-3 shadow-xl backdrop-blur"
          style={{ animation: "breakfast-pop 3s cubic-bezier(.2,.6,.3,1) forwards" }}
        >
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ color: NUTRITION_COLOR }}>
            Fast broken
          </p>
          <p className="mt-0.5 text-center text-lg font-semibold">🍽️ First meal logged</p>
        </div>
      </div>
    </>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

// ── Recent entries list ───────────────────────────────────────────────────────

function RecentEntriesList({ entries, fasting, loading, todayMealCount, onDuplicated, onBreakFast }: {
  entries: NutritionEntry[];
  fasting: FastingWindow[];
  loading: boolean;
  todayMealCount: number;
  onDuplicated: () => void;
  onBreakFast: () => void;
}) {
  const fastingByDate = useMemo(() => {
    const m = new Map<string, FastingWindow>();
    for (const f of fasting) m.set(f.date, f);
    return m;
  }, [fasting]);
  const totalsByDate = useMemo(() => {
    const m = new Map<string, { protein: number; fat: number; carbs: number; fiber: number; kcal: number }>();
    for (const e of entries) {
      const t = m.get(e.date) ?? { protein: 0, fat: 0, carbs: 0, fiber: 0, kcal: 0 };
      t.protein += e.protein_g || 0;
      t.fat += e.fat_g || 0;
      t.carbs += e.carbs_g || 0;
      t.fiber += e.fiber_g || 0;
      t.kcal += e.kcal || 0;
      m.set(e.date, t);
    }
    return m;
  }, [entries]);
  const targets = useMacroTargets();
  const fiberTarget = useFiberTarget();
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<NutritionEntry>>({});
  const [error, setError] = useState<string | null>(null);

  function startEdit(e: NutritionEntry) {
    setEditingFile(e.file);
    setEditValues({ ...e });
    setDeleteConfirm(null);
  }

  function cancelEdit() {
    setEditingFile(null);
    setEditValues({});
    setDeleteConfirm(null);
  }

  async function saveEdit() {
    if (!editingFile) return;
    setSaving((p) => new Set(p).add(editingFile));
    setError(null);
    try {
      await updateNutritionEntry({ ...(editValues as NutritionPayload), file: editingFile });
      setEditingFile(null);
      setEditValues({});
      onDuplicated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(editingFile); return n; });
    }
  }

  async function deleteEntry(file: string) {
    if (deleteConfirm !== file) { setDeleteConfirm(file); return; }
    setSaving((p) => new Set(p).add(file));
    setError(null);
    try {
      await deleteNutritionEntry(file);
      setDeleteConfirm(null);
      if (editingFile === file) cancelEdit();
      onDuplicated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(file); return n; });
    }
  }

  async function duplicate(entry: NutritionEntry) {
    if (saving.has(entry.file)) return;
    // Capture BEFORE the save — after `onDuplicated()` the parent refetches
    // and todayMealCount will already include this new entry.
    const targetDate = todayLocalISO();
    const willBreakFast = isBreakingFast(todayMealCount, targetDate);
    setSaving((p) => new Set(p).add(entry.file));
    setError(null);
    try {
      await saveNutritionEntry({
        date: targetDate,
        time: nowHHMM(),
        emoji: entry.emoji || "",
        protein_g: entry.protein_g,
        fat_g: entry.fat_g ?? 0,
        carbs_g: entry.carbs_g ?? 0,
        fiber_g: entry.fiber_g ?? 0,
        kcal: entry.kcal ?? 0,
        foods: entry.foods,
      });
      onDuplicated();
      showToast("Logged again", { description: entry.foods[0] });
      if (willBreakFast) onBreakFast();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Duplicate failed";
      setError(msg);
      showError(msg);
    } finally {
      setSaving((p) => { const n = new Set(p); n.delete(entry.file); return n; });
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Last 7 days</CardTitle>
        <CardDescription>
          {loading ? "Loading…" : `${entries.length} entries · tap to edit · copy to duplicate`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet — log a meal via chat to get started.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.reduce<React.ReactNode[]>((rows, e, i) => {
              const prev = entries[i - 1];
              if (i === 0 || (prev && prev.date !== e.date)) {
                if (prev && prev.date !== e.date) {
                  const fast = fastingByDate.get(prev.date);
                  if (fast) rows.push(<FastingGap key={`fast-${prev.date}`} fast={fast} />);
                }
                const [y, m, d] = e.date.split("-").map(Number);
                const dayLabel = new Date(y!, (m! - 1), d!).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
                const t = totalsByDate.get(e.date);
                rows.push(
                  <li key={`sep-${e.date}`} className="flex flex-col items-center gap-0.5 py-2">
                    <span className="text-xs font-medium text-muted-foreground">{dayLabel}</span>
                    {t && (
                      <span className="text-xs font-semibold tabular-nums">
                        <span style={{ color: targets.protein.color }}>{Math.round(t.protein)}P</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: targets.fat.color }}>{Math.round(t.fat)}F</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: targets.carbs.color }}>{Math.round(t.carbs)}C</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: fiberTarget.color }}>{Math.round(t.fiber)}Fb</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: targets.kcal.color }}>{Math.round(t.kcal)}kcal</span>
                      </span>
                    )}
                  </li>,
                );
              }
              const isEditing = editingFile === e.file;
              const isPending = saving.has(e.file);
              const showDeleteConfirm = deleteConfirm === e.file;

              rows.push(
                <li key={e.file} className="py-0">
                  {isEditing ? (
                    <div className="-mx-4 mb-2 mt-3 rounded-xl border border-border bg-muted/40 px-4 py-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edit entry</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Time</label>
                          <TimeInput
                            value={editValues.time ?? ""}
                            onChange={(v) => setEditValues((p) => ({ ...p, time: v }))}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Emoji</label>
                          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editValues.emoji ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, emoji: v.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs text-muted-foreground">Foods (first line is the title)</label>
                          <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={3} value={(editValues.foods ?? []).join("\n")} onChange={(v) => setEditValues((p) => ({ ...p, foods: v.target.value.split("\n").filter(Boolean) }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Protein (g)</label>
                          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" type="number" min="0" value={editValues.protein_g ?? 0} onChange={(v) => setEditValues((p) => ({ ...p, protein_g: Number(v.target.value) }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Fat (g)</label>
                          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" type="number" min="0" value={editValues.fat_g ?? 0} onChange={(v) => setEditValues((p) => ({ ...p, fat_g: Number(v.target.value) }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Carbs (g)</label>
                          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" type="number" min="0" value={editValues.carbs_g ?? 0} onChange={(v) => setEditValues((p) => ({ ...p, carbs_g: Number(v.target.value) }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Fiber (g)</label>
                          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" type="number" min="0" value={editValues.fiber_g ?? 0} onChange={(v) => setEditValues((p) => ({ ...p, fiber_g: Number(v.target.value) }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Kcal</label>
                          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" type="number" min="0" value={editValues.kcal ?? 0} onChange={(v) => setEditValues((p) => ({ ...p, kcal: Number(v.target.value) }))} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <button type="button" onClick={() => deleteEntry(e.file)} disabled={isPending} className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                          {showDeleteConfirm ? "Tap again to confirm delete" : "Delete"}
                        </button>
                        <div className="flex gap-2">
                          <button type="button" onClick={cancelEdit} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">Cancel</button>
                          <button type="button" onClick={saveEdit} disabled={isPending || !(editValues.foods && editValues.foods.length > 0)} className="rounded-md px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: NUTRITION_COLOR }}>
                            {isPending ? "…" : "Save"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={["py-3 px-4", isPending ? "opacity-50" : ""].filter(Boolean).join(" ")}
                    >
                      {/* Row 1: title (first food) + time + action buttons */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                          {e.emoji?.trim() && <span>{e.emoji?.trim()}</span>}
                          <span className="truncate">{e.foods[0]}</span>
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">{e.time || e.date}</span>
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); startEdit(e); }}
                            disabled={isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-40 transition-colors"
                            title="Edit entry"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); duplicate(e); }}
                            disabled={isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-40 transition-colors"
                            title="Duplicate to today"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                      {/* Row 2: remaining foods (skip first — it's the title) */}
                      {e.foods.length > 1 && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{e.foods.slice(1).join(" · ")}</p>
                      )}
                      {/* Row 3: macro stats */}
                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        <span style={{ color: targets.protein.color }}>{Math.round(e.protein_g)}P</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: targets.fat.color }}>{Math.round(e.fat_g)}F</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: targets.carbs.color }}>{Math.round(e.carbs_g || 0)}C</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: fiberTarget.color }}>{Math.round(e.fiber_g || 0)}Fb</span>
                        <span className="text-muted-foreground/50"> · </span>
                        <span style={{ color: targets.kcal.color }}>{Math.round(e.kcal)}kcal</span>
                      </div>
                    </div>
                  )}
                </li>,
              );
              return rows;
            }, [])}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Fasting gap row ───────────────────────────────────────────────────────────
// Rendered between day separators in the entry list — the window from the
// previous day's last eating event to the current day's first one. Uses the
// same colour thresholds as the Fasting chart so the two agree visually.

function FastingGap({ fast }: { fast: FastingWindow }) {
  if (fast.hours == null) {
    if (fast.note === "gap") {
      return (
        <li className="flex justify-center py-1.5">
          <span className="text-[11px] text-muted-foreground/70">incomplete logs</span>
        </li>
      );
    }
    return null;
  }
  const totalMin = Math.round(fast.hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const label = m === 0 ? `${h}h fast` : `${h}h ${m}m fast`;
  return (
    <li className="flex justify-center py-1.5">
      <span className="text-[11px] tabular-nums text-muted-foreground">{label}</span>
    </li>
  );
}

// ── Macro chart card ──────────────────────────────────────────────────────────
// One card per macro (protein / fat / carbs / kcal). The dashed band between
// min and max is the target range; bars above the max are "over" rather than
// "wrong" — we don't penalise within-band variation.

function MacroChartCard({
  macroKey,
  dataKey,
  chartData,
}: {
  macroKey: MacroKey;
  dataKey: "protein" | "fat" | "carbs" | "kcal";
  chartData: { date: string; protein: number; fat: number; carbs: number; kcal: number }[];
}) {
  const targets = useMacroTargets();
  const target = targets[macroKey];
  const unit = target.unit;
  // Leave headroom above max so bars near the top of the range don't touch
  // the chart ceiling. 1.2× max covers typical overshoot.
  const yMax = Math.ceil(target.max * 1.2);
  const data = chartData.slice(-7);
  const barAnim = useBarAnimation();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{target.label}</CardTitle>
        <CardDescription>target {formatRange(target)}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer
          config={{ [dataKey]: { label: `${target.label}${unit ? ` (${unit})` : ""}`, color: target.color } }}
          className="h-[200px] w-full overflow-hidden"
        >
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0} fontSize={11}
              tickFormatter={(v: string) => formatWeekdayTickNarrow(v)} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, yMax]}
              width={unit === "g" ? 36 : 40}
              fontSize={11}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <ReferenceArea y1={target.min} y2={target.max} fill={target.color} fillOpacity={0.12} stroke="none" />
            <ReferenceLine y={target.min} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={target.max} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />

            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={22} {...barAnim}>
              {data.map((d, i) => {
                const v = d[dataKey] as number;
                // Under min → muted, in band → primary, over max → primary but
                // readable as "over".
                const color =
                  v === 0 ? "hsl(220,10%,88%)"
                  : v < target.min ? `${target.color}`
                  : target.color;
                const opacity = v === 0 ? 1 : v < target.min ? 0.55 : 1;
                return <Cell key={i} fill={color} fillOpacity={opacity} />;
              })}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHM(hm: string | null): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ── Fasting window chart ──────────────────────────────────────────────────────



// ── Hours fasted stat card ───────────────────────────────────────────────────

function FastingStatCard({ stats }: { stats: NutritionStats | null }) {
  const fastingTarget = useFastingTarget();
  const fastingConfig = useFastingConfig();
  const today = todayLocalISO();
  const todayFast = (stats?.fasting ?? []).find((f) => f.date === today);
  const fastHours = todayFast?.hours;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const fastingState = useMemo(() => computeFastingState(stats ?? null, fastingConfig), [stats, tick, fastingConfig]);
  const liveHours = fastingState.state === "fasting" ? fastingState.totalMin / 60 : null;
  const displayHours = liveHours ?? fastHours;
  const progress = displayHours != null ? Math.min(1, displayHours / fastingTarget.max) : undefined;

  return (
    <StatCard
      label="Fasting"
      value={displayHours != null ? displayHours.toFixed(1) : null}
      unit="h"
      progress={progress}
      color={NUTRITION_COLOR}
    />
  );
}


function FiberChartCard({
  dataKey,
  chartData,
}: {
  dataKey: "fiber";
  chartData: { date: string; protein: number; fat: number; carbs: number; fiber: number; kcal: number }[];
}) {
  const target = useFiberTarget();
  const unit = target.unit;
  const yMax = Math.ceil(target.max * 1.2);
  const data = chartData.slice(-7);
  const barAnim = useBarAnimation();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{target.label}</CardTitle>
        <CardDescription>target {formatRange(target)}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer
          config={{ [dataKey]: { label: `${target.label} (${unit})`, color: target.color } }}
          className="h-[200px] w-full overflow-hidden"
        >
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0} fontSize={11}
              tickFormatter={(v: string) => formatWeekdayTickNarrow(v)} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, yMax]}
              width={36}
              fontSize={11}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <ReferenceArea y1={target.min} y2={target.max} fill={target.color} fillOpacity={0.12} stroke="none" />
            <ReferenceLine y={target.min} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={target.max} stroke={target.color} strokeDasharray="4 4" strokeOpacity={0.6} />

            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={22} {...barAnim}>
              {data.map((d, i) => {
                const v = d.fiber as number;
                const color =
                  v === 0 ? "hsl(220,10%,88%)"
                  : v < target.min ? `${target.color}`
                  : target.color;
                const opacity = v === 0 ? 1 : v < target.min ? 0.55 : 1;
                return <Cell key={i} fill={color} fillOpacity={opacity} />;
              })}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}


function FastingCard({ stats }: { stats: NutritionStats | null }) {
  const barAnim = useBarAnimation();
  const fastingTarget = useFastingTarget();
  const fastingConfig = useFastingConfig();
  const today = todayLocalISO();

  // Build chart data from historical fasting windows, tagging today's entry.
  const rawData = useMemo(
    () =>
      (stats?.fasting ?? []).map((f) => ({
        date: f.date,
        metric: f.hours ?? (f.note === "gap" ? 0.3 : 0),
        hasData: f.hours != null,
        isGap: f.note === "gap",
        rawHours: f.hours,
        isToday: f.date === today,
        isLive: false,
      })),
    [stats, today],
  );

  // Inject live creeping bar for today when actively fasting.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fastingState = useMemo(() => computeFastingState(stats ?? null, fastingConfig), [stats, tick, fastingConfig]);

  const chartData = useMemo(() => {
    const data = [...rawData];
    if (fastingState.state === "fasting") {
      const liveHours = fastingState.totalMin / 60;
      const todayIdx = data.findIndex((d) => d.date === today);
      if (todayIdx >= 0) {
        // Replace today's bar with live creeping value.
        data[todayIdx] = { ...data[todayIdx], metric: liveHours, hasData: true, isLive: true };
      } else {
        // Append today's live bar.
        data.push({ date: today, metric: liveHours, hasData: true, isGap: false, rawHours: null, isToday: true, isLive: true });
      }
    }
    return data;
  }, [rawData, fastingState, today]);

  const fastingChartConfig = { metric: { label: "Fasting hours", color: NUTRITION_COLOR } } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fasting</CardTitle>
        <CardDescription>{fastingTarget.min}-{fastingTarget.max}h target</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer config={fastingChartConfig} className="h-[200px] w-full overflow-hidden">
          <BarChart data={chartData.slice(-7)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} interval={0} fontSize={11}
              tickFormatter={(v: string) => formatWeekdayTickNarrow(v)} />
            <YAxis tickLine={false} axisLine={false} domain={[0, Math.ceil(fastingTarget.max / 0.85)]} width={36} fontSize={11} tickFormatter={(v: number) => `${v}h`} />
            <ReferenceArea y1={fastingTarget.min} y2={fastingTarget.max} fill={NUTRITION_COLOR} fillOpacity={0.12} stroke="none" />
            <ReferenceLine y={fastingTarget.min} stroke={NUTRITION_COLOR} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={fastingTarget.max} stroke={NUTRITION_COLOR} strokeDasharray="4 4" strokeOpacity={0.6} />
            <Tooltip
              cursor={false}
              contentStyle={{ fontSize: 12 }}
              formatter={(value, _name, item) => {
                const p = (item as { payload?: { rawHours: number | null; isGap: boolean; isLive: boolean; metric: number } }).payload;
                if (!p) return ["—", ""];
                if (p.isLive) return [`${Number(value).toFixed(1)}h`, "Live — creeping up"];
                if (p.isGap) return ["—", "Incomplete logs"];
                if (p.rawHours == null) return ["—", "No data"];
                return [`${Number(value).toFixed(1)}h`, `${p.rawHours}h fasted`];
              }}
            />
            <Bar dataKey="metric" radius={[4, 4, 0, 0]} maxBarSize={22} {...barAnim}>
              {chartData.slice(-7).map((d, i) => {
                const v = d.metric;
                const hasData = d.hasData && !d.isGap;
                const color = hasData ? NUTRITION_COLOR : "hsl(220,10%,88%)";
                const opacity = !hasData ? 1 : v >= fastingTarget.min ? 1 : 0.55;
                return <Cell key={i} fill={color} fillOpacity={opacity} />;
              })}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export default NutritionDashboard;
