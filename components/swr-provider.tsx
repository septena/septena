"use client";

import { SWRConfig } from "swr";
import type { Cache } from "swr";
import type { ReactNode } from "react";

const STORAGE_KEY = "septena:swr-cache:v1";

// localStorage-backed SWR cache. On first paint the in-memory Map is seeded
// from the previous session's snapshot so cached views (notably the Next
// widget) render before any network round-trip; SWR then revalidates in the
// background and the new data flows in.
function createCacheProvider(): Cache {
  if (typeof window === "undefined") return new Map();
  let initial: Array<[string, unknown]> = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) initial = JSON.parse(raw) as Array<[string, unknown]>;
  } catch {
    initial = [];
  }
  const map = new Map<string, unknown>(initial);
  const flush = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
    } catch {
      /* quota or privacy mode — ignore */
    }
  };
  window.addEventListener("beforeunload", flush);
  // pagehide fires on iOS Safari when beforeunload doesn't.
  window.addEventListener("pagehide", flush);
  return map as unknown as Cache;
}

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        provider: createCacheProvider,
      }}
    >
      {children}
    </SWRConfig>
  );
}
