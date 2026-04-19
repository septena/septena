"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  accent: string;
  children: React.ReactNode;
  /** Optional footer rendered in the sticky action row. If omitted, the form
   *  is expected to render its own actions inside `children`. */
  footer?: React.ReactNode;
};

/** Shared bottom-sheet on mobile, centered dialog ≥sm.
 *
 *  - Backdrop click closes.
 *  - Escape closes.
 *  - Body scroll is locked while open.
 *  - Safe-area padding on the bottom so the sheet clears home-indicator on iOS.
 *  - Accent color tints the grabber + header rule so it reads as the section.
 */
export function QuickLogModal({ open, onClose, title, accent, children, footer }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
      />

      <div
        ref={dialogRef}
        className={cn(
          "relative z-10 w-full bg-background shadow-2xl",
          "rounded-t-3xl sm:rounded-2xl",
          "sm:max-w-md sm:mx-4",
          "max-h-[90vh] flex flex-col",
          "animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in",
        )}
      >
        {/* Grabber + header */}
        <div className="shrink-0 px-5 pt-3">
          <div
            className="mx-auto mb-3 h-1 w-10 rounded-full opacity-40 sm:hidden"
            style={{ backgroundColor: accent }}
          />
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              // 44×44 tap area; the hover/focus chrome is on the visible inner
              // circle so the button doesn't feel oversized.
              className="-mr-2 flex h-11 w-11 items-center justify-center"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                ✕
              </span>
            </button>
          </div>
          <div
            className="mt-3 h-0.5 rounded-full opacity-20"
            style={{ backgroundColor: accent }}
          />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Sticky footer (optional) + safe-area inset */}
        {footer && (
          <div className="shrink-0 border-t border-border bg-background px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
        {!footer && (
          <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>,
    document.body,
  );
}
