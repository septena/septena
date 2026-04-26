/**
 * Chores config def. Items have a numeric `cadence_days` driving the
 * recurring schedule. Computed fields (due_date, last_completed,
 * days_overdue) are NOT in the schema — only the editable ones.
 */

import {
  type Chore,
  createChoreDefinition,
  deleteChoreDefinition,
  getChores,
  updateChoreDefinition,
} from "@/lib/api";
import { group, numField, stringField } from "../schema";
import { defineSectionConfig } from "../section-config";

const choreItemSchema = group("Chore", {
  emoji: stringField({ label: "Emoji", width: "narrow", default: "🧹" }),
  name: stringField({ label: "Name", placeholder: "Chore name", width: "default", default: "" }),
  cadence_days: numField({
    label: "Cadence",
    unit: "d",
    min: 1,
    step: 1,
    default: 7,
  }),
});

export const choresDef = defineSectionConfig<Chore>({
  swrKey: "chores-list",
  fetcher: getChores,
  selectItems: (data) => (data as { chores: Chore[] }).chores ?? [],
  add: ({ name, cadence_days, emoji }) =>
    createChoreDefinition({
      name: (name as string) ?? "New chore",
      cadence_days: (cadence_days as number) ?? 7,
      emoji: emoji as string | undefined,
    }),
  update: (id, patch) =>
    updateChoreDefinition(id, {
      name: patch.name as string | undefined,
      cadence_days: patch.cadence_days as number | undefined,
      emoji: patch.emoji as string | undefined,
    }),
  remove: (id) => deleteChoreDefinition(id),
  itemSchema: choreItemSchema,
  emptyLabel: "No chores yet.",
  addLabel: "chore",
  defaultNewItem: () => ({ name: "New chore", emoji: "🧹", cadence_days: 7 }),
  invalidates: ["chores", "next-actions"],
});
