"use client";

import { ArrowRight, Circle, Plus } from "lucide-react";
import { Emoji } from "@/components/ui/emoji";
import type { NextAction } from "@/hooks/use-next-actions";

export function NextActionIcon({
  action,
  className,
}: {
  action: NextAction;
  className?: string;
}) {
  if (action.emoji) return <Emoji className={className}>{action.emoji}</Emoji>;
  if (action.task) return <Circle className={className} />;
  if (action.modal) return <Plus className={className} />;
  return <ArrowRight className={className} />;
}
