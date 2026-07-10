export type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "ai-news-theme";

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : "system";
}

export function storeThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyThemePreference(preference);
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return "light";

  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;

  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
