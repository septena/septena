/** Pulsing placeholder shown while a dashboard is loading. */

export function DashboardSkeleton({ title }: { title?: string }) {
  return (
    <div className="animate-pulse">
      <section className="mb-6">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="mt-2 h-8 w-48 rounded bg-muted" />
        {title && <span className="sr-only">{title}</span>}
      </section>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-background p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-7 w-16 rounded bg-muted" />
            <div className="mt-2 h-2 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-6">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="mt-4 h-[200px] w-full rounded bg-muted/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
