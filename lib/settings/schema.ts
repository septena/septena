/**
 * Tiny declarative schema for app settings.
 *
 * One node = one setting (or a group of them). Schemas drive three things at
 * once: TypeScript types (via Infer<>), default values (via defaultsFrom()),
 * and the rendered UI (via <SettingsRenderer>). Validation can be plugged in
 * later from the same tree without touching call sites.
 */

export type FieldHint = "inline" | "drill";

interface BaseLeaf<V> {
  __type: "leaf";
  label: string;
  description?: string;
  default: V;
  /** UI hint: render the control next to the label (default for toggles,
   *  small numbers, colors) or push it into a drill-down screen. */
  hint?: FieldHint;
  /** Stable key under the parent group's value. Filled in by the renderer
   *  from the schema's surrounding object key — authors don't set it. */
}

export interface NumberLeaf extends BaseLeaf<number> {
  kind: "number";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface RangeLeaf extends BaseLeaf<[number, number]> {
  kind: "range";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface ToggleLeaf extends BaseLeaf<boolean> {
  kind: "toggle";
}

export interface EnumLeaf<O extends readonly string[]> extends BaseLeaf<O[number]> {
  kind: "enum";
  options: O;
  /** Optional pretty labels, indexed by option value. */
  labels?: Partial<Record<O[number], string>>;
}

export type Leaf =
  | NumberLeaf
  | RangeLeaf
  | ToggleLeaf
  | EnumLeaf<readonly string[]>;

export interface Group<C extends Record<string, Node> = Record<string, Node>> {
  __type: "group";
  label: string;
  description?: string;
  children: C;
}

export type Node = Leaf | Group;

/* ── builders ──────────────────────────────────────────────────────────── */

export function group<C extends Record<string, Node>>(
  label: string,
  children: C,
  opts?: { description?: string },
): Group<C> {
  return { __type: "group", label, children, description: opts?.description };
}

export function numField(opts: Omit<NumberLeaf, "kind" | "__type">): NumberLeaf {
  return { __type: "leaf", kind: "number", ...opts };
}

export function rangeField(opts: Omit<RangeLeaf, "kind" | "__type">): RangeLeaf {
  return { __type: "leaf", kind: "range", ...opts };
}

export function toggle(opts: Omit<ToggleLeaf, "kind" | "__type">): ToggleLeaf {
  return { __type: "leaf", kind: "toggle", ...opts };
}

export function enumField<const O extends readonly string[]>(
  options: O,
  opts: Omit<EnumLeaf<O>, "kind" | "__type" | "options">,
): EnumLeaf<O> {
  return { __type: "leaf", kind: "enum", options, ...opts };
}

/* ── inference ─────────────────────────────────────────────────────────── */

export type Infer<T extends Node> = T extends Group<infer C>
  ? { [K in keyof C]: C[K] extends Node ? Infer<C[K]> : never }
  : T extends BaseLeaf<infer V>
    ? V
    : never;

export function defaultsFrom<T extends Node>(node: T): Infer<T> {
  if (node.__type === "leaf") {
    return node.default as Infer<T>;
  }
  const out: Record<string, unknown> = {};
  for (const [k, child] of Object.entries(node.children)) {
    out[k] = defaultsFrom(child as Node);
  }
  return out as Infer<T>;
}

/* ── helpers for partial updates ───────────────────────────────────────── */

/**
 * Set a deeply nested value by path, returning a new object. Used by the
 * renderer to convert a leaf change into a top-level patch the caller can
 * merge into draft state.
 */
export function setIn<T>(obj: T, path: readonly (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const cur = (obj as unknown as Record<string | number, unknown>) ?? {};
  return {
    ...cur,
    [head]: setIn(cur[head] as unknown, rest, value),
  } as T;
}

export function getIn(obj: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}
