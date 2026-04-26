"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE, findSwatchByValue } from "@/lib/palette";

type OtherUsage = { label: string; value: string };

/** Compact picker: a single round trigger showing the current color.
 *  Click opens a floating grid of swatches; selecting one closes it.
 *
 *  `others` lets a caller mark colors that are already taken elsewhere
 *  (e.g. by other sections or other macros) with a small dot on the
 *  swatch — soft guidance, not a hard block. */
export function PaletteSwatchGrid({
  value,
  onChange,
  others = [],
}: {
  value: string;
  onChange: (value: string) => void;
  others?: OtherUsage[];
}) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = findSwatchByValue(value);
  const takenByValue = new Map<string, string[]>();
  for (const o of others) {
    const v = o.value?.toLowerCase();
    if (!v) continue;
    const arr = takenByValue.get(v) ?? [];
    arr.push(o.label);
    takenByValue.set(v, arr);
  }

  // Close on outside click / Escape. Listeners only bind while open so
  // closed pickers don't add noise on every render.
  useEffect(() => {
    if (!open) return;
    const trigger = rootRef.current?.querySelector("button");
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setFlipUp(spaceBelow < 220 && rect.top > spaceBelow);
    }
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `Color: ${selected.label}` : "Pick a color"}
        title={selected?.label ?? "Pick a color"}
        className="h-8 w-8 shrink-0 rounded-full border border-border shadow-sm transition-transform hover:scale-105"
        style={{ backgroundColor: value }}
      />

      {open && (
        <div
          role="listbox"
          className={
            "absolute left-0 z-50 w-max max-w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-2 shadow-lg " +
            (flipUp ? "bottom-10" : "top-10")
          }
        >
          <div className="grid grid-cols-8 gap-1.5">
            {PALETTE.map((s) => {
              const isSelected = selected?.id === s.id;
              const taken = takenByValue.get(s.value.toLowerCase());
              const title = taken?.length ? `${s.label} — used by ${taken.join(", ")}` : s.label;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(s.value);
                    setOpen(false);
                  }}
                  aria-label={title}
                  title={title}
                  className={
                    "relative h-7 w-7 shrink-0 rounded-full border transition-transform hover:scale-110 " +
                    (isSelected
                      ? "border-foreground ring-2 ring-foreground/70 ring-offset-2 ring-offset-popover"
                      : "border-border")
                  }
                  style={{ backgroundColor: s.value }}
                >
                  {taken && !isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-popover bg-foreground"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
