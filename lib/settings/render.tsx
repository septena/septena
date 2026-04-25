"use client";

/**
 * Schema-driven renderer.
 *
 * Walks a Node tree from `lib/settings/schema.ts`, looks each leaf up in a
 * small field registry, and renders it. Sub-groups render as a labelled
 * section with their children below — a single recursive component covers
 * any depth without the caller writing boilerplate per setting.
 *
 * The renderer is intentionally dumb about persistence: it pushes a leaf
 * value up via onChange(path, value), and the parent decides what to do
 * with it (typically: call setIn(draft, path, value) and let the existing
 * debounce-on-blur effect save it).
 */

import { useId } from "react";
import {
  type EnumLeaf,
  type Group,
  type Leaf,
  type Node,
  type NumberLeaf,
  type RangeLeaf,
  type ToggleLeaf,
  getIn,
} from "./schema";

type Path = readonly (string | number)[];

export interface RendererProps {
  node: Node;
  /** The slice of state the schema describes (typed externally as Infer<T>). */
  value: unknown;
  /** Called on every leaf change with a path relative to `value`'s root. */
  onChange: (path: Path, next: unknown) => void;
  color?: string;
  /** Internal — accumulated path during recursion. */
  path?: Path;
}

const NUM_INPUT_CLASS =
  "w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring";

function parseNum(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/* ── leaf field components ─────────────────────────────────────────────── */

function NumberField({
  leaf,
  value,
  onChange,
}: {
  leaf: NumberLeaf;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">
        {leaf.label}
        {leaf.unit && <span className="ml-1 text-xs text-muted-foreground">({leaf.unit})</span>}
      </span>
      <input
        type="number"
        step={leaf.step ?? 1}
        min={leaf.min}
        max={leaf.max}
        value={value}
        onChange={(e) => onChange(parseNum(e.target.value, value))}
        className={NUM_INPUT_CLASS}
      />
    </label>
  );
}

function RangeFieldView({
  leaf,
  value,
  onChange,
}: {
  leaf: RangeLeaf;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [min, max] = value;
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">
        {leaf.label}
        {leaf.unit && <span className="ml-1 text-xs text-muted-foreground">({leaf.unit})</span>}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          step={leaf.step ?? 1}
          min={leaf.min}
          value={min}
          onChange={(e) => onChange([parseNum(e.target.value, min), max])}
          onBlur={() => {
            if (min > max) onChange([min, min]);
          }}
          aria-label={`${leaf.label} min`}
          aria-describedby={id}
          className={NUM_INPUT_CLASS}
        />
        <span aria-hidden id={id} className="text-muted-foreground">–</span>
        <input
          type="number"
          step={leaf.step ?? 1}
          min={min}
          value={max}
          onChange={(e) => onChange([min, parseNum(e.target.value, max)])}
          onBlur={() => {
            if (max < min) onChange([max, max]);
          }}
          aria-label={`${leaf.label} max`}
          className={NUM_INPUT_CLASS}
        />
      </span>
    </div>
  );
}

function ToggleField({
  leaf,
  value,
  onChange,
  color,
}: {
  leaf: ToggleLeaf;
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm">{leaf.label}</span>
        {leaf.description && (
          <span className="block text-xs text-muted-foreground">{leaf.description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border transition-colors"
        style={{ backgroundColor: value ? color ?? "currentColor" : "transparent" }}
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: value ? "translateX(1.25rem)" : "translateX(0.15rem)" }}
        />
      </button>
    </label>
  );
}

function EnumField({
  leaf,
  value,
  onChange,
  color,
}: {
  leaf: EnumLeaf<readonly string[]>;
  value: string;
  onChange: (v: string) => void;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">{leaf.label}</span>
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {leaf.options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              style={active ? { backgroundColor: color ?? "currentColor", color: "white" } : undefined}
            >
              {leaf.labels?.[opt] ?? opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── leaf dispatch ─────────────────────────────────────────────────────── */

function LeafView({
  leaf,
  value,
  onChange,
  color,
}: {
  leaf: Leaf;
  value: unknown;
  onChange: (v: unknown) => void;
  color?: string;
}) {
  switch (leaf.kind) {
    case "number":
      return (
        <NumberField
          leaf={leaf}
          value={(value as number | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
        />
      );
    case "range":
      return (
        <RangeFieldView
          leaf={leaf}
          value={(value as [number, number] | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
        />
      );
    case "toggle":
      return (
        <ToggleField
          leaf={leaf}
          value={(value as boolean | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          color={color}
        />
      );
    case "enum":
      return (
        <EnumField
          leaf={leaf}
          value={(value as string | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          color={color}
        />
      );
  }
}

/* ── recursive walk ────────────────────────────────────────────────────── */

export function SettingsRenderer({
  node,
  value,
  onChange,
  color,
  path = [],
}: RendererProps) {
  if (node.__type === "leaf") {
    return (
      <LeafView
        leaf={node}
        value={value}
        onChange={(v) => onChange(path, v)}
        color={color}
      />
    );
  }

  const entries = Object.entries(node.children);

  return (
    <section>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {node.label}
        {node.description && (
          <span className="ml-1 text-muted-foreground/70">· {node.description}</span>
        )}
      </p>
      <div className="divide-y divide-border/60">
        {entries.map(([key, child]) => (
          <SettingsRenderer
            key={key}
            node={child}
            value={getIn(value, [key])}
            onChange={onChange}
            color={color}
            path={[...path, key]}
          />
        ))}
      </div>
    </section>
  );
}
