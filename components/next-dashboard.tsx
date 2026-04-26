"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Circle,
  Clock3,
  ListChecks,
} from "lucide-react";
import { NextActionIcon } from "@/components/next-action-icon";
import { QuickLogModal } from "@/components/quick-log-modal";
import {
  CaffeineQuickLog,
  NutritionQuickLog,
  revalidateAfterLog,
} from "@/components/quick-log-forms";
import { SectionTheme } from "@/components/section-theme";
import { RowActionsMenu, TaskRow, type TaskRowAction } from "@/components/tasks";
import {
  completeChore,
  completeTask,
  toggleHabit,
  toggleSupplement,
  type SectionMeta,
} from "@/lib/api";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { useSectionColor, useSections } from "@/hooks/use-sections";
import {
  useNextActions,
  type ModalKey,
  type NextAction,
} from "@/hooks/use-next-actions";
import { cn } from "@/lib/utils";

function sectionMeta(sections: SectionMeta[], key: SectionKey): SectionMeta {
  return sections.find((s) => s.key === key) ?? {
    ...SECTIONS[key],
    enabled: true,
    show_in_nav: true,
    show_on_dashboard: true,
    order: 0,
  };
}

function NextActionRow({
  action,
  color,
  pending,
  primary,
  onComplete,
  onOpenModal,
  onNavigate,
  onSkip,
}: {
  action: NextAction;
  color: string;
  pending: boolean;
  primary?: boolean;
  onComplete: (action: NextAction) => void;
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (href: string) => void;
  onSkip?: (action: NextAction) => void;
}) {
  const rowActions: TaskRowAction[] | undefined =
    onSkip && action.bucket !== "done"
      ? [{ label: "Skip for now", onSelect: () => onSkip(action) }]
      : undefined;

  if (action.task) {
    return (
      <TaskRow
        label={action.title}
        emoji={action.emoji}
        sublabel={[action.detail, action.reason].filter(Boolean).join(" · ")}
        sublabelTone={action.detail.includes("late") ? "warn" : undefined}
        done={action.bucket === "done"}
        pending={pending}
        accent={color}
        muted={action.muted}
        onClick={() => onComplete(action)}
        actions={rowActions}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-stretch overflow-hidden rounded-xl border transition-colors",
        primary
          ? "border-transparent text-white"
          : "border-border bg-card hover:border-[color:var(--action-accent)]",
        pending && "opacity-60",
      )}
      style={
        {
          backgroundColor: primary ? color : undefined,
          ["--action-accent" as string]: color,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (action.modal) onOpenModal(action.modal);
          else if (action.href) onNavigate(action.href);
        }}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            primary ? "bg-white/20" : "bg-muted",
          )}
        >
          <NextActionIcon action={action} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{action.title}</span>
          <span className={cn("block text-xs", primary ? "text-white/80" : "text-muted-foreground")}>
            {[action.detail, action.reason].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
            primary ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {action.buttonLabel ?? "Open"}
        </span>
      </button>
      {rowActions && (
        <div className="flex shrink-0 items-center">
          <RowActionsMenu
            tone={primary ? "on-accent" : "default"}
            disabled={pending}
            actions={rowActions}
          />
        </div>
      )}
    </div>
  );
}

function ActionPanel({
  title,
  icon,
  actions,
  colors,
  pending,
  empty,
  onComplete,
  onOpenModal,
  onNavigate,
  onSkip,
}: {
  title: string;
  icon: React.ReactNode;
  actions: NextAction[];
  colors: Map<string, string>;
  pending: Set<string>;
  empty?: string;
  onComplete: (action: NextAction) => void;
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (href: string) => void;
  onSkip?: (action: NextAction) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {actions.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{actions.length}</span>
        )}
      </div>
      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty ?? "Nothing here."}</p>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <NextActionRow
              key={action.id}
              action={action}
              color={colors.get(action.section) ?? "var(--section-accent)"}
              pending={pending.has(action.id)}
              onComplete={onComplete}
              onOpenModal={onOpenModal}
              onNavigate={onNavigate}
              onSkip={onSkip}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function NextDashboard() {
  const { date: selectedDate, isToday } = useSelectedDate();
  const router = useRouter();
  const sections = useSections();
  const nextAccent = useSectionColor("next");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [openModal, setOpenModal] = useState<ModalKey | null>(null);

  const { data, isLoading, mutate, computed, skips } = useNextActions(selectedDate, isToday);
  const skip = (action: NextAction) => skips.skip(action.id);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) map.set(s.key, s.color);
    return map;
  }, [sections]);


  async function completeAction(action: NextAction) {
    if (!action.task || pending.has(action.id)) return;
    setPending((prev) => new Set(prev).add(action.id));
    try {
      if (action.task.type === "habit") {
        await toggleHabit(selectedDate, action.task.id, !action.task.done);
        revalidateAfterLog("habits");
      } else if (action.task.type === "supplement") {
        await toggleSupplement(selectedDate, action.task.id, !action.task.done);
        revalidateAfterLog("supplements");
      } else if (action.task.type === "task") {
        await completeTask(action.task.id);
        revalidateAfterLog("tasks");
      } else {
        await completeChore(action.task.id, { date: selectedDate });
        revalidateAfterLog("chores");
      }
      await mutate();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  }

  const openAccent = openModal ? colorMap.get(openModal) ?? nextAccent : nextAccent;
  const OpenForm = openModal === "nutrition" ? NutritionQuickLog : openModal === "caffeine" ? CaffeineQuickLog : null;

  return (
    <SectionTheme sectionKey="next" className="space-y-6">
      {isLoading && !data ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Loading…
        </div>
      ) : computed.primary ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Circle className="h-4 w-4" style={{ color: colorMap.get(computed.primary.section) ?? nextAccent }} />
              <h2 className="truncate text-sm font-semibold">First</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {computed.remaining > 1 ? `${computed.remaining} open` : "1 open"}
            </span>
          </div>
          <NextActionRow
            action={computed.primary}
            color={colorMap.get(computed.primary.section) ?? nextAccent}
            pending={pending.has(computed.primary.id)}
            primary
            onComplete={completeAction}
            onOpenModal={setOpenModal}
            onNavigate={(href) => router.push(href)}
            onSkip={skip}
          />
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: nextAccent }}
            >
              <Check className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Clear</h2>
              <p className="text-sm text-muted-foreground">No current action needs attention.</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="space-y-4">
          <ActionPanel
            title="Queue"
            icon={<ListChecks className="h-4 w-4" style={{ color: nextAccent }} />}
            actions={computed.queue}
            colors={colorMap}
            pending={pending}
            empty="Nothing else for now."
            onComplete={completeAction}
            onOpenModal={setOpenModal}
            onNavigate={(href) => router.push(href)}
            onSkip={skip}
          />

          <ActionPanel
            title="Later"
            icon={<Clock3 className="h-4 w-4" style={{ color: nextAccent }} />}
            actions={computed.later}
            colors={colorMap}
            pending={pending}
            empty="No later items."
            onComplete={completeAction}
            onOpenModal={setOpenModal}
            onNavigate={(href) => router.push(href)}
            onSkip={skip}
          />
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Check className="h-4 w-4" style={{ color: nextAccent }} />
                <h2 className="truncate text-sm font-semibold">Done Today</h2>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{computed.done.length}</span>
            </div>
            {computed.done.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing checked off yet.</p>
            ) : (
              <div className="space-y-2">
                {computed.done.map((action) => {
                  const accent = colorMap.get(action.section) ?? nextAccent;
                  return (
                    <TaskRow
                      key={action.id}
                      label={action.title}
                      emoji={action.emoji}
                      sublabel={action.detail}
                      done
                      pending={false}
                      accent={accent}
                      onClick={() => {}}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            {(["habits", "supplements", "chores", "training"] as SectionKey[]).map((key) => {
              const meta = sectionMeta(sections, key);
              return (
                <Link
                  key={key}
                  href={meta.path}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <span aria-hidden>{meta.emoji}</span>
                  <span>{meta.label}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {OpenForm && openModal && (
        <QuickLogModal
          open={!!openModal}
          onClose={() => setOpenModal(null)}
          title={openModal === "nutrition" ? "Log meal" : "Log caffeine"}
          accent={openAccent}
        >
          <OpenForm
            onDone={() => {
              setOpenModal(null);
              mutate();
            }}
          />
        </QuickLogModal>
      )}
    </SectionTheme>
  );
}
