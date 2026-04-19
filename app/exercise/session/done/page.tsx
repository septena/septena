"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import useSWR from "swr";

import { draft, type ActiveSession } from "@/lib/session-draft";
import { SESSION_META, isCardio, type SessionType } from "@/lib/session-templates";
import { getEntries, getSettings } from "@/lib/api";
import { computePRs, type ExercisePR } from "@/lib/pr";

// ─── Confetti ────────────────────────────────────────────────────────────
// Hand-rolled. No dependency. 60 particles, orange palette, CSS keyframes.

const CONFETTI_COUNT = 70;
const COLORS = [
  "#f97316", // orange-500
  "#fb923c", // orange-400
  "#fdba74", // orange-300
  "#ea580c", // orange-600
  "#ffedd5", // orange-100 (highlight)
];

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  color: string;
  size: number;
};

function Confetti() {
  const particles: Particle[] = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100, // vw
        delay: Math.random() * 0.4, // s
        duration: 2.2 + Math.random() * 1.8, // s
        drift: (Math.random() - 0.5) * 120, // px horizontal drift
        rotate: (Math.random() - 0.5) * 720, // deg
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 6 + Math.random() * 8, // px
      })),
    [],
  );

  return (
    <>
      <style>{`
        @keyframes fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
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
              animation: `fall ${p.duration}s ${p.delay}s cubic-bezier(.2,.6,.3,1) forwards`,
              ["--drift" as string]: `${p.drift}px`,
              ["--rot" as string]: `${p.rotate}deg`,
            }}
          />
        ))}
      </div>
    </>
  );
}

// ─── Stats ───────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Stats = {
  sessionType: SessionType;
  startedAt: string | undefined;
  concludedAt: string | undefined;
  durationMs: number | null;
  doneCount: number;
  skippedCount: number;
  totalCount: number;
  totalWeightKg: number;
  totalDistanceM: number;
  totalDurationMin: number;
};

function computeStats(session: ActiveSession): Stats {
  const started = session.started_at;
  const ended = session.concluded_at;
  const durationMs =
    started && ended ? Math.max(0, new Date(ended).getTime() - new Date(started).getTime()) : null;

  let totalWeightKg = 0;
  let totalDistanceM = 0;
  let totalDurationMin = 0;
  let doneCount = 0;
  let skippedCount = 0;

  for (const e of session.entries) {
    if (e.status === "done") {
      doneCount++;
      if (isCardio(e.exercise)) {
        if (e.distance_m != null) totalDistanceM += e.distance_m;
        if (e.duration_min != null) totalDurationMin += e.duration_min;
      } else {
        if (e.weight != null && e.sets != null) {
          // Treat reps as a number when possible for volume; fall back to 0.
          const reps = typeof e.reps === "string" ? Number(e.reps) || 0 : Number(e.reps) || 0;
          totalWeightKg += e.weight * e.sets * reps;
        }
      }
    } else if (e.status === "skipped") {
      skippedCount++;
    }
  }

  return {
    sessionType: (session.type ?? "upper") as SessionType,
    startedAt: started,
    concludedAt: ended,
    durationMs,
    doneCount,
    skippedCount,
    totalCount: session.entries.length,
    totalWeightKg: Math.round(totalWeightKg),
    totalDistanceM: Math.round(totalDistanceM),
    totalDurationMin: Math.round(totalDurationMin),
  };
}

// ─── Page ────────────────────────────────────────────────────────────────

/** Figure out which done entries broke a PR. Done AFTER the session is
 *  saved, so `computePRs` sees this session's entries. A done entry earns
 *  a badge if the PR for that exercise points at today AND matches the
 *  entry's value. That means if today's entry tied an older PR, it still
 *  flags (because both point at the same number on the same date). */
function computeDonePRs(
  session: ActiveSession,
  allPrs: Map<string, ExercisePR>,
): Map<number, { weightPR: boolean; volumePR: boolean }> {
  const out = new Map<number, { weightPR: boolean; volumePR: boolean }>();
  for (let i = 0; i < session.entries.length; i++) {
    const e = session.entries[i];
    if (e.status !== "done" || isCardio(e.exercise)) continue;
    const pr = allPrs.get(e.exercise);
    if (!pr) continue;
    const w = e.weight;
    const sets = typeof e.sets === "number" ? e.sets : 0;
    const repsRaw = e.reps;
    const reps =
      typeof repsRaw === "number"
        ? repsRaw
        : typeof repsRaw === "string" && /^\d+$/.test(repsRaw)
          ? Number(repsRaw)
          : 0;
    const volume = typeof w === "number" && sets && reps ? w * sets * reps : null;
    const weightPR =
      pr.maxWeightEntry?.date === session.date &&
      typeof w === "number" &&
      w === pr.maxWeight;
    const volumePR =
      pr.maxVolumeEntry?.date === session.date &&
      volume != null &&
      volume === pr.maxVolume;
    if (weightPR || volumePR) out.set(i, { weightPR, volumePR });
  }
  return out;
}

export default function SessionDonePage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [doneEntries, setDoneEntries] = useState<ActiveSession["entries"]>([]);
  const [prFlags, setPrFlags] = useState<Map<number, { weightPR: boolean; volumePR: boolean }>>(
    new Map(),
  );
  const { data: settings } = useSWR("settings", getSettings);
  const confettiEnabled = settings?.animations?.exercise_complete ?? true;

  useEffect(() => {
    draft.load().then(async (s) => {
      if (!s) {
        router.replace("/exercise");
        return;
      }
      setStats(computeStats(s));
      setDoneEntries(s.entries.filter((e) => e.status === "done"));
      // Fetch-all + compute PRs. The POST that concluded the session
      // already ran load_cache() server-side, so /api/entries includes
      // the just-written files.
      try {
        const all = await getEntries();
        const prs = computePRs(all);
        // Map of ORIGINAL entry index (in s.entries) to flags, then
        // re-key by index in doneEntries (since we filter below).
        const byOriginal = computeDonePRs(s, prs);
        const doneIndices: number[] = [];
        s.entries.forEach((e, i) => {
          if (e.status === "done") doneIndices.push(i);
        });
        const byDoneIdx = new Map<number, { weightPR: boolean; volumePR: boolean }>();
        doneIndices.forEach((origIdx, doneIdx) => {
          const flags = byOriginal.get(origIdx);
          if (flags) byDoneIdx.set(doneIdx, flags);
        });
        setPrFlags(byDoneIdx);
      } catch {
        // Non-fatal — PR badges just won't show.
      }
      setLoading(false);
    });
  }, [router]);

  async function goHome() {
    await draft.clear();
    router.push("/exercise");
  }

  if (loading || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const meta = SESSION_META[stats.sessionType];
  const isCardioDay = stats.sessionType === "cardio";

  return (
    <div className="relative min-h-screen bg-muted/30">
      {confettiEnabled && <Confetti />}
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-orange-600">
            Session complete
          </p>
          <h1 className="mt-2 text-5xl font-bold tracking-tight sm:text-6xl">
            {meta.emoji}
          </h1>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Nice work.</h2>
          <p className="mt-2 text-muted-foreground">
            {meta.label} — {stats.doneCount} of {stats.totalCount} exercises done
            {stats.skippedCount > 0 ? `, ${stats.skippedCount} skipped` : ""}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Duration"
            value={stats.durationMs != null ? formatDuration(stats.durationMs) : "—"}
            accent
          />
          <StatTile label="Started" value={formatTime(stats.startedAt)} />
          <StatTile label="Finished" value={formatTime(stats.concludedAt)} />
          <StatTile label="Exercises" value={`${stats.doneCount}/${stats.totalCount}`} />
        </div>

        {!isCardioDay && stats.totalWeightKg > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatTile
              label="Volume"
              value={`${stats.totalWeightKg.toLocaleString()} kg`}
              sub="weight × sets × reps"
            />
            <StatTile
              label="Cardio"
              value={`${stats.totalDurationMin} min · ${stats.totalDistanceM.toLocaleString()} m`}
            />
          </div>
        )}
        {isCardioDay && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatTile
              label="Distance"
              value={`${stats.totalDistanceM.toLocaleString()} m`}
              sub={`${stats.totalDurationMin} min total`}
            />
            <StatTile
              label="Avg pace"
              value={
                stats.totalDurationMin > 0
                  ? `${Math.round((stats.totalDistanceM / stats.totalDurationMin) * 10) / 10} m/min`
                  : "—"
              }
            />
          </div>
        )}

        <div className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Logged
          </p>
          <ul className="space-y-2 text-sm">
            {doneEntries.length === 0 && (
              <li className="text-muted-foreground">Nothing logged.</li>
            )}
            {doneEntries.map((e, i) => {
              const pr = prFlags.get(i);
              return (
                <li key={`${e.exercise}-${i}`} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 capitalize">
                    {e.exercise}
                    {pr?.weightPR && (
                      <span
                        title="New all-time weight PR"
                        className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                      >
                        PR kg
                      </span>
                    )}
                    {pr?.volumePR && (
                      <span
                        title="New all-time volume PR (weight × sets × reps)"
                        className="rounded-full bg-purple-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                      >
                        PR vol
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isCardio(e.exercise)
                      ? [
                          e.duration_min != null ? `${e.duration_min} min` : null,
                          e.distance_m != null ? `${e.distance_m} m` : null,
                          e.level != null ? `level ${e.level}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : [
                          e.sets != null && e.reps != null ? `${e.sets}×${e.reps}` : null,
                          e.weight != null ? `@ ${e.weight} kg` : null,
                          e.difficulty || "medium",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <button
          onClick={goHome}
          className="mt-8 w-full rounded-2xl bg-orange-500 py-4 text-lg font-semibold text-white shadow-lg transition-colors hover:bg-orange-600"
        >
          Back to dashboard →
        </button>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border bg-background p-4 shadow-sm " +
        (accent ? "border-orange-400 bg-orange-50" : "")
      }
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={"mt-1 text-xl font-semibold " + (accent ? "text-orange-700" : "")}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
