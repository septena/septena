"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useShowEmoji } from "@/hooks/use-show-emoji";

type Props = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  children?: ReactNode;
  /** Bypass the `display.show_emoji` setting. Use on edit screens
   *  (section settings, day-phase editor, manage-items) where the user
   *  is actively editing the emoji and must always see it. */
  force?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Single rendering primitive for emoji glyphs across the app.
 *
 *  Renders nothing when the `display.show_emoji` setting is off (unless
 *  `force` is set), or when the children are empty. The wrapping span is
 *  marked `aria-hidden` because emoji are decorative — screen readers
 *  should rely on the adjacent label.
 *
 *  Accepts `className` so call sites can preserve their original sizing
 *  (e.g. `text-3xl`, `shrink-0`). */
export function Emoji({ children, force = false, className, ...rest }: Props) {
  const show = useShowEmoji();
  const text = typeof children === "string" ? children.trim() : children;
  if (!text) return null;
  if (!show && !force) return null;
  return (
    <span aria-hidden className={className} {...rest}>
      {children}
    </span>
  );
}
