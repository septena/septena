"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCaffeineHistory, getCannabisHistory, getChores, getEntries, getGroceries, getHabitHistory, getHealthApple, getHealthOura, getHealthWithings, getNutritionEntries, getNutritionStats, getStats, getSupplementHistory, type Stats } from "@/lib/api";
import { computeStreak } from "@/lib/date-utils";
import { SECTIONS } from "@/lib/sections";
import { useSection, useSections } from "@/hooks/use-sections";
import { useAppConfig } from "@/lib/app-config";
import { StatusPill } from "@/components/ui/status-pill";
import { BackLink } from "@/components/back-link";
import { useLoadTime } from "@/components/load-timer";

type SectionKey = keyof typeof SECTIONS;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  const then = new Date(y!, m! - 1, d!);
  const now = new Date();
  const diff = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff}d ago`;
  return formatDate(iso);
}

type StatusData = {
  line1: string;
  line2: string;
  color: string;
};

export function SectionStatusBar({ section }: { section: SectionKey }) {
  const [data, setData] = useState<StatusData | null>(null);
  const { paths } = useAppConfig();
  const dataRoot = paths.data.replace(/\/$/, "");
  const loadTime = useLoadTime();
  const color = "var(--section-accent)";
  const sectionMeta = useSection(section);
  const sectionLabel = sectionMeta?.label ?? SECTIONS[section].label;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (section === "training") {
          const stats = await getStats();
          const line1 = `${stats.total_sessions ?? 0} sessions · ${stats.exercises_count ?? 0} exercises`;
          const line2 = `Last: ${relativeTime(stats.last_logged_at)} · Path: ${dataRoot}/${sectionMeta?.dataDir ?? "Training/Log"}/`;
          setData({ line1, line2, color });
        } else if (section === "health") {
          const [oura, withings, apple] = await Promise.all([
            getHealthOura(7).catch(() => null),
            getHealthWithings(7).catch(() => null),
            getHealthApple(7).catch(() => null),
          ]);
          const ouraDays = oura?.oura?.length ?? 0;
          const withingsDays = withings?.withings?.filter((r: any) => r.weight_kg != null).length ?? 0;
          const appleDays = apple?.apple?.length ?? 0;
          const line1 = `Oura ${ouraDays}d · Withings ${withingsDays}d · Apple Health ${appleDays}d (7d)`;
          const line2 = `Sources: Oura Ring · Withings Scale · Apple Health`;
          setData({ line1, line2, color });
        } else if (section === "nutrition") {
          const [entries, stats] = await Promise.all([getNutritionEntries(), getNutritionStats(7)]);
          const total = entries.length;
          const avg = stats.avg_g ?? 0;
          const lastEntry = entries.length > 0
            ? relativeTime(entries[entries.length - 1].date)
            : "—";
          const line1 = `${total} entries logged · avg ${Math.round(avg)}g protein/day`;
          const line2 = `Last meal: ${lastEntry}`;
          setData({ line1, line2, color });
        } else if (section === "habits") {
          const history = await getHabitHistory(30);
          const total = history.total;
          const avg = history.daily.length
            ? Math.round(history.daily.reduce((s, d) => s + d.percent, 0) / history.daily.length)
            : 0;
          const streak = computeStreak(history.daily, { graceDays: 1 });
          const line1 = `${total} habits · ${streak}d streak · ${avg}% avg (30d)`;
          const line2 = `Path: ${dataRoot}/Habits/Log/`;
          setData({ line1, line2, color });
        } else if (section === "chores") {
          const list = await getChores();
          const overdue = list.chores.filter((c) => c.days_overdue > 0).length;
          const dueToday = list.chores.filter((c) => c.days_overdue === 0).length;
          const line1 = `${list.total} chores · ${overdue} overdue · ${dueToday} due today`;
          const line2 = `Path: ${dataRoot}/Chores/Definitions/`;
          setData({ line1, line2, color });
        } else if (section === "supplements") {
          const history = await getSupplementHistory(30);
          const total = history.total;
          const avg = history.daily.length
            ? Math.round(history.daily.reduce((s, d) => s + d.percent, 0) / history.daily.length)
            : 0;
          const streak = computeStreak(history.daily, { graceDays: 1 });
          const line1 = `${total} supplements · ${streak}d streak · ${avg}% avg (30d)`;
          const line2 = `Path: ${dataRoot}/Supplements/Log/`;
          setData({ line1, line2, color });
        } else if (section === "cannabis") {
          const history = await getCannabisHistory(7);
          const total = history.daily.reduce((s, d) => s + (d.sessions ?? 0), 0);
          const lastDay = history.daily[history.daily.length - 1];
          const lastDate = lastDay ? relativeTime(lastDay.date) : "—";
          const line1 = `${total} sessions · ${history.daily.length}d tracked`;
          const line2 = `Last session: ${lastDate} · Path: ${dataRoot}/Cannabis/Log/`;
          setData({ line1, line2, color });
        } else if (section === "caffeine") {
          const history = await getCaffeineHistory(7);
          const total = history.daily.reduce((s, d) => s + (d.sessions ?? 0), 0);
          const lastWithEntry = [...history.daily].reverse().find((d) => d.sessions > 0);
          const lastDate = lastWithEntry ? relativeTime(lastWithEntry.date) : "—";
          const line1 = `${total} sessions · ${history.daily.length}d tracked`;
          const line2 = `Last: ${lastDate} · Path: ${dataRoot}/Caffeine/Log/`;
          setData({ line1, line2, color });
        } else if (section === "body") {
          const withings = await getHealthWithings(30).catch(() => null);
          const days = withings?.withings?.filter((r: any) => r.weight_kg != null).length ?? 0;
          const lastDate = withings?.withings?.filter((r: any) => r.weight_kg != null).at(-1)?.date;
          const line1 = `${days} weigh-ins (30d)`;
          const line2 = `Last: ${relativeTime(lastDate)} · Source: Withings Scale`;
          setData({ line1, line2, color });
        } else if (section === "groceries") {
          const g = await getGroceries();
          const total = g.items?.length ?? 0;
          const low = g.items?.filter((i) => i.low && !i.last_bought).length ?? 0;
          const cart = g.items?.filter((i) => !!i.last_bought).length ?? 0;
          const line1 = `${total} items · ${low} low · ${cart} in cart`;
          const line2 = `Path: ${dataRoot}/Groceries/`;
          setData({ line1, line2, color });
        } else if (section === "sleep") {
          const [oura] = await Promise.all([
            getHealthOura(7).catch(() => null),
          ]);
          const ouraDays = oura?.oura?.length ?? 0;
          const lastDate = oura?.oura?.at(-1)?.date;
          const line1 = `${ouraDays} nights tracked (7d)`;
          const line2 = `Last: ${relativeTime(lastDate)} · Sources: Oura Ring · Apple Health`;
          setData({ line1, line2, color });
        } else {
          const base = SECTIONS[section];
          const line1 = sectionMeta?.tagline ?? base?.tagline ?? sectionLabel;
          const line2 = base?.dataDir ? `Path: ${dataRoot}/${base.dataDir}/` : `Section: ${sectionLabel}`;
          setData({ line1, line2, color });
        }
      } catch {
        // Silently fail — status bar is non-critical
      }
    };
    fetchStatus();
  }, [section, dataRoot, color, sectionLabel, sectionMeta?.tagline]);

  if (!data) return null;

  return (
    <StatusPill className="mt-8">
      <p className="font-medium text-foreground">{data.line1}</p>
      <p className="mt-0.5">{data.line2}</p>
      {loadTime && <p className="mt-0.5">{loadTime}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <BackLink href="/septena/data" label="Data sources & freshness" direction="forward" />
        <BackLink href={`/septena/settings/${section}`} label={`${sectionLabel} settings`} direction="forward" />
      </div>
    </StatusPill>
  );
}

// Layout-level auto variant: resolves the current section from pathname the
// same way SectionHeader does, so dashboards don't each have to import and
// mount the status bar manually. Returns null on the root launcher and any
// route that doesn't map to a registered section (e.g. /settings).
export function SectionStatusBarAuto() {
  const pathname = usePathname();
  const sections = useSections();

  if (pathname === "/septena") return null;

  const match = sections
    .filter((s) => s.path && (pathname === s.path || pathname.startsWith(s.path + "/")))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!match) return null;
  if (!(match.key in SECTIONS)) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <SectionStatusBar section={match.key as SectionKey} />
    </div>
  );
}
