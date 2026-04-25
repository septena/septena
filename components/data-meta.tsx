"use client";

import useSWR from "swr";
import { getMeta, type SourceMeta } from "@/lib/api";
import { useSection } from "@/hooks/use-sections";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { useSectionColor } from "@/hooks/use-sections";
import { cn } from "@/lib/utils";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

type Freshness = "fresh" | "stale" | "old" | "missing";

function freshness(iso: string | null | undefined): Freshness {
  if (!iso) return "missing";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "missing";
  const hr = (Date.now() - d.getTime()) / 3_600_000;
  if (hr < 24) return "fresh";
  if (hr < 72) return "stale";
  return "old";
}

const FRESHNESS_DOT: Record<Freshness, string> = {
  fresh: "bg-green-500",
  stale: "bg-yellow-500",
  old: "bg-red-400",
  missing: "bg-muted-foreground/30",
};

const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "Up to date",
  stale: "1-3 days old",
  old: "3+ days old",
  missing: "No data",
};

// ── Vault source row ────────────────────────────────────────────────────────

function DataSourceRow({ sectionKey, meta }: { sectionKey: string; meta: SourceMeta }) {
  const section = useSection(sectionKey as SectionKey);
  const color = section?.color ?? "hsl(0,0%,50%)";
  const f = freshness(meta.newest ?? meta.last_modified);
  const isLive = meta.status === "live";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{meta.label}</p>
        {isLive ? (
          <p className="text-xs text-muted-foreground">Live data</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {meta.files ?? 0} files
            {meta.oldest && meta.newest && (
              <> &middot; {meta.oldest} &rarr; {meta.newest}</>
            )}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isLive ? (
          <span className="text-xs text-muted-foreground">live</span>
        ) : (
          <>
            <div className={cn("h-2 w-2 rounded-full", FRESHNESS_DOT[f])} title={FRESHNESS_LABEL[f]} />
            <span className="text-xs text-muted-foreground">
              {meta.newest ? timeAgo(meta.newest + "T23:59:59") : meta.last_modified ? timeAgo(meta.last_modified) : "—"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Health sub-source row ───────────────────────────────────────────────────

function HealthSubRow({ sub }: { sub: { label: string; status?: string; last_modified?: string | null; size_mb?: number; detail?: string | null } }) {
  const ok = sub.status === "ok";
  const f = sub.last_modified ? freshness(sub.last_modified) : ok ? "fresh" : "missing";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{sub.label}</p>
        {sub.detail ? (
          <p className="text-[10px] text-muted-foreground">{sub.detail}</p>
        ) : sub.size_mb != null ? (
          <p className="text-[10px] text-muted-foreground">{sub.size_mb} MB</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", FRESHNESS_DOT[f])} title={FRESHNESS_LABEL[f]} />
        <span className="text-xs text-muted-foreground">
          {sub.last_modified ? timeAgo(sub.last_modified) : sub.status ?? "—"}
        </span>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function DataMeta() {
  // Live color from /api/sections, not the static SECTIONS fallback —
  // honors user customisation in settings.yaml.
  const healthColor = useSectionColor("health");
  const { data, error, isLoading } = useSWR("meta", getMeta, { refreshInterval: 60_000 });

  if (isLoading) {
    return (
      <section className="mt-12 border-t border-border pt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Data Sources</h2>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) return null;

  const sources = data.sources;
  const dataKeys = ["training", "nutrition", "habits", "supplements", "cannabis", "caffeine"];
  const health = sources.health;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Data Sources</h2>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" /> &lt;24h</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500" /> 1-3d</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" /> 3d+</span>
        </div>
      </div>

      {/* Data-folder-backed sections */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {dataKeys.map((key) => {
          const meta = sources[key];
          return meta ? <DataSourceRow key={key} sectionKey={key} meta={meta} /> : null;
        })}
      </div>

      {/* Health external sources */}
      {health?.sources && (
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <div
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: healthColor }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{health.label}</p>
              <p className="text-xs text-muted-foreground">External APIs + Health Auto Export</p>
            </div>
          </div>
          <div className="ml-5 mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.values(health.sources).map((sub) => (
              <HealthSubRow key={sub.label} sub={sub} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
