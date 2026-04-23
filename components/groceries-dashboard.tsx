"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { ShoppingCart, X } from "lucide-react";

import {
  getGroceries,
  addGroceryItem,
  patchGroceryItem,
  type GroceryItem,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  SectionHeaderAction,
  SectionHeaderActionButton,
} from "@/components/section-header-action";
import { TaskGroup, TaskRow } from "@/components/tasks";
import { StatCard } from "@/components/stat-card";
import { revalidateAfterLog } from "@/components/quick-log-forms";

const CATEGORIES = ["produce", "dairy", "grains", "meat", "frozen", "household", "other"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_EMOJI: Record<Category, string> = {
  produce: "🥬",
  dairy: "🥛",
  grains: "🌾",
  meat: "🥩",
  frozen: "🧊",
  household: "🧹",
  other: "📦",
};

function relativeDays(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso + "T00:00:00");
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function GroceriesDashboard() {
  const GROCERIES_COLOR = "var(--section-accent)";
  const { data, isLoading, mutate } = useSWR("groceries", getGroceries);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [shopperMode, setShopperMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("other");
  const [newEmoji, setNewEmoji] = useState("📦");

  const items = data?.items ?? [];

  const grouped = useMemo(() => {
    const g: Partial<Record<Category, GroceryItem[]>> = {};
    for (const c of CATEGORIES) g[c] = [];
    for (const it of items) {
      const cat = (CATEGORIES.includes(it.category as Category) ? it.category : "other") as Category;
      g[cat]!.push(it);
    }
    return g;
  }, [items]);

  const lowItems = useMemo(() => items.filter((i) => i.low), [items]);
  const lowCount = lowItems.length;

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) return;
    setPending((p) => new Set(p).add("__add__"));
    try {
      await addGroceryItem(newName.trim(), newCategory, newEmoji);
      setNewName("");
      setNewEmoji("📦");
      setShowAdd(false);
      await mutate();
    } finally {
      setPending((p) => { const n = new Set(p); n.delete("__add__"); return n; });
    }
  }, [newName, newCategory, newEmoji, mutate]);

  const toggleLow = useCallback(async (it: GroceryItem) => {
    setPending((p) => new Set(p).add(it.id));
    try {
      await patchGroceryItem(it.id, { low: !it.low });
      await mutate();
      revalidateAfterLog("groceries");
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(it.id); return n; });
    }
  }, [mutate]);

  return (
    <>
      {!shopperMode && (
        <SectionHeaderAction>
          <SectionHeaderActionButton color={GROCERIES_COLOR} onClick={() => setShowAdd((v) => !v)}>
            + Add
          </SectionHeaderActionButton>
        </SectionHeaderAction>
      )}

      <div className="mb-6 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Need"
          value={lowCount > 0 ? lowCount : null}
          sublabel="items running low"
          color={GROCERIES_COLOR}
        />
        <button
          onClick={() => setShopperMode((m) => !m)}
          disabled={lowCount === 0}
          className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:bg-muted/50 disabled:opacity-50"
          style={shopperMode ? { borderColor: GROCERIES_COLOR, backgroundColor: `${GROCERIES_COLOR}15` } : undefined}
        >
          <ShoppingCart size={18} className="mb-1" style={{ color: shopperMode ? GROCERIES_COLOR : undefined }} />
          <p className="text-xs text-muted-foreground">{shopperMode ? "Exit shopper mode" : "Shopper mode"}</p>
          <p className="text-xs text-muted-foreground">{lowCount === 0 ? "Nothing to buy" : `${lowCount} to check off`}</p>
        </button>
      </div>

      {!shopperMode && showAdd && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Emoji</label>
              <input className="w-14 rounded-md border bg-background px-2 py-1.5 text-center text-lg" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value.slice(0, 2))} />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm" placeholder="e.g. Oats" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={newCategory} onChange={(e) => setNewCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (<option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>))}
              </select>
            </div>
            <button onClick={handleAdd} disabled={!newName.trim() || pending.has("__add__")} className="rounded-md px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: GROCERIES_COLOR }}>
              {pending.has("__add__") ? "…" : "Add"}
            </button>
            <button onClick={() => { setShowAdd(false); setNewName(""); }} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shopperMode ? (
        lowItems.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing on the list. Exit shopper mode to manage items.</CardContent></Card>
        ) : (
          <TaskGroup title="Shopping list" emoji="🛒" accent={GROCERIES_COLOR} doneCount={0} totalCount={lowItems.length}>
            {lowItems.map((it) => (
              <TaskRow
                key={it.id}
                label={it.name}
                emoji={it.emoji}
                done={false}
                pending={pending.has(it.id)}
                accent={GROCERIES_COLOR}
                onClick={() => toggleLow(it)}
              />
            ))}
          </TaskGroup>
        )
      ) : items.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No grocery items yet. Tap "+ Add" to get started.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((cat) => {
            const catItems = grouped[cat] ?? [];
            if (catItems.length === 0) return null;
            return (
              <TaskGroup key={cat} title={cat.charAt(0).toUpperCase() + cat.slice(1)} emoji={CATEGORY_EMOJI[cat]} accent={GROCERIES_COLOR} doneCount={catItems.filter((i) => i.low).length} totalCount={catItems.length}>
                {catItems.map((it) => (
                  <div key={it.id} className="flex items-center gap-2">
                    <TaskRow
                      label={it.name}
                      emoji={it.emoji}
                      sublabel={relativeDays(it.last_bought)}
                      done={it.low}
                      pending={pending.has(it.id)}
                      accent={GROCERIES_COLOR}
                      onClick={() => toggleLow(it)}
                    />
                  </div>
                ))}
              </TaskGroup>
            );
          })}
        </div>
      )}

    </>
  );
}
