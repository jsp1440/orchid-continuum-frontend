/**
 * dailyGenusContext — single source of truth for Genus of the Day.
 *
 * Resolves the genus once per rotation window, then hydrates that identity
 * through the canonical Orchid Continuum featured-taxon contract. Consumers
 * can therefore share the same approved media + graph evidence state instead
 * of independently fetching or inventing scientific content.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { featuredGenusName, msUntilNextRotation } from '@/lib/featuredGenus';
import { supabase } from '@/lib/supabase';
import { fetchFeaturedTaxonContinuum, type FeaturedTaxonContinuum } from '@/lib/featuredTaxonContinuum';

export interface DailyGenusState {
  genus: string;
  continuum: FeaturedTaxonContinuum | null;
  continuumStatus: 'loading' | 'ready' | 'unavailable';
  /** Curator-facing diagnostic; never scientific public copy. */
  diagnostic: string | null;
}

const SAFE_CANONICAL_GENUS = /^[A-Z][A-Za-z-]+$/;
const MAX_CANONICAL_GENUS_LENGTH = 120;

/**
 * Daily snapshot rows are operational input, not trusted scientific identity.
 * Keep them behind the same bounded single-genus contract used by public
 * navigation so a malformed snapshot cannot crash Homepage/Atlas/Matrix/Calyx
 * route producers or silently turn a binomial/locality-shaped value into genus
 * context.
 */
export function canonicalDailySnapshotGenus(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const genus = value.trim();
  if (
    !genus ||
    genus.length > MAX_CANONICAL_GENUS_LENGTH ||
    !SAFE_CANONICAL_GENUS.test(genus)
  ) {
    return null;
  }
  return genus;
}

const initialGenus = featuredGenusName();
const DailyGenusContext = createContext<DailyGenusState>({
  genus: initialGenus,
  continuum: null,
  continuumStatus: 'loading',
  diagnostic: null,
});

export function useDailyGenus(): DailyGenusState {
  return useContext(DailyGenusContext);
}

export const DailyGenusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DailyGenusState>({
    genus: initialGenus,
    continuum: null,
    continuumStatus: 'loading',
    diagnostic: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const hydrateContinuum = useCallback(async (genus: string, diagnostic: string | null) => {
    const request = ++requestRef.current;
    setState({ genus, continuum: null, continuumStatus: 'loading', diagnostic });
    try {
      const continuum = await fetchFeaturedTaxonContinuum(genus);
      if (request !== requestRef.current) return;
      setState({ genus: continuum.genus, continuum, continuumStatus: 'ready', diagnostic });
    } catch (error) {
      if (request !== requestRef.current) return;
      setState({
        genus,
        continuum: null,
        continuumStatus: 'unavailable',
        diagnostic: [diagnostic, `[Featured taxon] Continuum hydration unavailable for ${genus}: ${String(error)}`]
          .filter(Boolean)
          .join(' '),
      });
    }
  }, []);

  const validateSnapshot = useCallback(async () => {
    const local = featuredGenusName();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data, error } = await supabase
        .from('daily_genus_snapshot')
        .select('genus, snapshot_date')
        .eq('snapshot_date', today)
        .single();

      const rawSnapshotGenus = !error && data ? data.genus : null;
      const snapshotGenus = canonicalDailySnapshotGenus(rawSnapshotGenus);
      if (snapshotGenus) {
        await hydrateContinuum(snapshotGenus, null);
        return;
      }

      const invalidSnapshotDiagnostic =
        !error && data && typeof rawSnapshotGenus === 'string' && rawSnapshotGenus.trim()
          ? `[Genus of the Day] Snapshot identity for ${today} was not a bounded canonical genus; using deterministic identity ${local}.`
          : `[Genus of the Day] Snapshot unavailable for ${today}; using deterministic identity ${local}.`;

      await hydrateContinuum(local, invalidSnapshotDiagnostic);
    } catch (error) {
      await hydrateContinuum(
        local,
        `[Genus of the Day] Snapshot query unavailable; using deterministic identity ${local}. Error: ${String(error)}`,
      );
    }
  }, [hydrateContinuum]);

  useEffect(() => { void validateSnapshot(); }, [validateSnapshot]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNextRefresh = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      void validateSnapshot();
      scheduleNextRefresh();
    }, msUntilNextRotation() + 500);
  }, [clearTimer, validateSnapshot]);

  useEffect(() => {
    scheduleNextRefresh();
    return clearTimer;
  }, [scheduleNextRefresh, clearTimer]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void validateSnapshot();
        scheduleNextRefresh();
      } else clearTimer();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void validateSnapshot();
        scheduleNextRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [validateSnapshot, scheduleNextRefresh, clearTimer]);

  return <DailyGenusContext.Provider value={state}>{children}</DailyGenusContext.Provider>;
};
