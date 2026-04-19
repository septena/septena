import { DataMeta } from "@/components/data-meta";
import { PageHeader } from "@/components/page-header";

export default function DataPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Data sources"
        subtitle="Quality and freshness of the underlying data powering each section."
      />
      <DataMeta />
    </main>
  );
}
