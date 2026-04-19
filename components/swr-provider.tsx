"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
