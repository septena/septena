/**
 * Habits config def. The `bucket` field's options are dynamic — they
 * come from `settings.day_phases` (one bucket per phase id). So unlike
 * the other defs, habits exposes a *factory* that closes over the live
 * bucket list. Wrapper components fetch `/api/settings`, derive the
 * bucket list, then call `makeHabitsDef(buckets)` for the editor.
 */

import {
  addHabit,
  deleteHabit,
  getHabitConfig,
  type HabitConfigItem,
  updateHabit,
} from "@/lib/api";
import { enumField, group, stringField } from "../schema";
import { defineSectionConfig, type SectionConfigDef } from "../section-config";

export function makeHabitsDef(
  buckets: readonly string[],
): SectionConfigDef<HabitConfigItem> {
  const safeBuckets = buckets.length > 0 ? buckets : (["morning"] as const);
  const fallback = safeBuckets[0];

  const habitItemSchema = group("Habit", {
    emoji: stringField({ label: "Emoji", width: "narrow", default: "✅" }),
    name: stringField({ label: "Name", placeholder: "Habit name", width: "default", default: "" }),
    bucket: enumField(safeBuckets as readonly string[], {
      label: "Bucket",
      default: fallback,
    }),
  });

  return defineSectionConfig<HabitConfigItem>({
    swrKey: "habits-config",
    fetcher: getHabitConfig,
    // Backend returns `{ buckets, grouped, total }` — flatten grouped to
    // a single items list. Order doesn't matter; the editor groups by
    // bucket below.
    selectItems: (data) => {
      const grouped = (data as { grouped?: Record<string, HabitConfigItem[]> }).grouped;
      if (!grouped) return [];
      return Object.values(grouped).flat();
    },
    add: ({ name, bucket, emoji }) =>
      addHabit(
        (name as string) ?? "New habit",
        (bucket as string) ?? fallback,
        emoji as string | undefined,
      ),
    update: (id, patch) =>
      updateHabit(id, {
        name: patch.name as string | undefined,
        bucket: patch.bucket as string | undefined,
        emoji: patch.emoji as string | undefined,
      }),
    remove: (id) => deleteHabit(id),
    itemSchema: habitItemSchema,
    emptyLabel: "No habits yet.",
    addLabel: "habit",
    defaultNewItem: () => ({ name: "New habit", emoji: "✅", bucket: fallback }),
    groupBy: (item) => item.bucket,
    invalidates: ["quicklog-habits", "overview-habits"],
  });
}
