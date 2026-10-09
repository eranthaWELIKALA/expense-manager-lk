import { useCallback, useEffect, useState } from "react";

/* Light / dark / system theme. A per-device preference: stored in localStorage and applied as
   <html data-theme>. index.html applies it before first paint to avoid a flash. */

const KEY = "mmp-theme";
export const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const read = () => { try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; } };

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** [theme, setTheme] — theme is "system" | "light" | "dark". */
export function useTheme() {
  const [theme, set] = useState(read);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const setTheme = useCallback((t) => {
    try { if (t === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* private mode: session only */ }
    set(t);
  }, []);
  return [theme, setTheme];
}
