import Link from "next/link";

export default function DemoStub() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Demo coming soon</h1>
      <p className="mt-4 text-muted-foreground">
        A read-only walkthrough of Septena with fake data, refreshed daily. Not built yet —
        check back soon.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-orange-500 hover:text-orange-500"
      >
        ← Back to home
      </Link>
    </main>
  );
}
