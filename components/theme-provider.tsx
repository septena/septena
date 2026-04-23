"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "system" | "light" | "dark" | "eink";
type Resolved = "light" | "dark" | "eink";

const STORAGE_KEY = "theme";

type Ctx = {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function systemPref(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(resolved: Resolved) {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.classList.toggle("eink", resolved === "eink");
  el.style.colorScheme = resolved === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolved] = useState<Resolved>("light");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setThemeState(stored);
    const r = stored === "system" ? systemPref() : stored;
    setResolved(r);
    apply(r);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: Resolved = mq.matches ? "dark" : "light";
      setResolved(r);
      apply(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (t === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, t);
    const r = t === "system" ? systemPref() : t;
    setResolved(r);
    apply(r);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "system" as Theme, resolvedTheme: "light" as Resolved, setTheme: () => {} };
  return ctx;
}
