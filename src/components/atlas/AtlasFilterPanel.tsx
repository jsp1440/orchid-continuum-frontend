import React from 'react';
import { Filter, RefreshCcw } from 'lucide-react';
import type { AtlasFilters } from '@/lib/atlas';

interface Props {
  filters: AtlasFilters;
  onChange: (next: AtlasFilters) => void;
  onReset: () => void;
}

const BIOMES = [
  '',
  'Tropical moist broadleaf',
  'Tropical dry broadleaf',
  'Temperate broadleaf',
  'Montane grassland',
  'Mangrove',
  'Cloud forest',
];

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] tracking-[0.25em] uppercase text-emerald-200/70 mb-1.5">
    {children}
  </label>
);

const inputCls =
  'w-full bg-[#0d1f17] border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-300/60 focus:ring-1 focus:ring-emerald-300/30 transition-colors';

const AtlasFilterPanel: React.FC<Props> = ({ filters, onChange, onReset }) => {
  const update = <K extends keyof AtlasFilters>(key: K, value: AtlasFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const numOrUndef = (v: string): number | undefined => {
    if (v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  return (
    <aside className="rounded-2xl border border-white/10 bg-[#142a1f] p-5 lg:sticky lg:top-24 self-start">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-emerald-300/80">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-white/55 hover:text-emerald-200 transition-colors"
        >
          <RefreshCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <FieldLabel>Genus</FieldLabel>
          <input
            className={inputCls}
            placeholder="e.g. Bulbophyllum"
            value={filters.genus ?? ''}
            onChange={e => update('genus', e.target.value || undefined)}
          />
        </div>
        <div>
          <FieldLabel>Species</FieldLabel>
          <input
            className={inputCls}
            placeholder="specific epithet"
            value={filters.species ?? ''}
            onChange={e => update('species', e.target.value || undefined)}
          />
        </div>
        <div>
          <FieldLabel>Country</FieldLabel>
          <input
            className={inputCls}
            placeholder="ISO name (e.g. Ecuador)"
            value={filters.country ?? ''}
            onChange={e => update('country', e.target.value || undefined)}
          />
        </div>

        <div>
          <FieldLabel>Elevation (m)</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              className={inputCls}
              placeholder="min"
              value={filters.elevation_min ?? ''}
              onChange={e => update('elevation_min', numOrUndef(e.target.value))}
            />
            <input
              type="number"
              className={inputCls}
              placeholder="max"
              value={filters.elevation_max ?? ''}
              onChange={e => update('elevation_max', numOrUndef(e.target.value))}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Year range</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              className={inputCls}
              placeholder="from"
              value={filters.year_from ?? ''}
              onChange={e => update('year_from', numOrUndef(e.target.value))}
            />
            <input
              type="number"
              className={inputCls}
              placeholder="to"
              value={filters.year_to ?? ''}
              onChange={e => update('year_to', numOrUndef(e.target.value))}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Biome</FieldLabel>
          <select
            className={inputCls}
            value={filters.biome ?? ''}
            onChange={e => update('biome', e.target.value || undefined)}
          >
            {BIOMES.map(b => (
              <option key={b} value={b} className="bg-[#0d1f17]">
                {b === '' ? 'Any biome' : b}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/40 leading-relaxed">
        Filter envelope re-fetches the active layer on change.
      </div>
    </aside>
  );
};

export default AtlasFilterPanel;
