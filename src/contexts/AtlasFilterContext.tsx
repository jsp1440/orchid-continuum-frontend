/**
 * AtlasFilterContext
 * ------------------
 * Global, URL-synchronized filter state shared by EVERY component that
 * surfaces orchid biodiversity data:
 *
 *   - Living Atlas globe (homepage)
 *   - Atlas page (full workspace)
 *   - Gallery
 *   - Species cards
 *   - Habitat journeys
 *   - Pollinator / mycorrhiza pages
 *   - Intelligence graph
 *
 * Filter changes propagate automatically to the URL search params so the
 * user can bookmark or share the exact state of the Continuum (genus,
 * country, biome, conservation tier, pollinator, dataset…).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { applyAtlasFilters, type AtlasFilterState, type AtlasOccurrencePoint } from '@/lib/orchidContinuum';

interface AtlasFilterContextValue {
  filters: AtlasFilterState;
  setFilters: React.Dispatch<React.SetStateAction<AtlasFilterState>>;
  toggleArrayFilter: (field: keyof AtlasFilterState, value: string) => void;
  isActive: (field: keyof AtlasFilterState, value: string) => boolean;
  resetFilters: () => void;
  applyTo: <T extends AtlasOccurrencePoint>(points: T[]) => T[];
  activeFilterCount: number;
}

const AtlasFilterContext = createContext<AtlasFilterContextValue | null>(null);

const URL_FIELDS: Array<keyof AtlasFilterState> = [
  'genera',
  'species',
  'countries',
  'regions',
  'growthForms',
  'habitats',
  'conservationStatuses',
  'iucnCodes',
  'tribes',
  'subfamilies',
  'pollinatorTaxa',
  'datasets',
];

function deserializeFromUrl(params: URLSearchParams): AtlasFilterState {
  const f: AtlasFilterState = {};
  for (const field of URL_FIELDS) {
    const raw = params.get(field);
    if (raw) f[field] = raw.split('|').filter(Boolean) as never;
  }
  if (params.get('verified') === '1') f.verifiedOnly = true;
  const eMin = params.get('eMin');
  const eMax = params.get('eMax');
  if (eMin) f.elevationMin = Number(eMin);
  if (eMax) f.elevationMax = Number(eMax);
  return f;
}

function serializeToUrl(filters: AtlasFilterState, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const field of URL_FIELDS) {
    const arr = filters[field] as string[] | undefined;
    if (arr && arr.length > 0) next.set(field, arr.join('|'));
    else next.delete(field);
  }
  if (filters.verifiedOnly) next.set('verified', '1');
  else next.delete('verified');
  if (typeof filters.elevationMin === 'number') next.set('eMin', String(filters.elevationMin));
  else next.delete('eMin');
  if (typeof filters.elevationMax === 'number') next.set('eMax', String(filters.elevationMax));
  else next.delete('eMax');
  return next;
}

export const AtlasFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [filters, setFilters] = useState<AtlasFilterState>(() => deserializeFromUrl(searchParams));

  // Only sync URL on Atlas-related routes to avoid polluting unrelated pages.
  const isAtlasRoute = useMemo(
    () =>
      ['/atlas', '/gallery', '/habitats', '/pollinators', '/mycorrhizae', '/climate', '/conservation'].some(
        (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
      ),
    [location.pathname],
  );

  useEffect(() => {
    if (!isAtlasRoute) return;
    const next = serializeToUrl(filters, searchParams);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, isAtlasRoute]);

  const toggleArrayFilter = useCallback((field: keyof AtlasFilterState, value: string) => {
    setFilters((prev) => {
      const arr = (prev[field] as string[] | undefined) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [field]: next.length ? next : undefined };
    });
  }, []);

  const isActive = useCallback(
    (field: keyof AtlasFilterState, value: string) =>
      ((filters[field] as string[] | undefined) ?? []).includes(value),
    [filters],
  );

  const resetFilters = useCallback(() => setFilters({}), []);

  const applyTo = useCallback(
    <T extends AtlasOccurrencePoint>(points: T[]): T[] =>
      applyAtlasFilters(points, filters) as T[],
    [filters],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const field of URL_FIELDS) {
      const arr = filters[field] as string[] | undefined;
      if (arr && arr.length > 0) count += arr.length;
    }
    if (filters.verifiedOnly) count += 1;
    if (typeof filters.elevationMin === 'number' || typeof filters.elevationMax === 'number') count += 1;
    return count;
  }, [filters]);

  const value = useMemo<AtlasFilterContextValue>(
    () => ({ filters, setFilters, toggleArrayFilter, isActive, resetFilters, applyTo, activeFilterCount }),
    [filters, toggleArrayFilter, isActive, resetFilters, applyTo, activeFilterCount],
  );

  return <AtlasFilterContext.Provider value={value}>{children}</AtlasFilterContext.Provider>;
};

export function useAtlasFilters(): AtlasFilterContextValue {
  const ctx = useContext(AtlasFilterContext);
  if (!ctx) {
    // Fail-soft: provide a stub so components don't crash if mounted outside provider.
    return {
      filters: {},
      setFilters: () => undefined,
      toggleArrayFilter: () => undefined,
      isActive: () => false,
      resetFilters: () => undefined,
      applyTo: (pts) => pts,
      activeFilterCount: 0,
    };
  }
  return ctx;
}
