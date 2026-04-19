import type { Section } from "@/lib/sections";

// Placeholder for sections that have a slot in the nav but haven't been built
// yet. Deleted as each section lands.
export function ComingSoon({ section }: { section: Section }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
      <span
        aria-hidden
        className="mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
        style={{ backgroundColor: section.color }}
      >
        {section.label[0]}
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">{section.label}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{section.tagline}</p>
      <p className="mt-6 rounded-full border border-border px-4 py-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        Coming soon
      </p>
    </main>
  );
}
