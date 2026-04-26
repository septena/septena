"use client";

import { useCallback } from "react";
import { Plus, X } from "lucide-react";
import type { DayPhase } from "@/lib/api";
import { hmToMinutes } from "@/lib/day-phases";

/**
 * Times-of-day editor.
 *
 * Phases hold label/emoji/greeting/subtitles. Time boundaries between
 * adjacent phases are stored once as `boundaries[i]` (the divider between
 * phase i and i+1), so the same time can't drift apart on two sides.
 * `dayEnd` is the trailing cutoff (bedtime) for the last phase.
 */
export function DayPhasesEditor({
  phases,
  boundaries,
  dayEnd,
  onChange,
  color,
}: {
  phases: DayPhase[];
  boundaries: string[];
  dayEnd: string;
  onChange: (next: { phases: DayPhase[]; boundaries: string[]; dayEnd: string }) => void;
  color?: string;
}) {
  const phaseStart = (i: number): string =>
    i === 0 ? "00:00" : boundaries[i - 1] ?? "00:00";
  const phaseEnd = (i: number): string =>
    i === phases.length - 1 ? dayEnd : boundaries[i] ?? dayEnd;

  const updatePhase = useCallback(
    (idx: number, patch: Partial<DayPhase>) => {
      onChange({
        phases: phases.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
        boundaries,
        dayEnd,
      });
    },
    [phases, boundaries, dayEnd, onChange],
  );

  const updateBoundary = useCallback(
    (idx: number, value: string) => {
      const next = [...boundaries];
      // Clamp so dividers stay strictly increasing — drag past a neighbour
      // would otherwise let phase i overlap phase i+1.
      const minutes = hmToMinutes(value);
      const prevMin = idx === 0 ? 1 : hmToMinutes(next[idx - 1]) + 1;
      const nextMin = idx === next.length - 1 ? hmToMinutes(dayEnd) - 1 : hmToMinutes(next[idx + 1]) - 1;
      const clamped = Math.max(prevMin, Math.min(nextMin, minutes));
      next[idx] = `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
      onChange({ phases, boundaries: next, dayEnd });
    },
    [phases, boundaries, dayEnd, onChange],
  );

  const removePhase = useCallback(
    (idx: number) => {
      if (phases.length <= 1) return;
      const nextPhases = phases.filter((_, i) => i !== idx);
      // Drop the divider that bordered this phase. Removing the last
      // phase drops the trailing divider; otherwise drop the one between
      // this phase and the next, so the previous phase now flows into
      // what used to be the following phase.
      const dividerIdx = idx === phases.length - 1 ? idx - 1 : idx;
      const nextBoundaries = boundaries.filter((_, i) => i !== dividerIdx);
      onChange({ phases: nextPhases, boundaries: nextBoundaries, dayEnd });
    },
    [phases, boundaries, dayEnd, onChange],
  );

  const addPhase = useCallback(() => {
    const last = phases[phases.length - 1];
    const lastEnd = phaseEnd(phases.length - 1);
    const lastEndMin = hmToMinutes(lastEnd);
    // New phase squeezes in between the last existing boundary and dayEnd.
    // The new internal divider takes the prior dayEnd; dayEnd nudges 1h
    // forward so the new phase has at least some room.
    const newDividerMin = lastEndMin;
    const newDividerHM = `${String(Math.floor(newDividerMin / 60)).padStart(2, "0")}:${String(newDividerMin % 60).padStart(2, "0")}`;
    const newDayEndMin = Math.min(23 * 60 + 59, lastEndMin + 60);
    const newDayEnd = `${String(Math.floor(newDayEndMin / 60)).padStart(2, "0")}:${String(newDayEndMin % 60).padStart(2, "0")}`;
    const fresh: DayPhase = {
      id: `phase-${Date.now().toString(36)}`,
      label: "New phase",
      emoji: "🕒",
      greeting: "",
      subtitles: [],
    };
    onChange({
      phases: [...phases, fresh],
      boundaries: [...boundaries, newDividerHM],
      dayEnd: newDayEnd,
    });
    void last;
  }, [phases, boundaries, dayEnd, onChange]);

  return (
    <div className="space-y-2">
      {phases.map((phase, idx) => (
        <div key={phase.id || idx}>
          <PhaseCard
            phase={phase}
            start={phaseStart(idx)}
            end={phaseEnd(idx)}
            onChange={(patch) => updatePhase(idx, patch)}
            onRemove={phases.length > 1 ? () => removePhase(idx) : null}
            color={color}
          />
          {idx < phases.length - 1 && (
            <BoundaryDivider
              value={boundaries[idx] ?? "12:00"}
              min={phaseStart(idx)}
              max={phaseEnd(idx + 1)}
              onChange={(v) => updateBoundary(idx, v)}
            />
          )}
        </div>
      ))}
      <DayEndRow
        value={dayEnd}
        min={phases.length > 1 ? boundaries[boundaries.length - 1] : "00:01"}
        onChange={(v) => onChange({ phases, boundaries, dayEnd: v })}
      />
      <button
        type="button"
        onClick={addPhase}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        <Plus size={14} aria-hidden /> Add phase
      </button>
    </div>
  );
}

function PhaseCard({
  phase,
  start,
  end,
  onChange,
  onRemove,
  color,
}: {
  phase: DayPhase;
  start: string;
  end: string;
  onChange: (patch: Partial<DayPhase>) => void;
  onRemove: (() => void) | null;
  color?: string;
}) {
  const subs = phase.subtitles ?? [];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={phase.emoji}
          onChange={(e) => onChange({ emoji: e.target.value })}
          aria-label="Emoji"
          className="w-10 rounded-md border border-input bg-background px-1.5 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          type="text"
          value={phase.label}
          onChange={(e) => onChange({ label: e.target.value })}
          aria-label="Label"
          placeholder="Label"
          className="min-w-[6rem] flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
          style={color ? { color } : undefined}
        />
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">
          {start} – {end}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove"
            aria-label="Remove"
            className="ml-auto rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-red-400 hover:text-red-500"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2 pl-2">
        <input
          type="text"
          value={phase.greeting}
          onChange={(e) => onChange({ greeting: e.target.value })}
          aria-label="Greeting"
          placeholder="Greeting (e.g. Good morning)"
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="space-y-1">
          {subs.map((sub, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">·</span>
              <input
                type="text"
                value={sub}
                onChange={(e) => {
                  const next = [...subs];
                  next[i] = e.target.value;
                  onChange({ subtitles: next });
                }}
                aria-label={`Subtitle ${i + 1}`}
                placeholder="Subtitle"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => onChange({ subtitles: subs.filter((_, j) => j !== i) })}
                title="Remove subtitle"
                aria-label="Remove subtitle"
                className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:border-red-400 hover:text-red-500"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ subtitles: [...subs, ""] })}
            className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            <Plus size={10} aria-hidden /> Add subtitle
          </button>
        </div>
      </div>
    </div>
  );
}

function BoundaryDivider({
  value,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-1 pr-1">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="select-none">⇕</span>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Boundary"
          className="rounded-md border border-input bg-background px-1.5 py-0.5 font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-datetime-edit-ampm-field]:hidden"
        />
      </label>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

function DayEndRow({
  value,
  onChange,
}: {
  value: string;
  min: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 pl-3 pr-1 pt-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Bedtime</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Bedtime"
        className="rounded-md border border-input bg-background px-1.5 py-0.5 font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-datetime-edit-ampm-field]:hidden"
      />
    </div>
  );
}
