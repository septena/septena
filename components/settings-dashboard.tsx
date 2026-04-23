"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, PanelTop } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import useSWR, { mutate as globalMutate } from "swr";
import { useSections, useSectionColor } from "@/hooks/use-sections";
import {
  type AppSettings,
  type AppTheme,
  type DayPhase,
  getCalendar,
  getChores,
  getHabitConfig,
  getSettings,
  getSupplementConfig,
  saveSettings,
} from "@/lib/api";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { DEFAULT_DAY_PHASES } from "@/lib/day-phases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SaveRow } from "@/components/save-row";
import { cn } from "@/lib/utils";

// Shared input styling — consistent width so value columns align across rows.
const NUM_INPUT_CLASS =
  "w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring";

function parseNum(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Single-value row used for point targets (Z2 min, sleep hours, etc.). */
function TargetField({
  label,
  value,
  unit,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">
        {label}
        {unit && <span className="ml-1 text-xs text-muted-foreground">({unit})</span>}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(parseNum(e.target.value, value))}
          className={NUM_INPUT_CLASS}
        />
      </span>
    </label>
  );
}

/** Two-value row: label | min – max | unit. Enforces min ≤ max on blur so the
 *  range stays coherent even if the user types a larger value into the min
 *  field first. Keeps the two numbers visually tied as one control. */
function RangeField({
  label,
  min,
  max,
  unit,
  onMinChange,
  onMaxChange,
  step = 1,
  hardMin = 0,
}: {
  label: string;
  min: number;
  max: number;
  unit?: string;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  step?: number;
  hardMin?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">
        {label}
        {unit && <span className="ml-1 text-xs text-muted-foreground">({unit})</span>}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          min={hardMin}
          value={min}
          onChange={(e) => onMinChange(parseNum(e.target.value, min))}
          onBlur={() => {
            if (min > max) onMaxChange(min);
          }}
          aria-label={`${label} min`}
          className={NUM_INPUT_CLASS}
        />
        <span aria-hidden className="text-muted-foreground">–</span>
        <input
          type="number"
          step={step}
          min={min}
          value={max}
          onChange={(e) => onMaxChange(parseNum(e.target.value, max))}
          onBlur={() => {
            if (max < min) onMinChange(max);
          }}
          aria-label={`${label} max`}
          className={NUM_INPUT_CLASS}
        />
      </span>
    </div>
  );
}


function ToggleRow({
  label,
  description,
  checked,
  onChange,
  color,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border transition-colors"
        style={{ backgroundColor: checked ? color : "transparent" }}
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(1.25rem)" : "translateX(0.15rem)" }}
        />
      </button>
    </label>
  );
}

function Pill<T extends string>({
  options,
  value,
  onChange,
  color,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  color: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={value === o.value ? { backgroundColor: color, color: "white" } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CalendarConfigCard({
  showAllDay,
  enabledCalendars,
  onChange,
}: {
  showAllDay: boolean;
  enabledCalendars: string[] | null;
  onChange: (p: Partial<AppSettings["calendar"]>) => void;
}) {
  const { data } = useSWR("settings-calendar-list", getCalendar, {
    shouldRetryOnError: false,
  });
  // Live color from /api/sections, not the static SECTIONS fallback —
  // honors user customisation in settings.yaml.
  const color = useSectionColor("calendar");
  const cals = data?.calendars ?? [];

  const isEnabled = (title: string) =>
    enabledCalendars === null ? true : enabledCalendars.includes(title);

  const toggleCal = (title: string, next: boolean) => {
    // First toggle off materializes the allowlist from the full set.
    const base = enabledCalendars ?? cals.map((c) => c.title);
    const updated = next ? [...base, title] : base.filter((t) => t !== title);
    const all = cals.map((c) => c.title);
    // If every calendar is selected, collapse back to `null` (= show all).
    const collapsed = all.length > 0 && all.every((t) => updated.includes(t)) ? null : updated;
    onChange({ enabled_calendars: collapsed });
  };

  // Group by source (iCloud, Gmail, etc.) for readability.
  const grouped = cals.reduce<Record<string, typeof cals>>((acc, c) => {
    (acc[c.source || "Other"] ??= []).push(c);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Calendar</CardTitle>
        <p className="text-xs text-muted-foreground">What shows up in the calendar tile.</p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <ToggleRow
            label="All-day events"
            description="Include birthdays, holidays, and multi-day blocks."
            checked={showAllDay}
            onChange={(v) => onChange({ show_all_day: v })}
            color={color}
          />
        </div>

        {data?.error ? (
          <p className="mt-4 text-sm text-muted-foreground">{data.error}</p>
        ) : cals.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading calendars…</p>
        ) : (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Show calendars
            </p>
            <div className="mt-2 space-y-4">
              {Object.entries(grouped).map(([source, items]) => (
                <div key={source}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{source}</p>
                  <div className="mt-1 divide-y divide-border/60">
                    {items.map((c) => (
                      <ToggleRow
                        key={`${source}-${c.title}`}
                        label={c.title}
                        checked={isEnabled(c.title)}
                        onChange={(v) => toggleCal(c.title, v)}
                        color={color}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsDashboard() {
  const { setTheme } = useTheme();
  const sectionsMeta = useSections();
  // Live color from /api/sections, not the static SECTIONS fallback —
  // honors user customisation in settings.yaml.
  const correlationsColor = useSectionColor("correlations");
  const weatherColor = useSectionColor("weather");
  const trainingColor = useSectionColor("training");
  const nutritionColor = useSectionColor("nutrition");
  const { data, isLoading, mutate } = useSWR("settings", getSettings);
  const { data: habitsCfg } = useSWR("habits-config", getHabitConfig);
  const { data: supplCfg } = useSWR("supplements-config", getSupplementConfig);
  const { data: choresList } = useSWR("chores-list", getChores);
  const counts: Partial<Record<SectionKey, number>> = {
    habits: habitsCfg?.total,
    supplements: supplCfg?.total,
    chores: choresList?.total,
  };
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data || sectionsMeta.length === 0) return;
    // /api/sections is the single source of truth for what a section is —
    // it merges code-side wiring, settings metadata, and any backend
    // `_local` extensions. Hydrate section_order by taking the current
    // order first and appending any registry keys it doesn't yet mention,
    // so newly-registered sections auto-appear without touching code. The
    // merge runs whenever the registry grows (e.g. once /api/sections
    // resolves after the initial settings.yaml fallback), so late-arriving
    // extension keys get picked up without blowing away the user's edits.
    const registryKeys = sectionsMeta.map((s) => s.key).filter((k) => k !== "correlations");
    const registrySet = new Set(registryKeys);
    const baseOrder = draft?.section_order ?? data.section_order ?? [];
    const ordered = baseOrder.filter((k) => registrySet.has(k));
    const orderedSet = new Set(ordered);
    const mergedOrder = [
      ...ordered,
      ...registryKeys.filter((k) => !orderedSet.has(k)),
    ] as SectionKey[];
    if (!draft) {
      setDraft({
        ...data,
        section_order: mergedOrder,
        // Back-fill day_phases from code-side defaults when the backend
        // hasn't been restarted with the new DEFAULT_SETTINGS — keeps the
        // editor from rendering an empty card on stale servers.
        day_phases: data.day_phases?.length ? data.day_phases : DEFAULT_DAY_PHASES,
      });
    } else if (
      mergedOrder.length !== draft.section_order.length ||
      mergedOrder.some((k, i) => k !== draft.section_order[i])
    ) {
      setDraft({ ...draft, section_order: mergedOrder });
    }
  }, [data, draft, sectionsMeta]);

  const patch = useCallback((p: Partial<AppSettings>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setSaved(false);
  }, []);

  const patchTargets = useCallback((p: Partial<AppSettings["targets"]>) => {
    setDraft((d) => (d ? { ...d, targets: { ...d.targets, ...p } } : d));
    setSaved(false);
  }, []);

  const patchAnimations = useCallback((p: Partial<AppSettings["animations"]>) => {
    setDraft((d) => (d ? { ...d, animations: { ...d.animations, ...p } } : d));
    setSaved(false);
  }, []);

  const patchCalendar = useCallback((p: Partial<AppSettings["calendar"]>) => {
    setDraft((d) => (d ? { ...d, calendar: { ...d.calendar, ...p } } : d));
    setSaved(false);
  }, []);

  const patchWeather = useCallback((p: Partial<AppSettings["weather"]>) => {
    setDraft((d) => (d ? { ...d, weather: { ...d.weather, ...p } } : d));
    setSaved(false);
  }, []);

  const patchPhase = useCallback((idx: number, p: Partial<DayPhase>) => {
    setDraft((d) => {
      if (!d) return d;
      const phases = [...(d.day_phases ?? [])];
      if (idx < 0 || idx >= phases.length) return d;
      phases[idx] = { ...phases[idx], ...p };
      return { ...d, day_phases: phases };
    });
    setSaved(false);
  }, []);

  const addPhase = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const phases = [...(d.day_phases ?? [])];
      const existingIds = new Set(phases.map((p) => p.id));
      let id = "phase";
      let n = phases.length + 1;
      while (existingIds.has(`${id}-${n}`)) n += 1;
      phases.push({
        id: `${id}-${n}`,
        label: `Phase ${n}`,
        emoji: "🕒",
        start: "00:00",
        cutoff: "23:59",
        messages: [],
      });
      return { ...d, day_phases: phases };
    });
    setSaved(false);
  }, []);

  const removePhase = useCallback((idx: number) => {
    setDraft((d) => {
      if (!d) return d;
      const phases = [...(d.day_phases ?? [])];
      phases.splice(idx, 1);
      return { ...d, day_phases: phases };
    });
    setSaved(false);
  }, []);

  const setSectionVisibility = useCallback(
    (
      key: SectionKey,
      surface: "show_in_nav" | "show_on_dashboard",
      value: boolean,
      /** Currently-resolved visibility for BOTH surfaces. We pin both so the
       *  un-toggled surface doesn't silently fall back to auto-detect when we
       *  drop the legacy `enabled` field. */
      resolved: { show_in_nav: boolean; show_on_dashboard: boolean },
    ) => {
      setDraft((d) => {
        if (!d) return d;
        const prev = d.sections?.[key] ?? { label: "", emoji: "", color: "", tagline: "" };
        const { enabled: _legacy, ...rest } = prev;
        return {
          ...d,
          sections: {
            ...d.sections,
            [key]: {
              ...rest,
              show_in_nav: resolved.show_in_nav,
              show_on_dashboard: resolved.show_on_dashboard,
              [surface]: value,
            },
          },
        };
      });
      setSaved(false);
    },
    [],
  );

  const moveSection = useCallback((key: string, dir: -1 | 1) => {
    setDraft((d) => {
      if (!d) return d;
      const order = [...d.section_order];
      const i = order.indexOf(key);
      if (i < 0) return d;
      const j = i + dir;
      if (j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, section_order: order };
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const fresh = await saveSettings(draft);
      setDraft(fresh);
      mutate(fresh, false);
      globalMutate("settings");
      setSaved(true);
      setTheme(fresh.theme);
    } finally {
      setSaving(false);
    }
  }, [draft, saving, mutate, setTheme]);

  if (isLoading || !draft) {
    return (
      <>
        <PageHeader title="Settings" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  const accent = correlationsColor;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          <>
            Stored in <code className="rounded bg-muted px-1">Settings/settings.yaml</code> — you can edit on disk too.
          </>
        }
      />

      <div className="space-y-4">
        {/* Sections — list, reorder, toggle visibility, link to per-section editors. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sections</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tap to edit color/label/tagline. Arrows reorder nav + homepage.
              Left icon toggles the top nav tab; right icon toggles the homepage tile.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {draft.section_order
                .filter((k): k is SectionKey => sectionsMeta.some((s) => s.key === k))
                .map((key, i, arr) => {
                  const meta = sectionsMeta.find((s) => s.key === key)!;
                  const emoji = "emoji" in meta ? meta.emoji : "";
                  // Enabled state: explicit user override wins; otherwise fall
                  // back to whatever the registry (/api/sections) resolved to.
                  // Resolve each surface: draft override wins, then the
                  // registry's split flag, then legacy `enabled`, then true.
                  const draftSection = draft.sections?.[key];
                  const metaNav = "show_in_nav" in meta ? meta.show_in_nav !== false : true;
                  const metaDash = "show_on_dashboard" in meta ? meta.show_on_dashboard !== false : true;
                  const navOverride = draftSection?.show_in_nav;
                  const dashOverride = draftSection?.show_on_dashboard;
                  const legacyOverride = draftSection?.enabled;
                  const showInNav = typeof navOverride === "boolean"
                    ? navOverride
                    : typeof legacyOverride === "boolean"
                      ? legacyOverride
                      : metaNav;
                  const showOnDashboard = typeof dashOverride === "boolean"
                    ? dashOverride
                    : typeof legacyOverride === "boolean"
                      ? legacyOverride
                      : metaDash;
                  const anyVisible = showInNav || showOnDashboard;
                  return (
                    <li
                      key={key}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2",
                        !anyVisible && "opacity-60",
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                      {emoji && <span aria-hidden className="text-base leading-none">{emoji}</span>}
                      <Link
                        href={`/septena/settings/${key}`}
                        className="flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {meta.label}
                        {counts[key] !== undefined && (
                          <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                            ({counts[key]})
                          </span>
                        )}
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setSectionVisibility(key, "show_in_nav", !showInNav, {
                            show_in_nav: showInNav,
                            show_on_dashboard: showOnDashboard,
                          })
                        }
                        aria-label={showInNav ? "Hide from nav" : "Show in nav"}
                        aria-pressed={showInNav}
                        title={showInNav ? "In top nav — click to hide" : "Hidden from top nav — click to show"}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-muted",
                          !showInNav && "text-muted-foreground opacity-50",
                        )}
                      >
                        <PanelTop size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSectionVisibility(key, "show_on_dashboard", !showOnDashboard, {
                            show_in_nav: showInNav,
                            show_on_dashboard: showOnDashboard,
                          })
                        }
                        aria-label={showOnDashboard ? "Hide from dashboard" : "Show on dashboard"}
                        aria-pressed={showOnDashboard}
                        title={showOnDashboard ? "On homepage — click to hide" : "Hidden from homepage — click to show"}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-muted",
                          !showOnDashboard && "text-muted-foreground opacity-50",
                        )}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveSection(key, -1)}
                        aria-label="Move up"
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm",
                          i === 0 ? "opacity-40" : "hover:bg-muted",
                        )}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === arr.length - 1}
                        onClick={() => moveSection(key, 1)}
                        aria-label="Move down"
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm",
                          i === arr.length - 1 ? "opacity-40" : "hover:bg-muted",
                        )}
                      >
                        ↓
                      </button>
                    </li>
                  );
                })}
            </ul>
          </CardContent>
        </Card>

        {/* Targets */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Targets</CardTitle>
            <p className="text-xs text-muted-foreground">Daily macros, training, sleep, cannabis.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <section>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Macros <span className="text-muted-foreground/70">· daily min–max</span>
              </p>
              <div className="divide-y divide-border/60">
                <RangeField
                  label="Protein"
                  unit="g"
                  min={draft.targets.protein_min_g}
                  max={draft.targets.protein_max_g}
                  onMinChange={(v) => patchTargets({ protein_min_g: v })}
                  onMaxChange={(v) => patchTargets({ protein_max_g: v })}
                />
                <RangeField
                  label="Fat"
                  unit="g"
                  min={draft.targets.fat_min_g}
                  max={draft.targets.fat_max_g}
                  onMinChange={(v) => patchTargets({ fat_min_g: v })}
                  onMaxChange={(v) => patchTargets({ fat_max_g: v })}
                />
                <RangeField
                  label="Carbs"
                  unit="g"
                  min={draft.targets.carbs_min_g}
                  max={draft.targets.carbs_max_g}
                  onMinChange={(v) => patchTargets({ carbs_min_g: v })}
                  onMaxChange={(v) => patchTargets({ carbs_max_g: v })}
                />
                <RangeField
                  label="Kcal"
                  step={10}
                  min={draft.targets.kcal_min}
                  max={draft.targets.kcal_max}
                  onMinChange={(v) => patchTargets({ kcal_min: v })}
                  onMaxChange={(v) => patchTargets({ kcal_max: v })}
                />
              </div>
            </section>

            <section>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Body</p>
              <div className="divide-y divide-border/60">
                <RangeField
                  label="Weight"
                  unit="kg"
                  step={0.5}
                  min={draft.targets.weight_min_kg}
                  max={draft.targets.weight_max_kg}
                  onMinChange={(v) => patchTargets({ weight_min_kg: v })}
                  onMaxChange={(v) => patchTargets({ weight_max_kg: v })}
                />
                <RangeField
                  label="Body fat"
                  unit="%"
                  step={0.5}
                  min={draft.targets.fat_min_pct}
                  max={draft.targets.fat_max_pct}
                  onMinChange={(v) => patchTargets({ fat_min_pct: v })}
                  onMaxChange={(v) => patchTargets({ fat_max_pct: v })}
                />
              </div>
            </section>

            <section>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Other</p>
              <div className="divide-y divide-border/60">
                <TargetField
                  label="Z2 cardio (weekly)"
                  unit="min"
                  step={5}
                  value={draft.targets.z2_weekly_min}
                  onChange={(v) => patchTargets({ z2_weekly_min: v })}
                />
                <TargetField
                  label="Sleep"
                  unit="h"
                  step={0.25}
                  value={draft.targets.sleep_target_h}
                  onChange={(v) => patchTargets({ sleep_target_h: v })}
                />
                <RangeField
                  label="Fasting window"
                  unit="h"
                  step={1}
                  min={draft.targets.fasting_min_h}
                  max={draft.targets.fasting_max_h}
                  onMinChange={(v) => patchTargets({ fasting_min_h: v })}
                  onMaxChange={(v) => patchTargets({ fasting_max_h: v })}
                />
              </div>
            </section>
          </CardContent>
        </Card>

        {/* Units — intentionally hidden until conversion is wired across the
         *  app. Schema + API remain so switching on is a UI-only change; also
         *  leaves room for time-zone / locale settings under this heading. */}

        {/* Day phases — morning/afternoon/evening (or custom). Drive habit
         *  buckets, the overview greeting, and "time left" indicators. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Day phases</CardTitle>
            <p className="text-xs text-muted-foreground">
              Phases are ordered by start time. Changing a phase id orphans any habit rows
              that reference it. Edit greeting messages directly in <code className="rounded bg-muted px-1">settings.yaml</code>.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(draft.day_phases ?? []).map((phase, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <input
                    type="text"
                    value={phase.emoji}
                    onChange={(e) => patchPhase(idx, { emoji: e.target.value })}
                    aria-label="Emoji"
                    className="w-10 rounded-md border border-input bg-background px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    type="text"
                    value={phase.label}
                    onChange={(e) => patchPhase(idx, { label: e.target.value })}
                    aria-label="Label"
                    placeholder="Label"
                    className="min-w-[6rem] flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    type="text"
                    value={phase.id}
                    onChange={(e) => patchPhase(idx, { id: e.target.value.trim().toLowerCase() })}
                    aria-label="Phase id"
                    placeholder="id"
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    start
                    <input
                      type="time"
                      value={phase.start}
                      onChange={(e) => patchPhase(idx, { start: e.target.value })}
                      aria-label="Start time"
                      className="rounded-md border border-input bg-background px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-datetime-edit-ampm-field]:hidden"
                    />
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    cutoff
                    <input
                      type="time"
                      value={phase.cutoff}
                      onChange={(e) => patchPhase(idx, { cutoff: e.target.value })}
                      aria-label="Cutoff time"
                      className="rounded-md border border-input bg-background px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-datetime-edit-ampm-field]:hidden"
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhase(idx)}
                    title="Remove phase"
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-red-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addPhase}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                + Add phase
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <Pill<AppTheme>
              options={[
                { value: "light", label: "Day" },
                { value: "dark", label: "Night" },
                { value: "eink", label: "Eink" },
              ]}
              value={draft.theme}
              // Apply instantly so the user can see the effect; the final
              // choice still persists to disk on Save.
              onChange={(v) => {
                patch({ theme: v });
                setTheme(v);
              }}
              color={accent}
            />
            <label className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <span className="text-sm">
                Icon Color
                <span className="ml-1 text-xs text-muted-foreground">
                  favicon + iOS home-screen icon
                </span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.icon_color}
                  onChange={(e) => patch({ icon_color: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-background"
                />
                <input
                  type="text"
                  value={draft.icon_color}
                  onChange={(e) => patch({ icon_color: e.target.value })}
                  className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </label>
          </CardContent>
        </Card>

        {/* Weather config — only relevant when the weather tile is enabled.
         *  Visibility toggle itself lives in the Sections list above. */}
        {((draft.sections?.weather?.show_in_nav ?? draft.sections?.weather?.enabled) ||
          (draft.sections?.weather?.show_on_dashboard ?? draft.sections?.weather?.enabled)) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Weather</CardTitle>
              <p className="text-xs text-muted-foreground">Location + units for the weather tile.</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  Location
                  <span className="ml-1 text-xs text-muted-foreground">city or "city, country"</span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft.weather?.location ?? ""}
                    onChange={(e) => patchWeather({ location: e.target.value })}
                    placeholder="e.g. Berlin"
                    className="w-48 rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Pill<"celsius" | "fahrenheit">
                    options={[
                      { value: "celsius", label: "°C" },
                      { value: "fahrenheit", label: "°F" },
                    ]}
                    value={draft.weather?.units ?? "celsius"}
                    onChange={(v) => patchWeather({ units: v })}
                    color={weatherColor}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar config — only relevant when the calendar tile is enabled. */}
        {((draft.sections?.calendar?.show_in_nav ?? draft.sections?.calendar?.enabled) ||
          (draft.sections?.calendar?.show_on_dashboard ?? draft.sections?.calendar?.enabled)) && (
          <CalendarConfigCard
            showAllDay={draft.calendar?.show_all_day ?? true}
            enabledCalendars={draft.calendar?.enabled_calendars ?? null}
            onChange={patchCalendar}
          />
        )}

        {/* Animations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Animations</CardTitle>
            <p className="text-xs text-muted-foreground">Celebration effects after key moments.</p>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              <ToggleRow
                label="Training complete"
                description="Confetti when a workout wraps."
                checked={draft.animations.training_complete}
                onChange={(v) => patchAnimations({ training_complete: v })}
                color={trainingColor}
              />
              <ToggleRow
                label="First meal"
                description="Break-fast burst on today's first nutrition entry."
                checked={draft.animations.first_meal}
                onChange={(v) => patchAnimations({ first_meal: v })}
                color={nutritionColor}
              />
              <ToggleRow
                label="Raise histograms"
                description="Quick raise-from-baseline on chart bars when a card loads."
                checked={draft.animations.histograms_raise ?? true}
                onChange={(v) => patchAnimations({ histograms_raise: v })}
                color={accent}
              />
            </div>
          </CardContent>
        </Card>

        <SaveRow saving={saving} saved={saved} onSave={handleSave} />
      </div>
    </>
  );
}
