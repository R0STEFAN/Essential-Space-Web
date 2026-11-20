'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  getSavedTheme,
  toggleTheme,
  type ThemeMode,
} from '@/lib/theme';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(getSavedTheme());

    const handleCustomEvent = (e: Event) => {
      const next = (e as CustomEvent<ThemeMode>).detail;
      if (next === 'light' || next === 'dark') {
        setTheme(next);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        document.documentElement.classList.toggle('dark', e.newValue === 'dark');
        document.documentElement.style.colorScheme = e.newValue;
        setTheme(e.newValue);
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleCustomEvent);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const isDark = !mounted || theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`w-8 h-8 rounded-full bg-nothing-card hover:bg-nothing-ink/10 border border-nothing-border/80 hover:border-nothing-ink/40 text-nothing-light hover:text-nothing-ink flex items-center justify-center transition-all select-none shadow-sm active:scale-95 group ${className}`}
    >
      {isDark ? (
        <Sun size={15} className="transition-transform group-hover:rotate-12 group-hover:scale-110" />
      ) : (
        <Moon size={15} className="transition-transform group-hover:-rotate-12 group-hover:scale-110" />
      )}
    </button>
  );
}
