"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

type PageHeaderContextValue = {
  setRefreshing: (section: string, refreshing: boolean) => void;
  isRefreshing: (section: string) => boolean;
};

const PageHeaderContext = createContext<PageHeaderContextValue>({
  setRefreshing: () => {},
  isRefreshing: () => false,
});

export function PageHeaderContextProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, boolean>>({});

  const setRefreshing = useCallback((section: string, refreshing: boolean) => {
    setStates((prev) => ({ ...prev, [section]: refreshing }));
  }, []);

  const isRefreshing = useCallback(
    (section: string) => !!states[section],
    [states]
  );

  return (
    <PageHeaderContext.Provider value={{ setRefreshing, isRefreshing }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

/** Call this in a dashboard to register its refreshing state with the global header. */
export function usePageHeader(section: string, isLoading: boolean) {
  const { setRefreshing } = useContext(PageHeaderContext);

  useEffect(() => {
    setRefreshing(section, isLoading);
  }, [section, isLoading, setRefreshing]);
}

export function usePageHeaderContext() {
  return useContext(PageHeaderContext);
}
