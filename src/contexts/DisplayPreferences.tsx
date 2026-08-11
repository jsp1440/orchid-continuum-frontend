import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type TextChoice = 'small' | 'standard' | 'large' | 'xl';
export type ContrastChoice = 'standard' | 'high';
export type WidthChoice = 'comfortable' | 'wide';
export type MotionChoice = 'full' | 'reduced';
export type DensityChoice = 'comfortable' | 'compact';
export type ReadingChoice = 'standard' | 'focus';

export interface DisplayPrefs {
  theme: ThemeChoice;
  text: TextChoice;
  contrast: ContrastChoice;
  width: WidthChoice;
  motion: MotionChoice;
  density: DensityChoice;
  reading: ReadingChoice;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  theme: 'system', text: 'standard', contrast: 'standard', width: 'comfortable', motion: 'full', density: 'comfortable', reading: 'standard',
};

export const PREF_OPTIONS: { key: keyof DisplayPrefs; label: string; help: string; options: { value: string; label: string }[] }[] = [
  { key: 'theme', label: 'Theme', help: 'Dark mode is designed for low-light reading, not simply inverted.', options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }] },
  { key: 'text', label: 'Text size', help: 'Scales all body and heading type, including scientific names.', options: [{ value: 'small', label: 'Small' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }, { value: 'xl', label: 'Extra large' }] },
  { key: 'contrast', label: 'Contrast', help: 'High contrast strengthens text, borders, focus rings and controls.', options: [{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High contrast' }] },
  { key: 'width', label: 'Content width', help: 'Wide uses more of a large display; comfortable keeps a shorter measure.', options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'wide', label: 'Wide' }] },
  { key: 'motion', label: 'Motion', help: 'Reduced motion replaces animated sequences with static stages.', options: [{ value: 'full', label: 'Full motion' }, { value: 'reduced', label: 'Reduced motion' }] },
  { key: 'density', label: 'Density', help: 'Compact tightens vertical spacing between sections.', options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }] },
  { key: 'reading', label: 'Reading mode', help: 'Reading focus opens up line spacing and calms background texture.', options: [{ value: 'standard', label: 'Standard' }, { value: 'focus', label: 'Reading focus' }] },
];

const STORAGE_KEY = 'ioc-display-prefs-v1';
interface Ctx { prefs: DisplayPrefs; resolvedTheme: 'light' | 'dark'; set: <K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) => void; reset: () => void; }
const DisplayPreferencesContext = createContext<Ctx | null>(null);

function readStored(): DisplayPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      return { ...DEFAULT_PREFS, motion: prefersReduced ? 'reduced' : 'full' };
    }
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<DisplayPrefs>) };
  } catch { return DEFAULT_PREFS; }
}

export const DisplayPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<DisplayPrefs>(readStored);
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const resolvedTheme: 'light' | 'dark' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', prefs.theme);
    root.setAttribute('data-theme-resolved', resolvedTheme);
    root.setAttribute('data-text', prefs.text);
    root.setAttribute('data-contrast', prefs.contrast);
    root.setAttribute('data-width', prefs.width);
    root.setAttribute('data-motion', prefs.motion);
    root.setAttribute('data-density', prefs.density);
    root.setAttribute('data-reading', prefs.reading);
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* session-only */ }
  }, [prefs, resolvedTheme]);
  const set = useCallback(<K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) => setPrefs((p) => ({ ...p, [key]: value })), []);
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), []);
  const value = useMemo(() => ({ prefs, resolvedTheme, set, reset }), [prefs, resolvedTheme, set, reset]);
  return <DisplayPreferencesContext.Provider value={value}>{children}</DisplayPreferencesContext.Provider>;
};

export function useDisplayPrefs(): Ctx {
  const ctx = useContext(DisplayPreferencesContext);
  if (!ctx) return { prefs: DEFAULT_PREFS, resolvedTheme: 'light', set: () => undefined, reset: () => undefined };
  return ctx;
}

export function useReducedMotion(): boolean {
  const { prefs } = useDisplayPrefs();
  const [osReduced, setOsReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return prefs.motion === 'reduced' || (prefs.motion !== 'full' && osReduced);
}
