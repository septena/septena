"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Emoji } from "@/components/ui/emoji";

// Shared "do the thing today" primitives — one TaskRow and one TaskGroup for
// every section whose UX is a checklist (habits, supplements, chores, and the
// homepage quick-log widgets that drive the same endpoints). Rows never
// disappear when completed; they flip to the accent-filled state and stay
// tappable to undo. Editing the *set* of tasks lives elsewhere (per-section
// settings page) — there is no add/edit/delete affordance on the row itself.
//
// Optional `actions` slot exposes section-specific secondary verbs
// (defer/reschedule/cancel/move-to-today) through a trailing ⋯ menu, so each
// section gets the same affordance shape instead of inventing its own button
// row. Toggle stays the primary tap target.

export type TaskRowAction = {
  label: string;
  onSelect: () => void;
  tone?: "default" | "destructive";
  disabled?: boolean;
};

export function TaskRow({
  label,
  emoji,
  sublabel,
  sublabelTone,
  done,
  pending,
  accent,
  onClick,
  muted,
  actions,
}: {
  label: string;
  emoji?: string;
  sublabel?: string;
  sublabelTone?: "warn";
  done: boolean;
  pending: boolean;
  accent: string;
  onClick: () => void;
  /** Undone item rendered dimmed + struck-through. Used for habits whose
   *  bucket cutoff has passed without completion. Ignored when `done`. */
  muted?: boolean;
  /** Secondary actions shown in a trailing ⋯ menu. Omit or pass [] to hide. */
  actions?: TaskRowAction[];
}) {
  const hasActions = !!actions && actions.length > 0;

  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 items-stretch overflow-hidden rounded-xl border text-sm transition-colors",
        done
          ? "border-transparent text-white"
          : "border-border bg-card hover:border-[color:var(--task-accent)]",
        pending && "opacity-60",
      )}
      style={
        {
          backgroundColor: done ? accent : undefined,
          ["--task-accent" as string]: accent,
        } as React.CSSProperties
      }
    >
      {/* Section-accent "ear" — same vocabulary as the homepage SectionCard
          and NextWidget tiles. Hidden on done rows where the accent already
          floods the entire row. */}
      {!done && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1"
          style={{ backgroundColor: accent }}
        />
      )}

      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold",
            done ? "border-white bg-white" : "border-border bg-card",
          )}
          style={done ? { color: accent } : undefined}
        >
          {done ? "✓" : ""}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Emoji className="shrink-0">{emoji}</Emoji>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate font-medium",
                muted && !done && "opacity-70",
              )}
            >
              {label}
            </span>
            {sublabel && (
              <span
                className={cn(
                  "block text-xs",
                  done
                    ? "text-white/80"
                    : sublabelTone === "warn"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
              >
                {sublabel}
              </span>
            )}
          </span>
        </span>
      </button>

      {hasActions && (
        <RowActionsMenu
          actions={actions!}
          tone={done ? "on-accent" : "default"}
          disabled={pending}
        />
      )}
    </div>
  );
}

export function RowActionsMenu({
  actions,
  tone = "default",
  disabled,
}: {
  actions: TaskRowAction[];
  tone?: "default" | "on-accent";
  disabled?: boolean;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        aria-label="More actions"
        className={cn(
          "flex shrink-0 items-center justify-center self-stretch px-3 transition-colors outline-none",
          tone === "on-accent"
            ? "text-white hover:bg-white/15"
            : "text-foreground hover:bg-muted",
        )}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2.5} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Menu.Popup className="min-w-44 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            {actions.map((action, i) => (
              <Menu.Item
                key={i}
                disabled={action.disabled}
                onClick={() => action.onSelect()}
                className={cn(
                  "flex cursor-default select-none items-center rounded-md px-2.5 py-1.5 outline-none transition-colors",
                  "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                  "data-disabled:pointer-events-none data-disabled:opacity-50",
                  action.tone === "destructive" &&
                    "text-destructive data-highlighted:bg-destructive data-highlighted:text-white",
                )}
              >
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function TaskGroup({
  title,
  emoji,
  accent,
  doneCount,
  totalCount,
  collapsible,
  defaultCollapsed,
  nowBadge,
  statusLabel,
  statusColor,
  emptyHint,
  children,
}: {
  title?: string;
  emoji?: string;
  accent: string;
  doneCount: number;
  totalCount: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** "NOW" pill next to the title, tinted with the section accent. */
  nowBadge?: boolean;
  /** Small inline label after the title (e.g. "2h 15m left"). */
  statusLabel?: string;
  statusColor?: string;
  emptyHint?: string;
  children: React.ReactNode;
}) {
  const empty = totalCount === 0;
  const showHeader = title !== undefined;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  const headerRow = showHeader ? (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Emoji className="shrink-0">{emoji}</Emoji>
        <span className="truncate text-base font-medium">{title}</span>
        {nowBadge && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            NOW
          </span>
        )}
        {statusLabel && (
          <span
            className="shrink-0 text-xs font-normal"
            style={{ color: statusColor ?? accent }}
          >
            {statusLabel}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: accent }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {doneCount}/{totalCount}
        </span>
      </div>
    </div>
  ) : null;

  const body = empty ? (
    emptyHint ? (
      <p className="text-xs text-muted-foreground">{emptyHint}</p>
    ) : null
  ) : (
    <div className="space-y-2">{children}</div>
  );

  if (!showHeader) {
    return <div className="min-w-0">{body}</div>;
  }

  if (collapsible) {
    return (
      <Card className="min-w-0">
        <details open={!defaultCollapsed} className="group">
          <summary className="cursor-pointer list-none select-none px-4 py-3">
            {headerRow}
          </summary>
          <div className="border-t border-border px-4 py-3">{body}</div>
        </details>
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">{headerRow}</CardHeader>
      <CardContent className="pt-0">{body}</CardContent>
    </Card>
  );
}
