"use client";

import { useEffect, useRef, useState } from "react";
import { SWRConfig } from "swr";
import type { Cache } from "swr";
import type { ReactNode } from "react";

const STORAGE_KEY = "septena:swr-cache:v1";

export function SWRProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Cache>(new Map());
  const [, setCacheReady] = useState(false);

  useEffect(() => {
    let initial: Array<[string, unknown]> = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) initial = JSON.parse(raw) as Array<[string, unknown]>;
    } catch {
      initial = [];
    }

    const cache = cacheRef.current as Map<string, unknown>;
    for (const [key, value] of initial) cache.set(key, value);

    const flush = () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cache.entries())));
      } catch {
        /* quota or privacy mode — ignore */
      }
    };

    window.addEventListener("beforeunload", flush);
    // pagehide fires on iOS Safari when beforeunload doesn't.
    window.addEventListener("pagehide", flush);
    // Force one post-hydration render so SWR hooks can see restored cache
    // without diverging from the server-rendered HTML.
    const refreshId = window.requestAnimationFrame(() => {
      setCacheReady((ready) => !ready);
    });

    return () => {
      window.cancelAnimationFrame(refreshId);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        provider: () => cacheRef.current,
      }}
    >
      {children}
    </SWRConfig>
  );
}
