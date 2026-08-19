import React, { useEffect, useRef, useState } from 'react';
import { PREF_OPTIONS, useDisplayPrefs, DisplayPrefs } from '@/contexts/DisplayPreferences';

export const ThemeQuickToggle: React.FC = () => {
  const { prefs, resolvedTheme, set } = useDisplayPrefs();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={() => set('theme', next)} title={`Switch to ${next} theme`} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[#F3EEE2] transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B7F5]">
      <span className="sr-only">Switch to {next} theme (currently {prefs.theme === 'system' ? 'system' : prefs.theme})</span>
      {resolvedTheme === 'dark' ? <svg aria-hidden viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="3.6" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5 6 6M14 14l1.5 1.5M15.5 4.5 14 6M6 14l-1.5 1.5" strokeLinecap="round" /></svg> : <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.6a6.6 6.6 0 1 0 8 7.9z" strokeLinecap="round" /></svg>}
    </button>
  );
};

export const DisplaySettings: React.FC = () => {
  const { prefs, set, reset } = useDisplayPrefs();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    const onClick = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);
  return (
    <div className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-[#F3EEE2] transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B7F5]">
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h12M4 10h12M4 14h12" strokeLinecap="round" /><circle cx="8" cy="6" r="1.8" fill="currentColor" stroke="none" /><circle cx="13" cy="10" r="1.8" fill="currentColor" stroke="none" /><circle cx="7" cy="14" r="1.8" fill="currentColor" stroke="none" /></svg>
        <span className="hidden sm:inline">Display</span><span className="sr-only">settings: theme, text size, contrast and motion</span>
      </button>
      {open && <div ref={panelRef} role="dialog" aria-label="Display and reading settings" className="fade-rise absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-stone-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-lg leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Display &amp; reading</h2><p className="mt-0.5 text-[12px] text-stone-500">Saved on this device. Nothing is hidden — only how it is presented changes.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-sm p-1 text-stone-500 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0]"><span className="sr-only">Close settings</span><svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg></button></div>
        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">{PREF_OPTIONS.map((group) => { const current = prefs[group.key] as string; return <fieldset key={group.key}><legend className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4A7C59]">{group.label}</legend><div className="mt-1.5 flex flex-wrap gap-1.5">{group.options.map((o) => { const active = current === o.value; return <button key={o.value} type="button" onClick={() => set(group.key, o.value as DisplayPrefs[typeof group.key])} aria-pressed={active} className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0] ${active ? 'border-[#6B3FA0] bg-[#6B3FA0] text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'}`}>{active && <svg aria-hidden viewBox="0 0 10 10" className="mr-1 inline h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 5.2 3.6 8 9 2" strokeLinecap="round" /></svg>}{o.label}</button>; })}</div><p className="mt-1 text-[11px] leading-snug text-stone-500">{group.help}</p></fieldset>; })}</div>
        <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3"><button type="button" onClick={reset} className="text-[12px] text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-[#6B3FA0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0]">Reset to defaults</button><span className="text-[11px] text-stone-500">System settings respected</span></div>
      </div>}
    </div>
  );
};
