"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TimeInput } from "@/components/time-input";
import useSWR, { mutate as globalMutate } from "swr";
import { addGutEntry, getGutConfig } from "@/lib/api-gut";
import {
  addCaffeineEntry,
  addCannabisEntry,
  completeChore,
  getCaffeineConfig,
  getCaffeineSessions,
  getCannabisActiveCapsule,
  getCannabisDay,
  getCannabisSessions,
  getChores,
  getHabitDay,
  getNextWorkout,
  getNutritionEntries,
  getSettings,
  getSupplementDay,
  saveNutritionEntry,
  startCannabisCapsule,
  toggleHabit,
  toggleSupplement,
  type CaffeineMethod,
  type HabitBucket,
  type HabitDayItem,
  type NutritionEntry,
  type SupplementItem,
} from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { useSectionColor } from "@/hooks/use-sections";
import { useSelectedDate } from "@/hooks/use-selected-date";
import {
  DEFAULT_DAY_PHASES,
  activePhaseId,
  orderPhasesByCurrent,
  timeLeftInPhase,
} from "@/lib/day-phases";
import { SESSION_META, type SessionType } from "@/lib/session-templates";
import { daysAgoLocalISO, nowHHMM } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import { TaskRow } from "@/components/tasks";

// ── Shared primitives ────────────────────────────────────────────────────────

function SaveBar({
  onCancel,
  onSave,
  saving,
  label = "Save",
  accent,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  label?: string;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  accent,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={value === o.value ? { backgroundColor: accent, color: "white" } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const HAPTIC = () => {
  try {
    (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate?.(8);
  } catch {}
};

// Revalidate every SWR cache entry whose key (or array-key head) is in the
// given set. Homepage tiles use `["overview-<section>", date]`, day-view
// pages use `["<section>", date]`, and the timeline uses
// `["today-timeline", date]` — a plain-string mutate never matches those,
// so after any quick-log write we fan out with a filter function.
export function revalidateAfterLog(section: string) {
  // Prefix match on `overview-${section}` — tiles sometimes register
  // extra keys like `overview-${section}-history` for companion queries.
  const exact = new Set([section, `quicklog-${section}`, "today-timeline"]);
  const overviewPrefix = `overview-${section}`;
  globalMutate((key) => {
    const head = Array.isArray(key) ? key[0] : key;
    if (typeof head !== "string") return false;
    return exact.has(head) || head === overviewPrefix || head.startsWith(`${overviewPrefix}-`);
  });
}

// ── Exercise ─────────────────────────────────────────────────────────────────

const SESSION_ORDER: SessionType[] = ["upper", "lower", "cardio", "yoga"];

function fmtDaysAgo(n: number | null): string {
  if (n == null) return "never";
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  return `${n}d ago`;
}

export function ExerciseQuickLog({ onDone }: { onDone: () => void }) {
  // Live color from /api/sections, not the static SECTIONS fallback —
  // honors user customisation in settings.yaml.
  const accent = useSectionColor("exercise");
  const router = useRouter();
  const { data, isLoading } = useSWR("quicklog-exercise", () => getNextWorkout());
  const [navigating, setNavigating] = useState<SessionType | null>(null);

  const pick = useCallback(
    (type: SessionType) => {
      if (navigating) return;
      setNavigating(type);
      HAPTIC();
      router.push(`/exercise/session/new?type=${type}`);
      onDone();
    },
    [navigating, router, onDone],
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Pick a session type. Suggestion is based on days since your last one of each kind.
      </p>
      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1.5">
          {SESSION_ORDER.map((type) => {
            const meta = SESSION_META[type];
            const daysAgo = data?.days_ago[type] ?? null;
            const suggested = data?.suggested.type === type;
            const busy = navigating === type;
            return (
              <button
                key={type}
                type="button"
                disabled={!!navigating}
                onClick={() => pick(type)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors",
                  suggested
                    ? "border-transparent text-white"
                    : "border-border bg-card hover:border-[color:var(--accent)]",
                  busy && "opacity-60",
                )}
                style={{
                  backgroundColor: suggested ? accent : undefined,
                  ["--accent" as string]: accent,
                } as React.CSSProperties}
              >
                <span className="flex items-center gap-3">
                  <span className="text-2xl">{meta.emoji}</span>
                  <span>
                    <span className="block text-base font-semibold">{meta.label}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        suggested ? "text-white/80" : "text-muted-foreground",
                      )}
                    >
                      Last: {fmtDaysAgo(daysAgo)}
                    </span>
                  </span>
                </span>
                {suggested && (
                  <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    Suggested
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Nutrition ────────────────────────────────────────────────────────────────

export function NutritionQuickLog({ onDone }: { onDone: () => void }) {
  const accent = useSectionColor("nutrition");
  const { date: selectedDate } = useSelectedDate();
  const { data, isLoading } = useSWR("quicklog-nutrition", () =>
    getNutritionEntries(daysAgoLocalISO(7)),
  );
  const [savingFile, setSavingFile] = useState<string | null>(null);

  // Unique recent entries ranked by most-used (frequency) — deduplicate by
  // first food name, sort by how many times each appears, keep top 8.
  const recent = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const e of data) {
      const key = e.foods[0] ?? "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const unique = [...new Set(data.map((e) => e.foods[0] ?? ""))];
    unique.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    const seen = new Set<string>();
    const out: NutritionEntry[] = [];
    for (const e of data) {
      const key = e.foods[0] ?? "";
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= 8) break;
    }
    return out;
  }, [data]);

  const duplicate = useCallback(
    async (entry: NutritionEntry) => {
      if (savingFile) return;
      setSavingFile(entry.file);
      HAPTIC();
      try {
        await saveNutritionEntry({
          date: selectedDate,
          time: nowHHMM(),
          emoji: entry.emoji ?? "",
          protein_g: entry.protein_g,
          fat_g: entry.fat_g ?? 0,
          carbs_g: entry.carbs_g ?? 0,
          kcal: entry.kcal ?? 0,
          foods: entry.foods,
        });
        revalidateAfterLog("nutrition");
        showToast("Logged again", { description: entry.foods[0] });
        onDone();
      } finally {
        setSavingFile(null);
      }
    },
    [savingFile, onDone, selectedDate],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Tap a recent meal to log it again now. For custom macros, open the Nutrition page.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading recent meals…</p>
      ) : recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recent meals yet. Log a first entry via chat or the Nutrition page.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((e) => {
            const pending = savingFile === e.file;
            return (
              <li key={e.file}>
                <button
                  type="button"
                  disabled={!!savingFile}
                  onClick={() => duplicate(e)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-[color:var(--accent)]",
                    pending && "opacity-60",
                  )}
                  style={{ ["--accent" as string]: accent } as React.CSSProperties}
                >
                  <span className="shrink-0 text-xl">{e.emoji?.trim() || "🍽️"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.foods[0]}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {Math.round(e.protein_g)}P · {Math.round(e.fat_g)}F ·{" "}
                      {Math.round(e.carbs_g || 0)}C · {Math.round(e.kcal)}kcal
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: accent }}>
                    {pending ? "…" : "Log"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Caffeine ─────────────────────────────────────────────────────────────────

const CAFFEINE_METHODS: { value: CaffeineMethod; label: string }[] = [
  { value: "v60", label: "☕ V60" },
  { value: "matcha", label: "🍵 Matcha" },
  { value: "other", label: "· Other" },
];

export function CaffeineQuickLog({ onDone }: { onDone: () => void }) {
  const accent = useSectionColor("caffeine");
  const { date: selectedDate } = useSelectedDate();
  const { data } = useSWR("quicklog-caffeine", async () => {
    const [sessions, cfg] = await Promise.all([getCaffeineSessions(7), getCaffeineConfig()]);
    return { sessions: sessions.sessions, beans: cfg.beans };
  });
  const beans = data?.beans ?? [];
  // Prefill from the most recent historical session (backend returns oldest→newest).
  // Using 7 days of history means the very first coffee of the day still gets sensible
  // defaults rather than an empty form.
  const lastEntry = useMemo(() => {
    const entries = data?.sessions ?? [];
    return entries.length ? entries[entries.length - 1] : null;
  }, [data]);

  const [time, setTime] = useState<string>(nowHHMM);
  const [method, setMethod] = useState<CaffeineMethod>("v60");
  const [beansSel, setBeansSel] = useState("");
  const [grams, setGrams] = useState("");
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !data) return;
    if (lastEntry) {
      setMethod(lastEntry.method);
      setBeansSel(lastEntry.beans ?? "");
      setGrams(lastEntry.grams != null ? String(lastEntry.grams) : "");
    }
    setSeeded(true);
  }, [data, lastEntry, seeded]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const gramsNum = grams.trim() ? parseFloat(grams) : null;
      await addCaffeineEntry({
        date: selectedDate,
        time,
        method,
        beans: beansSel.trim() || null,
        grams: Number.isFinite(gramsNum as number) ? (gramsNum as number) : null,
      });
      revalidateAfterLog("caffeine");
      onDone();
    } finally {
      setSaving(false);
    }
  }, [saving, grams, selectedDate, time, method, beansSel, onDone]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TimeInput value={time} onChange={setTime} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <PillGroup
          options={CAFFEINE_METHODS}
          value={method}
          onChange={setMethod}
          accent={accent}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {beans.length > 0 ? (
          <select
            value={beansSel}
            onChange={(e) => setBeansSel(e.target.value)}
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
            value={beansSel}
            onChange={(e) => setBeansSel(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        )}
        <input
          type="number"
          step="0.1"
          min="0"
          inputMode="decimal"
          placeholder="Grams"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <SaveBar onCancel={onDone} onSave={handleSave} saving={saving} accent={accent} />
    </div>
  );
}

// ── Cannabis ─────────────────────────────────────────────────────────────────

const CANNABIS_METHODS: { value: "vape" | "edible"; label: string }[] = [
  { value: "vape", label: "💨 Vape" },
  { value: "edible", label: "🍬 Edible" },
];

export function CannabisQuickLog({ onDone }: { onDone: () => void }) {
  const accent = useSectionColor("cannabis");
  const { date: selectedDate } = useSelectedDate();
  const { data, mutate } = useSWR(["quicklog-cannabis", selectedDate], async () => {
    const [day, cap, sessions] = await Promise.all([
      getCannabisDay(selectedDate),
      getCannabisActiveCapsule(),
      getCannabisSessions(30),
    ]);
    return { day, capsule: cap, sessions: sessions.sessions };
  });

  const activeCapsule = data?.capsule.active ?? null;
  // Most recent session with a strain — used to seed the "start new capsule"
  // input so a repeat strain doesn't need re-typing. Backend returns
  // oldest→newest, so scan from the tail.
  const lastStrain = useMemo(() => {
    const s = data?.sessions ?? [];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].strain) return s[i].strain ?? "";
    }
    return "";
  }, [data]);
  const [time, setTime] = useState<string>(nowHHMM);
  const [method, setMethod] = useState<"vape" | "edible">("vape");
  const [strain, setStrain] = useState("");
  const [strainSeeded, setStrainSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (strainSeeded || !data) return;
    if (lastStrain) setStrain(lastStrain);
    setStrainSeeded(true);
  }, [data, lastStrain, strainSeeded]);

  const handleStartCapsule = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await startCannabisCapsule(strain.trim() || null);
      // A fresh capsule always starts with the first hit — log a vape
      // session alongside it so use_count reflects reality.
      await addCannabisEntry({ date: selectedDate, time: nowHHMM(), method: "vape" });
      revalidateAfterLog("cannabis");
      await mutate();
    } finally {
      setSaving(false);
    }
  }, [saving, strain, selectedDate, mutate]);

  const handleLog = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await addCannabisEntry({ date: selectedDate, time, method });
      revalidateAfterLog("cannabis");
      onDone();
    } finally {
      setSaving(false);
    }
  }, [saving, selectedDate, time, method, onDone]);

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!activeCapsule) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          No active capsule. Start one before logging a session.
        </p>
        <input
          type="text"
          placeholder="Strain (optional)"
          value={strain}
          onChange={(e) => setStrain(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <SaveBar
          onCancel={onDone}
          onSave={handleStartCapsule}
          saving={saving}
          label="Start capsule"
          accent={accent}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        Active capsule: <span className="font-medium text-foreground">{activeCapsule.strain ?? "(no strain)"}</span>
        {" · "}use {activeCapsule.use_count + 1}/{data.capsule.uses_per_capsule}
      </div>
      <div className="flex items-center gap-2">
        <TimeInput value={time} onChange={setTime} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <PillGroup options={CANNABIS_METHODS} value={method} onChange={setMethod} accent={accent} />
      </div>
      <SaveBar onCancel={onDone} onSave={handleLog} saving={saving} accent={accent} />
    </div>
  );
}

// ── Habits ───────────────────────────────────────────────────────────────────

export function HabitsQuickLog() {
  const accent = useSectionColor("habits");
  const { date: selectedDate, isToday } = useSelectedDate();
  const { data, mutate, isLoading } = useSWR(["quicklog-habits", selectedDate], () =>
    getHabitDay(selectedDate),
  );
  const { data: settings } = useSWR("settings", getSettings);
  const phases = settings?.day_phases ?? DEFAULT_DAY_PHASES;
  const [pending, setPending] = useState<Set<string>>(new Set());

  const onToggle = useCallback(
    async (habit: HabitDayItem) => {
      if (pending.has(habit.id) || !data) return;
      setPending((p) => new Set(p).add(habit.id));
      HAPTIC();
      try {
        await toggleHabit(selectedDate, habit.id, !habit.done);
        revalidateAfterLog("habits");
        await mutate();
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(habit.id);
          return next;
        });
      }
    },
    [pending, data, selectedDate, mutate],
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading habits…</p>;
  }

  if (data.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No habits configured. Add some in Settings → Habits.
      </p>
    );
  }

  const nowBucket = activePhaseId(phases);
  const order = orderPhasesByCurrent(phases).map((p) => p.id);
  const allDone = data.done_count === data.total;

  const showCurrentBucket = isToday;
  const activeBucket = isToday ? nowBucket : null;
  const timeLeft = activeBucket ? timeLeftInPhase(phases, activeBucket) : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {isToday
          ? timeLeft
            ? `${timeLeft} · ${data.done_count}/${data.total} done`
            : `${data.done_count}/${data.total} done today`
          : `${data.done_count}/${data.total} done today`}
        {allDone && " · all caught up 🎉"}
      </p>

      {(showCurrentBucket && activeBucket ? [activeBucket] : order).map((bucket, idx) => {
        const items = (data.grouped[bucket] ?? []).filter((h) => !h.done);
        if (items.length === 0) return null;
        const meta = phases.find((p) => p.id === bucket) ?? { label: bucket, emoji: "" };
        const isNow = bucket === nowBucket;
        return (
          <div key={bucket} className={idx > 0 ? "border-t border-border pt-3" : ""}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
              <span>{meta.emoji}</span>
              <span className={cn(isNow ? "text-foreground" : "text-muted-foreground")}>
                {meta.label}
              </span>
              {isNow && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  NOW
                </span>
              )}
            </p>
            <div className="space-y-1.5">
              {items.map((h) => (
                <TaskRow
                  key={h.id}
                  label={h.name}
                  done={h.done}
                  pending={pending.has(h.id)}
                  accent={accent}
                  onClick={() => onToggle(h)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Supplements ──────────────────────────────────────────────────────────────

export function SupplementsQuickLog() {
  const accent = useSectionColor("supplements");
  const { date: selectedDate } = useSelectedDate();
  const { data, mutate, isLoading } = useSWR(["quicklog-supplements", selectedDate], () =>
    getSupplementDay(selectedDate),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  const onToggle = useCallback(
    async (item: SupplementItem) => {
      if (pending.has(item.id) || !data) return;
      setPending((p) => new Set(p).add(item.id));
      HAPTIC();
      try {
        await toggleSupplement(selectedDate, item.id, !item.done);
        revalidateAfterLog("supplements");
        await mutate();
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(item.id);
          return next;
        });
      }
    },
    [pending, data, selectedDate, mutate],
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading supplements…</p>;
  }

  if (data.total === 0) {
    return <p className="text-sm text-muted-foreground">No supplements configured.</p>;
  }

  const remaining = data.items.filter((i) => !i.done);
  const allDone = remaining.length === 0;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.done_count}/{data.total} taken today
        {allDone ? " · all caught up 🎉" : " · showing unfinished"}
      </p>
      {!allDone && (
        <div className="space-y-1.5">
          {remaining.map((item) => (
            <TaskRow
              key={item.id}
              label={item.name}
              emoji={item.emoji}
              done={item.done}
              pending={pending.has(item.id)}
              accent={accent}
              onClick={() => onToggle(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chores ───────────────────────────────────────────────────────────────────

export function ChoresQuickLog() {
  const accent = useSectionColor("chores");
  const { date: selectedDate } = useSelectedDate();
  const { data, mutate, isLoading } = useSWR("quicklog-chores", () => getChores());
  const [pending, setPending] = useState<Set<string>>(new Set());

  const onComplete = useCallback(
    async (id: string) => {
      if (pending.has(id)) return;
      setPending((p) => new Set(p).add(id));
      HAPTIC();
      try {
        await completeChore(id, { date: selectedDate });
        revalidateAfterLog("chores");
        await mutate();
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      }
    },
    [pending, mutate, selectedDate],
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading chores…</p>;
  }

  // Show anything overdue or due today — the actionable bucket.
  const actionable = data.chores.filter((c) => c.days_overdue >= 0);
  if (actionable.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing due today. ✨</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {actionable.length} actionable · tap to mark complete
      </p>
      <div className="space-y-1.5">
        {actionable.map((c) => {
          const late = c.days_overdue > 0;
          const sub = late
            ? c.days_overdue === 1
              ? "1 day late"
              : `${c.days_overdue} days late`
            : "due today";
          return (
            <TaskRow
              key={c.id}
              label={c.name}
              emoji={c.emoji}
              sublabel={sub}
              sublabelTone={late ? "warn" : undefined}
              done={false}
              pending={pending.has(c.id)}
              accent={accent}
              onClick={() => onComplete(c.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Gut ──────────────────────────────────────────────────────────────────────

export function GutQuickLog({ onDone }: { onDone: () => void }) {
  const accent = useSectionColor("gut");
  const { date: selectedDate } = useSelectedDate();
  const { data: config } = useSWR("quicklog-gut-config", getGutConfig);

  const [time, setTime] = useState<string>(nowHHMM);
  const [bristol, setBristol] = useState<string>("4");
  const [blood, setBlood] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  const bristolOpts = useMemo(
    () =>
      (config?.bristol ?? [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, label: `Type ${id}`, description: "" }))).map((b) => ({
        value: String(b.id),
        label: `${b.id}`,
      })),
    [config],
  );
  const bloodOpts = useMemo(
    () =>
      (config?.blood ?? [0, 1, 2].map((id) => ({ id, label: String(id) }))).map((b) => ({
        value: String(b.id),
        label: `${b.id} · ${b.label}`,
      })),
    [config],
  );

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await addGutEntry({
        date: selectedDate,
        time,
        bristol: parseInt(bristol, 10),
        blood: parseInt(blood, 10),
      });
      revalidateAfterLog("gut");
      onDone();
    } finally {
      setSaving(false);
    }
  }, [saving, selectedDate, time, bristol, blood, onDone]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TimeInput
          value={time}
          onChange={setTime}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Bristol</p>
        <PillGroup options={bristolOpts} value={bristol} onChange={setBristol} accent={accent} />
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Blood</p>
        <PillGroup options={bloodOpts} value={blood} onChange={setBlood} accent={accent} />
      </div>

      <SaveBar onCancel={onDone} onSave={handleSave} saving={saving} accent={accent} />
    </div>
  );
}

// ToggleRow has been promoted to the shared TaskRow in components/tasks.tsx.
// Imports below are from there.
