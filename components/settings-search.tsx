"use client";

/**
 * Settings search bar — a single text input that fuzzy-filters every
 * leaf in the registered schemas and jumps to the card that owns it.
 * Mounted at the top of the settings dashboard. Closes on Escape, on
 * blur (after a result click), or after navigating to a card.
 */

import { Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  filterEntries,
  type SearchEntry,
} from "@/lib/settings/search-index";

interface Props {
  /** All searchable leaves across the registered schemas. */
  entries: SearchEntry[];
}

export function SettingsSearch({ entries }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => filterEntries(entries, query).slice(0, 8), [entries, query]);
  const showResults = open && query.trim().length > 0;

  function jumpTo(cardId: string) {
    const el = document.getElementById(cardId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Brief flash so the user can see what landed.
      el.classList.add("ring-2", "ring-foreground/40");
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-foreground/40");
      }, 1200);
    }
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative mb-3">
      <label htmlFor={inputId} className="sr-only">
        Search settings
      </label>
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Enter" && matches.length > 0) {
              jumpTo(matches[0].cardId);
            }
          }}
          // Delay close so a click on a result registers.
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search settings — protein, theme, sleep, …"
          className="w-full rounded-lg border border-input bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showResults && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-md">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {matches.map((m, idx) => (
                <li key={`${m.cardId}-${m.breadcrumb}-${idx}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => jumpTo(m.cardId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{m.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.breadcrumb}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
