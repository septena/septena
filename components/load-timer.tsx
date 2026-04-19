"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { StatusPill } from "@/components/ui/status-pill";

/** Current perf label: "loaded in Xms". `null` until the browser reports
 *  the first navigation timing. Context lets the value persist across
 *  route changes even though per-section components remount. */
const LoadTimeContext = createContext<string | null>(null);

export function LoadTimeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [label, setLabel] = useState<string | null>(null);
  // Skips the initial pathname effect so it doesn't race with the Navigation
  // Timing read on first mount.
  const isFirstPath = useRef(true);

  useEffect(() => {
    const read = () => {
      const entry = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming | undefined;
      if (!entry) return;
      const ms = Math.round(entry.loadEventEnd || entry.domContentLoadedEventEnd);
      if (ms > 0) setLabel(`loaded in ${ms}ms`);
    };
    if (document.readyState === "complete") read();
    else window.addEventListener("load", read, { once: true });
  }, []);

  useEffect(() => {
    if (isFirstPath.current) {
      isFirstPath.current = false;
      return;
    }
    const start = performance.now();
    const raf = requestAnimationFrame(() => {
      const ms = Math.round(performance.now() - start);
      setLabel(`loaded in ${ms}ms`);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return <LoadTimeContext.Provider value={label}>{children}</LoadTimeContext.Provider>;
}

export function useLoadTime(): string | null {
  return useContext(LoadTimeContext);
}

/** Inline status pill showing the current load time. Used on the home
 *  overview; section subpages inline the value into their status bar via
 *  useLoadTime() instead. */
export function LoadTimer() {
  const label = useLoadTime();
  if (!label) return null;
  return <StatusPill className="mt-8 text-center">{label}</StatusPill>;
}
