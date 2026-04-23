"use client";

import { useEffect, useState } from "react";

const REPO = "septena/septena";
export const GITHUB_URL = `https://github.com/${REPO}`;

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function GitHubStarButton({ className = "" }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${REPO}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.stargazers_count === "number") {
          setStars(d.stargazers_count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer noopener"
      className={`group inline-flex items-stretch overflow-hidden rounded-full border border-border bg-background text-sm font-medium text-foreground transition-colors hover:border-brand-accent ${className}`}
      aria-label={`Septena on GitHub — ${REPO}`}
    >
      <span className="flex items-center gap-2 px-3 py-1.5 transition-colors group-hover:text-brand-accent">
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
          <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.37-3.88-1.37-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.48.11-3.08 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.08.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.79.56A10.52 10.52 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
        </svg>
        <span>GitHub</span>
      </span>
      <span className="flex items-center gap-1 border-l border-border bg-muted/50 px-3 py-1.5 text-muted-foreground">
        <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-current">
          <path d="M12 2.5 14.9 8.6l6.6.6-5 4.5 1.5 6.5L12 16.9l-6 3.3 1.5-6.5-5-4.5 6.6-.6L12 2.5Z" />
        </svg>
        <span className="tabular-nums">{stars === null ? "—" : formatCount(stars)}</span>
      </span>
    </a>
  );
}
