import Link from "next/link";

export default function DemoSectionStub({ params }: { params: Promise<{ section: string }> }) {
  return <DemoSectionStubContent params={params} />;
}

async function DemoSectionStubContent({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {section} demo coming soon
      </h1>
      <p className="mt-4 text-muted-foreground">
        A read-only walkthrough of the {section} section with fake data. Not built yet.
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
