"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { DateNav } from "@/components/date-nav";
import { SeptenaMark } from "@/components/septena-mark";
import { useNavSections } from "@/hooks/use-sections";
import { useDemoHref } from "@/hooks/use-demo-href";

export function SectionTabs() {
  const pathname = usePathname();
  const sections = useNavSections();
  const toHref = useDemoHref();
  const homeHref = toHref("/septena");
  const homeActive = pathname === homeHref;
  const markRef = useRef<HTMLSpanElement>(null);
  const spinRef = useRef(0);
  const [colorActive, setColorActive] = useState(false);
  const handleHomeClick = () => {
    const el = markRef.current;
    if (!el) return;
    setColorActive(true);
    window.setTimeout(() => {
      spinRef.current += 360;
      el.style.transition = "transform 1000ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = `rotate(${spinRef.current}deg)`;
    }, 200);
    window.setTimeout(() => {
      setColorActive(false);
    }, 1300);
  };

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <Link
          href={homeHref}
          aria-label="Home"
          title="Home"
          onClick={handleHomeClick}
          className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors ${
            homeActive
              ? "border-foreground/30 bg-foreground/10"
              : "border-border bg-card/60 hover:border-foreground/40"
          }`}
        >
          <span ref={markRef} className="relative inline-flex h-3.5 w-3.5">
            <SeptenaMark
              className={`absolute inset-0 h-3.5 w-3.5 transition-opacity duration-500 ${homeActive || colorActive ? "opacity-0" : "opacity-100"}`}
              variant="currentColor"
            />
            <SeptenaMark
              className={`absolute inset-0 h-3.5 w-3.5 transition-opacity duration-500 ${homeActive || colorActive ? "opacity-100" : "opacity-0"}`}
              variant="spectrum"
            />
          </span>
          <span>Septena</span>
        </Link>
        {sections.map((section) => {
          const href = toHref(section.path);
          const active = pathname === href || pathname.startsWith(href + "/");
          // Soft tinted active style — colored border + accent text on a 12%
          // accent fill. Same shape as the home pill (border + tint + text)
          // and the marketing-page "Read more" pill, so the whole nav reads
          // as one system instead of jumping from neutral → fully saturated.
          const activeFill = `color-mix(in oklab, ${section.color} 12%, transparent)`;
          const activeBorder = `color-mix(in oklab, ${section.color} 60%, transparent)`;
          return (
            <Link
              key={section.key}
              href={href}
              className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                active
                  ? { borderColor: activeBorder, backgroundColor: activeFill, color: section.color }
                  : { borderColor: "var(--border)", backgroundColor: "color-mix(in oklab, var(--card) 60%, transparent)", color: "var(--foreground)" }
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
                style={{ backgroundColor: section.color }}
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
