import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="w-full max-w-full overflow-hidden bg-zinc-800 text-zinc-100 px-4 py-2 text-sm text-center shadow-sm pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <span className="font-semibold">Demo mode</span>
      <span className="hidden sm:inline"> — exploring fixture data.</span>
      <Link href="/" className="ml-2 underline decoration-dotted underline-offset-2 hover:text-white">
        Back to homepage
      </Link>
    </div>
  );
}
