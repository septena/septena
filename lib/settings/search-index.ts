/**
 * Walks a schema tree and produces a flat list of every leaf, with the
 * breadcrumb that led to it. Used by `<SettingsSearch>` to fuzzy-filter
 * settings by label/description and jump straight to the matching card.
 */

import type { Node } from "./schema";

export interface SearchEntry {
  /** Full human breadcrumb, e.g. "Targets › Macros › Protein". */
  breadcrumb: string;
  /** Leaf label only — what the user is most likely typing. */
  label: string;
  /** Description text from the schema, if any. */
  description?: string;
  /** DOM id of the card the leaf belongs to — search results scroll to it. */
  cardId: string;
}

export function indexSchema(
  rootLabel: string,
  cardId: string,
  node: Node,
  trail: string[] = [],
): SearchEntry[] {
  const path = [...trail, node.label];
  if (node.__type === "leaf") {
    return [
      {
        breadcrumb: [rootLabel, ...trail].filter(Boolean).join(" › "),
        label: node.label,
        description: node.description,
        cardId,
      },
    ];
  }
  if (node.__type === "list") {
    return indexSchema(rootLabel, cardId, node.itemSchema, trail);
  }
  // group
  const out: SearchEntry[] = [];
  for (const child of Object.values(node.children)) {
    out.push(...indexSchema(rootLabel, cardId, child, path));
  }
  return out;
}

/** Lowercased substring match on label, breadcrumb, and description. */
export function filterEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries.filter((e) => {
    const hay = `${e.label} ${e.breadcrumb} ${e.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}
