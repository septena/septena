"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDaysISO, todayLocalISO } from "@/lib/date-utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Global selected-date state driven by the `?date=YYYY-MM-DD` URL param.
 *
 * - Falls back to today when the param is missing or malformed.
 * - Future dates are clamped to today (no time-travelling forward for now).
 * - `setDate` / `goPrev` / `goNext` write via router.replace so the browser
 *   back-stack isn't spammed on every arrow click.
 */
export function useSelectedDate() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = todayLocalISO();

  const raw = searchParams.get("date");
  const date = useMemo(() => {
    if (!raw || !DATE_RE.test(raw)) return today;
    return raw > today ? today : raw;
  }, [raw, today]);

  const isToday = date === today;
  const canGoNext = date < today;

  const setDate = useCallback(
    (next: string) => {
      const clamped = next > today ? today : next;
      const params = new URLSearchParams(searchParams.toString());
      if (clamped === today) params.delete("date");
      else params.set("date", clamped);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, today],
  );

  const goPrev = useCallback(() => setDate(addDaysISO(date, -1)), [date, setDate]);
  const goNext = useCallback(() => {
    if (canGoNext) setDate(addDaysISO(date, 1));
  }, [canGoNext, date, setDate]);
  const goToday = useCallback(() => setDate(today), [setDate, today]);

  return { date, today, isToday, canGoNext, setDate, goPrev, goNext, goToday };
}
