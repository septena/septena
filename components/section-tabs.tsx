"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { DateNav } from "@/components/date-nav";
import { useNavSections } from "@/hooks/use-sections";

export function SectionTabs() {
  const pathname = usePathname();
  const sections = useNavSections();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <Link
          href="/septena"
          aria-label="Home"
          title="Home"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-[color:var(--section-accent)] hover:text-[color:var(--section-accent)]"
        >
          <svg
            viewBox="0 0 512 512"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <circle cx="256" cy="107" r="49" />
            <circle cx="373" cy="162" r="49" />
            <circle cx="402" cy="290" r="49" />
            <circle cx="321" cy="391" r="49" />
            <circle cx="191" cy="391" r="49" />
            <circle cx="110" cy="290" r="49" />
            <circle cx="139" cy="162" r="49" />
          </svg>
          <span>Septena</span>
        </Link>
        {sections.map((section) => {
          const active = pathname === section.path || pathname.startsWith(section.path + "/");
          return (
            <Link
              key={section.key}
              href={section.path}
              className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                active
                  ? { borderColor: section.color, backgroundColor: section.color, color: "white" }
                  : { borderColor: "var(--border)", color: "var(--foreground)" }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.borderColor = section.color;
                  e.currentTarget.style.color = section.color;
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--foreground)";
                }
              }}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? "white" : section.color }}
              />
              <span>{section.label}</span>
            </Link>
          );
        })}
        <Suspense fallback={null}>
          <DateNav />
        </Suspense>
      </div>
    </nav>
  );
}
