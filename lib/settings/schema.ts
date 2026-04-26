/**
 * Tiny declarative schema for app settings.
 *
 * One node = one setting (or a group of them). Schemas drive three things at
 * once: TypeScript types (via Infer<>), default values (via defaultsFrom()),
 * and the rendered UI (via <SettingsRenderer>). Validation can be plugged in
 * later from the same tree without touching call sites.
 *
 * Three node kinds:
 *   • Group — a record of named children, rendered as a captioned section
 *   • List  — a homogeneous array of records (each item is itself a Group)
 *   • Leaf  — a single value (number, range, toggle, enum, string, color, time)
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

export interface StringLeaf extends BaseLeaf<string> {
  kind: "string";
  placeholder?: string;
  /** Render as monospace (useful for ids, codes). */
  mono?: boolean;
  /** Visual width hint — narrow for short codes/emoji, wide for free text. */
  width?: "narrow" | "default" | "wide";
}

export interface TimeLeaf extends BaseLeaf<string> {
  kind: "time";
}

export interface ColorLeaf extends BaseLeaf<string> {
  kind: "color";
}

export type Leaf =
  | NumberLeaf
  | RangeLeaf
  | ToggleLeaf
  | EnumLeaf<readonly string[]>
  | StringLeaf
  | TimeLeaf
  | ColorLeaf;

export interface Group<C extends Record<string, Node> = Record<string, Node>> {
  __type: "group";
  label: string;
  description?: string;
  children: C;
}

export interface ListNode<I extends Group = Group> {
  __type: "list";
  label: string;
  description?: string;
  itemSchema: I;
  /** Default list contents (used by defaultsFrom()). */
  default: unknown[];
  /** Factory called when the user clicks +Add. Falls back to defaultsFrom(itemSchema). */
  newItem?: () => unknown;
  /** Optional accessor for a stable id within an item — improves keying & a11y. */
  itemKey?: (item: unknown, index: number) => string;
}

export type Node = Leaf | Group | ListNode;

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

export function stringField(opts: Omit<StringLeaf, "kind" | "__type">): StringLeaf {
  return { __type: "leaf", kind: "string", ...opts };
}

export function timeField(opts: Omit<TimeLeaf, "kind" | "__type">): TimeLeaf {
  return { __type: "leaf", kind: "time", ...opts };
}

export function colorField(opts: Omit<ColorLeaf, "kind" | "__type">): ColorLeaf {
  return { __type: "leaf", kind: "color", ...opts };
}

export function listField<I extends Group>(
  itemSchema: I,
  opts: Omit<ListNode<I>, "__type" | "itemSchema">,
): ListNode<I> {
  return { __type: "list", itemSchema, ...opts };
}

/* ── inference ─────────────────────────────────────────────────────────── */

export type Infer<T extends Node> = T extends Group<infer C>
  ? { [K in keyof C]: C[K] extends Node ? Infer<C[K]> : never }
  : T extends ListNode<infer I>
    ? Infer<I>[]
    : T extends BaseLeaf<infer V>
      ? V
      : never;

export function defaultsFrom<T extends Node>(node: T): Infer<T> {
  if (node.__type === "leaf") {
    return node.default as Infer<T>;
  }
  if (node.__type === "list") {
    return (node.default ?? []) as Infer<T>;
  }
  const out: Record<string, unknown> = {};
  for (const [k, child] of Object.entries(node.children)) {
    out[k] = defaultsFrom(child as Node);
  }
  return out as Infer<T>;
}

/* ── helpers for partial updates ───────────────────────────────────────── */

/**
 * Set a deeply nested value by path, returning a new object/array. Used by
 * the renderer to convert a leaf change into a top-level patch the caller
 * can merge into draft state. Numeric path segments index arrays.
 */
export function setIn<T>(obj: T, path: readonly (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const arr = Array.isArray(obj) ? [...(obj as unknown[])] : [];
    arr[head] = setIn(arr[head], rest, value);
    return arr as unknown as T;
  }
  const cur = (obj as unknown as Record<string, unknown>) ?? {};
  return {
    ...cur,
    [head]: setIn(cur[head] as unknown, rest, value),
  } as T;
}

export function getIn(obj: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    if (typeof k === "number") {
      cur = Array.isArray(cur) ? cur[k] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}
