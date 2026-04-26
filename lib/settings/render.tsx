"use client";

/**
 * Schema-driven renderer.
 *
 * Walks a Node tree from `lib/settings/schema.ts` and renders each node:
 *   • Group → a captioned section, children rendered as stacked rows
 *   • List  → an inline editor: each item's fields lined up in a flex row
 *             with a remove button + a +Add button at the bottom
 *   • Leaf  → a single field control (number, range, toggle, enum,
 *             string, time, color)
 *
 * The renderer is intentionally dumb about persistence. It pushes a leaf
 * value up via onChange(path, value), where `path` is the dotted/indexed
 * trail from the schema root. The parent decides what to do with it
 * (typically setIn(draft, path, value) and let the existing debounce-on-blur
 * effect save it).
 *
 * Compact mode: list items render their leaves without the per-row
 * label/divider scaffolding so a list can present as a horizontal record
 * row (used for day phases). Labels become aria-labels + placeholders.
 */

import { Plus, RotateCcw, X } from "lucide-react";
import { useId } from "react";
import {
  type ColorLeaf,
  type EnumLeaf,
  type Group,
  type Leaf,
  type ListNode,
  type Node,
  type NumberLeaf,
  type RangeLeaf,
  type StringLeaf,
  type TimeLeaf,
  type ToggleLeaf,
  defaultsFrom,
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
  /** Internal — render leaves without label/divider scaffolding (list rows). */
  compact?: boolean;
  /**
   * When true, every Group caption shows a "Reset" button that emits
   * `onChange(path, defaultsFrom(group))`. Off by default — only safe for
   * direct-mapping callers (where schema path == storage path). Adapter
   * callers like the targets card should leave this off because the
   * adapter only handles leaf-level paths.
   */
  resettable?: boolean;
}

const NUM_INPUT_CLASS =
  "w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring";
const TEXT_INPUT_BASE =
  "rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function parseNum(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/* ── shared row scaffolding ───────────────────────────────────────────── */

/**
 * Stacked label + optional description, used across non-toggle leaves so
 * the schema's `description` text surfaces on every row (not just
 * toggles). Inline-form for tight rows, block-form when description is
 * present.
 */
function RowLabel({
  label,
  description,
  unit,
}: {
  label: string;
  description?: string;
  unit?: string;
}) {
  return (
    <span className="min-w-0">
      <span className="block text-sm">
        {label}
        {unit && <span className="ml-1 text-xs text-muted-foreground">({unit})</span>}
      </span>
      {description && (
        <span className="block text-xs text-muted-foreground">{description}</span>
      )}
    </span>
  );
}

/* ── leaf views ────────────────────────────────────────────────────────── */

function NumberView({
  leaf,
  value,
  onChange,
  compact,
}: {
  leaf: NumberLeaf;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const input = (
    <input
      type="number"
      step={leaf.step ?? 1}
      min={leaf.min}
      max={leaf.max}
      value={value}
      onChange={(e) => onChange(parseNum(e.target.value, value))}
      aria-label={leaf.label}
      className={NUM_INPUT_CLASS}
    />
  );
  if (compact) return input;
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <RowLabel label={leaf.label} description={leaf.description} unit={leaf.unit} />
      {input}
    </label>
  );
}

function RangeView({
  leaf,
  value,
  onChange,
  compact,
}: {
  leaf: RangeLeaf;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  compact?: boolean;
}) {
  const [min, max] = value;
  const id = useId();
  const inputs = (
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
  );
  if (compact) return inputs;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <RowLabel label={leaf.label} description={leaf.description} unit={leaf.unit} />
      {inputs}
    </div>
  );
}

function ToggleView({
  leaf,
  value,
  onChange,
  color,
  compact,
}: {
  leaf: ToggleLeaf;
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
  compact?: boolean;
}) {
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={leaf.label}
      onClick={() => onChange(!value)}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border transition-colors"
      style={{ backgroundColor: value ? color ?? "currentColor" : "transparent" }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: value ? "translateX(1.25rem)" : "translateX(0.15rem)" }}
      />
    </button>
  );
  if (compact) return sw;
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm">{leaf.label}</span>
        {leaf.description && (
          <span className="block text-xs text-muted-foreground">{leaf.description}</span>
        )}
      </span>
      {sw}
    </label>
  );
}

function EnumView({
  leaf,
  value,
  onChange,
  color,
  compact,
}: {
  leaf: EnumLeaf<readonly string[]>;
  value: string;
  onChange: (v: string) => void;
  color?: string;
  compact?: boolean;
}) {
  const pill = (
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
  );
  if (compact) return pill;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <RowLabel label={leaf.label} description={leaf.description} />
      {pill}
    </div>
  );
}

function StringView({
  leaf,
  value,
  onChange,
  compact,
}: {
  leaf: StringLeaf;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const widthClass =
    leaf.width === "narrow" ? "w-10 text-center" : leaf.width === "wide" ? "w-64" : "w-48";
  const monoClass = leaf.mono ? "font-mono text-xs" : "";
  const input = (
    <input
      type="text"
      value={value}
      onChange={(e) =>
        onChange(leaf.mono ? e.target.value.trim().toLowerCase() : e.target.value)
      }
      placeholder={leaf.placeholder}
      aria-label={leaf.label}
      className={`${TEXT_INPUT_BASE} ${widthClass} ${monoClass}`}
    />
  );
  if (compact) return input;
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <RowLabel
        label={leaf.label}
        description={leaf.description ?? leaf.placeholder}
      />
      {input}
    </label>
  );
}

function TimeView({
  leaf,
  value,
  onChange,
  compact,
}: {
  leaf: TimeLeaf;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const input = (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={leaf.label}
      className="rounded-md border border-input bg-background px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-datetime-edit-ampm-field]:hidden"
    />
  );
  if (compact) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {leaf.label.toLowerCase()}
        {input}
      </span>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <RowLabel label={leaf.label} description={leaf.description} />
      {input}
    </label>
  );
}

function ColorView({
  leaf,
  value,
  onChange,
  compact,
}: {
  leaf: ColorLeaf;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const input = (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={leaf.label}
      className="h-7 w-10 cursor-pointer rounded-md border border-input bg-background p-0.5"
    />
  );
  if (compact) return input;
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <RowLabel label={leaf.label} description={leaf.description} />
      {input}
    </label>
  );
}

function LeafView({
  leaf,
  value,
  onChange,
  color,
  compact,
}: {
  leaf: Leaf;
  value: unknown;
  onChange: (v: unknown) => void;
  color?: string;
  compact?: boolean;
}) {
  switch (leaf.kind) {
    case "number":
      return (
        <NumberView
          leaf={leaf}
          value={(value as number | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          compact={compact}
        />
      );
    case "range":
      return (
        <RangeView
          leaf={leaf}
          value={(value as [number, number] | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          compact={compact}
        />
      );
    case "toggle":
      return (
        <ToggleView
          leaf={leaf}
          value={(value as boolean | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          color={color}
          compact={compact}
        />
      );
    case "enum":
      return (
        <EnumView
          leaf={leaf}
          value={(value as string | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          color={color}
          compact={compact}
        />
      );
    case "string":
      return (
        <StringView
          leaf={leaf}
          value={(value as string | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          compact={compact}
        />
      );
    case "time":
      return (
        <TimeView
          leaf={leaf}
          value={(value as string | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          compact={compact}
        />
      );
    case "color":
      return (
        <ColorView
          leaf={leaf}
          value={(value as string | undefined) ?? leaf.default}
          onChange={(v) => onChange(v)}
          compact={compact}
        />
      );
  }
}

/* ── list view ─────────────────────────────────────────────────────────── */

function ListView({
  node,
  value,
  onChange,
  color,
  path,
  resettable,
}: {
  node: ListNode;
  value: unknown[];
  onChange: (path: Path, next: unknown) => void;
  color?: string;
  path: Path;
  resettable?: boolean;
}) {
  const items = value ?? [];
  const itemEntries = Object.entries(node.itemSchema.children);

  // Split children into "inline" (leaves & primitives that fit a flex row)
  // and "block" (nested lists / groups that need their own sub-section
  // beneath the row). Lets us edit, e.g., greeting messages within a day
  // phase without breaking the compact-row layout for the phase itself.
  const inlineEntries = itemEntries.filter(([, child]) => child.__type === "leaf");
  const blockEntries = itemEntries.filter(([, child]) => child.__type !== "leaf");

  const removeAt = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(path, next);
  };

  const addItem = () => {
    const fresh = node.newItem ? node.newItem() : defaultsFrom(node.itemSchema);
    onChange(path, [...items, fresh]);
  };

  return (
    <div className="space-y-2">
      {resettable && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Reset ${node.label} to defaults?`)) return;
              onChange(path, defaultsFrom(node));
            }}
            title={`Reset ${node.label} to defaults`}
            className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            <RotateCcw size={10} aria-hidden /> reset
          </button>
        </div>
      )}
      {items.map((item, idx) => (
        <div
          key={node.itemKey ? node.itemKey(item, idx) : idx}
          className="rounded-lg border border-border bg-card px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            {inlineEntries.map(([childKey, child]) => (
              <SettingsRenderer
                key={childKey}
                node={child}
                value={getIn(item, [childKey])}
                onChange={onChange}
                color={color}
                path={[...path, idx, childKey]}
                compact
              />
            ))}
            <button
              type="button"
              onClick={() => removeAt(idx)}
              title="Remove"
              aria-label="Remove"
              className="ml-auto rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-red-400 hover:text-red-500"
            >
              <X size={14} />
            </button>
          </div>
          {blockEntries.length > 0 && (
            <div className="mt-2 space-y-3 border-t border-border/40 pt-2 pl-3">
              {blockEntries.map(([childKey, child]) => (
                <SettingsRenderer
                  key={childKey}
                  node={child}
                  value={getIn(item, [childKey])}
                  onChange={onChange}
                  color={color}
                  path={[...path, idx, childKey]}
                />
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        <Plus size={14} aria-hidden /> Add {node.itemSchema.label.toLowerCase()}
      </button>
    </div>
  );
}

/* ── recursive walk ────────────────────────────────────────────────────── */

export function SettingsRenderer({
  node,
  value,
  onChange,
  color,
  path = [],
  compact,
  resettable,
}: RendererProps) {
  if (node.__type === "leaf") {
    return (
      <LeafView
        leaf={node}
        value={value}
        onChange={(v) => onChange(path, v)}
        color={color}
        compact={compact}
      />
    );
  }

  if (node.__type === "list") {
    return (
      <ListView
        node={node}
        value={(value as unknown[] | undefined) ?? []}
        onChange={onChange}
        color={color}
        path={path}
        resettable={resettable}
      />
    );
  }

  const handleReset = resettable
    ? () => {
        if (!window.confirm(`Reset ${node.label} to defaults?`)) return;
        onChange(path, defaultsFrom(node));
      }
    : null;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {node.label}
          {node.description && (
            <span className="ml-1 text-muted-foreground/70">· {node.description}</span>
          )}
        </p>
        {handleReset && (
          <button
            type="button"
            onClick={handleReset}
            title={`Reset ${node.label} to defaults`}
            aria-label={`Reset ${node.label} to defaults`}
            className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            <RotateCcw size={10} aria-hidden /> reset
          </button>
        )}
      </div>
      <div className="divide-y divide-border/60">
        {Object.entries(node.children).map(([key, child]) => (
          <SettingsRenderer
            key={key}
            node={child}
            value={getIn(value, [key])}
            onChange={onChange}
            color={color}
            path={[...path, key]}
            resettable={resettable}
          />
        ))}
      </div>
    </section>
  );
}

/* ── headless top-level helper ─────────────────────────────────────────── */

/**
 * Render a single group as the children of a card without its own caption
 * (caller already supplies the CardHeader). Useful when you want the card
 * shell to come from the page but the body to be schema-driven.
 */
export function SettingsCardBody({
  node,
  value,
  onChange,
  color,
}: Omit<RendererProps, "path" | "compact"> & { node: Group }) {
  return (
    <div className="space-y-6">
      {Object.entries(node.children).map(([key, child]) => (
        <SettingsRenderer
          key={key}
          node={child}
          value={getIn(value, [key])}
          onChange={onChange}
          color={color}
          path={[key]}
        />
      ))}
    </div>
  );
}
