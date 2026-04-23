"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCaffeineHistory, getCalendar, getCannabisHistory, getChores, getEntries, getGroceries, getHabitHistory, getHealthApple, getHealthOura, getHealthWithings, getNutritionEntries, getNutritionStats, getStats, getSupplementHistory, getWeather, type Stats } from "@/lib/api";
import { computeStreak } from "@/lib/date-utils";
import { SECTIONS } from "@/lib/sections";
import { useSection, useSections } from "@/hooks/use-sections";
import { useAppConfig } from "@/lib/app-config";
import { StatusPill } from "@/components/ui/status-pill";
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
  const vault = paths.vault.replace(/\/$/, "");
  const loadTime = useLoadTime();
  const color = "var(--section-accent)";
  const sectionMeta = useSection(section);
  const sectionLabel = sectionMeta?.label ?? SECTIONS[section].label;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (section === "exercise") {
          const stats = await getStats();
          const line1 = `${stats.total_sessions ?? 0} sessions · ${stats.exercises_count ?? 0} exercises`;
          const line2 = `Last: ${relativeTime(stats.last_logged_at)} · Path: ${vault}/Exercise/Log/`;
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
          const line2 = `Path: ${vault}/Habits/Log/`;
          setData({ line1, line2, color });
        } else if (section === "chores") {
          const list = await getChores();
          const overdue = list.chores.filter((c) => c.days_overdue > 0).length;
          const dueToday = list.chores.filter((c) => c.days_overdue === 0).length;
          const line1 = `${list.total} chores · ${overdue} overdue · ${dueToday} due today`;
          const line2 = `Path: ${vault}/Chores/Definitions/`;
          setData({ line1, line2, color });
        } else if (section === "supplements") {
          const history = await getSupplementHistory(30);
          const total = history.total;
          const avg = history.daily.length
            ? Math.round(history.daily.reduce((s, d) => s + d.percent, 0) / history.daily.length)
            : 0;
          const streak = computeStreak(history.daily, { graceDays: 1 });
          const line1 = `${total} supplements · ${streak}d streak · ${avg}% avg (30d)`;
          const line2 = `Path: ${vault}/Supplements/Log/`;
          setData({ line1, line2, color });
        } else if (section === "cannabis") {
          const history = await getCannabisHistory(7);
          const total = history.daily.reduce((s, d) => s + (d.sessions ?? 0), 0);
          const lastDay = history.daily[history.daily.length - 1];
          const lastDate = lastDay ? relativeTime(lastDay.date) : "—";
          const line1 = `${total} sessions · ${history.daily.length}d tracked`;
          const line2 = `Last session: ${lastDate} · Path: ${vault}/Cannabis/Log/`;
          setData({ line1, line2, color });
        } else if (section === "caffeine") {
          const history = await getCaffeineHistory(7);
          const total = history.daily.reduce((s, d) => s + (d.sessions ?? 0), 0);
          const lastWithEntry = [...history.daily].reverse().find((d) => d.sessions > 0);
          const lastDate = lastWithEntry ? relativeTime(lastWithEntry.date) : "—";
          const line1 = `${total} sessions · ${history.daily.length}d tracked`;
          const line2 = `Last: ${lastDate} · Path: ${vault}/Caffeine/Log/`;
          setData({ line1, line2, color });
        } else if (section === "body") {
          const withings = await getHealthWithings(30).catch(() => null);
          const days = withings?.withings?.filter((r: any) => r.weight_kg != null).length ?? 0;
          const lastDate = withings?.withings?.filter((r: any) => r.weight_kg != null).at(-1)?.date;
          const line1 = `${days} weigh-ins (30d)`;
          const line2 = `Last: ${relativeTime(lastDate)} · Source: Withings Scale`;
          setData({ line1, line2, color });
        } else if (section === "calendar") {
          const cal = await getCalendar();
          const total = cal.events?.length ?? 0;
          const line1 = cal.error
            ? "Calendar unavailable"
            : `${cal.today_count ?? 0} today · ${total} upcoming (7d)`;
          const line2 = cal.error ?? "Source: macOS Calendar (EventKit)";
          setData({ line1, line2, color });
        } else if (section === "weather") {
          const w = await getWeather().catch(() => null);
          if (w) {
            const loc = w.location?.split(",")[0]?.trim() || "—";
            const now = w.current?.temperature != null
              ? `${Math.round(w.current.temperature)}${w.temp_unit ?? ""}`
              : "—";
            const line1 = `${loc} · ${now}`;
            const line2 = "Source: Open-Meteo (no auth, public API)";
            setData({ line1, line2, color });
          } else {
            setData({
              line1: "No location configured",
              line2: "Set a city in Settings to see weather",
              color,
            });
          }
        } else if (section === "groceries") {
          const g = await getGroceries();
          const total = g.items?.length ?? 0;
          const low = g.items?.filter((i) => i.low && !i.last_bought).length ?? 0;
          const cart = g.items?.filter((i) => !!i.last_bought).length ?? 0;
          const line1 = `${total} items · ${low} low · ${cart} in cart`;
          const line2 = `Path: ${vault}/Groceries/`;
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
          const line2 = base?.dataDir ? `Obsidian: ${vault}/${base.dataDir}/` : `Section: ${sectionLabel}`;
          setData({ line1, line2, color });
        }
      } catch {
        // Silently fail — status bar is non-critical
      }
    };
    fetchStatus();
  }, [section, vault, color, sectionLabel, sectionMeta?.tagline]);

  if (!data) return null;

  return (
    <StatusPill className="mt-8">
      <p className="font-medium text-foreground">{data.line1}</p>
      <p className="mt-0.5">{data.line2}</p>
      {loadTime && <p className="mt-0.5">{loadTime}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <Link
          href="/data"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Data sources & freshness →
        </Link>
        <Link
          href={`/settings/${section}`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          {sectionLabel} settings →
        </Link>
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

  if (pathname === "/") return null;

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
