'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Diamond, Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark' | 'gold' | 'system';
const options = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Azul moderno', icon: Moon },
  { value: 'gold', label: 'Obsidiana Gold', icon: Diamond },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

function subscribe(callback: () => void) {
  window.addEventListener('gozo-theme-change', callback);
  return () => window.removeEventListener('gozo-theme-change', callback);
}
function currentTheme(): Theme {
  const value = document.documentElement.dataset.appearance;
  return value === 'light' || value === 'dark' || value === 'gold' ? value : 'system';
}

export function ThemeSelector() {
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'system' as Theme);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function syncSystem() {
      if (document.documentElement.dataset.appearance === 'system')
        document.documentElement.setAttribute('data-theme', media.matches ? 'dark' : 'light');
    }
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    media.addEventListener('change', syncSystem);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      media.removeEventListener('change', syncSystem);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  function choose(value: Theme) {
    document.documentElement.setAttribute('data-appearance', value);
    document.documentElement.setAttribute(
      'data-theme',
      value === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value,
    );
    window.dispatchEvent(new Event('gozo-theme-change'));
    try {
      localStorage.setItem('gozo-appearance', value);
    } catch {}
    setOpen(false);
  }

  const Icon = options.find((option) => option.value === theme)?.icon || Monitor;
  return (
    <div className="theme-selector" ref={root}>
      <button
        type="button"
        className="alert-bell theme-trigger"
        aria-label="Elegir apariencia"
        title="Apariencia"
        aria-expanded={open}
        aria-controls="appearance-options"
        onClick={() => setOpen(!open)}
      >
        <Icon size={18} />
      </button>
      {open && (
        <div id="appearance-options" className="theme-menu" role="group" aria-label="Apariencia">
          <span className="theme-menu-title">APARIENCIA</span>
          {options.map(({ value, label, icon: OptionIcon }) => (
            <button
              type="button"
              key={value}
              aria-pressed={theme === value}
              onClick={() => choose(value)}
            >
              <OptionIcon size={16} />
              <span>{label}</span>
              {theme === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
