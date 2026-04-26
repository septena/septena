"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import {
  type AppSettings,
  getCaffeineDay,
  getCaffeineSessions,
  getChores,
  getEntries,
  getHabitRange,
  getNextWorkout,
  getNutritionEntries,
  getSettings,
  getSupplementRange,
  getTasks,
  saveSettings,
  type HabitDay,
  type HabitDayItem,
  type SupplementDay,
  type SupplementItem,
  type Task,
  type TaskListResponse,
} from "@/lib/api";
import {
  DEFAULT_DAY_PHASES,
  DEFAULT_DAY_PHASE_BOUNDARIES,
  DEFAULT_DAY_END,
  activePhaseId,
  isPastPhase,
  resolvePhases,
  timeLeftInPhase,
} from "@/lib/day-phases";
import { daysAgoLocalISO } from "@/lib/date-utils";
import type { SectionKey } from "@/lib/sections";

const HISTORY_DAYS = 14;
const VISIBLE_QUEUE = 5;
const VISIBLE_LATER = 6;

/**
 * Sections that produce action cards in the Next view. Each is toggleable via
 * `settings.sections.<key>.include_in_next` (default true). Other sections
 * (nutrition, caffeine) feed Next as ambient signals only.
 */
export const NEXT_CONTRIBUTORS = ["habits", "supplements", "chores", "training", "tasks"] as const;
export type NextContributor = (typeof NEXT_CONTRIBUTORS)[number];

function includeInNext(
  settings: Awaited<ReturnType<typeof getSettings>> | null,
  key: NextContributor,
): boolean {
  const meta = settings?.sections?.[key] as { include_in_next?: boolean } | undefined;
  return meta?.include_in_next !== false;
}

export type ActionTask =
  | { type: "habit"; id: string; done: boolean }
  | { type: "supplement"; id: string; done: boolean }
  | { type: "chore"; id: string }
  | { type: "task"; id: string };

export type ModalKey = "nutrition" | "caffeine";

export type NextAction = {
  id: string;
  section: SectionKey;
  title: string;
  emoji?: string;
  detail: string;
  reason?: string;
  score: number;
  bucket: "now" | "later" | "done";
  task?: ActionTask;
  modal?: ModalKey;
  href?: string;
  buttonLabel?: string;
  muted?: boolean;
};

export type NextData = {
  today: string;
  habitToday: HabitDay | null;
  habitDays: Array<HabitDay | null>;
  supplementToday: SupplementDay | null;
  supplementDays: Array<SupplementDay | null>;
  chores: Awaited<ReturnType<typeof getChores>> | null;
  workout: Awaited<ReturnType<typeof getNextWorkout>> | null;
  trainingEntries: Awaited<ReturnType<typeof getEntries>>;
  nutritionEntries: Awaited<ReturnType<typeof getNutritionEntries>>;
  caffeineToday: Awaited<ReturnType<typeof getCaffeineDay>> | null;
  caffeineSessions: Awaited<ReturnType<typeof getCaffeineSessions>> | null;
  settings: Awaited<ReturnType<typeof getSettings>> | null;
  tasks: TaskListResponse | null;
};

export function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function formatMinutes(minutes: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function orFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

function daysAgoLabel(days: number | null | undefined): string {
  if (days == null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function trainingUrgency(days: number | null | undefined): number {
  if (days == null) return 32;
  if (days >= 5) return 34;
  if (days >= 3) return 24;
  if (days >= 2) return 14;
  return 0;
}

function timingScore(usual: number | null, nowMinutes: number, isToday: boolean): number {
  if (!isToday || usual == null) return 0;
  const diff = nowMinutes - usual;
  if (diff < -180) return -30;
  if (diff < -90) return -12;
  if (diff <= 90) return 30 - Math.abs(diff) / 6;
  if (diff <= 240) return 10;
  return -8;
}

function timingBucket(usual: number | null, nowMinutes: number, isToday: boolean): "now" | "later" {
  if (!isToday || usual == null) return "now";
  return nowMinutes < usual - 150 ? "later" : "now";
}

function usualItemTime<T extends { id: string; done: boolean; time?: string | null }>(
  days: Array<{ date: string; items: T[] } | null>,
  id: string,
  today: string,
): number | null {
  const times: number[] = [];
  for (const day of days) {
    if (!day || day.date === today) continue;
    const item = day.items.find((i) => i.id === id);
    const minutes = item?.done ? parseHHMM(item.time) : null;
    if (minutes != null) times.push(minutes);
  }
  return median(times);
}

function habitItems(day: HabitDay | null): HabitDayItem[] {
  if (!day) return [];
  return day.buckets.flatMap((bucket) => day.grouped[bucket] ?? []);
}

function habitUsualTime(days: Array<HabitDay | null>, id: string, today: string): number | null {
  const normalized = days.map((day) => day ? { date: day.date, items: habitItems(day) } : null);
  return usualItemTime(normalized, id, today);
}

function firstDailyTimes<T extends { date: string; time: string }>(items: T[], beforeDay: string): number[] {
  const byDay = new Map<string, number>();
  for (const item of items) {
    if (item.date >= beforeDay) continue;
    const minutes = parseHHMM(item.time);
    if (minutes == null) continue;
    const existing = byDay.get(item.date);
    if (existing == null || minutes < existing) byDay.set(item.date, minutes);
  }
  return [...byDay.values()];
}

export type ComputedNext = {
  primary: NextAction | null;
  queue: NextAction[];
  later: NextAction[];
  done: NextAction[];
  activePhase: ReturnType<typeof DEFAULT_DAY_PHASES.find> | undefined;
  remaining: number;
  totalNow: number;
};

const SKIP_RETENTION_DAYS = 30;

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function nextSkipsForDate(settings: AppSettings | null | undefined, date: string): string[] {
  const values = settings?.next_view?.skipped_by_date?.[date];
  return Array.isArray(values) ? dedupe(values.filter((value): value is string => typeof value === "string")) : [];
}

function buildNextSkipsPatch(
  settings: AppSettings | null | undefined,
  date: string,
  ids: string[],
): Pick<AppSettings, "next_view"> {
  const cutoff = daysAgoLocalISO(SKIP_RETENTION_DAYS);
  const current = settings?.next_view?.skipped_by_date ?? {};
  const skipped_by_date: Record<string, string[]> = {};
  for (const [day, values] of Object.entries(current)) {
    if (day < cutoff || !Array.isArray(values)) continue;
    const normalized = dedupe(values.filter((value): value is string => typeof value === "string"));
    if (normalized.length > 0) skipped_by_date[day] = normalized;
  }
  const normalizedIds = dedupe(ids);
  if (normalizedIds.length > 0) skipped_by_date[date] = normalizedIds;
  else delete skipped_by_date[date];
  return { next_view: { skipped_by_date } };
}

export function useNextSkips(date: string) {
  const { data: settings, mutate } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  const skippedIds = useMemo(() => nextSkipsForDate(settings, date), [settings, date]);
  const skipped = useMemo(() => new Set(skippedIds), [skippedIds]);

  const persist = useCallback(async (ids: string[]) => {
    const optimistic = settings ? { ...settings, ...buildNextSkipsPatch(settings, date, ids) } : null;
    await mutate(
      async (current) => {
        const patch = buildNextSkipsPatch(current ?? settings ?? null, date, ids);
        const saved = await saveSettings(patch as Partial<AppSettings>);
        return current ? { ...current, ...saved } : saved;
      },
      {
        optimisticData: optimistic ?? undefined,
        rollbackOnError: true,
        revalidate: false,
      },
    );
  }, [date, mutate, settings]);

  const skip = useCallback((id: string) => {
    if (skipped.has(id)) return;
    void persist([...skippedIds, id]);
  }, [persist, skipped, skippedIds]);

  const unskipOne = useCallback((id: string) => {
    if (!skipped.has(id)) return;
    void persist(skippedIds.filter((item) => item !== id));
  }, [persist, skipped, skippedIds]);

  const clear = useCallback(() => {
    if (skippedIds.length === 0) return;
    void persist([]);
  }, [persist, skippedIds.length]);

  return { skipped, skip, unskip: unskipOne, clear };
}

export function useNextActions(selectedDate: string, isToday: boolean) {
  const skips = useNextSkips(selectedDate);
  const swr = useSWR(["next-dashboard", selectedDate], async (): Promise<NextData> => {
    // All sources fan out in a single Promise.all — settings is fetched in
    // parallel with the rest, and `include_in_next` filtering happens after
    // the round-trip. Disabled contributors waste one cheap request; in
    // exchange we shave the settings round-trip off the critical path.
    const [
      settings,
      habitRange,
      supplementRange,
      chores,
      workout,
      trainingEntries,
      tasks,
      nutritionEntries,
      caffeineToday,
      caffeineSessions,
    ] = await Promise.all([
      orFallback(getSettings(), null),
      orFallback(getHabitRange(HISTORY_DAYS), { days: [] as HabitDay[] }),
      orFallback(getSupplementRange(HISTORY_DAYS), { days: [] as SupplementDay[] }),
      orFallback(getChores(), null),
      orFallback(getNextWorkout(), null),
      orFallback(getEntries(daysAgoLocalISO(30)), []),
      orFallback(getTasks("today"), null as TaskListResponse | null),
      orFallback(getNutritionEntries(daysAgoLocalISO(14)), []),
      orFallback(getCaffeineDay(selectedDate), null),
      orFallback(getCaffeineSessions(14), null),
    ]);
    const enabled = (key: NextContributor) => includeInNext(settings, key);
    const habitDays: Array<HabitDay | null> = enabled("habits") ? habitRange.days : [];
    const supplementDays: Array<SupplementDay | null> = enabled("supplements")
      ? supplementRange.days
      : [];
    return {
      today: selectedDate,
      habitToday: habitDays.at(-1) ?? null,
      habitDays,
      supplementToday: supplementDays.at(-1) ?? null,
      supplementDays,
      chores: enabled("chores") ? chores : null,
      workout: enabled("training") ? workout : null,
      trainingEntries: enabled("training") ? trainingEntries : [],
      nutritionEntries,
      caffeineToday,
      caffeineSessions,
      settings,
      tasks: enabled("tasks") ? tasks : null,
    };
  }, { refreshInterval: 60_000 });

  const now = useMemo(() => new Date(), []);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const skipped = skips.skipped;
  const computed = useMemo<ComputedNext>(() => {
    const data = swr.data;
    const actions: NextAction[] = [];
    const done: NextAction[] = [];
    const phases = resolvePhases(
      data?.settings?.day_phases ?? DEFAULT_DAY_PHASES,
      data?.settings?.day_phase_boundaries ?? DEFAULT_DAY_PHASE_BOUNDARIES,
      data?.settings?.day_end ?? DEFAULT_DAY_END,
    );
    const activePhase = activePhaseId(phases, now);
    const activePhaseMeta = phases.find((p) => p.id === activePhase);

    const habits = habitItems(data?.habitToday ?? null);
    for (const habit of habits) {
      const phase = phases.find((p) => p.id === habit.bucket);
      const usual = habitUsualTime(data?.habitDays ?? [], habit.id, selectedDate);
      const timing = usual != null ? `Usually around ${formatMinutes(usual)}` : undefined;
      const currentPhase = habit.bucket === activePhase;
      const past = isPastPhase(phases, habit.bucket, now);
      const left = currentPhase ? timeLeftInPhase(phases, habit.bucket, now) : null;
      const action: NextAction = {
        id: `habit:${habit.id}`,
        section: "habits",
        title: habit.name,
        emoji: habit.emoji,
        detail: currentPhase
          ? [phase?.label ?? habit.bucket, left].filter(Boolean).join(" · ")
          : past
            ? `${phase?.label ?? habit.bucket} · earlier`
            : `${phase?.label ?? habit.bucket} · later`,
        reason: timing,
        score: (currentPhase ? 110 : past ? 45 : 20) + timingScore(usual, nowMinutes, isToday),
        bucket: habit.done ? "done" : currentPhase || past ? "now" : "later",
        task: { type: "habit", id: habit.id, done: habit.done },
        muted: past && !habit.done,
      };
      if (habit.done) done.push({ ...action, detail: habit.time ? `Done ${habit.time}` : "Done today" });
      else actions.push(action);
    }

    for (const item of data?.supplementToday?.items ?? []) {
      const normalized = (data?.supplementDays ?? []).map((day) =>
        day ? { date: day.date, items: day.items } : null,
      );
      const usual = usualItemTime<SupplementItem>(normalized, item.id, selectedDate);
      const bucket = timingBucket(usual, nowMinutes, isToday);
      const action: NextAction = {
        id: `supplement:${item.id}`,
        section: "supplements",
        title: item.name,
        emoji: item.emoji,
        detail: usual != null ? `Usually around ${formatMinutes(usual)}` : "Daily stack",
        score: 75 + timingScore(usual, nowMinutes, isToday),
        bucket: item.done ? "done" : bucket,
        task: { type: "supplement", id: item.id, done: item.done },
      };
      if (item.done) done.push({ ...action, detail: item.time ? `Taken ${item.time}` : "Taken today" });
      else actions.push(action);
    }

    for (const chore of data?.chores?.chores ?? []) {
      const completeToday = chore.last_completed === selectedDate;
      if (completeToday) {
        done.push({
          id: `chore:${chore.id}`,
          section: "chores",
          title: chore.name,
          emoji: chore.emoji,
          detail: chore.last_completed_time ? `Done ${chore.last_completed_time}` : "Done today",
          score: 0,
          bucket: "done",
          task: { type: "chore", id: chore.id },
        });
        continue;
      }
      if (chore.days_overdue >= 0) {
        actions.push({
          id: `chore:${chore.id}`,
          section: "chores",
          title: chore.name,
          emoji: chore.emoji,
          detail: chore.days_overdue > 0
            ? chore.days_overdue === 1
              ? "1 day late"
              : `${chore.days_overdue} days late`
            : "Due today",
          score: chore.days_overdue > 0 ? 140 + Math.min(chore.days_overdue * 8, 40) : 95,
          bucket: "now",
          task: { type: "chore", id: chore.id },
        });
      } else if (chore.days_overdue >= -2) {
        actions.push({
          id: `chore:${chore.id}`,
          section: "chores",
          title: chore.name,
          emoji: chore.emoji,
          detail: `Due in ${Math.abs(chore.days_overdue)}d`,
          score: 15,
          bucket: "later",
          task: { type: "chore", id: chore.id },
        });
      }
    }

    const trainedToday = (data?.trainingEntries ?? []).some((entry) => entry.date === selectedDate);
    if (data?.workout && !trainedToday && isToday) {
      const type = data.workout.suggested.type;
      const suggestedGap = data.workout.days_ago[type];
      const usualTraining = median(
        (data.trainingEntries ?? [])
          .filter((entry) => entry.date < selectedDate && entry.concluded_at)
          .map((entry) => parseHHMM(entry.concluded_at?.slice(11, 16)))
          .filter((v): v is number => v != null),
      );
      const dueNow = suggestedGap == null || suggestedGap >= 2 || usualTraining == null;
      const bucket = dueNow ? "now" : timingBucket(usualTraining, nowMinutes, isToday);
      actions.push({
        id: "training:suggested",
        section: "training",
        title: data.workout.suggested.label,
        emoji: data.workout.suggested.emoji,
        detail: `Last ${daysAgoLabel(suggestedGap)}`,
        reason: usualTraining != null ? `Usually around ${formatMinutes(usualTraining)}` : "Suggested training day",
        score: 78 + trainingUrgency(suggestedGap) + timingScore(usualTraining, nowMinutes, isToday),
        bucket,
        href: `/septena/training/session/start?type=${type}`,
        buttonLabel: "Start",
      });
    } else if (trainedToday) {
      done.push({
        id: "training:done",
        section: "training",
        title: "Training",
        detail: "Session logged",
        score: 0,
        bucket: "done",
      });
    }

    const taskList = data?.tasks;
    if (taskList) {
      const seen = new Set<string>();
      const pushTask = (task: Task, source: "today" | "review") => {
        if (seen.has(task.id)) return;
        seen.add(task.id);
        if (task.status === "done") {
          done.push({
            id: `task:${task.id}`,
            section: "tasks",
            title: task.title,
            detail: "Done today",
            score: 0,
            bucket: "done",
            task: { type: "task", id: task.id },
          });
          return;
        }
        const isReview = source === "review";
        actions.push({
          id: `task:${task.id}`,
          section: "tasks",
          title: task.title,
          detail: isReview
            ? task.scheduled
              ? `Scheduled ${task.scheduled}`
              : "Scheduled earlier"
            : task.project
              ? `Project · ${task.project}`
              : task.area
                ? `Area · ${task.area}`
                : "Today",
          score: isReview ? 35 : 80,
          bucket: "now",
          task: { type: "task", id: task.id },
        });
      };
      for (const task of taskList.items ?? []) pushTask(task, "today");
      for (const task of taskList.review ?? []) pushTask(task, "review");
    }

    const firstMealUsual = median(firstDailyTimes(data?.nutritionEntries ?? [], selectedDate));
    const hasMealToday = (data?.nutritionEntries ?? []).some((entry) => entry.date === selectedDate);
    if (!hasMealToday && isToday && firstMealUsual != null && nowMinutes >= firstMealUsual - 45) {
      actions.push({
        id: "nutrition:first-meal",
        section: "nutrition",
        title: "Log meal",
        detail: `Usually around ${formatMinutes(firstMealUsual)}`,
        score: 38 + timingScore(firstMealUsual, nowMinutes, isToday),
        bucket: "now",
        modal: "nutrition",
        buttonLabel: "Log",
      });
    }

    const firstCaffeineUsual = median(
      firstDailyTimes(data?.caffeineSessions?.sessions ?? [], selectedDate),
    );
    const hasCaffeineToday = (data?.caffeineToday?.entries ?? []).length > 0;
    if (!hasCaffeineToday && isToday && firstCaffeineUsual != null && nowMinutes >= firstCaffeineUsual - 45) {
      actions.push({
        id: "caffeine:first",
        section: "caffeine",
        title: "Log caffeine",
        detail: `Usually around ${formatMinutes(firstCaffeineUsual)}`,
        score: 34 + timingScore(firstCaffeineUsual, nowMinutes, isToday),
        bucket: "now",
        modal: "caffeine",
        buttonLabel: "Log",
      });
    }

    const sortedNow = actions
      .filter((action) => action.bucket === "now" && !skipped.has(action.id))
      .sort((a, b) => b.score - a.score);
    const primary = sortedNow[0] ?? null;
    const queue = sortedNow.slice(primary ? 1 : 0, (primary ? 1 : 0) + VISIBLE_QUEUE);
    const later = actions
      .filter((action) => action.bucket === "later" && !skipped.has(action.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, VISIBLE_LATER);

    return {
      primary,
      queue,
      later,
      done: done.slice(0, 8),
      activePhase: activePhaseMeta,
      remaining: sortedNow.length,
      totalNow: sortedNow.length,
    };
  }, [swr.data, selectedDate, isToday, nowMinutes, now, skipped]);

  return { ...swr, computed, now, nowMinutes, skips };
}
