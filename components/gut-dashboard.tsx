"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInput } from "@/components/time-input";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

import {
  addGutEntry,
  deleteGutEntry,
  getGutConfig,
  getGutDay,
  getGutHistory,
  updateGutEntry,
  type GutEntry,
} from "@/lib/api-gut";
import { SectionHeaderAction, SectionHeaderActionButton } from "@/components/section-header-action";
import { StatCard } from "@/components/stat-card";
import {
  todayLocalISO,
  nowHHMM as currentTime,
} from "@/lib/date-utils";
import { CHART_GRID, WEEKDAY_X_AXIS, Y_AXIS } from "@/lib/chart-defaults";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { SECTION_ACCENT_SHADE_2, SECTION_ACCENT_STRONG } from "@/lib/section-colors";

const GUT_COLOR = "var(--section-accent)";
const BRISTOL_IDS = [1, 2, 3, 4, 5, 6, 7];
const BLOOD_IDS = [0, 1, 2];

const chartConfig = {
  count: { label: "Count", color: GUT_COLOR },
  avg: { label: "Avg Bristol", color: GUT_COLOR },
  discomfort: { label: "Discomfort (h)", color: GUT_COLOR },
} satisfies ChartConfig;

function fmtDuration(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 0 ? `${whole}h` : `${whole}h ${mins}m`;
}

export function GutDashboard() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTime, setFormTime] = useState(currentTime());
  const [formBristol, setFormBristol] = useState<number>(4);
  const [formBlood, setFormBlood] = useState<number>(0);
  const [formDiscomfortHours, setFormDiscomfortHours] = useState<string>("");
  const [formNote, setFormNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const { date: selectedDate } = useSelectedDate();
  const today = todayLocalISO();

  const { data, error, isLoading, mutate } = useSWR(
    ["gut", selectedDate],
    async () => {
      const [d, c, h] = await Promise.all([
        getGutDay(selectedDate),
        getGutConfig(),
        getGutHistory(30),
      ]);
      return { day: d, config: c, history: h.daily };
    },
    { refreshInterval: 60_000 },
  );

  const day = data?.day ?? null;
  const config = data?.config ?? null;
  const history = data?.history ?? [];
  const loading = isLoading && !data;

  const bristolLabel = useCallback(
    (id: number) => config?.bristol.find((b) => b.id === id)?.label ?? `Type ${id}`,
    [config],
  );
  const bristolDesc = useCallback(
    (id: number) => config?.bristol.find((b) => b.id === id)?.description ?? "",
    [config],
  );
  const bloodLabel = useCallback(
    (id: number) => config?.blood.find((b) => b.id === id)?.label ?? `${id}`,
    [config],
  );

  const resetForm = useCallback(() => {
    setFormTime(currentTime());
    setFormBristol(4);
    setFormBlood(0);
    setFormDiscomfortHours("");
    setFormNote("");
    setEditingId(null);
  }, []);

  const handleToggleForm = useCallback(() => {
    setShowForm((open) => {
      if (!open) resetForm();
      return !open;
    });
  }, [resetForm]);

  const handleEdit = useCallback((entry: GutEntry) => {
    setEditingId(entry.id);
    setFormTime(entry.time.slice(0, 5));
    setFormBristol(entry.bristol);
    setFormBlood(entry.blood);
    setFormDiscomfortHours(
      entry.discomfort_hours != null && entry.discomfort_hours > 0
        ? String(entry.discomfort_hours)
        : "",
    );
    setFormNote(entry.note ?? "");
    setShowForm(true);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, [resetForm]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const hours =
        formDiscomfortHours.trim() === "" ? null : Number(formDiscomfortHours);
      const hoursValid = hours == null || (Number.isFinite(hours) && hours >= 0);
      const hoursPayload = hoursValid ? hours : null;
      if (editingId) {
        await updateGutEntry(editingId, selectedDate, {
          time: formTime,
          bristol: formBristol,
          blood: formBlood,
          discomfort_hours: hoursPayload,
          note: formNote.trim() || null,
        });
      } else {
        await addGutEntry({
          date: today,
          time: formTime,
          bristol: formBristol,
          blood: formBlood,
          discomfort_hours: hoursPayload,
          note: formNote.trim() || null,
        });
      }
      setShowForm(false);
      resetForm();
      await mutate();
    } finally {
      setSaving(false);
    }
  }, [
    today,
    selectedDate,
    editingId,
    formTime,
    formBristol,
    formBlood,
    formDiscomfortHours,
    formNote,
    saving,
    mutate,
    resetForm,
  ]);

  const handleDelete = useCallback(
    async (entryId: string) => {
      await deleteGutEntry(entryId, selectedDate);
      await mutate();
    },
    [selectedDate, mutate],
  );

  // 30-day Bristol distribution
  const bristolHistogram = useMemo(() => {
    const counts = new Map<number, number>();
    for (const id of BRISTOL_IDS) counts.set(id, 0);
    // Scrape bristol values out of movements across history via today's counts
    // only — but we want 30d, so recompute from avg_bristol * movements isn't
    // accurate. Instead, show today's distribution + multi-day averages in
    // the trend chart below.
    if (day) {
      for (const [k, v] of Object.entries(day.bristol_counts)) {
        counts.set(Number(k), v);
      }
    }
    return BRISTOL_IDS.map((id) => ({
      id,
      label: `T${id}`,
      count: counts.get(id) ?? 0,
    }));
  }, [day]);

  const dailyMovements = useMemo(
    () => history.map((p) => ({ date: p.date, count: p.movements })),
    [history],
  );

  const avgBristolSeries = useMemo(
    () => history.filter((p) => p.avg_bristol != null).map((p) => ({ date: p.date, avg: p.avg_bristol! })),
    [history],
  );

  const discomfortSeries = useMemo(
    () => history.map((p) => ({ date: p.date, discomfort: p.discomfort_h })),
    [history],
  );

  const weeklyTotal = useMemo(() => {
    const last7 = history.slice(-7);
    return last7.reduce((s, p) => s + p.movements, 0);
  }, [history]);

  const openDiscomfort = day?.open_discomfort ?? 0;

  return (
    <>
      <SectionHeaderAction>
        <SectionHeaderActionButton color={GUT_COLOR} onClick={handleToggleForm}>
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

      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? "Edit Movement" : "Log Movement"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <TimeInput
                value={formTime}
                onChange={(v) => setFormTime(v)}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Bristol
              </p>
              <div className="flex flex-wrap gap-1.5">
                {BRISTOL_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormBristol(id)}
                    title={bristolDesc(id)}
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors"
                    style={
                      formBristol === id
                        ? { backgroundColor: GUT_COLOR, color: "white", borderColor: GUT_COLOR }
                        : undefined
                    }
                  >
                    <span className="mr-1 font-bold">{id}</span>
                    {bristolLabel(id)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Blood
              </p>
              <div className="flex gap-1.5">
                {BLOOD_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormBlood(id)}
                    className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors"
                    style={
                      formBlood === id
                        ? { backgroundColor: GUT_COLOR, color: "white", borderColor: GUT_COLOR }
                        : undefined
                    }
                  >
                    {id} · {bloodLabel(id)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Discomfort (hours)
              </p>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                placeholder="0"
                value={formDiscomfortHours}
                onChange={(e) => setFormDiscomfortHours(e.target.value)}
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <textarea
              placeholder="Note (optional)"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />

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
                style={{ backgroundColor: GUT_COLOR }}
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Save"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Movements"
          value={day ? day.movement_count : null}
          color={GUT_COLOR}
        />
        <StatCard
          label="Blood"
          value={day ? bloodLabel(day.max_blood) : null}
          color={day && day.max_blood > 0 ? SECTION_ACCENT_STRONG : GUT_COLOR}
        />
        <StatCard
          label="Discomfort"
          value={day ? fmtDuration(day.total_discomfort_h || null) : null}
          color={GUT_COLOR}
        />
        <StatCard
          label="Open"
          value={day ? openDiscomfort : null}
          sublabel={openDiscomfort > 0 ? "Unresolved discomfort" : undefined}
          color={openDiscomfort > 0 ? SECTION_ACCENT_SHADE_2 : GUT_COLOR}
        />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Today's log */}
        <div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : day && day.entries.length > 0 ? (
            <div className="space-y-2">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => handleEdit(entry)}
                  className="cursor-pointer rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{ backgroundColor: GUT_COLOR, color: "white" }}
                    >
                      {entry.time.slice(0, 5)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <span>Bristol {entry.bristol}</span>
                        <span className="ml-2 text-muted-foreground">
                          · {bristolLabel(entry.bristol)}
                        </span>
                        {entry.blood > 0 && (
                          <span className="ml-2 font-semibold" style={{ color: SECTION_ACCENT_STRONG }}>
                            · Blood: {bloodLabel(entry.blood)}
                          </span>
                        )}
                        {entry.discomfort_hours != null && entry.discomfort_hours > 0 && (
                          <span className="ml-2 text-muted-foreground">
                            · Discomfort {fmtDuration(entry.discomfort_hours)}
                          </span>
                        )}
                      </p>
                      {entry.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.note}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !showForm && (
              <p className="text-sm text-muted-foreground">No movements logged today.</p>
            )
          )}
        </div>

        {/* Bristol distribution (today) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Bristol Distribution · Today</CardTitle>
            <p className="text-xs text-muted-foreground">
              Count per Bristol type. Hover on the form buttons for descriptions.
            </p>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-4">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={bristolHistogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 30-day movements */}
        {dailyMovements.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Movements · last 30 Days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Daily count. Last 7 days total{" "}
                <span className="font-semibold text-foreground">{weeklyTotal}</span>.
              </p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={dailyMovements} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={"preserveStartEnd" as const} />
                  <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Average Bristol over time */}
        {avgBristolSeries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Average Bristol · last 30 Days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Daily mean across movements. 4 is the ideal range.
              </p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <LineChart data={avgBristolSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={"preserveStartEnd" as const} />
                  <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} domain={[1, 7]} ticks={[1, 2, 3, 4, 5, 6, 7]} />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="var(--color-avg)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Discomfort hours over time */}
        {discomfortSeries.some((p) => p.discomfort > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Discomfort · last 30 Days</CardTitle>
              <p className="text-xs text-muted-foreground">Daily discomfort hours.</p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-4">
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={discomfortSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...WEEKDAY_X_AXIS} interval={"preserveStartEnd" as const} />
                  <YAxis {...Y_AXIS} width={28} tick={{ fontSize: 11 }} />
                  <Bar
                    dataKey="discomfort"
                    fill="var(--color-discomfort)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
