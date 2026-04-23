"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { draft, type ActiveSession, type ActiveEntry } from "@/lib/session-draft";
import { BASIC_FIT_MACHINES, SESSION_META, isCardio } from "@/lib/session-templates";

/** Live session totals shown in the header panel. Recomputed from the
 *  current draft state on every render — cheap, no memo needed. */
function computeSessionTotals(session: ActiveSession) {
  let cardioMinutes = 0;
  let liftedKg = 0;
  for (const e of session.entries) {
    // Only count entries the user actually completed.
    if (e.status !== "done") continue;
    if (isCardio(e.exercise)) {
      if (typeof e.duration_min === "number") cardioMinutes += e.duration_min;
    } else {
      const w = typeof e.weight === "number" ? e.weight : 0;
      const s = typeof e.sets === "number" ? e.sets : 0;
      // reps is "number | string | null" — only numeric reps contribute.
      // AMRAP can't be multiplied so we conservatively skip it.
      const r =
        typeof e.reps === "number"
          ? e.reps
          : typeof e.reps === "string" && /^\d+$/.test(e.reps)
            ? Number(e.reps)
            : 0;
      if (w && s && r) liftedKg += w * s * r;
    }
  }
  return { cardioMinutes, liftedKg };
}

/** Header panel: elapsed time + cardio minutes + lifted volume. The clock
 *  ticks every 30s (a 1s tick was overkill — the visible precision is
 *  whole minutes), and the totals come from the parent's session prop so
 *  they refresh as soon as Done is tapped. */
function SessionStatsPanel({ session }: { session: ActiveSession }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const startedAt = session.started_at ? new Date(session.started_at) : null;
  const elapsedMin = startedAt
    ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60_000))
    : null;
  const { cardioMinutes, liftedKg } = computeSessionTotals(session);
  const fmt = new Intl.NumberFormat("en-GB");

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      <StatTile
        label="Elapsed"
        value={elapsedMin == null ? "—" : `${elapsedMin}m`}
        accent="orange"
      />
      <StatTile
        label="Cardio"
        value={`${fmt.format(Math.round(cardioMinutes))} min`}
        accent="blue"
      />
      <StatTile
        label="Lifted"
        value={`${fmt.format(Math.round(liftedKg))} kg`}
        accent="orange"
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "orange" | "blue";
}) {
  return (
    <div className="rounded-2xl border bg-background p-3 shadow-sm">
      <p
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          accent === "blue" ? "text-blue-600" : "text-[color:var(--section-accent-strong)]",
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
import { getExercises, getLastEntries, type ProgressionPoint } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatHistoryLine(cardio: boolean, p: ProgressionPoint): string {
  if (cardio) {
    const parts: string[] = [];
    if (p.duration_min != null) parts.push(`${p.duration_min}min`);
    if (p.distance_m != null) parts.push(`${p.distance_m}m`);
    if (p.level != null) parts.push(`level ${p.level}`);
    if (p.distance_m != null && p.duration_min != null && p.duration_min > 0) {
      const pace = Math.round((p.distance_m / p.duration_min) * 10) / 10;
      parts.push(`${pace}m/min`);
    }
    return parts.join(" · ");
  }
  const parts: string[] = [];
  if (p.sets != null && p.reps != null) parts.push(`${p.sets}×${p.reps}`);
  if (p.weight != null) parts.push(`@${p.weight}kg`);
  parts.push(`(${p.difficulty || "medium"})`);
  return parts.join(" ");
}

type StatusIcon = "○" | "◎" | "⏳" | "✓" | "⚠" | "—";

function statusIcon(status: ActiveEntry["status"]): StatusIcon {
  switch (status) {
    case "done": return "✓";
    case "saving": return "⏳";
    case "failed": return "⚠";
    case "skipped": return "—";
    default: return "○";
  }
}

export default function ActiveSessionPage() {
  const router = useRouter();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [allExercises, setAllExercises] = useState<string[]>([]);
  // Which card is in swap mode (showing the picker instead of inputs).
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);

  // Load draft on mount. If none, bounce back to start; if the draft was
  // already concluded (e.g. user refreshed the page after finishing),
  // forward to the done screen.
  useEffect(() => {
    draft.load().then((s) => {
      if (!s) {
        router.replace("/exercise/session/start");
        return;
      }
      if (s.status === "concluded") {
        router.replace("/exercise/session/done");
        return;
      }
      setSession(s);
      const firstOpen = s.entries.findIndex((e) => e.status === "pending" || e.status === "failed");
      setActiveIndex(firstOpen === -1 ? 0 : firstOpen);
      setLoading(false);
    });
    // Full exercise list powers the "Add exercise" dropdown.
    getExercises()
      .then(setAllExercises)
      .catch(() => setAllExercises([]));
  }, [router]);

  const updateField = useCallback(
    async (idx: number, field: keyof ActiveEntry, value: string | number | null) => {
      setSession((current) => {
        if (!current) return current;
        return {
          ...current,
          entries: current.entries.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
        };
      });
      // Persist to IDB asynchronously. We don't await — the optimistic state
      // above is instant; IDB catches up within a ms or two.
      const latest = await draft.load();
      if (latest) {
        const updated = { ...latest, entries: latest.entries.map((e, i) => (i === idx ? { ...e, [field]: value } : e)) };
        await draft.update(updated, idx, { [field]: value });
      }
    },
    [],
  );

  const markDone = useCallback(async (idx: number) => {
    setSession((current) => current && { ...current, entries: current.entries.map((e, i) => i === idx ? { ...e, status: "saving" } : e) });
    const latest = await draft.load();
    if (!latest) return;
    // Remember whether this was a first-time save or an edit of a done entry.
    // Edits should NOT auto-advance — user might want to verify their change.
    const wasAlreadyDone = latest.entries[idx].status === "done";
    const result = await draft.markDone(latest, idx);
    setSession(result.session);
    if (!wasAlreadyDone) {
      const nextOpen = result.session.entries.findIndex((e, i) => i > idx && e.status === "pending");
      if (nextOpen !== -1) setActiveIndex(nextOpen);
    }
  }, []);

  const markSkipped = useCallback(async (idx: number) => {
    const latest = await draft.load();
    if (!latest) return;
    const updated = await draft.markSkipped(latest, idx);
    setSession(updated);
    const nextOpen = updated.entries.findIndex((e, i) => i > idx && e.status === "pending");
    if (nextOpen !== -1) setActiveIndex(nextOpen);
  }, []);

  const swapExerciseAt = useCallback(async (idx: number, name: string) => {
    const clean = name.trim().toLowerCase();
    if (!clean || swapping) return;
    setSwapping(true);
    try {
      const latest = await draft.load();
      if (!latest) return;
      const lastMap = await getLastEntries([clean]);
      const next = await draft.swapExercise(latest, idx, clean, lastMap[clean] ?? null);
      setSession(next);
      setSwappingIdx(null);
    } finally {
      setSwapping(false);
    }
  }, [swapping]);

  async function finishSession() {
    if (!session || finishing) return;
    setFinishing(true);
    const retried = await draft.retryFailed(session);
    setSession(retried);
    const stillFailed = retried.entries.some((e) => e.status === "failed");
    if (stillFailed) {
      setFinishing(false);
      return; // leave draft in place for user to review
    }
    await draft.finish(); // concludes but doesn't clear — done page reads it
    router.push("/exercise/session/done");
  }

  const progress = useMemo(() => {
    if (!session) return { done: 0, total: 0 };
    const done = session.entries.filter((e) => e.status === "done" || e.status === "skipped").length;
    return { done, total: session.entries.length };
  }, [session]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  const meta = SESSION_META[session.type];

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <>
        <div className="mb-4 flex items-center justify-between">
          <Link href="/exercise" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
          <span className="text-sm font-medium">
            {progress.done} / {progress.total} exercises
          </span>
        </div>

        <div className="mb-5 rounded-2xl border bg-background p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">In progress</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {meta.emoji} {meta.label} day
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{session.date}</p>
        </div>

        <SessionStatsPanel session={session} />

        <div className="flex flex-col gap-3">
          {session.entries.map((entry, idx) => {
            const inSession = new Set(session.entries.map((e) => e.exercise));
            const swapOptions = [...new Set<string>([...BASIC_FIT_MACHINES, ...allExercises])]
              .filter((ex) => !inSession.has(ex))
              .sort();
            return (
              <EntryCard
                key={`${entry.exercise}-${idx}`}
                entry={entry}
                index={idx}
                active={activeIndex === idx}
                onActivate={() => setActiveIndex(idx)}
                onChange={(field, value) => updateField(idx, field, value)}
                onDone={() => markDone(idx)}
                onSkip={() => markSkipped(idx)}
                swapping={swappingIdx === idx}
                swapOptions={swapOptions}
                swapBusy={swapping}
                onRequestSwap={() => setSwappingIdx(idx)}
                onCancelSwap={() => setSwappingIdx(null)}
                onConfirmSwap={(name) => swapExerciseAt(idx, name)}
              />
            );
          })}
        </div>

        <button
          onClick={finishSession}
          disabled={finishing}
          className="fixed bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-2xl py-4 text-lg font-semibold text-white shadow-lg transition-colors disabled:opacity-60"
          style={{ backgroundColor: "var(--section-accent)" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent-strong)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent)"; }}
        >
          {finishing ? "Finishing…" : "Finish session"}
        </button>
      </>
    </div>
  );
}

function EntryCard({
  entry,
  index,
  active,
  onActivate,
  onChange,
  onDone,
  onSkip,
  swapping,
  swapOptions,
  swapBusy,
  onRequestSwap,
  onCancelSwap,
  onConfirmSwap,
}: {
  entry: ActiveEntry;
  index: number;
  active: boolean;
  onActivate: () => void;
  onChange: (field: keyof ActiveEntry, value: string | number | null) => void;
  onDone: () => void;
  onSkip: () => void;
  swapping: boolean;
  swapOptions: string[];
  swapBusy: boolean;
  onRequestSwap: () => void;
  onCancelSwap: () => void;
  onConfirmSwap: (name: string) => void;
}) {
  const cardio = isCardio(entry.exercise);
  const done = entry.status === "done";
  const saving = entry.status === "saving";
  const failed = entry.status === "failed";
  const skipped = entry.status === "skipped";
  // Done cards can be re-opened for editing by tapping them. Skipped cards stay collapsed.
  const expanded = active && !skipped;
  const isReedit = expanded && done;

  function handleNum(field: keyof ActiveEntry, raw: string) {
    const v = raw === "" ? null : Number(raw);
    onChange(field, Number.isNaN(v) ? null : v);
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-background shadow-sm transition-all",
        done && "opacity-70",
        skipped && "opacity-40",
        failed && "border-red-400",
        active && !done && !skipped && "border-[color:var(--section-accent-shade-2)] shadow-md",
      )}
    >
      <button
        onClick={onActivate}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={cn("text-lg", done && "text-green-600", failed && "text-red-500")}>
            {statusIcon(entry.status)}
          </span>
          <div>
            <p className="font-medium capitalize">{entry.exercise}</p>
            {!expanded && entry.last_summary && (
              <p className="text-xs text-muted-foreground">Last: {entry.last_summary}</p>
            )}
            {done && (
              <p className="text-xs text-green-700">
                {cardio
                  ? (() => {
                      const parts: string[] = [];
                      if (entry.duration_min != null) parts.push(`${entry.duration_min}min`);
                      if (entry.distance_m != null) parts.push(`${entry.distance_m}m`);
                      if (entry.level != null) parts.push(`level ${entry.level}`);
                      if (entry.distance_m != null && entry.duration_min != null && entry.duration_min > 0) {
                        const pace = Math.round((entry.distance_m / entry.duration_min) * 10) / 10;
                        parts.push(`${pace}m/min`);
                      }
                      return parts.join(" · ") || "done";
                    })()
                  : (() => {
                      const parts: string[] = [];
                      if (entry.sets != null && entry.reps != null) parts.push(`${entry.sets}×${entry.reps}`);
                      if (entry.weight != null) parts.push(`@${entry.weight}kg`);
                      parts.push(`— ${entry.difficulty || "medium"}`);
                      return parts.join(" ") || "done";
                    })()}
              </p>
            )}
          </div>
        </div>
        {saving && <span className="text-xs text-muted-foreground">saving…</span>}
        {failed && <span className="text-xs text-red-600">retry?</span>}
      </button>

      {expanded && swapping && (
        <div className="border-t px-5 py-4">
          <SwapPicker options={swapOptions} busy={swapBusy} onCancel={onCancelSwap} onConfirm={onConfirmSwap} />
        </div>
      )}
      {expanded && !swapping && (
        <div className="border-t px-5 py-4">
          {entry.history.length > 0 && (
            <div className="mb-4 rounded-xl bg-muted/50 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Last {entry.history.length} sessions
              </p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {entry.history.map((p, i) => (
                  <li key={`${p.date}-${i}`} className="flex justify-between gap-4 font-mono">
                    <span>{p.date}</span>
                    <span className="truncate text-right">{formatHistoryLine(cardio, p) || "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cardio ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Duration (min)" value={entry.duration_min} onChange={(v) => handleNum("duration_min", v)} />
              <Field label="Distance (m)" value={entry.distance_m} onChange={(v) => handleNum("distance_m", v)} />
              <Field label="Level" value={entry.level} onChange={(v) => handleNum("level", v)} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Weight (kg)" step={2.5} value={entry.weight} onChange={(v) => handleNum("weight", v)} />
              <Field label="Sets" value={entry.sets} onChange={(v) => handleNum("sets", v)} />
              <FieldText label="Reps" value={entry.reps ?? ""} onChange={(v) => onChange("reps", v)} />
            </div>
          )}

          {!cardio && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Difficulty</p>
              <div className="flex gap-2">
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => onChange("difficulty", d)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      entry.difficulty === d
                        ? "border-[color:var(--section-accent)] bg-[color:var(--section-accent)] text-white"
                        : "border-border bg-background text-muted-foreground hover:border-[color:var(--section-accent-shade-3)]",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={onSkip}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-red-300 hover:text-red-600"
            >
              Skip
            </button>
            <button
              onClick={onRequestSwap}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-blue-300 hover:text-blue-600"
            >
              ↔ Swap
            </button>
            <button
              onClick={onDone}
              disabled={saving}
              className="flex-1 rounded-xl py-2.5 font-semibold text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: "var(--section-accent)" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent)"; }}
            >
              {saving ? "Saving…" : failed ? "Retry" : isReedit ? "Update ✓" : "Done →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: string) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
      />
    </div>
  );
}

function SwapPicker({
  options,
  busy,
  onCancel,
  onConfirm,
}: {
  options: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const target = (custom || selected).trim();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Swap with…
        </p>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          cancel
        </button>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">From the catalog</label>
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setCustom("");
          }}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
        >
          <option value="">— pick one —</option>
          {options.map((ex) => (
            <option key={ex} value={ex}>
              {ex}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Or type a new one</label>
        <input
          type="text"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setSelected("");
          }}
          placeholder="e.g. chest fly"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
        />
      </div>
      <button
        onClick={() => onConfirm(target)}
        disabled={busy || !target}
        className="w-full rounded-xl bg-blue-500 py-2.5 font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? "Swapping…" : "Swap"}
      </button>
    </div>
  );
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
      />
    </div>
  );
}
