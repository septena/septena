"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { getNextWorkout, getLastEntries, type NextWorkoutResponse } from "@/lib/api";
import { draft, type ActiveSession } from "@/lib/session-draft";
import { SESSION_META, TEMPLATES, type SessionType } from "@/lib/session-templates";
import { cn } from "@/lib/utils";

const ORDER: SessionType[] = ["upper", "lower", "cardio", "yoga"];

function formatDaysAgo(n: number | null): string {
  if (n == null) return "never";
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}

function todayLocalISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function draftProgress(d: ActiveSession): { done: number; total: number } {
  const done = d.entries.filter((e) => e.status === "done" || e.status === "skipped").length;
  return { done, total: d.entries.length };
}

export default function StartSessionPage() {
  const router = useRouter();
  const [next, setNext] = useState<NextWorkoutResponse | null>(null);
  const [selected, setSelected] = useState<SessionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingDraft, setExistingDraft] = useState<ActiveSession | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getNextWorkout(), draft.load()])
      .then(([res, d]) => {
        if (cancelled) return;
        setNext(res);
        setSelected(res.suggested.type);
        setExistingDraft(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function resumeDraft() {
    router.push("/exercise/session/active");
  }

  async function discardDraft() {
    await draft.clear();
    setExistingDraft(null);
    setConfirmingDiscard(false);
  }

  async function startSession() {
    if (!selected || starting) return;
    // If there's a draft but the user hit Start without dealing with the
    // banner, prompt instead of silently clobbering or resuming.
    if (existingDraft) {
      setConfirmingDiscard(true);
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const exercises = TEMPLATES[selected].map((t) => t.exercise);
      const lastByExercise = await getLastEntries(exercises);
      await draft.start(selected, lastByExercise);
      router.push("/exercise/session/active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
      setStarting(false);
    }
  }

  async function discardAndStartFresh() {
    if (!selected) return;
    setStarting(true);
    setError(null);
    try {
      await draft.clear();
      const exercises = TEMPLATES[selected].map((t) => t.exercise);
      const lastByExercise = await getLastEntries(exercises);
      await draft.start(selected, lastByExercise);
      router.push("/exercise/session/active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
      setStarting(false);
      setConfirmingDiscard(false);
    }
  }

  const draftIsToday = existingDraft && existingDraft.date === todayLocalISO();
  const draftMeta = existingDraft ? SESSION_META[existingDraft.session_type as SessionType] ?? null : null;
  const progress = existingDraft ? draftProgress(existingDraft) : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <>
        <div className="mb-4">
          <Link href="/exercise" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>

        <div className="rounded-3xl border bg-background p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Gym</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Ready to train?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a session type. The suggestion is based on how long since your last one of each kind.
          </p>

          {existingDraft && draftMeta && progress && (
            <div className="mt-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                    Unfinished session {draftIsToday ? "" : `· ${existingDraft.date}`}
                  </p>
                  <p className="mt-1 text-sm font-medium text-amber-900">
                    {draftMeta.emoji} {draftMeta.label} · {progress.done}/{progress.total} done
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={discardDraft}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  >
                    Discard
                  </button>
                  <button
                    onClick={resumeDraft}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                  >
                    Resume →
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {ORDER.map((type) => {
              const meta = SESSION_META[type];
              const daysAgo = next?.days_ago[type] ?? null;
              const isSuggested = next?.suggested.type === type;
              const isSelected = selected === type;
              return (
                <button
                  key={type}
                  onClick={() => setSelected(type)}
                  disabled={loading}
                  className={cn(
                    "flex items-center justify-between rounded-2xl border-2 px-5 py-5 text-left transition-all",
                    isSelected
                      ? "border-[color:var(--section-accent)] bg-[color:var(--section-accent)] text-white shadow-md"
                      : "border-border bg-background hover:border-[color:var(--section-accent-shade-3)]",
                    loading && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{meta.emoji}</span>
                    <div>
                      <p className="text-xl font-semibold">{meta.label}</p>
                      <p className={cn("text-sm", isSelected ? "text-orange-100" : "text-muted-foreground")}>
                        Last: {formatDaysAgo(daysAgo)}
                      </p>
                    </div>
                  </div>
                  {isSuggested && (
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                        isSelected ? "bg-white/25 text-white" : "bg-[color:var(--section-accent-soft)] text-[color:var(--section-accent-strong)]",
                      )}
                    >
                      Suggested
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={startSession}
            disabled={!selected || loading || starting}
            className="mt-6 w-full rounded-2xl py-4 text-lg font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--section-accent)" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent)"; }}
          >
            {starting ? "Starting…" : loading ? "Loading…" : "Start session →"}
          </button>
        </div>

        {confirmingDiscard && existingDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="max-w-sm rounded-2xl border bg-background p-6 shadow-xl">
              <h2 className="text-lg font-semibold">Discard unfinished session?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You have a {draftMeta?.label.toLowerCase() ?? ""} session in progress
                {progress ? ` (${progress.done}/${progress.total} done)` : ""}. Starting
                a new one will discard it — already-saved exercises stay in your vault,
                but any unsent edits will be lost.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setConfirmingDiscard(false)}
                  className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={discardAndStartFresh}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
                >
                  Discard & start
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    </div>
  );
}
