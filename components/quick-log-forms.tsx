"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { TimeInput } from "@/components/time-input";
import useSWR, { mutate as globalMutate } from "swr";
import { duplicateNutritionEntry } from "@/lib/nutrition-duplicate";
import { addGutEntry, getGutConfig } from "@/lib/api-gut";
import {
  addCaffeineEntry,
  addCannabisEntry,
  addHabit,
  addSupplement,
  completeChore,
  createChoreDefinition,
  createTask,
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
  getTaskAreas,
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
  DEFAULT_DAY_PHASE_BOUNDARIES,
  DEFAULT_DAY_END,
  activePhaseId,
  orderPhasesByCurrent,
  resolvePhases,
  timeLeftInPhase,
} from "@/lib/day-phases";
import { SESSION_META, type SessionType } from "@/lib/session-templates";
import { daysAgoLocalISO, nowHHMM } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import { TaskRow } from "@/components/tasks";
import { haptic } from "@/lib/haptics";

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

// Collapsed "+ New …" affordance that expands to a name input + optional
// extra controls (cadence, bucket, …) + Save/Cancel. Used inside fixed-set
// quick-log modals (chores, habits, supplements) so a new definition can be
// created without leaving the dialog.
function InlineNewItem({
  collapsedLabel,
  placeholder = "Name",
  accent,
  onSubmit,
  onClose,
  children,
}: {
  collapsedLabel: string;
  placeholder?: string;
  accent: string;
  onSubmit: (name: string) => Promise<void>;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setOpen(false);
    setName("");
    setSaving(false);
    onClose?.();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {collapsedLabel}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--section-accent)]"
      />
      {children}
      <SaveBar
        accent={accent}
        saving={saving}
        disabled={!name.trim()}
        onCancel={close}
        onSave={async () => {
          setSaving(true);
          try {
            await onSubmit(name.trim());
            close();
          } catch {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}


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

// ── Nutrition ────────────────────────────────────────────────────────────────

export function NutritionQuickLog({ onDone }: { onDone: () => void }) {
  const accent = useSectionColor("nutrition");
  const { date: selectedDate } = useSelectedDate();
  const { data, isLoading } = useSWR("quicklog-nutrition", () =>
    getNutritionEntries(daysAgoLocalISO(30)),
  );
  const [savingFile, setSavingFile] = useState<string | null>(null);

  // All entries from the last 30 days, newest first, deduped by foods[0] so
  // the same meal isn't repeated. cmdk handles the type-ahead filtering on
  // the joined foods string we pass into each item's `value`.
  const meals = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort((a, b) => {
      const ka = `${a.date} ${a.time ?? ""}`;
      const kb = `${b.date} ${b.time ?? ""}`;
      return kb.localeCompare(ka);
    });
    const seen = new Set<string>();
    const out: NutritionEntry[] = [];
    for (const e of sorted) {
      const key = (e.foods[0] ?? "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }, [data]);

  const duplicate = useCallback(
    async (entry: NutritionEntry) => {
      if (savingFile) return;
      setSavingFile(entry.file);
      haptic();
      try {
        await duplicateNutritionEntry(entry, selectedDate);
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
        Search past meals or tap to log again now. For custom macros, open the Nutrition page.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading recent meals…</p>
      ) : meals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recent meals yet. Log a first entry via chat or the Nutrition page.
        </p>
      ) : (
        <Command label="Search meals" className="space-y-2">
          <Command.Input
            placeholder="Search meals…"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            style={{ ["--accent" as string]: accent } as React.CSSProperties}
          />
          <Command.List className="max-h-[50vh] overflow-y-auto">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>
            {meals.map((e) => {
              const pending = savingFile === e.file;
              const value = `${e.foods.join(" ")} ${e.emoji ?? ""} ${Math.round(e.kcal)}kcal`;
              return (
                <Command.Item
                  key={e.file}
                  value={value}
                  disabled={!!savingFile}
                  onSelect={() => duplicate(e)}
                  className={cn(
                    "mb-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors aria-selected:border-[color:var(--accent)] hover:border-[color:var(--accent)]",
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
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
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
      haptic();
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
      haptic("medium");
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
      haptic();
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
  const phases = resolvePhases(
    settings?.day_phases ?? DEFAULT_DAY_PHASES,
    settings?.day_phase_boundaries ?? DEFAULT_DAY_PHASE_BOUNDARIES,
    settings?.day_end ?? DEFAULT_DAY_END,
  );
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [newBucket, setNewBucket] = useState<string>(activePhaseId(phases) ?? phases[0]?.id ?? "morning");

  const onToggle = useCallback(
    async (habit: HabitDayItem) => {
      if (pending.has(habit.id) || !data) return;
      setPending((p) => new Set(p).add(habit.id));
      haptic();
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

  const newItem = (
    <InlineNewItem
      collapsedLabel="+ New Habit"
      placeholder="Habit name"
      accent={accent}
      onSubmit={async (name) => {
        await addHabit(name, newBucket);
        revalidateAfterLog("habits");
        await mutate();
      }}
    >
      <PillGroup
        value={newBucket}
        onChange={setNewBucket}
        options={phases.map((p) => ({ value: p.id, label: p.label }))}
        accent={accent}
      />
    </InlineNewItem>
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading habits…</p>;
  }

  if (data.total === 0) {
    return <div className="space-y-2">{newItem}</div>;
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
      {newItem}
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
      haptic();
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

  const newItem = (
    <InlineNewItem
      collapsedLabel="+ New Supplement"
      placeholder="Supplement name"
      accent={accent}
      onSubmit={async (name) => {
        await addSupplement(name);
        revalidateAfterLog("supplements");
        await mutate();
      }}
    />
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading supplements…</p>;
  }

  if (data.total === 0) {
    return <div className="space-y-2">{newItem}</div>;
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
      {newItem}
    </div>
  );
}

// ── Chores ───────────────────────────────────────────────────────────────────

const CHORE_CADENCE_OPTIONS = [
  { value: "1", label: "Daily" },
  { value: "2", label: "Every Other" },
  { value: "7", label: "Weekly" },
  { value: "14", label: "Biweekly" },
  { value: "30", label: "Monthly" },
] as const;

export function ChoresQuickLog() {
  const accent = useSectionColor("chores");
  const { date: selectedDate } = useSelectedDate();
  const { data, mutate, isLoading } = useSWR("quicklog-chores", () => getChores());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [newCadence, setNewCadence] = useState<"1" | "2" | "7" | "14" | "30">("7");

  const onComplete = useCallback(
    async (id: string) => {
      if (pending.has(id)) return;
      setPending((p) => new Set(p).add(id));
      haptic();
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

  const newItem = (
    <InlineNewItem
      collapsedLabel="+ New Chore"
      placeholder="Chore name"
      accent={accent}
      onSubmit={async (name) => {
        await createChoreDefinition({ name, cadence_days: Number(newCadence) });
        revalidateAfterLog("chores");
        await mutate();
      }}
    >
      <PillGroup
        value={newCadence}
        onChange={setNewCadence}
        options={[...CHORE_CADENCE_OPTIONS]}
        accent={accent}
      />
    </InlineNewItem>
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading chores…</p>;
  }

  // Show anything overdue or due today — the actionable bucket.
  const actionable = data.chores.filter((c) => c.days_overdue >= 0);
  if (actionable.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Nothing due today. ✨</p>
        {newItem}
      </div>
    );
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
      {newItem}
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
  const [discomfortLevel, setDiscomfortLevel] = useState<"low" | "med" | "high" | "">("");
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
        discomfort_level: discomfortLevel || null,
      });
      revalidateAfterLog("gut");
      haptic();
      onDone();
    } finally {
      setSaving(false);
    }
  }, [saving, selectedDate, time, bristol, blood, discomfortLevel, onDone]);

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

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Discomfort amount</p>
        <PillGroup
          options={[
            { value: "", label: "None" },
            { value: "low", label: "Low" },
            { value: "med", label: "Med" },
            { value: "high", label: "High" },
          ]}
          value={discomfortLevel}
          onChange={setDiscomfortLevel}
          accent={accent}
        />
      </div>

      <SaveBar onCancel={onDone} onSave={handleSave} saving={saving} accent={accent} />
    </div>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function TasksQuickLog({ onDone }: { onDone: () => void }) {
  const accent = useSectionColor("tasks");
  const { data: areas } = useSWR("quicklog-tasks-areas", () => getTaskAreas());
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<string>("");
  const [today, setToday] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      await createTask({
        title: t,
        area: area || null,
        today,
      });
      revalidateAfterLog("tasks");
      showToast("Task added", { description: t });
      onDone();
    } finally {
      setSaving(false);
    }
  }, [title, area, today, saving, onDone]);

  return (
    <div className="space-y-3">
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            e.preventDefault();
            handleSave();
          }
        }}
        placeholder="What needs doing?"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus:border-[color:var(--accent)]"
        style={{ ["--accent" as string]: accent } as React.CSSProperties}
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Area</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {(areas?.areas ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji ? `${a.emoji} ` : ""}
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} />
          <span>Move to Today</span>
        </label>
      </div>

      <SaveBar onCancel={onDone} onSave={handleSave} saving={saving} accent={accent} disabled={!title.trim()} />
    </div>
  );
}

// ToggleRow has been promoted to the shared TaskRow in components/tasks.tsx.
// Imports below are from there.
