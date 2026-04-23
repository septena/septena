"use client";

import { useEffect, useMemo, useState } from "react";
import { getEntries, type ExerciseEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CardTitle, CardDescription, CardHeader, CardContent } from "@/components/ui/card";

/** Last-7-days streak strip. Today is the rightmost dot, six days ago the
 *  leftmost. Each day is classified by what was trained — strength wins over
 *  cardio wins over mobility, mirroring main.py:exercise_group(). When all 7
 *  days have any activity, an orange capsule "connects" the dots (perfect
 *  week treatment, à la Duolingo). */

// Mirrors the taxonomy in main.py. Anything not listed in CARDIO/MOBILITY/CORE
// falls through to "strength" — including the LOWER set, since for the
// week-strip view we only care about strength-vs-cardio-vs-mobility, not
// upper/lower split.
const CARDIO = new Set(["rowing", "elliptical", "stairs", "cycling", "running", "walking", "swimming"]);
const MOBILITY = new Set(["surya namaskar", "pull up"]);
const CORE = new Set(["ab crunch", "abdominal"]); // ignored — finisher, not session

type DayKind = "strength" | "cardio" | "mobility" | "rest";

function classify(exercises: string[]): DayKind {
  const groups = new Set<DayKind>();
  for (const ex of exercises) {
    if (!ex || CORE.has(ex)) continue;
    if (CARDIO.has(ex)) groups.add("cardio");
    else if (MOBILITY.has(ex)) groups.add("mobility");
    else groups.add("strength");
  }
  // Priority: strength > cardio > mobility > rest. A day with both a strength
  // session and a cardio warmup counts as strength.
  if (groups.has("strength")) return "strength";
  if (groups.has("cardio")) return "cardio";
  if (groups.has("mobility")) return "mobility";
  return "rest";
}

function lastSevenDays(): { iso: string; weekday: string; dayNum: number; isToday: boolean }[] {
  const out: { iso: string; weekday: string; dayNum: number; isToday: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      iso,
      weekday: d.toLocaleDateString("en-GB", { weekday: "narrow" }),
      dayNum: d.getDate(),
      isToday: i === 0,
    });
  }
  return out;
}

// Background + border colors come from --section-accent-shade-{1,2,3} so
// they recolor automatically with the user's exercise section accent. Rest
// stays neutral. The arbitrary `[color:var(--…)]` syntax is the Tailwind v4
// way to pull a custom property into a utility class.
const KIND_DOT: Record<DayKind, string> = {
  strength:
    "bg-[color:var(--section-accent-shade-1)] border-[color:var(--section-accent-shade-1)]",
  cardio:
    "bg-[color:var(--section-accent-shade-2)] border-[color:var(--section-accent-shade-2)]",
  mobility:
    "bg-[color:var(--section-accent-shade-3)] border-[color:var(--section-accent-shade-3)]",
  rest: "bg-transparent border-muted-foreground/30",
};

const KIND_LABEL: Record<DayKind, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
  rest: "Rest day",
};

export function WeekStreak() {
  const [entries, setEntries] = useState<ExerciseEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEntries()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { days, kinds, perfect, z2Minutes, streak } = useMemo(() => {
    const days = lastSevenDays();
    if (!entries) {
      return {
        days,
        kinds: days.map(() => "rest" as DayKind),
        perfect: false,
        z2Minutes: 0,
        streak: 0,
      };
    }
    const byDate = new Map<string, string[]>();
    const z2ByDate = new Map<string, number>();
    for (const e of entries) {
      if (!e.date || !e.exercise) continue;
      const bucket = byDate.get(e.date) ?? [];
      bucket.push(e.exercise);
      byDate.set(e.date, bucket);
      if (CARDIO.has(e.exercise) && typeof e.duration_min === "number") {
        z2ByDate.set(e.date, (z2ByDate.get(e.date) ?? 0) + e.duration_min);
      }
    }
    const kinds = days.map(({ iso }) => classify(byDate.get(iso) ?? []));
    const perfect = kinds.every((k) => k !== "rest");
    let z2Minutes = 0;
    for (const { iso } of days) z2Minutes += z2ByDate.get(iso) ?? 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const isActive = (iso: string) => classify(byDate.get(iso) ?? []) !== "rest";
    let streak = 0;
    let graceUsed = false;
    const cursor = new Date(today);
    if (!isActive(toIso(cursor))) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const iso = toIso(cursor);
      if (isActive(iso)) streak += 1;
      else if (!graceUsed) graceUsed = true;
      else break;
      cursor.setDate(cursor.getDate() - 1);
      if (cursor.getFullYear() < 2020) break;
    }
    return { days, kinds, perfect, z2Minutes, streak };
  }, [entries]);

  const activeCount = kinds.filter((k) => k !== "rest").length;
  const Z2_TARGET = 150;
  const z2Pct = Math.min(100, Math.round((z2Minutes / Z2_TARGET) * 100));
  const z2Hit = z2Minutes >= Z2_TARGET;

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>
              {perfect
                ? "Perfect week — every day trained."
                : `${activeCount}/7 days trained in the last week.`}
            </CardDescription>
          </div>
          <Legend />
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4 flex flex-col flex-1">
        <div className="relative">
          {perfect ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-[calc(50%+8px)] h-12 rounded-full"
              style={{
                // Soft glow behind the dots on a perfect week. Section
                // accent at three alpha levels — fill, ring, outer glow —
                // all derived from the same accent so changing the user's
                // exercise color recolours every layer in one shot.
                backgroundColor:
                  "color-mix(in oklab, var(--section-accent) 15%, transparent)",
                boxShadow:
                  "0 0 0 2px color-mix(in oklab, var(--section-accent) 60%, transparent), 0 0 20px color-mix(in oklab, var(--section-accent) 35%, transparent)",
              }}
            />
          ) : null}
          <div className="relative grid grid-cols-7 gap-2">
            {days.map((day, i) => {
              const kind = kinds[i];
              return (
                <div key={day.iso} className="flex flex-col items-center gap-1">
                  <span className={cn("text-xs font-medium", day.isToday ? "text-foreground" : "text-muted-foreground")}>
                    {day.weekday}
                  </span>
                  <div
                    title={`${day.iso} — ${KIND_LABEL[kind]}`}
                    className={cn("h-9 w-9 rounded-full border-2 transition-all", KIND_DOT[kind], day.isToday && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background")}
                  />
                  <span className={cn("text-[10px] tabular-nums", day.isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {day.dayNum}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-sm font-semibold">Z2 cardio</p>
              <p className="text-sm text-muted-foreground">Target 150 min/week for mitochondrial biogenesis</p>
            </div>
            <p className="text-sm tabular-nums">
              <span
                className="font-semibold"
                style={{ color: z2Hit ? "var(--section-accent-shade-1)" : "var(--foreground)" }}
              >{Math.round(z2Minutes)}</span>
              <span className="text-muted-foreground"> / {Z2_TARGET} min</span>
            </p>
          </div>
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${z2Pct}%`,
                backgroundColor: z2Hit
                  ? "var(--section-accent-shade-2)"
                  : "var(--section-accent-shade-3)",
              }}
            />
          </div>
        </div>
      </CardContent>
    </>
  );
}


function Legend() {
  return (
    <div className="hidden gap-3 text-xs text-muted-foreground sm:flex">
      <LegendDot shade="var(--section-accent-shade-1)" label="Strength" />
      <LegendDot shade="var(--section-accent-shade-2)" label="Cardio" />
      <LegendDot shade="var(--section-accent-shade-3)" label="Mobility" />
    </div>
  );
}

function LegendDot({ shade, label }: { shade: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: shade }} />
      {label}
    </span>
  );
}
