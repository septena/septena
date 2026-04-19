"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { relativeDayLabel } from "@/lib/date-utils";

/** Global prev / date-picker / next control. Lives in SectionTabs. */
export function DateNav() {
  const { date, today, isToday, canGoNext, setDate, goPrev, goNext, goToday } =
    useSelectedDate();

  return (
    <div className="ml-auto flex items-center gap-1 text-sm">
      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous day"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-orange-500 hover:text-orange-500"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <label className="relative inline-flex items-center">
        <span
          onClick={!isToday ? goToday : undefined}
          className={`pointer-events-none inline-flex h-8 min-w-[6rem] items-center justify-center rounded-full border px-3 font-medium ${
            isToday
              ? "border-border text-foreground"
              : "cursor-pointer border-orange-500 text-orange-500"
          }`}
          title={!isToday ? "Jump to today" : undefined}
        >
          {relativeDayLabel(date)}
        </span>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
          aria-label="Pick date"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <button
        type="button"
        onClick={goNext}
        disabled={!canGoNext}
        aria-label="Next day"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-orange-500 hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
