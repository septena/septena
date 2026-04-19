"use client";

import { useEffect, useRef, useState } from "react";
import { notFound, useParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { useSections } from "@/hooks/use-sections";
import { getSettings, saveSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SaveRow } from "@/components/save-row";
import {
  ManageChoresCard,
  ManageHabitsCard,
  ManageSupplementsCard,
} from "@/components/manage-items";

// Per-section settings editor. Writes to Bases/Settings/settings.yaml under
// sections.{key} via PUT /api/settings — the backend deep-merges partial
// patches so we only send the diff.
export default function SectionSettingsPage() {
  const params = useParams<{ section: string }>();
  const key = params?.section;
  const sections = useSections();
  const section = sections.find((s) => s.key === key);

  const { data: settings } = useSWR("settings", getSettings);

  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState("");
  const [tagline, setTagline] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setEnabled(section.enabled);
  }, [section]);

  if (!key) return null;
  if (sections.length > 0 && !section) return notFound();
  if (!section) return null;

  async function onSave() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveSettings({
        sections: {
          ...(settings?.sections ?? {}),
          [key as string]: { label, emoji, color, tagline, enabled },
        },
      });
      await globalMutate("settings");
      await globalMutate("/api/sections");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:pb-6">
      <PageHeader
        title={label || section.key}
        subtitle={tagline || undefined}
        emoji={emoji || undefined}
        color={color || undefined}
        back={{ href: "/settings", label: "Settings" }}
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
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              />
            </Field>

            <Field label="Emoji">
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="w-20 rounded-lg border border-input bg-background px-3 py-1.5 text-center text-lg"
              />
            </Field>

            <Field label="Color">
              <ColorPicker
                value={color}
                onChange={setColor}
                others={sections
                  .filter((s) => s.key !== key)
                  .map((s) => ({ key: s.key, label: s.label, color: s.color }))}
              />
            </Field>

            <Field label="Tagline">
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              />
            </Field>

            <Field label="Enabled">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-muted-foreground">Show in nav</span>
              </label>
            </Field>

            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <p>Path <code className="rounded bg-muted px-1">{section.path}</code></p>
              <p>API <code className="rounded bg-muted px-1">{section.apiBase || "—"}</code></p>
              <p>Vault <code className="rounded bg-muted px-1">{section.obsidianDir || "—"}</code></p>
            </div>
          </CardContent>
        </Card>

        {key === "habits" && <ManageHabitsCard />}
        {key === "supplements" && <ManageSupplementsCard />}
        {key === "chores" && <ManageChoresCard />}

        <SaveRow saving={saving} saved={saved} color={color || undefined} onSave={onSave} />
      </div>
    </main>
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

// ── Color picker ───────────────────────────────────────────────────────────

type HSL = { h: number; s: number; l: number };

function parseHsl(raw: string): HSL | null {
  const m = raw.match(/hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)/i);
  if (!m) return null;
  return { h: +m[1], s: +m[2], l: +m[3] };
}

function formatHsl(hsl: HSL): string {
  return `hsl(${Math.round(hsl.h)},${Math.round(hsl.s)}%,${Math.round(hsl.l)}%)`;
}

type OtherSection = { key: string; label: string; color: string };

/** Inline HSL picker with a rainbow hue slider that shows tick marks for
 *  every other section's hue — so the user can see the palette at a glance
 *  and avoid clashing with a neighbour when adjusting this section's color.
 *  Swatch + text input collapse the picker; the picker opens below when the
 *  swatch is clicked. */
function ColorPicker({
  value,
  onChange,
  others,
}: {
  value: string;
  onChange: (v: string) => void;
  others: OtherSection[];
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseHsl(value) ?? { h: 0, s: 0, l: 50 };

  const update = (patch: Partial<HSL>) => {
    onChange(formatHsl({ ...parsed, ...patch }));
  };

  // Pull hues of other sections for tick marks. Skip ones we can't parse.
  const otherTicks = others
    .map((o) => {
      const p = parseHsl(o.color);
      return p ? { hue: p.h, color: o.color, label: o.label } : null;
    })
    .filter((t): t is { hue: number; color: string; label: string } => t !== null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle color picker"
          className="h-8 w-8 shrink-0 rounded-full border border-border shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="hsl(25,95%,53%)"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 font-mono text-xs"
        />
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-xl border border-border bg-background p-3">
          {/* Hue slider with rainbow gradient + other-section tick marks */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Hue</span>
              <span className="font-mono">{Math.round(parsed.h)}°</span>
            </div>
            <div className="relative">
              {/* Tick marks for other sections */}
              <div className="pointer-events-none absolute inset-x-0 -top-1 h-2">
                {otherTicks.map((t, i) => (
                  <span
                    key={`${t.label}-${i}`}
                    title={`${t.label} — ${Math.round(t.hue)}°`}
                    className="pointer-events-auto absolute -translate-x-1/2"
                    style={{ left: `${(t.hue / 360) * 100}%` }}
                  >
                    <span
                      className="block h-2 w-1 rounded-sm border border-background"
                      style={{ backgroundColor: t.color }}
                    />
                  </span>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={parsed.h}
                onChange={(e) => update({ h: +e.target.value })}
                className="w-full accent-foreground"
                style={{
                  background:
                    "linear-gradient(to right, hsl(0,90%,50%), hsl(60,90%,50%), hsl(120,90%,50%), hsl(180,90%,50%), hsl(240,90%,50%), hsl(300,90%,50%), hsl(360,90%,50%))",
                  borderRadius: "9999px",
                  height: "8px",
                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Ticks above show where other sections sit on the hue wheel.
            </p>
          </div>

          {/* Saturation slider */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Saturation</span>
              <span className="font-mono">{Math.round(parsed.s)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={parsed.s}
              onChange={(e) => update({ s: +e.target.value })}
              className="w-full accent-foreground"
              style={{
                background: `linear-gradient(to right, hsl(${parsed.h},0%,${parsed.l}%), hsl(${parsed.h},100%,${parsed.l}%))`,
                borderRadius: "9999px",
                height: "8px",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            />
          </div>

          {/* Lightness slider */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Lightness</span>
              <span className="font-mono">{Math.round(parsed.l)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={parsed.l}
              onChange={(e) => update({ l: +e.target.value })}
              className="w-full accent-foreground"
              style={{
                background: `linear-gradient(to right, #000, hsl(${parsed.h},${parsed.s}%,50%), #fff)`,
                borderRadius: "9999px",
                height: "8px",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
