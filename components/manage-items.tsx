"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addHabit,
  addSupplement,
  createChoreDefinition,
  deleteChoreDefinition,
  deleteHabit,
  deleteSupplement,
  getChores,
  getHabitConfig,
  getSettings,
  getSupplementConfig,
  updateChoreDefinition,
  updateHabit,
  updateSupplement,
  type Chore,
  type DayPhase,
  type HabitBucket,
  type HabitConfigItem,
} from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { DEFAULT_DAY_PHASES } from "@/lib/day-phases";

// Inline per-item editing lives here — one card per configurable section
// (habits, supplements, chores) rendered on /settings/{section}. Keeps the
// section dashboards focused on "do the thing today" with no editing chrome.

function useDayPhases(): DayPhase[] {
  const { data } = useSWR("settings", getSettings);
  return data?.day_phases ?? DEFAULT_DAY_PHASES;
}

// ── Shared primitives ────────────────────────────────────────────────────────

function IconButton({
  onClick,
  title,
  children,
  tone,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  tone?: "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={[
        "shrink-0 rounded-md border border-transparent px-2 py-1 text-xs transition-colors",
        "hover:border-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent",
        tone === "danger" ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      className={[
        "rounded-lg border border-input bg-background px-3 py-1.5 text-sm",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        className ?? "flex-1",
      ].join(" ")}
    />
  );
}

function EmojiInput({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="·"
      aria-label="Emoji"
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      className={[
        "w-12 shrink-0 rounded-lg border border-input bg-background px-3 py-1.5 text-center text-sm",
        "placeholder:text-muted-foreground/50",
        "focus:outline-none focus:ring-1 focus:ring-ring",
      ].join(" ")}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min = 1,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "rounded-lg border border-input bg-background px-2 py-1.5 text-center text-sm tabular-nums",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        className ?? "w-20",
      ].join(" ")}
    />
  );
}

function BucketPicker({
  value,
  onChange,
  accent,
}: {
  value: HabitBucket;
  onChange: (b: HabitBucket) => void;
  accent: string;
}) {
  const phases = useDayPhases();
  return (
    <div className="flex gap-1">
      {phases.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={[
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            value === p.id ? "border-transparent text-white" : "border-border bg-card hover:border-foreground/30",
          ].join(" ")}
          style={value === p.id ? { backgroundColor: accent } : undefined}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function SaveCancel({
  onSave,
  onCancel,
  saving,
  accent,
  disabled,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

function ShellCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tap a row to edit. New items append to the bottom.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">{children}</CardContent>
    </Card>
  );
}

// ── Habits ───────────────────────────────────────────────────────────────────

export function ManageHabitsCard() {
  const accent = SECTIONS.habits.color;
  const { data, mutate, isLoading } = useSWR("habits-config", getHabitConfig);
  const phases = useDayPhases();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <ShellCard title="Manage habits">
      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        phases.map((phase) => {
          const bucket = phase.id;
          const items = data?.grouped[bucket] ?? [];
          return (
            <div key={bucket}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {phase.label}
              </p>
              <div className="space-y-1">
                {items.length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">No habits in this bucket.</p>
                )}
                {items.map((h) =>
                  editingId === h.id ? (
                    <HabitEditRow
                      key={h.id}
                      habit={h}
                      accent={accent}
                      onCancel={() => setEditingId(null)}
                      onSaved={async () => {
                        setEditingId(null);
                        await mutate();
                        globalMutate("quicklog-habits");
                        globalMutate("overview-habits");
                      }}
                    />
                  ) : (
                    <HabitDisplayRow
                      key={h.id}
                      habit={h}
                      onEdit={() => setEditingId(h.id)}
                      onDeleted={async () => {
                        await mutate();
                        globalMutate("quicklog-habits");
                        globalMutate("overview-habits");
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })
      )}

      <div className="border-t border-border pt-3">
        <HabitAddRow
          accent={accent}
          onAdded={async () => {
            await mutate();
            globalMutate("quicklog-habits");
            globalMutate("overview-habits");
          }}
        />
      </div>
    </ShellCard>
  );
}

function HabitDisplayRow({
  habit,
  onEdit,
  onDeleted,
}: {
  habit: HabitConfigItem;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  async function onDelete() {
    if (!confirm(`Delete "${habit.name}"? Historical logs are preserved.`)) return;
    setDeleting(true);
    try {
      await deleteHabit(habit.id);
      await onDeleted();
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{habit.name}</span>
      <IconButton onClick={onEdit} title="Edit habit">
        Edit
      </IconButton>
      <IconButton onClick={onDelete} title="Delete habit" tone="danger" disabled={deleting}>
        Delete
      </IconButton>
    </div>
  );
}

function HabitEditRow({
  habit,
  accent,
  onCancel,
  onSaved,
}: {
  habit: HabitConfigItem;
  accent: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(habit.name);
  const [bucket, setBucket] = useState<HabitBucket>(habit.bucket);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateHabit(habit.id, { name: name.trim(), bucket });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <TextInput value={name} onChange={setName} autoFocus onEnter={onSave} className="min-w-[10rem] flex-1" />
      <BucketPicker value={bucket} onChange={setBucket} accent={accent} />
      <SaveCancel onSave={onSave} onCancel={onCancel} saving={saving} accent={accent} disabled={!name.trim()} />
    </div>
  );
}

function HabitAddRow({ accent, onAdded }: { accent: string; onAdded: () => Promise<void> }) {
  const phases = useDayPhases();
  const defaultBucket = phases[0]?.id ?? "morning";
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState<HabitBucket>(defaultBucket);
  const [saving, setSaving] = useState(false);

  async function onAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addHabit(name.trim(), bucket);
      setName("");
      setBucket(defaultBucket);
      await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TextInput value={name} onChange={setName} placeholder="New habit…" onEnter={onAdd} className="min-w-[10rem] flex-1" />
      <BucketPicker value={bucket} onChange={setBucket} accent={accent} />
      <button
        type="button"
        onClick={onAdd}
        disabled={!name.trim() || saving}
        className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {saving ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

// ── Supplements ──────────────────────────────────────────────────────────────

export function ManageSupplementsCard() {
  const accent = SECTIONS.supplements.color;
  const { data, mutate, isLoading } = useSWR("supplements-config", getSupplementConfig);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refresh() {
    await mutate();
    globalMutate("supplements");
    globalMutate("quicklog-supplements");
    globalMutate("overview-supplements");
  }

  return (
    <ShellCard title="Manage supplements">
      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {(data?.supplements ?? []).length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">No supplements yet.</p>
          )}
          {(data?.supplements ?? []).map((s) =>
            editingId === s.id ? (
              <SupplementEditRow
                key={s.id}
                supplement={s}
                accent={accent}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refresh();
                }}
              />
            ) : (
              <SupplementDisplayRow
                key={s.id}
                supplement={s}
                onEdit={() => setEditingId(s.id)}
                onDeleted={refresh}
              />
            ),
          )}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <SupplementAddRow accent={accent} onAdded={refresh} />
      </div>
    </ShellCard>
  );
}

type SupplementConfigItem = { id: string; name: string; emoji: string };

function SupplementDisplayRow({
  supplement,
  onEdit,
  onDeleted,
}: {
  supplement: SupplementConfigItem;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  async function onDelete() {
    if (!confirm(`Delete "${supplement.name}"? Historical logs are preserved.`)) return;
    setDeleting(true);
    try {
      await deleteSupplement(supplement.id);
      await onDeleted();
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span className="w-6 shrink-0 text-center text-base">{supplement.emoji || "·"}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{supplement.name}</span>
      <IconButton onClick={onEdit} title="Edit supplement">
        Edit
      </IconButton>
      <IconButton onClick={onDelete} title="Delete supplement" tone="danger" disabled={deleting}>
        Delete
      </IconButton>
    </div>
  );
}

function SupplementEditRow({
  supplement,
  accent,
  onCancel,
  onSaved,
}: {
  supplement: SupplementConfigItem;
  accent: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(supplement.name);
  const [emoji, setEmoji] = useState(supplement.emoji ?? "");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateSupplement(supplement.id, { name: name.trim(), emoji });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <EmojiInput value={emoji} onChange={setEmoji} />
      <TextInput value={name} onChange={setName} autoFocus onEnter={onSave} className="flex-1" />
      <SaveCancel onSave={onSave} onCancel={onCancel} saving={saving} accent={accent} disabled={!name.trim()} />
    </div>
  );
}

function SupplementAddRow({ accent, onAdded }: { accent: string; onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [saving, setSaving] = useState(false);

  async function onAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addSupplement(name.trim(), emoji.trim() || undefined);
      setName("");
      setEmoji("");
      await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <EmojiInput value={emoji} onChange={setEmoji} />
      <TextInput value={name} onChange={setName} placeholder="New supplement…" onEnter={onAdd} className="flex-1" />
      <button
        type="button"
        onClick={onAdd}
        disabled={!name.trim() || saving}
        className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {saving ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

// ── Chores ───────────────────────────────────────────────────────────────────

const CADENCE_PRESETS: Array<{ label: string; days: number }> = [
  { label: "Daily", days: 1 },
  { label: "Every Other", days: 2 },
  { label: "Weekly", days: 7 },
  { label: "Biweekly", days: 14 },
  { label: "Monthly", days: 30 },
  { label: "Quarterly", days: 90 },
];

function cadenceLabel(days: number): string {
  const match = CADENCE_PRESETS.find((p) => p.days === days);
  if (match) return match.label;
  if (days === 1) return "Daily";
  return `Every ${days}d`;
}

export function ManageChoresCard() {
  const accent = SECTIONS.chores.color;
  const { data, mutate, isLoading } = useSWR("chores-config", getChores);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refresh() {
    await mutate();
    globalMutate(["chores"]);
    globalMutate("quicklog-chores");
    globalMutate("overview-chores");
  }

  const list = (data?.chores ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ShellCard title="Manage chores">
      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {list.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">No chores yet.</p>
          )}
          {list.map((c) =>
            editingId === c.id ? (
              <ChoreEditRow
                key={c.id}
                chore={c}
                accent={accent}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refresh();
                }}
              />
            ) : (
              <ChoreDisplayRow
                key={c.id}
                chore={c}
                onEdit={() => setEditingId(c.id)}
                onDeleted={refresh}
              />
            ),
          )}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <ChoreAddRow accent={accent} onAdded={refresh} />
      </div>
    </ShellCard>
  );
}

function ChoreDisplayRow({
  chore,
  onEdit,
  onDeleted,
}: {
  chore: Chore;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  async function onDelete() {
    if (!confirm(`Delete "${chore.name}"? Historical logs are preserved.`)) return;
    setDeleting(true);
    try {
      await deleteChoreDefinition(chore.id);
      await onDeleted();
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span className="w-6 shrink-0 text-center text-base">{chore.emoji || "·"}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{chore.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{cadenceLabel(chore.cadence_days)}</span>
      <IconButton onClick={onEdit} title="Edit chore">
        Edit
      </IconButton>
      <IconButton onClick={onDelete} title="Delete chore" tone="danger" disabled={deleting}>
        Delete
      </IconButton>
    </div>
  );
}

function ChoreEditRow({
  chore,
  accent,
  onCancel,
  onSaved,
}: {
  chore: Chore;
  accent: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(chore.name);
  const [emoji, setEmoji] = useState(chore.emoji ?? "");
  const [cadence, setCadence] = useState(String(chore.cadence_days ?? 7));
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const n = parseInt(cadence, 10);
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    try {
      await updateChoreDefinition(chore.id, {
        name: name.trim(),
        emoji: emoji.trim() || undefined,
        cadence_days: n,
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <EmojiInput value={emoji} onChange={setEmoji} />
        <TextInput value={name} onChange={setName} autoFocus onEnter={onSave} className="flex-1" />
        <NumberInput value={cadence} onChange={setCadence} className="w-16" />
        <span className="shrink-0 text-xs text-muted-foreground">days</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {CADENCE_PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setCadence(String(p.days))}
            className={[
              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              parseInt(cadence, 10) === p.days
                ? "border-transparent text-white"
                : "border-border bg-card hover:border-foreground/30",
            ].join(" ")}
            style={parseInt(cadence, 10) === p.days ? { backgroundColor: accent } : undefined}
          >
            {p.label} ({p.days}d)
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <SaveCancel
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
          accent={accent}
          disabled={!name.trim() || !(parseInt(cadence, 10) > 0)}
        />
      </div>
    </div>
  );
}

function ChoreAddRow({ accent, onAdded }: { accent: string; onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [cadence, setCadence] = useState("7");
  const [saving, setSaving] = useState(false);

  async function onAdd() {
    const n = parseInt(cadence, 10);
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    try {
      await createChoreDefinition({
        name: name.trim(),
        cadence_days: n,
        emoji: emoji.trim() || undefined,
      });
      setName("");
      setEmoji("");
      setCadence("7");
      await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <EmojiInput value={emoji} onChange={setEmoji} />
        <TextInput value={name} onChange={setName} placeholder="New chore…" onEnter={onAdd} className="flex-1" />
        <NumberInput value={cadence} onChange={setCadence} className="w-16" />
        <span className="shrink-0 text-xs text-muted-foreground">days</span>
        <button
          type="button"
          onClick={onAdd}
          disabled={!name.trim() || !(parseInt(cadence, 10) > 0) || saving}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {CADENCE_PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setCadence(String(p.days))}
            className={[
              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              parseInt(cadence, 10) === p.days
                ? "border-transparent text-white"
                : "border-border bg-card hover:border-foreground/30",
            ].join(" ")}
            style={parseInt(cadence, 10) === p.days ? { backgroundColor: accent } : undefined}
          >
            {p.label} ({p.days}d)
          </button>
        ))}
      </div>
    </div>
  );
}
