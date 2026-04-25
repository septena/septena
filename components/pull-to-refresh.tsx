"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { haptic } from "@/lib/haptics";

// Pull-to-refresh that revalidates all SWR caches when the user drags down
// from the very top of the document. No full page reload needed.

const THRESHOLD = 70;
const MAX = 120;

export function PullToRefresh() {
  const { mutate } = useSWRConfig();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const armedRef = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      if (window.scrollY > 0) {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) return;
      const eased = Math.min(MAX, Math.sqrt(dy) * 9);
      pullRef.current = eased;
      setPull(eased);
      // Single tick the moment we cross the trigger threshold while pulling.
      if (!armedRef.current && eased >= THRESHOLD) {
        armedRef.current = true;
        haptic();
      } else if (armedRef.current && eased < THRESHOLD) {
        armedRef.current = false;
      }
    }

    function onTouchEnd() {
      armedRef.current = false;
      if (pullRef.current >= THRESHOLD) {
        haptic("medium");
        setRefreshing(true);
        // Revalidate all SWR keys — dashboards re-fetch without a page reload.
        mutate(() => true, undefined, { revalidate: true }).finally(() => {
          setRefreshing(false);
          pullRef.current = 0;
          setPull(0);
        });
      } else {
        pullRef.current = 0;
        setPull(0);
      }
      startY.current = null;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mutate]);

  if (pull === 0 && !refreshing) return null;

  const ready = refreshing || pull >= THRESHOLD;
  const rotation = refreshing ? undefined : pull * 3;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-end justify-center overflow-hidden"
      style={{ height: `${refreshing ? 50 : pull}px` }}
    >
      <div className="mb-2 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur">
        <svg
          className={`text-muted-foreground ${refreshing ? "animate-spin" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={rotation !== undefined ? { transform: `rotate(${rotation}deg)` } : undefined}
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={ready ? "28 10" : `${Math.min(pull / THRESHOLD, 1) * 28} 10`}
            strokeLinecap="round"
          />
        </svg>
        {!refreshing && (
          <span className="text-xs font-medium text-muted-foreground">
            {ready ? "Release" : "Pull"}
          </span>
        )}
      </div>
    </div>
  );
}
