"use client";

import { useEffect, useRef, useState } from "react";
import { notFound, useParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { useSections } from "@/hooks/use-sections";
import { getSettings, saveSettings, type AppSettings, type SectionMeta } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SectionConfigEditor } from "@/components/section-config-editor";
import { cannabisStrainsDef } from "@/lib/settings/sections/cannabis";
import { caffeineBeansDef } from "@/lib/settings/sections/caffeine";
import { supplementsDef } from "@/lib/settings/sections/supplements";
import { groceriesDef } from "@/lib/settings/sections/groceries";
import { choresDef } from "@/lib/settings/sections/chores";
import { makeHabitsDef } from "@/lib/settings/sections/habits";
import { makeExercisesDef } from "@/lib/settings/sections/exercises";
import { getExerciseConfig } from "@/lib/api";
import { useSectionColor } from "@/hooks/use-sections";
import { useMemo } from "react";
import { PaletteSwatchGrid } from "@/components/palette-swatch-grid";
import { ManageMacroColorsCard } from "@/components/manage-macro-colors";

// Per-section settings editor. Writes to Bases/Settings/settings.yaml under
// sections.{key} via PUT /api/settings — the backend deep-merges partial
// patches so we only send the diff.
export default function SectionSettingsPage() {
  const params = useParams<{ section: string }>();
  const key = params?.section;
  const sectionKey = key === "exercise" ? "training" : key;
  const sections = useSections();
  const section = sections.find((s) => s.key === sectionKey);

  const { data: settings } = useSWR("settings", getSettings);

  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState("");
  const [tagline, setTagline] = useState("");
  const [showInNav, setShowInNav] = useState(true);
  const [showOnDashboard, setShowOnDashboard] = useState(true);
  const dirtyRef = useRef(false);

  // Seed the form once per section key. `section` is a fresh object on every
  // render (useSections rebuilds from SWR), so depending on it would wipe the
  // user's edits on every revalidation — we only want to initialize on mount
  // or when navigating between sections.
  const seededKey = useRef<string | null>(null);
  useEffect(() => {
    if (!section || seededKey.current === section.key) return;
    seededKey.current = section.key;
    setLabel(section.label);
    setEmoji(section.emoji);
    setColor(section.color);
    setTagline(section.tagline);
    setShowInNav(section.show_in_nav);
    setShowOnDashboard(section.show_on_dashboard);
    dirtyRef.current = false;
  }, [section]);

  useEffect(() => {
    if (!sectionKey || !dirtyRef.current) return;
    const handle = setTimeout(async () => {
      dirtyRef.current = false;
      await saveSettings({
        sections: {
          ...(settings?.sections ?? {}),
          [sectionKey as string]: {
            label,
            emoji,
            color,
            tagline,
            show_in_nav: showInNav,
            show_on_dashboard: showOnDashboard,
          },
        },
      });
      touchedRef.current = false;
      globalMutate("settings");
      globalMutate("sections-registry");
    }, 400);
    return () => clearTimeout(handle);
  }, [sectionKey, label, emoji, color, tagline, showInNav, showOnDashboard, settings]);

  // Live-preview: optimistically push the picked color into the `settings`
  // and `sections-registry` SWR caches so the top nav, headers and chrome
  // repaint immediately — without persisting to disk until Save. Reverted
  // on unmount so an abandoned edit doesn't leak into other routes.
  const touchedRef = useRef(false);
  function previewColor(next: string) {
    setColor(next);
    if (!sectionKey) return;
    touchedRef.current = true;
    globalMutate(
      "settings",
      (current: AppSettings | undefined) => {
        if (!current) return current;
        const prev = current.sections?.[sectionKey] ?? { label: "", emoji: "", color: "", tagline: "" };
        return {
          ...current,
          sections: { ...current.sections, [sectionKey]: { ...prev, color: next } },
        };
      },
      { revalidate: false },
    );
    globalMutate(
      "sections-registry",
      (current: SectionMeta[] | undefined) => {
        if (!current) return current;
        return current.map((s) => (s.key === sectionKey ? { ...s, color: next } : s));
      },
      { revalidate: false },
    );
  }

  // If the user navigates away without saving, drop the optimistic tint.
  useEffect(() => {
    return () => {
      if (!touchedRef.current) return;
      globalMutate("settings");
      globalMutate("sections-registry");
    };
  }, []);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  if (!sectionKey) return null;
  if (sections.length > 0 && !section) return notFound();
  if (!section) return null;

  return (
    <>
      <PageHeader
        title={label || section.key}
        subtitle={tagline || undefined}
        emoji={emoji || undefined}
        color={color || undefined}
        back={{ href: "/septena/settings", label: "Settings" }}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Appearance</CardTitle>
            <p className="text-xs text-muted-foreground">Label, emoji, color, tagline — shown in nav, headers and cards.</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <Field label="Label">
              <input
                type="text"
                value={label}
                onChange={(e) => { markDirty(); setLabel(e.target.value); }}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              />
            </Field>

            <Field label="Emoji">
              <input
                type="text"
                value={emoji}
                onChange={(e) => { markDirty(); setEmoji(e.target.value); }}
                maxLength={4}
                className="w-20 rounded-lg border border-input bg-background px-3 py-1.5 text-center text-lg"
              />
            </Field>

            <Field label="Color">
              <PaletteSwatchGrid
                value={color}
                onChange={(v) => { markDirty(); previewColor(v); }}
                others={sections
                  .filter((s) => s.key !== sectionKey)
                  .map((s) => ({ label: s.label, value: s.color }))}
              />
            </Field>

            <Field label="Tagline">
              <input
                type="text"
                value={tagline}
                onChange={(e) => { markDirty(); setTagline(e.target.value); }}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              />
            </Field>

            <Field label="Visibility">
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showInNav}
                    onChange={(e) => { markDirty(); setShowInNav(e.target.checked); }}
                    className="h-4 w-4"
                  />
                  <span className="text-muted-foreground">Show in top nav</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showOnDashboard}
                    onChange={(e) => { markDirty(); setShowOnDashboard(e.target.checked); }}
                    className="h-4 w-4"
                  />
                  <span className="text-muted-foreground">Show on homepage</span>
                </label>
              </div>
            </Field>

            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <p>Path <code className="rounded bg-muted px-1">{section.path}</code></p>
              <p>API <code className="rounded bg-muted px-1">{section.apiBase || "—"}</code></p>
              <p>Vault <code className="rounded bg-muted px-1">{section.dataDir || "—"}</code></p>
            </div>
          </CardContent>
        </Card>

        {sectionKey === "training" && <ExercisesCard />}
        {sectionKey === "nutrition" && <ManageMacroColorsCard />}
        {sectionKey === "groceries" && <GroceriesCard />}
        {sectionKey === "habits" && <HabitsCard />}
        {sectionKey === "supplements" && <SupplementsCard />}
        {sectionKey === "chores" && <ChoresCard />}
        {sectionKey === "cannabis" && <CannabisStrainsCard />}
        {sectionKey === "caffeine" && <CaffeineBeansCard />}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Thin wrappers — each pulls the section's accent color from /api/sections
 * and hands it to the generic <SectionConfigEditor>. Replaces every
 * Manage{X}Card that used to live in components/manage-items.tsx.
 *
 * Habits and exercises use *factory* defs (makeHabitsDef, makeExercisesDef)
 * because they have dynamic enums (buckets read from settings.day_phases,
 * types read from /api/training/config).
 */
function CannabisStrainsCard() {
  const color = useSectionColor("cannabis");
  return <SectionConfigEditor def={cannabisStrainsDef} color={color} title="Manage strains" />;
}

function CaffeineBeansCard() {
  const color = useSectionColor("caffeine");
  return <SectionConfigEditor def={caffeineBeansDef} color={color} title="Manage beans" />;
}

function SupplementsCard() {
  const color = useSectionColor("supplements");
  return <SectionConfigEditor def={supplementsDef} color={color} title="Manage supplements" />;
}

function GroceriesCard() {
  const color = useSectionColor("groceries");
  return <SectionConfigEditor def={groceriesDef} color={color} title="Manage groceries" />;
}

function ChoresCard() {
  const color = useSectionColor("chores");
  return <SectionConfigEditor def={choresDef} color={color} title="Manage chores" />;
}

function HabitsCard() {
  const color = useSectionColor("habits");
  const { data: settings } = useSWR("settings", getSettings);
  // Bucket options come from settings.day_phases at runtime.
  const buckets = useMemo(
    () => (settings?.day_phases ?? []).map((p) => p.id).filter(Boolean),
    [settings?.day_phases],
  );
  const def = useMemo(() => makeHabitsDef(buckets), [buckets]);
  return <SectionConfigEditor def={def} color={color} title="Manage habits" />;
}

function ExercisesCard() {
  const color = useSectionColor("training");
  // Type options + labels come from /api/training/config at runtime.
  const { data } = useSWR("training-config", getExerciseConfig);
  const types = useMemo(() => data?.types ?? [], [data?.types]);
  const def = useMemo(() => makeExercisesDef(types), [types]);
  return <SectionConfigEditor def={def} color={color} title="Manage exercises" />;
}

