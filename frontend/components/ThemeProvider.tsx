"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });

export function useTheme() { return useContext(Ctx); }

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = (localStorage.getItem("vd-theme") as Theme) ?? "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("vd-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}
