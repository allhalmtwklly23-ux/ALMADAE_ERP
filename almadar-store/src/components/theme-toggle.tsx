"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "nexa-erp-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
      const frame = window.requestAnimationFrame(() => setTheme(storedTheme));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
      aria-pressed={theme === "dark"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "نهاري" : "ليلي"}</span>
    </button>
  );
}
