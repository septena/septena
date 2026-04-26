/**
 * Exercise config def. Like habits, the `type` field's options are
 * dynamic (read from `/api/training/config`). The `subgroup` field is
 * always shown but only meaningful for strength exercises — placeholder
 * tells the user that, no special conditional UI.
 */

import {
  addExercise,
  deleteExercise,
  type ExerciseConfigItem,
  type ExerciseType,
  getExerciseConfig,
  updateExercise,
} from "@/lib/api";
import { enumField, group, stringField } from "../schema";
import { defineSectionConfig, type SectionConfigDef } from "../section-config";

export function makeExercisesDef(
  types: readonly ExerciseType[],
): SectionConfigDef<ExerciseConfigItem> {
  const typeIds = types.length > 0 ? types.map((t) => t.id) : (["strength"] as const);
  const fallback = typeIds[0];

  const exerciseItemSchema = group("Exercise", {
    name: stringField({ label: "Name", placeholder: "Exercise name", width: "wide", default: "" }),
    type: enumField(typeIds as readonly string[], {
      label: "Type",
      labels: Object.fromEntries(types.map((t) => [t.id, t.label])),
      default: fallback,
    }),
    subgroup: stringField({
      label: "Subgroup",
      placeholder: "upper / lower (strength)",
      width: "default",
      default: "",
    }),
  });

  return defineSectionConfig<ExerciseConfigItem>({
    swrKey: "training-config",
    fetcher: getExerciseConfig,
    selectItems: (data) => (data as { exercises: ExerciseConfigItem[] }).exercises ?? [],
    add: ({ name, type, subgroup }) =>
      addExercise(
        (name as string) ?? "New exercise",
        (type as string) ?? fallback,
        subgroup as string | undefined,
      ),
    update: (id, patch) =>
      updateExercise(id, {
        name: patch.name as string | undefined,
        type: patch.type as string | undefined,
        subgroup: patch.subgroup as string | undefined,
      }),
    remove: (id) => deleteExercise(id),
    itemSchema: exerciseItemSchema,
    emptyLabel: "No exercises yet.",
    addLabel: "exercise",
    defaultNewItem: () => ({ name: "New exercise", type: fallback, subgroup: "" }),
    groupBy: (item) => item.type,
    groupLabel: (key) => types.find((t) => t.id === key)?.label ?? key,
    invalidates: ["exercises", "training-summary"],
  });
}
