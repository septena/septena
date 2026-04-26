import Link from "next/link";

type Props = {
  href: string;
  label: string;
  className?: string;
  direction?: "back" | "forward";
};

// Pill-style nav button. Default is a back arrow (used by PageHeader's `back`
// prop and pages with their own headers). Pass direction="forward" to point
// the other way — used by SectionStatusBar links.
export function BackLink({ href, label, className, direction = "back" }: Props) {
  const arrow = direction === "back" ? "←" : "→";
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted" +
        (className ? ` ${className}` : "")
      }
    >
      {direction === "back" && <span aria-hidden>{arrow}</span>}
      <span>{label}</span>
      {direction === "forward" && <span aria-hidden>{arrow}</span>}
    </Link>
  );
}
