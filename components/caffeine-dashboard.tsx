"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInput } from "@/components/time-input";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

import {
  getCaffeineConfig,
  getCaffeineDay,
  addCaffeineEntry,
  deleteCaffeineEntry,
  getCaffeineHistory,
  getCaffeineSessions,
  type CaffeineMethod,
  type CaffeineSession,
} from "@/lib/api";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { StatCard } from "@/components/stat-card";
import { useBarAnimation } from "@/hooks/use-bar-animation";
import {
  todayLocalISO,
  nowHHMM as currentTime,
  HOUR_TICKS_2H,
  formatHourTick,
} from "@/lib/date-utils";
import { CHART_GRID, WEEKDAY_X_AXIS, Y_AXIS } from "@/lib/chart-defaults";
import { useSelectedDate } from "@/hooks/use-selected-date";

// 30-minute buckets → 48 slots covering the full day.
const BUCKET_MIN = 30;
const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MIN;

const METHOD_LABEL: Record<CaffeineMethod, string> = {
  v60: "☕ V60",
  matcha: "🍵 Matcha",
  other: "· Other",
};

const METHOD_ORDER: CaffeineMethod[] = ["v60", "matcha", "other"];

function fmtHour(frac: number): string {
  const h = Math.floor(frac);
  const m = Math.round((frac % 1) * 60);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function CaffeineDashboard() {
  const caffeineColor = "var(--section-accent)";
  const chartConfig = {
    count: { label: "Sessions", color: caffeineColor },
  } satisfies ChartConfig;
  const [showForm, setShowForm] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).has("log");
    }
    return false;
  });
  const [formTime, setFormTime] = useState(currentTime());
  const [formMethod, setFormMethod] = useState<CaffeineMethod>("v60");
  const [formBeans, setFormBeans] = useState("");
  const [formGrams, setFormGrams] = useState("");
  const [saving, setSaving] = useState(false);
  const barAnim = useBarAnimation();
  const { date: selectedDate } = useSelectedDate();
  const today = todayLocalISO();

  const { data, error, isLoading, mutate } = useSWR(
    ["caffeine", selectedDate],
    async () => {
      const [d, c, s, h] = await Promise.all([
        getCaffeineDay(selectedDate),
        getCaffeineConfig(),
        getCaffeineSessions(7),
        getCaffeineHistory(7),
      ]);
      return { day: d, beans: c.beans, sessions: s.sessions, history: h.daily };
    },
    { refreshInterval: 60_000 },
  );

  const day = data?.day ?? null;
  const beans = data?.beans ?? [];
  const sessions = data?.sessions ?? [];
  const history = data?.history ?? [];
  const loading = isLoading && !data;

  // Most recent session (sessions are sorted oldest→newest by the backend).
  const lastSession: CaffeineSession | null = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  // Seed the form from the last coffee — method, beans, grams. Time resets to now.
  const seedFormFromLast = useCallback((last: CaffeineSession | null) => {
    setFormTime(currentTime());
    setFormMethod(last?.method ?? "v60");
    setFormBeans(last?.beans ?? "");
    setFormGrams(last?.grams != null ? String(last.grams) : "");
  }, []);

  // If the page was opened with ?log (quick-log entry), seed once data arrives.
  const autoSeededRef = useRef(false);
  useEffect(() => {
    if (!autoSeededRef.current && showForm && data) {
      seedFormFromLast(lastSession);
      autoSeededRef.current = true;
    }
  }, [showForm, data, lastSession, seedFormFromLast]);

  const handleToggleForm = useCallback(() => {
    setShowForm((open) => {
      if (!open) seedFormFromLast(lastSession);
      return !open;
    });
  }, [lastSession, seedFormFromLast]);

  const handleAdd = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const gramsNum = formGrams.trim() ? parseFloat(formGrams) : null;
      await addCaffeineEntry({
        date: today,
        time: formTime,
        method: formMethod,
        beans: formBeans.trim() || null,
        grams: Number.isFinite(gramsNum as number) ? (gramsNum as number) : null,
      });
      setShowForm(false);
      // Defaults get re-seeded from the (now freshly-saved) last entry on next open.
      await mutate();
    } catch {
      // surfaced via SWR
    } finally {
      setSaving(false);
    }
  }, [today, formTime, formMethod, formBeans, formGrams, saving, mutate]);

  const handleDelete = useCallback(
    async (entryId: string) => {
      try {
        await deleteCaffeineEntry(entryId, selectedDate);
        await mutate();
      } catch {
        // surfaced via SWR
      }
    },
    [selectedDate, mutate],
  );

  // 7-day time-of-day distribution, 30-min buckets.
  const histogram = useMemo(() => {
    const counts = new Array(BUCKETS_PER_DAY).fill(0) as number[];
    for (const s of sessions) {
      const bucket = Math.min(BUCKETS_PER_DAY - 1, Math.floor((s.hour * 60) / BUCKET_MIN));
      counts[bucket] += 1;
    }
    return counts.map((count, i) => {
      const hourFrac = (i * BUCKET_MIN) / 60;
      return {
        bucket: i,
        hourFrac,
        label: fmtHour(hourFrac),
        count,
      };
    });
  }, [sessions]);

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

  const hasAnySessions = sessions.length > 0;

  // 7-day daily totals. Backend returns oldest→newest; keep that order so
  // today sits on the right edge — matches how every other 7d chart reads.
  const dailyTotals = useMemo(
    () => history.map((p) => ({ date: p.date, count: p.sessions })),
    [history],
  );
  const weekTotal = useMemo(
    () => dailyTotals.reduce((s, p) => s + p.count, 0),
    [dailyTotals],
  );

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton color={caffeineColor} onClick={handleToggleForm}>
          + Log
        </SectionHeaderActionButton>
      </SectionHeaderAction>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      {/* Log entry form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Log caffeine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <TimeInput value={formTime} onChange={(v) => setFormTime(v)} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <div className="flex rounded-lg border border-border bg-card p-0.5">
                {METHOD_ORDER.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormMethod(m)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                    style={
                      formMethod === m
                        ? { backgroundColor: caffeineColor, color: "white" }
                        : undefined
                    }
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {beans.length > 0 ? (
                <select
                  value={formBeans}
                  onChange={(e) => setFormBeans(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Beans (optional)</option>
                  {beans.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Beans (optional)"
                  value={formBeans}
                  onChange={(e) => setFormBeans(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              )}
              <input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                placeholder="Grams"
                value={formGrams}
                onChange={(e) => setFormGrams(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: caffeineColor }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Sessions"
          value={day ? day.session_count : null}
          color={caffeineColor}
        />
        <StatCard
          label="Grams"
          value={day && day.total_g != null ? `${day.total_g}g` : day ? "—" : null}
          color={caffeineColor}
        />
        <StatCard
          label="Method"
          value={
            day
              ? METHOD_ORDER.map((m) =>
                  day.methods[m] > 0 ? `${METHOD_LABEL[m].split(" ")[0]} ${day.methods[m]}` : "",
                )
                  .filter(Boolean)
                  .join(" ") || "—"
              : null
          }
          color={caffeineColor}
        />
      </div>

      {/* Two-column: today's log on the left, 7d distribution on the right (max half). */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Today's session log */}
        <div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : day && day.entries.length > 0 ? (
            <div className="space-y-2">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div
                    className="flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{ backgroundColor: caffeineColor, color: "white" }}
                  >
                    {entry.time.slice(0, 5)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {METHOD_LABEL[entry.method]}
                      {entry.grams != null && (
                        <span className="ml-2 text-muted-foreground">· {entry.grams}g</span>
                      )}
                      {entry.beans && (
                        <span className="ml-2 text-muted-foreground">· {entry.beans}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !showForm && (
              <p className="text-sm text-muted-foreground">No caffeine logged today.</p>
            )
          )}
        </div>

        {/* 30-day time-of-day distribution */}
        {hasAnySessions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Time-of-day · last 7 days</CardTitle>
              <p className="text-xs text-muted-foreground">
                30-min buckets across sessions from the last 7 days.
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

        {/* 7-day daily totals */}
        {dailyTotals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Daily total · last 7 days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Sessions per day. Weekly total{" "}
                <span className="font-semibold text-foreground">{weekTotal}</span>.
              </p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={dailyTotals} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={0} />
                  <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} {...barAnim} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

    </>
  );
}
