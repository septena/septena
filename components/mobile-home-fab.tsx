"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavSections } from "@/hooks/use-sections";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressFired = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Close menu on route change (user tapped a section link).
  useEffect(() => {
    setMenuOpen(false);
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
    // Short tap → navigate home.
    router.push("/septena");
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
            href="/septena"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-semibold shadow-md backdrop-blur"
          >
            <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden />
            Home
          </Link>
          {visibleSections.map((s) => {
            const active = pathname === s.path || pathname.startsWith(s.path + "/");
            return (
              <Link
                key={s.key}
                href={s.path}
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
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerLeave}
        onPointerLeave={handlePointerLeave}
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
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6 transition-transform"
          >
            <circle cx="6" cy="6" r="1.8" />
            <circle cx="12" cy="6" r="1.8" />
            <circle cx="18" cy="6" r="1.8" />
            <circle cx="6" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="18" cy="12" r="1.8" />
            <circle cx="6" cy="18" r="1.8" />
            <circle cx="12" cy="18" r="1.8" />
            <circle cx="18" cy="18" r="1.8" />
          </svg>
        )}
      </button>
    </>
  );
}
