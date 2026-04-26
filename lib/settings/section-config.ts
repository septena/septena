/**
 * Section-local config definitions.
 *
 * Each per-section settings card (Manage Strains, Manage Beans, Manage
 * Habits, …) used to be a hand-built component in `manage-items.tsx`. They
 * all do the same thing: list items, edit fields inline, add a row, remove
 * a row. This module turns that pattern into a single declarative def the
 * generic `<SectionConfigEditor>` (components/section-config-editor.tsx)
 * can render.
 *
 * Adding a new section's config UI is now: write one def, mount the
 * component on the per-section settings page. No bespoke React.
 */

import type { Group } from "./schema";

/** Anything with an id — every section item has one. The component reads
 *  other fields via `getIn(item, [fieldKey])` so we deliberately don't pin
 *  an index signature; concrete shapes (Strain, Bean, Habit, …) just need
 *  an `id`. */
export interface BaseItem {
  id: string;
}

export interface SectionConfigDef<Item extends BaseItem> {
  /** SWR cache key for the list. Used both for fetching and invalidation. */
  swrKey: string;

  /** Fetch the current list. The fetcher returns the section's full config
   *  payload; the def picks `items` out via `selectItems`. */
  fetcher: () => Promise<unknown>;
  /** Project the fetcher's response onto the item array. */
  selectItems: (data: unknown) => Item[];

  /** CRUD endpoints, fully typed. The component awaits each before
   *  invalidating SWR so the list re-renders with fresh data. */
  add: (input: Partial<Item>) => Promise<unknown>;
  update: (id: string, patch: Partial<Item>) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;

  /** Item shape — drives the editable fields rendered per row. The schema
   *  carries labels, placeholders, units, and validation hints. */
  itemSchema: Group;

  /** Empty-state copy when the list is empty. */
  emptyLabel: string;
  /** Button label / placeholder used by the +Add row. */
  addLabel: string;
  /** Optional fields to seed when the user clicks +Add. */
  defaultNewItem?: () => Partial<Item>;

  /** Extra SWR keys to invalidate after a mutation (e.g. dashboards that
   *  show counts). The primary `swrKey` is invalidated automatically. */
  invalidates?: string[];

  /** Optional grouping. Returns the group key for an item; the editor
   *  renders one sub-section per distinct key. */
  groupBy?: (item: Item) => string;
  /** Optional pretty label for a group key (defaults to the key itself). */
  groupLabel?: (key: string) => string;
  /** Optional sort within a group (defaults to name asc). */
  sortItems?: (a: Item, b: Item) => number;

  /** Optional confirmation copy for delete. Returning null disables
   *  confirmation; default uses `${item.name}`. */
  confirmDelete?: (item: Item) => string | null;
}

/**
 * Identity helper — lets call sites get type-checked on the Item generic
 * without TypeScript widening it to `BaseItem`. Pure ergonomics.
 */
export function defineSectionConfig<Item extends BaseItem>(
  def: SectionConfigDef<Item>,
): SectionConfigDef<Item> {
  return def;
}
