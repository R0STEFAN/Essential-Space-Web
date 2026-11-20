export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'essential_space_theme';
export const THEME_CHANGE_EVENT = 'essential-space-theme-change';

/**
 * Returns the active UI theme, defaulting to 'dark' when no saved preference exists.
 */
export function getSavedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {}
  return 'dark';
}

/**
 * Applies the selected theme class to <html>, updates color-scheme, persists it,
 * and notifies any mounted ThemeToggle listeners.
 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: theme }));
  }
}

export function toggleTheme(): ThemeMode {
  const current =
    typeof document !== 'undefined' && !document.documentElement.classList.contains('dark')
      ? 'light'
      : 'dark';
  const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
