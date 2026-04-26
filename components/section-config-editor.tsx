"use client";

/**
 * Generic per-section config editor. Replaces the hand-built Manage{X}Card
 * components in `manage-items.tsx`. Driven by a SectionConfigDef from
 * `lib/settings/section-config.ts`.
 *
 * UX notes:
 *   • Fields are always-editable inline (compact mode of <SettingsRenderer>),
 *     with a 400ms debounce-on-blur PUT — same model as the global settings
 *     cards. No explicit save button.
 *   • Delete still confirms via `window.confirm` (preserves the safety
 *     affordance the bespoke editors had).
 *   • Add appends a new item with `defaultNewItem()` (or schema defaults)
 *     and immediately POSTs.
 *   • SWR invalidates the def's `swrKey` plus any extra keys in
 *     `def.invalidates` after every mutation so dashboards that show
 *     counts (e.g. the section-list "(N)" pill) re-render.
 */

import { Plus, X } from "lucide-react";
import { useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultsFrom, getIn } from "@/lib/settings/schema";
import { SettingsRenderer } from "@/lib/settings/render";
import type { BaseItem, SectionConfigDef } from "@/lib/settings/section-config";

interface Props<Item extends BaseItem> {
  def: SectionConfigDef<Item>;
  color: string;
  /** Card title — defaults to "Manage {addLabel}". */
  title?: string;
}

export function SectionConfigEditor<Item extends BaseItem>({
  def,
  color,
  title,
}: Props<Item>) {
  const { data, isLoading, mutate } = useSWR(def.swrKey, def.fetcher);
  const items = data ? def.selectItems(data) : [];

  // Pending per-field edits coalesced into one PUT per field (debounced
  // 400ms). Mirrors the global settings dashboard's draft pattern but
  // scoped per item-id+field so two rows don't fight over a single timer.
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingValues = useRef<Map<string, unknown>>(new Map());

  async function invalidate() {
    await mutate();
    for (const k of def.invalidates ?? []) {
      await globalMutate(k);
    }
  }

  async function flushFieldUpdate(item: Item, field: string, value: unknown) {
    const patch: Partial<Item> = { [field]: value } as Partial<Item>;
    await def.update(item.id, patch);
    await invalidate();
  }

  function scheduleFieldUpdate(item: Item, field: string, value: unknown) {
    const key = `${item.id}::${field}`;
    pendingValues.current.set(key, value);
    const prev = pendingTimers.current.get(key);
    if (prev) clearTimeout(prev);
    pendingTimers.current.set(
      key,
      setTimeout(() => {
        const v = pendingValues.current.get(key);
        pendingTimers.current.delete(key);
        pendingValues.current.delete(key);
        void flushFieldUpdate(item, field, v);
      }, 400),
    );
  }

  async function handleAdd() {
    const fresh =
      def.defaultNewItem?.() ?? (defaultsFrom(def.itemSchema) as Partial<Item>);
    await def.add(fresh);
    await invalidate();
  }

  async function handleRemove(item: Item) {
    const message =
      def.confirmDelete === undefined
        ? `Delete "${(item as { name?: string }).name ?? item.id}"? Past entries that reference it stay as-is.`
        : def.confirmDelete(item);
    if (message && !window.confirm(message)) return;
    await def.remove(item.id);
    await invalidate();
  }

  // Sort + (optionally) group.
  const sorted = [...items].sort(
    def.sortItems ??
      ((a, b) =>
        String((a as { name?: string }).name ?? a.id).localeCompare(
          String((b as { name?: string }).name ?? b.id),
        )),
  );
  const grouped: Array<[string, Item[]]> = def.groupBy
    ? Array.from(
        sorted.reduce<Map<string, Item[]>>((acc, item) => {
          const key = def.groupBy!(item);
          (acc.get(key) ?? acc.set(key, []).get(key))!.push(item);
          return acc;
        }, new Map()),
      )
    : [["__all__", sorted]];

  const itemEntries = Object.entries(def.itemSchema.children);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title ?? `Manage ${def.addLabel}`}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">{def.emptyLabel}</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([groupKey, groupItems]) => (
              <div key={groupKey}>
                {def.groupBy && (
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {def.groupLabel?.(groupKey) ?? groupKey}
                  </p>
                )}
                <div className="space-y-1">
                  {groupItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
                    >
                      {itemEntries.map(([fieldKey, child]) => (
                        <SettingsRenderer
                          key={fieldKey}
                          node={child}
                          value={getIn(item, [fieldKey])}
                          onChange={(_p, next) =>
                            scheduleFieldUpdate(item, fieldKey, next)
                          }
                          color={color}
                          compact
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => handleRemove(item)}
                        title="Delete"
                        aria-label="Delete"
                        className="ml-auto rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-red-400 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={handleAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            <Plus size={14} aria-hidden /> Add {def.addLabel}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
