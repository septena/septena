import type { MetadataRoute } from "next";
import { MARKETING_SECTIONS } from "@/lib/marketing-sections";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/demo`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];
  for (const s of MARKETING_SECTIONS) {
    entries.push({
      url: `${SITE_URL}/about/${s.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }
  return entries;
}
