"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, GripVertical, LayoutGrid, PanelTop } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import useSWR, { mutate as globalMutate } from "swr";
import { useSections, useSectionColor } from "@/hooks/use-sections";
import { SettingsRenderer } from "@/lib/settings/render";
import { setIn } from "@/lib/settings/schema";
import {
  animationsSchema,
  dayPhasesSchema,
  targetsSchema,
  themeSchema,
  toAnimationsView,
  toTargetsView,
  targetsPatch,
} from "@/lib/settings/schemas/app";
import {
  type AppSettings,
  type AppTheme,
  type DayPhase,
  getCaffeineConfig,
  getCannabisConfig,
  getChores,
  getExerciseConfig,
  getGroceries,
  getHabitConfig,
  getSettings,
  getSupplementConfig,
  saveSettings,
} from "@/lib/api";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { NEXT_CONTRIBUTORS, type NextContributor } from "@/hooks/use-next-actions";
import { DEFAULT_DAY_PHASES } from "@/lib/day-phases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export function SettingsDashboard() {
  const { setTheme } = useTheme();
  const sectionsMeta = useSections();
  // Live color from /api/sections, not the static SECTIONS fallback —
  // honors user customisation in settings.yaml.
  const correlationsColor = useSectionColor("correlations");
  const trainingColor = useSectionColor("training");
  const nutritionColor = useSectionColor("nutrition");
  const { data, isLoading, mutate } = useSWR("settings", getSettings);
  const { data: habitsCfg } = useSWR("habits-config", getHabitConfig);
  const { data: supplCfg } = useSWR("supplements-config", getSupplementConfig);
  const { data: choresList } = useSWR("chores-list", getChores);
  const { data: exerciseCfg } = useSWR("training-config", getExerciseConfig);
  const { data: cannabisCfg } = useSWR("cannabis-config", getCannabisConfig);
  const { data: caffeineCfg } = useSWR("caffeine-config", getCaffeineConfig);
  const { data: groceriesData } = useSWR("groceries", getGroceries);
  const counts: Partial<Record<SectionKey, number>> = {
    habits: habitsCfg?.total,
    supplements: supplCfg?.total,
    chores: choresList?.total,
    training: exerciseCfg?.exercises.length,
    cannabis: cannabisCfg?.strains.length,
    caffeine: caffeineCfg?.beans.length,
    groceries: groceriesData?.items.length,
  };
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
    const registryKeys = sectionsMeta.map((s) => s.key);
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
    dirtyRef.current = true;
  }, []);

  const patchTargets = useCallback((p: Partial<AppSettings["targets"]>) => {
    setDraft((d) => (d ? { ...d, targets: { ...d.targets, ...p } } : d));
    dirtyRef.current = true;
  }, []);

  /**
   * Schema-driven onChange used by every <SettingsRenderer>. The path is
   * the dotted/indexed trail from the schema root; we re-key it under the
   * AppSettings key the schema describes (e.g. ["animations", "first_meal"])
   * and let setIn() apply the mutation. Dirties the draft so the
   * debounce-on-blur effect persists.
   */
  const setAt = useCallback((path: readonly (string | number)[], next: unknown) => {
    setDraft((d) => (d ? setIn(d, path, next) : d));
    dirtyRef.current = true;
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
      dirtyRef.current = true;
    },
    [],
  );

  const setSectionIncludeInNext = useCallback(
    (key: NextContributor, value: boolean) => {
      setDraft((d) => {
        if (!d) return d;
        const prev = d.sections?.[key] ?? { label: "", emoji: "", color: "", tagline: "" };
        return {
          ...d,
          sections: {
            ...d.sections,
            [key]: { ...prev, include_in_next: value },
          },
        };
      });
      dirtyRef.current = true;
    },
    [],
  );

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const reorderSection = useCallback((from: string, to: string) => {
    if (from === to) return;
    setDraft((d) => {
      if (!d) return d;
      const order = [...d.section_order];
      const fi = order.indexOf(from);
      const ti = order.indexOf(to);
      if (fi < 0 || ti < 0) return d;
      order.splice(fi, 1);
      order.splice(ti, 0, from);
      return { ...d, section_order: order };
    });
    dirtyRef.current = true;
  }, []);

  useEffect(() => {
    if (!draft || !dirtyRef.current) return;
    const handle = setTimeout(async () => {
      dirtyRef.current = false;
      const fresh = await saveSettings(draft);
      mutate(fresh, false);
      globalMutate("settings");
    }, 400);
    return () => clearTimeout(handle);
  }, [draft, mutate]);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Sections — list, reorder, toggle visibility, link to per-section editors. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sections</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tap to edit color/label/tagline. Drag to reorder nav + homepage.
              Icons toggle: top nav tab, homepage tile, and (where applicable) the Next view.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {draft.section_order
                .filter((k): k is SectionKey => sectionsMeta.some((s) => s.key === k))
                .map((key) => {
                  const meta = sectionsMeta.find((s) => s.key === key)!;
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
                  const isNextContributor = (NEXT_CONTRIBUTORS as readonly string[]).includes(key);
                  const includeInNextOverride = draftSection?.include_in_next;
                  const includeInNext = typeof includeInNextOverride === "boolean" ? includeInNextOverride : true;
                  const isDragging = dragKey === key;
                  const isDragOver = dragOverKey === key && dragKey !== null && dragKey !== key;
                  return (
                    <li
                      key={key}
                      draggable
                      onDragStart={(e) => {
                        setDragKey(key);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", key);
                      }}
                      onDragEnter={() => setDragOverKey(key)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget === e.target) setDragOverKey((k) => (k === key ? null : k));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = e.dataTransfer.getData("text/plain") || dragKey;
                        if (from) reorderSection(from, key);
                        setDragKey(null);
                        setDragOverKey(null);
                      }}
                      onDragEnd={() => {
                        setDragKey(null);
                        setDragOverKey(null);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 transition-colors",
                        !anyVisible && "opacity-60",
                        isDragging && "bg-muted opacity-70",
                        isDragOver && "bg-muted/60",
                      )}
                    >
                      <GripVertical
                        size={14}
                        className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                        aria-hidden
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
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
                      {isNextContributor && (
                        <button
                          type="button"
                          onClick={() => setSectionIncludeInNext(key as NextContributor, !includeInNext)}
                          aria-label={includeInNext ? "Hide from Next" : "Show in Next"}
                          aria-pressed={includeInNext}
                          title={includeInNext ? "In Next view — click to hide" : "Hidden from Next — click to show"}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted",
                            !includeInNext && "text-muted-foreground opacity-50",
                          )}
                        >
                          <Clock size={16} />
                        </button>
                      )}
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
                          "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted",
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
                          "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted",
                          !showOnDashboard && "text-muted-foreground opacity-50",
                        )}
                      >
                        <LayoutGrid size={16} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </CardContent>
        </Card>

        {/* Targets — schema-driven; flat YAML keys bridged via targetsPatch(). */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Targets</CardTitle>
            <p className="text-xs text-muted-foreground">Daily macros, training, sleep, cannabis.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {Object.entries(targetsSchema.children).map(([key, child]) => (
              <SettingsRenderer
                key={key}
                node={child}
                value={toTargetsView(draft.targets)[key as keyof ReturnType<typeof toTargetsView>]}
                color={accent}
                onChange={(path, next) => {
                  const p = targetsPatch([key, ...path], next);
                  if (p) patchTargets(p);
                }}
              />
            ))}
          </CardContent>
        </Card>

        {/* Units — intentionally hidden until conversion is wired across the
         *  app. Schema + API remain so switching on is a UI-only change; also
         *  leaves room for time-zone / locale settings under this heading. */}

        {/* Day phases — morning/afternoon/evening (or custom). Drive habit
         *  buckets, the overview greeting, and "time left" indicators.
         *  `messages` is preserved per-item; only the row fields are edited. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Day phases</CardTitle>
            <p className="text-xs text-muted-foreground">
              Phases are ordered by start time. Changing a phase id orphans any habit rows
              that reference it. Edit greeting messages directly in <code className="rounded bg-muted px-1">settings.yaml</code>.
            </p>
          </CardHeader>
          <CardContent>
            <SettingsRenderer
              node={dayPhasesSchema}
              value={draft.day_phases ?? []}
              color={accent}
              path={["day_phases"]}
              onChange={setAt}
            />
          </CardContent>
        </Card>

        {/* Theme — schema-driven; instant preview via setTheme side effect. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsRenderer
              node={themeSchema}
              value={draft.theme}
              color={accent}
              onChange={(_path, next) => {
                const v = next as AppTheme;
                patch({ theme: v });
                setTheme(v);
              }}
            />
          </CardContent>
        </Card>

        {/* Animations — schema-driven; coloured per-row by section accent. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Animations</CardTitle>
            <p className="text-xs text-muted-foreground">Celebration effects after key moments.</p>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              {Object.entries(animationsSchema.children).map(([key, child]) => {
                // Each row picks up its owning section's accent so toggle
                // colour matches the surface it celebrates.
                const rowColor =
                  key === "training_complete"
                    ? trainingColor
                    : key === "first_meal"
                      ? nutritionColor
                      : accent;
                const view = toAnimationsView(draft.animations);
                return (
                  <SettingsRenderer
                    key={key}
                    node={child}
                    value={view[key as keyof typeof view]}
                    color={rowColor}
                    path={["animations", key]}
                    onChange={setAt}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        <footer className="pt-6 pb-2 text-center text-xs text-muted-foreground">
          <a
            href="https://www.septena.app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Septena · www.septena.app
          </a>
        </footer>
      </div>
    </>
  );
}
