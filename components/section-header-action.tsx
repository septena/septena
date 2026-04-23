"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Portal target rendered by SectionHeader. Dashboards call SectionHeaderAction
// with their add button as children and it renders inline with the section
// title instead of below it.
export const SECTION_HEADER_ACTION_SLOT_ID = "section-header-action-slot";

export function SectionHeaderAction({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(SECTION_HEADER_ACTION_SLOT_ID));
  }, []);
  if (!target) return null;
  return createPortal(children, target);
}

const ACTION_BUTTON_CLASS =
  "inline-flex shrink-0 items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors";

type ActionButtonProps = {
  /** Optional accent override. Defaults to `var(--section-accent)` from
   *  the enclosing <SectionThemeRoot>, which resolves via pathname — so
   *  individual dashboards no longer need to pass their section color. */
  color?: string;
  children: ReactNode;
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
);

export function SectionHeaderActionButton(props: ActionButtonProps) {
  const style = { backgroundColor: props.color ?? "var(--section-accent)" };
  if ("href" in props && props.href) {
    return (
      <a href={props.href} className={ACTION_BUTTON_CLASS} style={style}>
        {props.children}
      </a>
    );
  }
  return (
    <button onClick={props.onClick} className={ACTION_BUTTON_CLASS} style={style}>
      {props.children}
    </button>
  );
}
