"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getLastSession, postSession, type ExerciseEntry, type SessionWritePayload } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SESSION_EXERCISES: Record<string, string[]> = {
  upper: ["chest press", "lat pull", "shoulder press", "row", "triceps extension", "curl", "rear delt"],
  lower: ["leg press", "leg extension", "leg curl", "calf press", "adduction", "abduction"],
  yoga: ["surya namaskar"],
  cardio: ["elliptical", "row"],
  gym: ["chest press", "lat pull", "leg press", "row", "shoulder press"],
};

const CARDIO_EXERCISES = new Set(["elliptical", "row"]);
const MOBILITY_EXERCISES = new Set(["surya namaskar"]);

function todayLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function currentLocalTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

function emptyEntry(exercise: string): FormEntry {
  return {
    exercise,
    weight: "",
    sets: "",
    reps: "",
    difficulty: "",
    duration_min: "",
    distance_m: "",
    level: "",
    skipped: false,
    note: "",
  };
}

type FormEntry = {
  exercise: string;
  weight: string;
  sets: string;
  reps: string;
  difficulty: string;
  duration_min: string;
  distance_m: string;
  level: string;
  skipped: boolean;
  note: string;
};

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <NewSessionInner />
    </Suspense>
  );
}

function NewSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionType = searchParams.get("type") ?? "upper";

  const [entries, setEntries] = useState<FormEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load prefill from last session of this type
  useEffect(() => {
    const defaultExercises = SESSION_EXERCISES[sessionType] ?? SESSION_EXERCISES.gym;
    getLastSession(sessionType).then((res) => {
      if (res.entries && res.entries.length > 0) {
        const prefilled = res.entries
          .slice(0, defaultExercises.length)
          .map((e: ExerciseEntry) => ({
            ...emptyEntry(e.exercise ?? ""),
            weight: e.weight != null ? String(e.weight) : "",
            sets: e.sets != null ? String(e.sets) : "",
            reps: e.reps != null ? String(e.reps) : "",
            difficulty: e.difficulty ?? "",
            duration_min: e.duration_min != null ? String(e.duration_min) : "",
            distance_m: e.distance_m != null ? String(e.distance_m) : "",
            level: e.level != null ? String(e.level) : "",
          }));
        const filled = [...prefilled];
        for (const ex of defaultExercises) {
          if (!filled.some((f) => f.exercise === ex)) filled.push(emptyEntry(ex));
        }
        setEntries(filled.slice(0, defaultExercises.length));
      } else {
        setEntries(defaultExercises.map(emptyEntry));
      }
      setLoading(false);
    }).catch(() => {
      setEntries(defaultExercises.map(emptyEntry));
      setLoading(false);
    });
  }, [sessionType]);

  const updateEntry = useCallback((index: number, field: keyof FormEntry, value: string | boolean) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: SessionWritePayload = {
      date: todayLocalISO(),
      time: currentLocalTime(),
      session_type: sessionType,
      entries: entries.map((entry) => ({
        exercise: entry.exercise,
        weight: entry.weight ? parseFloat(entry.weight) : null,
        sets: entry.sets ? parseInt(entry.sets) : null,
        reps: entry.reps || null,
        difficulty: entry.difficulty,
        duration_min: entry.duration_min ? parseFloat(entry.duration_min) : null,
        distance_m: entry.distance_m ? parseFloat(entry.distance_m) : null,
        level: entry.level ? parseInt(entry.level) : null,
        skipped: entry.skipped,
        note: entry.note,
      })),
    };
    try {
      await postSession(payload);
      setSaved(true);
      setTimeout(() => { router.push("/exercise"); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-4xl mb-2">✅</p>
            <p className="text-lg font-semibold">Session saved!</p>
            <p className="text-sm text-muted-foreground mt-1">Redirecting to dashboard…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <>
        <div className="mb-4">
          <Link href="/exercise" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Log Session</CardTitle>
            <CardDescription>
              {loading ? "Loading prefill…" : `Pre-filled from your last ${sessionType} session`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {entries.map((entry, i) => {
                const isCardio = CARDIO_EXERCISES.has(entry.exercise);
                const isMobility = MOBILITY_EXERCISES.has(entry.exercise);
                return (
                  <div key={entry.exercise} className={cn("rounded-xl border p-4 transition-colors", entry.skipped ? "bg-muted/30 opacity-60" : "bg-background")}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium capitalize">{entry.exercise.replace(/-/g, " ")}</span>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={entry.skipped}
                          onChange={(e) => { updateEntry(i, "skipped", e.target.checked); }}
                          className="rounded border-gray-400"
                        />
                        Skip
                      </label>
                    </div>
                    {entry.skipped ? null : isMobility ? (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Duration (min)</label>
                        <input
                          type="number"
                          value={entry.duration_min}
                          onChange={(e) => { updateEntry(i, "duration_min", e.target.value); }}
                          placeholder="e.g. 45"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    ) : isCardio ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Distance (m)</label>
                          <input
                            type="number"
                            value={entry.distance_m}
                            onChange={(e) => { updateEntry(i, "distance_m", e.target.value); }}
                            placeholder="e.g. 5000"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Duration (min)</label>
                          <input
                            type="number"
                            value={entry.duration_min}
                            onChange={(e) => { updateEntry(i, "duration_min", e.target.value); }}
                            placeholder="e.g. 30"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Level (1-20)</label>
                          <input
                            type="number"
                            value={entry.level}
                            onChange={(e) => { updateEntry(i, "level", e.target.value); }}
                            placeholder="12"
                            min="1"
                            max="20"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Difficulty</label>
                          <input
                            type="text"
                            value={entry.difficulty}
                            onChange={(e) => { updateEntry(i, "difficulty", e.target.value); }}
                            placeholder="moderate / hard / easy"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Weight (kg)</label>
                          <input
                            type="number"
                            value={entry.weight}
                            onChange={(e) => { updateEntry(i, "weight", e.target.value); }}
                            placeholder="60"
                            step="0.5"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Sets</label>
                          <input
                            type="number"
                            value={entry.sets}
                            onChange={(e) => { updateEntry(i, "sets", e.target.value); }}
                            placeholder="3"
                            min="1"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Reps</label>
                          <input
                            type="text"
                            value={entry.reps}
                            onChange={(e) => { updateEntry(i, "reps", e.target.value); }}
                            placeholder="10"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Difficulty</label>
                          <input
                            type="text"
                            value={entry.difficulty}
                            onChange={(e) => { updateEntry(i, "difficulty", e.target.value); }}
                            placeholder="moderate"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl py-3 font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--section-accent)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--section-accent)"; }}
              >
                {saving ? "Saving…" : "Save Session"}
              </button>
            </form>
          </CardContent>
        </Card>
      </>
    </div>
  );
}