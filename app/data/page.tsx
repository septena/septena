import { DataMeta } from "@/components/data-meta";
import { PageHeader } from "@/components/page-header";

export default function DataPage() {
  return (
    <>
      <PageHeader
        title="Data sources"
        subtitle="Quality and freshness of the underlying data powering each section."
      />
      <DataMeta />
    </>
  );
}
