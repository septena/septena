/**
 * Supplements config def. Like cannabis/caffeine but with an emoji column.
 */

import {
  addSupplement,
  deleteSupplement,
  getSupplementConfig,
  updateSupplement,
} from "@/lib/api";
import { group, stringField } from "../schema";
import { defineSectionConfig } from "../section-config";

interface Supplement {
  id: string;
  name: string;
  emoji: string;
}

const supplementItemSchema = group("Supplement", {
  emoji: stringField({ label: "Emoji", width: "narrow", default: "💊" }),
  name: stringField({ label: "Name", placeholder: "Supplement name", width: "wide", default: "" }),
});

export const supplementsDef = defineSectionConfig<Supplement>({
  swrKey: "supplements-config",
  fetcher: getSupplementConfig,
  selectItems: (data) => (data as { supplements: Supplement[] }).supplements ?? [],
  add: ({ name, emoji }) => addSupplement(name ?? "New supplement", emoji),
  update: (id, patch) =>
    updateSupplement(id, {
      name: patch.name as string | undefined,
      emoji: patch.emoji as string | undefined,
    }),
  remove: (id) => deleteSupplement(id),
  itemSchema: supplementItemSchema,
  emptyLabel: "No supplements yet.",
  addLabel: "supplement",
  defaultNewItem: () => ({ name: "New supplement", emoji: "💊" }),
  // Quicklog + overview show supplement counts; refresh after a mutation.
  invalidates: ["quicklog-supplements", "overview-supplements"],
});
