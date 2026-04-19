"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SECTION_LIST } from "@/lib/sections";

const SWIPE_THRESHOLD = 50;
const CHAIN_KEY = "setlist:swipe-chain";

function readChain(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(CHAIN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeChain(paths: string[]) {
  try {
    sessionStorage.setItem(CHAIN_KEY, JSON.stringify(paths));
  } catch {}
}

export function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef<number | null>(null);
  const [indicator, setIndicator] = useState<"left" | "right" | null>(null);
  const isSwipingRef = useRef(false);

  const currentIdx = SECTION_LIST.findIndex(
    (s) => pathname === s.path || pathname.startsWith(s.path + "/")
  );

  // Init chain with current page; deduplicate
  useEffect(() => {
    const chain = readChain().filter((p) => p !== pathname);
    writeChain([...chain, pathname]);
  }, [pathname]);

  // Intercept browser back — follow swipe chain instead of raw history
  useEffect(() => {
    function handlePopState() {
      // If the pop was triggered by our own router.push (isSwipingRef),
      // the URL already matches the chain — just trim and continue.
      if (isSwipingRef.current) {
        isSwipingRef.current = false;
        return;
      }

      const chain = readChain();
      if (chain.length <= 1) return; // natural exit from app

      // URL has already changed to chain[chain.length - 2]
      const prev = chain[chain.length - 2];
      writeChain(chain.slice(0, -1)); // trim current from chain
      router.replace(prev); // push it back on top
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
    }

    function onTouchEnd(e: TouchEvent) {
      if (touchStartX.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      setIndicator(null);

      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

      if (deltaX < 0 && currentIdx < SECTION_LIST.length - 1) {
        setIndicator("right");
        isSwipingRef.current = true;
        const next = SECTION_LIST[currentIdx + 1].path;
        setTimeout(() => {
          setIndicator(null);
          const chain = readChain();
          writeChain([...chain, next]);
          router.push(next);
        }, 160);
      } else if (deltaX > 0 && currentIdx > 0) {
        setIndicator("left");
        isSwipingRef.current = true;
        const prev = SECTION_LIST[currentIdx - 1].path;
        setTimeout(() => {
          setIndicator(null);
          const chain = readChain();
          writeChain([...chain, prev]);
          router.push(prev);
        }, 160);
      }
    }

    if ("ontouchstart" in window) {
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchend", onTouchEnd, { passive: true });
    }

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [currentIdx, router]);

  const isFirst = currentIdx === 0;
  const isLast = currentIdx === SECTION_LIST.length - 1;

  return (
    <>
      {/* Directional swipe indicator */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 transition-all duration-150"
        style={{
          opacity: indicator ? 1 : 0,
          background:
            indicator === "left"
              ? "linear-gradient(to right, rgba(0,0,0,0.04) 0%, transparent 30%)"
              : "linear-gradient(to left, rgba(0,0,0,0.04) 0%, transparent 30%)",
        }}
      >
        <div
          className="absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full shadow-sm"
          style={{
            backgroundColor:
              indicator === "left"
                ? SECTION_LIST[currentIdx - 1]?.color ?? "#ccc"
                : SECTION_LIST[currentIdx + 1]?.color ?? "#ccc",
            opacity: 0.85,
            left: indicator === "left" ? 12 : undefined,
            right: indicator === "right" ? 12 : undefined,
          }}
        >
          <span className="text-xl font-light text-white">
            {indicator === "left" ? "‹" : "›"}
          </span>
        </div>
      </div>

      {/* Edge blockers at boundaries */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 24,
          zIndex: 40,
          pointerEvents: isFirst ? "none" : "auto",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 24,
          zIndex: 40,
          pointerEvents: isLast ? "none" : "auto",
        }}
      />

      {children}
    </>
  );
}
