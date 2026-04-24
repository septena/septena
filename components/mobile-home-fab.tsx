"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { SeptenaMark } from "@/components/septena-mark";
import { useNavSections } from "@/hooks/use-sections";
import { useDemoHref } from "@/hooks/use-demo-href";

/** Floating home button for mobile PWA navigation.
 *
 *  - Tap          → navigate to `/`.
 *  - Long-press   → open a vertical menu of all sections.
 *  - Right-click  → same menu, for desktop convenience (hidden on ≥sm normally).
 *
 *  Appears on sub-pages only, respects safe-area-inset-bottom, `sm:hidden` so
 *  desktop keeps relying on the sticky top nav.
 */
const LONG_PRESS_MS = 450;

export function MobileHomeFab() {
  const pathname = usePathname();
  // Same source of truth as the topnav tabs — enabled + ordered by
  // user's section_order from settings.
  const visibleSections = useNavSections();
  const router = useRouter();
  const toHref = useDemoHref();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const longPressFired = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markWrapRef = useRef<HTMLSpanElement>(null);
  const spinRef = useRef(0);

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    longPressFired.current = true;
    setMenuOpen(true);
    try {
      (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate?.(12);
    } catch {}
  }, []);

  useEffect(() => {
    // Cleanup a dangling timer on unmount or route change.
    return () => clearPressTimer();
  }, [clearPressTimer]);

  const closeMenu = useEffectEvent(() => {
    setMenuOpen(false);
  });

  // Close menu on route change (user tapped a section link).
  useEffect(() => {
    closeMenu();
  }, [pathname]);


  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return; // ignore non-primary mouse buttons
    longPressFired.current = false;
    clearPressTimer();
    pressTimer.current = setTimeout(openMenu, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    clearPressTimer();
    if (longPressFired.current) return;
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    // Short tap → kick off navigation immediately; color swap + spin play alongside.
    router.push(toHref("/septena"));
    setSpinning(true);
    const el = markWrapRef.current;
    if (el) {
      window.setTimeout(() => {
        spinRef.current += 360;
        el.style.transition = "transform 1000ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = `rotate(${spinRef.current}deg)`;
      }, 200);
    }
    window.setTimeout(() => setSpinning(false), 1300);
  };

  const handlePointerLeave = () => {
    clearPressTimer();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu();
  };

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
        />
      )}

      {menuOpen && (
        <div
          role="menu"
          className="fixed z-50 flex select-none flex-col-reverse items-end gap-2 sm:hidden"
          style={{
            right: "1rem",
            bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          <Link
            href={toHref("/septena")}
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-semibold shadow-md backdrop-blur"
          >
            <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden />
            Home
          </Link>
          {visibleSections.map((s) => {
            const href = toHref(s.path);
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={s.key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium shadow-md backdrop-blur"
                style={
                  active
                    ? { borderColor: s.color, backgroundColor: s.color, color: "white" }
                    : { borderColor: "var(--border)" }
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: active ? "white" : s.color }}
                  aria-hidden
                />
                {s.label}
              </Link>
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-label={menuOpen ? "Close section menu" : "Home · long-press for sections"}
        title="Tap: Home · Hold: section menu"
        onPointerDown={(e) => { setPressed(true); handlePointerDown(e); }}
        onPointerUp={() => { setPressed(false); handlePointerUp(); }}
        onPointerCancel={() => { setPressed(false); clearPressTimer(); }}
        onPointerLeave={() => setPressed(false)}
        onContextMenu={handleContextMenu}
        className="fixed right-4 z-50 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition-transform active:scale-95 sm:hidden"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {menuOpen ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 rotate-45 transition-transform"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        ) : (
          <span ref={markWrapRef} className="inline-flex h-8 w-8">
            <SeptenaMark className="h-8 w-8" variant={pressed || menuOpen || spinning ? "spectrum" : "currentColor"} />
          </span>
        )}
      </button>
    </>
  );
}
