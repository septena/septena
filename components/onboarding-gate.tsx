"use client";

import { useState } from "react";
import { mutate } from "swr";

import { useAppConfig } from "@/lib/app-config";
import { bootstrapDataFolder, BackendUnreachableError } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeptenaMark } from "@/components/septena-mark";

const CORE_SECTIONS = [
  { key: "training", label: "Training", tagline: "Sessions, progressions & PRs" },
  { key: "nutrition", label: "Nutrition", tagline: "Meals, macros & fasting" },
  { key: "habits", label: "Habits", tagline: "Morning, afternoon & evening routines" },
] as const;

const OPTIONAL_SECTIONS = [
  { key: "supplements", label: "Supplements", tagline: "Daily stack & streaks" },
  { key: "chores", label: "Chores", tagline: "Recurring tasks, deferrable" },
  { key: "caffeine", label: "Caffeine", tagline: "V60s, matcha & time of day" },
  { key: "cannabis", label: "Cannabis", tagline: "Sessions, strains & usage" },
] as const;

const DEFAULT_CHECKED = new Set<string>(CORE_SECTIONS.map((s) => s.key));

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const config = useAppConfig();
  if (config.data_exists && config.data_has_sections) {
    return <>{children}</>;
  }
  return <OnboardingScreen dataPath={config.paths.data} />;
}

function OnboardingScreen({ dataPath }: { dataPath: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_CHECKED));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await bootstrapDataFolder({ sections: Array.from(selected) });
      await mutate("app-config");
    } catch (err) {
      const msg = err instanceof BackendUnreachableError
        ? "Backend not reachable. Start it with: uvicorn main:app --port 7000"
        : err instanceof Error
          ? err.message
          : "Bootstrap failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const nothingSelected = selected.size === 0;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <section className="mb-8 rounded-[2rem] border border-brand-accent-soft bg-linear-to-br from-brand-accent-soft via-background to-background p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] border border-brand-accent-soft bg-background/90 shadow-sm">
            <SeptenaMark className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to Septena</h1>
            <p className="mt-2 text-muted-foreground">
              Pick the sections you want to track. You can add or remove any of
              these later from Settings — nothing you choose now is final.
            </p>
          </div>
        </div>
      </section>

      <Card className="mb-4 border-brand-accent-soft">
        <CardHeader>
          <CardTitle>Core sections</CardTitle>
          <CardDescription>The everyday three. Pre-selected.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CORE_SECTIONS.map((s) => (
            <SectionRow
              key={s.key}
              sectionKey={s.key}
              label={s.label}
              tagline={s.tagline}
              checked={selected.has(s.key)}
              onToggle={() => toggle(s.key)}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6 border-brand-accent-soft">
        <CardHeader>
          <CardTitle>Optional sections</CardTitle>
          <CardDescription>
            Add only what you want to track. Each lives in its own folder under
            your data directory — remove the folder any time to hide the section.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {OPTIONAL_SECTIONS.map((s) => (
            <SectionRow
              key={s.key}
              sectionKey={s.key}
              label={s.label}
              tagline={s.tagline}
              checked={selected.has(s.key)}
              onToggle={() => toggle(s.key)}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6 border-brand-accent-soft">
        <CardHeader>
          <CardTitle className="text-brand-accent">Data folder</CardTitle>
          <CardDescription>
            Files go here. Override with <code>SEPTENA_DATA_DIR</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded bg-muted px-3 py-2 text-sm">{dataPath}</code>
        </CardContent>
      </Card>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          onClick={submit}
          disabled={busy || nothingSelected}
          className="border-brand-accent bg-brand-accent text-white hover:bg-brand-accent-strong"
        >
          {busy ? "Creating…" : "Create my data folder"}
        </Button>
        {nothingSelected ? (
          <span className="text-sm text-muted-foreground">Pick at least one section.</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {selected.size} section{selected.size === 1 ? "" : "s"} selected
          </span>
        )}
      </div>
    </main>
  );
}

function SectionRow({
  sectionKey,
  label,
  tagline,
  checked,
  onToggle,
}: {
  sectionKey: string;
  label: string;
  tagline: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = `onboarding-${sectionKey}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:border-brand-accent-soft hover:bg-brand-accent-soft/40"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-border accent-brand-accent"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">{tagline}</div>
      </div>
    </label>
  );
}
