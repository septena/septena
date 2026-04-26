/**
 * Groceries config def. Adds a category enum (hardcoded list) and
 * groups items by category so the list reads as a categorized roster.
 */

import {
  addGroceryItem,
  deleteGroceryItem,
  getGroceries,
  patchGroceryItem,
  type GroceryItem,
} from "@/lib/api";
import { enumField, group, stringField } from "../schema";
import { defineSectionConfig } from "../section-config";

const GROCERY_CATEGORIES = [
  "produce",
  "dairy",
  "grains",
  "meat",
  "frozen",
  "household",
  "other",
] as const;

const GROCERY_CATEGORY_EMOJI: Record<(typeof GROCERY_CATEGORIES)[number], string> = {
  produce: "🥬",
  dairy: "🥛",
  grains: "🌾",
  meat: "🥩",
  frozen: "🧊",
  household: "🧹",
  other: "📦",
};

const groceryItemSchema = group("Item", {
  emoji: stringField({ label: "Emoji", width: "narrow", default: "📦" }),
  name: stringField({ label: "Name", placeholder: "Item name", width: "default", default: "" }),
  category: enumField(GROCERY_CATEGORIES, {
    label: "Category",
    labels: Object.fromEntries(
      GROCERY_CATEGORIES.map((c) => [c, `${GROCERY_CATEGORY_EMOJI[c]} ${c}`]),
    ),
    default: "other",
  }),
});

export const groceriesDef = defineSectionConfig<GroceryItem>({
  swrKey: "groceries",
  fetcher: getGroceries,
  selectItems: (data) => (data as { items: GroceryItem[] }).items ?? [],
  add: ({ name, category, emoji }) =>
    addGroceryItem(
      (name as string) ?? "New item",
      category as string | undefined,
      emoji as string | undefined,
    ),
  update: (id, patch) => patchGroceryItem(id, patch as Partial<GroceryItem>),
  remove: (id) => deleteGroceryItem(id),
  itemSchema: groceryItemSchema,
  emptyLabel: "No grocery items yet.",
  addLabel: "item",
  defaultNewItem: () => ({ name: "New item", emoji: "📦", category: "other" }),
  groupBy: (item) => item.category,
  groupLabel: (key) =>
    `${GROCERY_CATEGORY_EMOJI[key as (typeof GROCERY_CATEGORIES)[number]] ?? ""} ${key}`,
});
