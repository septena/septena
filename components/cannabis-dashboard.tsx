"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInput } from "@/components/time-input";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Scatter, ScatterChart, ZAxis, ReferenceLine } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_GRID, CHART_GRID_FULL, X_AXIS_DATE, Y_AXIS } from "@/lib/chart-defaults";
import { SECTION_ACCENT_SHADE_3 } from "@/lib/section-colors";

import {
  getCannabisConfig,
  getCannabisDay,
  addCannabisEntry,
  deleteCannabisEntry,
  updateCannabisEntry,
  getCannabisHistory,
  getCannabisSessions,
  getCannabisActiveCapsule,
  startCannabisCapsule,
  endCannabisCapsule,
  type CannabisEntry,
} from "@/lib/api";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";

// 30-minute buckets → 48 slots covering the full day (matches caffeine).
const BUCKET_MIN = 30;
const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MIN;

function fmtHour(frac: number): string {
  const h = Math.floor(frac);
  const m = Math.round((frac % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

import {
  todayLocalISO,
  nowHHMM as currentTime,
  HOUR_TICKS_2H,
  formatHourTick,
} from "@/lib/date-utils";
import { useSelectedDate } from "@/hooks/use-selected-date";

export function CannabisDashboard() {
  const cannabisColor = "var(--section-accent)";
  const chartConfig = {
    grams: { label: "Grams", color: cannabisColor },
    count: { label: "Sessions", color: cannabisColor },
  } satisfies ChartConfig;
  const [showForm, setShowForm] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).has("log");
    }
    return false;
  });
  const [formTime, setFormTime] = useState(currentTime());
  const [formMethod, setFormMethod] = useState<"vape" | "edible">("vape");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCapsuleStrain, setNewCapsuleStrain] = useState("");
  const barAnim = useBarAnimation();
  const { date: selectedDate } = useSelectedDate();
  const today = todayLocalISO();

  const { data, error, isLoading, mutate } = useSWR(
    ["cannabis", selectedDate],
    async () => {
      const [d, h, c, s, cap] = await Promise.all([
        getCannabisDay(selectedDate),
        getCannabisHistory(30),
        getCannabisConfig(),
        getCannabisSessions(7),
        getCannabisActiveCapsule(),
      ]);
      return {
        day: d,
        history: h,
        strains: c.strains,
        sessions: s.sessions,
        capsule: cap,
      };
    },
    { refreshInterval: 60_000 },
  );

  const day = data?.day ?? null;
  const history = data?.history ?? null;
  const strains = data?.strains ?? [];
  const sessions = data?.sessions ?? [];
  const activeCapsule = data?.capsule?.active ?? null;
  const usesPerCapsule = data?.capsule?.uses_per_capsule ?? 3;
  const loading = isLoading && !data;

  // Seed the new-capsule strain from the most recent historical session that
  // had one. Users usually reorder the same strain, and retyping it on every
  // fresh capsule is the kind of friction we're trying to eliminate.
  const lastStrain = useMemo(() => {
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].strain) return sessions[i].strain ?? "";
    }
    return "";
  }, [sessions]);
  const needsNewCapsule = !activeCapsule && formMethod === "vape";
  useEffect(() => {
    if (showForm && needsNewCapsule && !newCapsuleStrain && lastStrain) {
      setNewCapsuleStrain(lastStrain);
    }
  }, [showForm, needsNewCapsule, lastStrain, newCapsuleStrain]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateCannabisEntry(editingId, selectedDate, {
          time: formTime,
          method: formMethod,
        });
      } else {
        if (needsNewCapsule) {
          await startCannabisCapsule(newCapsuleStrain || null);
        }
        await addCannabisEntry({
          date: today,
          time: formTime,
          method: formMethod,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setFormTime(currentTime());
      setFormMethod("vape");
      setNewCapsuleStrain("");
      await mutate();
    } catch (err) {
      // error is surfaced via SWR
    } finally {
      setSaving(false);
    }
  }, [today, selectedDate, editingId, formTime, formMethod, saving, needsNewCapsule, newCapsuleStrain, mutate]);

  const handleEdit = useCallback((entry: CannabisEntry) => {
    setEditingId(entry.id);
    setFormTime(entry.time.slice(0, 5));
    setFormMethod(entry.method);
    setShowForm(true);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setNewCapsuleStrain("");
  }, []);

  const handleEndCapsule = useCallback(async () => {
    await endCannabisCapsule();
    await mutate();
  }, [mutate]);

  const handleStartCapsule = useCallback(async () => {
    await startCannabisCapsule(lastStrain || null);
    await mutate();
  }, [mutate, lastStrain]);

  const handleDelete = useCallback(async (entryId: string) => {
    try {
      await deleteCannabisEntry(entryId, selectedDate);
      await mutate();
    } catch {
      // error surfaced via SWR
    }
  }, [selectedDate, mutate]);

  const chartData = (history?.daily ?? []).map((p) => ({
    date: p.date.slice(5),
    sessions: p.sessions,
    grams: p.total_g,
  }));

  // Time-of-day charts — vape only, since that's the thing you actually
  // care about seeing the distribution of. Edibles are too infrequent.
  const vapeSessions = sessions.filter((s) => s.method === "vape");

  // Scatter: last 7 days. x = days ago, y = hour.
  const scatterData = vapeSessions
    .map((s) => {
      const daysAgo = Math.round(
        (new Date(selectedDate + "T00:00:00").getTime() - new Date(s.date + "T00:00:00").getTime()) /
          86_400_000,
      );
      return {
        x: -daysAgo,
        y: s.hour,
        date: s.date,
        time: s.time,
      };
    })
    .filter((d) => d.x >= -6);
  const avgHour =
    scatterData.length > 0
      ? scatterData.reduce((acc, d) => acc + d.y, 0) / scatterData.length
      : null;

  // Histogram: full 7-day window bucketed into 30-min slots.
  const histogram = useMemo(() => {
    const counts = new Array(BUCKETS_PER_DAY).fill(0) as number[];
    for (const s of vapeSessions) {
      const bucket = Math.min(BUCKETS_PER_DAY - 1, Math.floor((s.hour * 60) / BUCKET_MIN));
      counts[bucket] += 1;
    }
    return counts.map((count, i) => {
      const hourFrac = (i * BUCKET_MIN) / 60;
      return { bucket: i, hourFrac, label: fmtHour(hourFrac), count };
    });
  }, [vapeSessions]);

  const peakBucket = useMemo(() => {
    let best = -1;
    let max = 0;
    for (const h of histogram) {
      if (h.count > max) {
        max = h.count;
        best = h.bucket;
      }
    }
    if (best < 0) return null;
    const start = (best * BUCKET_MIN) / 60;
    const end = ((best + 1) * BUCKET_MIN) / 60;
    return { range: `${fmtHour(start)}–${fmtHour(end)}`, count: max };
  }, [histogram]);

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton
          color={cannabisColor}
          onClick={() => setShowForm((v) => !v)}
        >
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error instanceof Error ? error.message : String(error)}</CardContent>
        </Card>
      )}

      {/* Log entry form — also starts a new capsule when logging a vape with no active one */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingId
                ? "Edit Session"
                : needsNewCapsule
                  ? "Start Capsule & Log First Use"
                  : "Log Session"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <TimeInput value={formTime} onChange={(v) => setFormTime(v)} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <button
                type="button"
                onClick={() => setFormMethod((m) => (m === "vape" ? "edible" : "vape"))}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                {formMethod === "vape" ? "Vape" : "🍬 Edible"}
              </button>
            </div>

            {needsNewCapsule && !editingId && (
              <>
                <input
                  type="text"
                  value={newCapsuleStrain}
                  onChange={(e) => setNewCapsuleStrain(e.target.value)}
                  placeholder="Strain (optional)"
                  list="cannabis-strain-options"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                {strains.length > 0 && (
                  <datalist id="cannabis-strain-options">
                    {strains.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                )}
              </>
            )}

            {formMethod === "vape" && activeCapsule && (
              <p className="text-xs text-muted-foreground">
                Strain: <span className="font-medium text-foreground">{activeCapsule.strain ?? "None"}</span> · from active capsule
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: cannabisColor }}
              >
                {saving ? "Saving…" : editingId ? "Save changes" : needsNewCapsule ? "Start & log" : "Save"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Active capsule</p>
          {activeCapsule ? (
            <>
              <p className="mt-1 truncate text-2xl font-semibold" style={{ color: cannabisColor }}>
                {activeCapsule.strain ?? "No strain"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeCapsule.use_count}/{usesPerCapsule} uses
                {activeCapsule.use_count > usesPerCapsule && " (extra)"}
              </p>
              <button
                type="button"
                onClick={handleEndCapsule}
                className="mt-2 w-full rounded-lg px-2 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: cannabisColor }}
              >
                End capsule
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold" style={{ color: cannabisColor }}>None</p>
              <button
                type="button"
                onClick={handleStartCapsule}
                className="mt-2 w-full rounded-lg px-2 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: cannabisColor }}
              >
                Start capsule
              </button>
            </>
          )}
        </div>
        <StatCard label="Sessions" value={day ? day.session_count : null} color={cannabisColor} />
        <StatCard label="Total" value={day ? `${day.total_g}g` : null} color={cannabisColor} />
        <StatCard
          label="Method"
          value={day ? [
            day.methods.vape > 0 ? `Vape ${day.methods.vape}` : "",
            day.methods.edible > 0 ? `🍬 ${day.methods.edible}` : "",
          ].filter(Boolean).join(" ") || "—" : null}
        />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Session log */}
        <div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : day && day.entries.length > 0 ? (
            <div className="space-y-2">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40"
                  onClick={() => handleEdit(entry)}
                >
                  <div className="flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{ backgroundColor: cannabisColor, color: "white" }}>
                    {entry.time.slice(0, 5)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {entry.method === "vape" ? "Vape" : "🍬 Edible"}
                      {entry.strain && entry.strain !== "None" && (
                        <span className="ml-2 text-muted-foreground">· {entry.strain}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                    className="shrink-0 text-xs text-muted-foreground hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !showForm && (
              <p className="text-sm text-muted-foreground">No sessions logged today.</p>
            )
          )}
        </div>

        {/* 30-day chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Last 30 days (g)</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...X_AXIS_DATE} interval={3} />
                  <YAxis {...Y_AXIS} width={32} />
                  <Bar dataKey="grams" fill="var(--color-grams)" radius={[4, 4, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Aggregated time-of-day distribution (vape only, 7 days) */}
      {vapeSessions.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle>Vape time-of-day · last 7 days</CardTitle>
            <p className="text-xs text-muted-foreground">
              30-min buckets across vape sessions from the last 7 days.
              {peakBucket && (
                <>
                  {" "}Peak{" "}
                  <span className="font-semibold text-foreground">{peakBucket.range}</span>
                  {" "}
                  <span className="text-muted-foreground/70">({peakBucket.count})</span>
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-4">
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={histogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  dataKey="hourFrac"
                  type="number"
                  domain={[0, 24]}
                  ticks={HOUR_TICKS_2H}
                  interval={0}
                  tickFormatter={formatHourTick}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                />
                <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} {...barAnim} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent scatter (vape only, 7 days) */}
      {scatterData.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle>Vape time-of-day · last 7 days</CardTitle>
            <p className="text-xs text-muted-foreground">
              Each dot is a vape session.
              {avgHour !== null && (
                <>
                  {" "}Average time{" "}
                  <span className="font-semibold text-foreground">
                    {String(Math.floor(avgHour)).padStart(2, "0")}:
                    {String(Math.round((avgHour % 1) * 60)).padStart(2, "0")}
                  </span>
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-4">
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid {...CHART_GRID_FULL} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Day"
                  domain={[-6, 0]}
                  ticks={[-6, -4, -2, 0]}
                  tickFormatter={(v: number) => (v === 0 ? "today" : `${-v}d`)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Hour"
                  domain={[0, 24]}
                  ticks={HOUR_TICKS_2H}
                  interval={0}
                  tickFormatter={formatHourTick}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tick={{ fontSize: 10 }}
                  reversed
                />
                <ZAxis type="number" range={[80, 80]} />
                {/* Shaded bands for rough daypart context */}
                <ReferenceLine y={6} stroke={SECTION_ACCENT_SHADE_3} strokeDasharray="2 2" strokeOpacity={0.3} />
                <ReferenceLine y={12} stroke={SECTION_ACCENT_SHADE_3} strokeDasharray="2 2" strokeOpacity={0.3} />
                <ReferenceLine y={18} stroke={SECTION_ACCENT_SHADE_3} strokeDasharray="2 2" strokeOpacity={0.3} />
                {avgHour !== null && (
                  <ReferenceLine
                    y={avgHour}
                    stroke={cannabisColor}
                    strokeDasharray="4 3"
                    strokeOpacity={0.6}
                  />
                )}
                <Scatter
                  data={scatterData}
                  fill={cannabisColor}
                  fillOpacity={0.55}
                  stroke={cannabisColor}
                  strokeOpacity={0.9}
                />
              </ScatterChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

    </>
  );
}
