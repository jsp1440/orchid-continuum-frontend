/**
 * dailyGenusContext — single source of truth for Genus of the Day.
 *
 * Resolves the genus once per rotation window, then hydrates that identity
 * through the canonical Orchid Continuum featured-taxon contract. Consumers
 * can therefore share the same approved media + graph evidence state instead
 * of independently fetching or inventing scientific content.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { featuredGenusName, WINDOW_MS } from '@/lib/featuredGenus';
import { homepageHeroMedia } from '@/lib/genusMediaResolver';
import { featuredSpecies } from '@/features/homepage-recovery/featuredSpecies';
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
 * The snapshot table is an optional operational input, not the homepage's
 * identity authority. It is explicitly opt-in because an unprovisioned table
 * returns a browser-visible 4xx response; the deterministic UTC rotation below
 * is the safe production default until a deployment advertises this adapter.
 */
export const DAILY_SNAPSHOT_ENABLED =
  String((import.meta.env as Record<string, string | undefined>).VITE_ENABLE_DAILY_GENUS_SNAPSHOT || '')
    .trim()
    .toLowerCase() === 'true';

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


const PREFETCH_LEAD_MS = 5 * 60_000;

async function resolveWindowGenus(at: number, signal: AbortSignal) {
  const local = featuredGenusName(at);
  const today = new Date(at).toISOString().slice(0, 10);
  if (!DAILY_SNAPSHOT_ENABLED) return {
    genus: local,
    diagnostic: `[Genus of the Day] Snapshot adapter is disabled for this deployment; using deterministic identity ${local}.`,
  };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) throw new Error('Window cancelled');
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 10_000);
  try {
    const { data, error } = await supabase.from('daily_genus_snapshot')
      .select('genus, snapshot_date').eq('snapshot_date', today).abortSignal(controller.signal).single();
    const genus = !error && data?.snapshot_date === today && canonicalDailySnapshotGenus(data.genus);
    if (genus) return { genus, diagnostic: null };
  } catch (error) {
    if (signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
  return { genus: local, diagnostic: `Snapshot unavailable or invalid for ${today}; using ${local}.` };
}

/** Load the photo the homepage would actually show, with one bounded browser request. */
function checkHeroPhoto(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const photo = new Image();
    function finish(ok: boolean) {
      clearTimeout(timer);
      signal.removeEventListener('abort', fail);
      photo.onload = null;
      photo.onerror = null;
      if (ok) resolve();
      else {
        photo.removeAttribute('src');
        reject(new Error('Featured photograph could not be loaded'));
      }
    }
    const fail = () => finish(false);
    const timer = setTimeout(fail, 10_000);
    photo.onload = () => finish(photo.naturalWidth > 0 && photo.naturalHeight > 0);
    photo.onerror = fail;
    if (signal.aborted) return fail();
    signal.addEventListener('abort', fail, { once: true });
    photo.src = url;
  });
}

async function prepareExhibit(genus: string, signal: AbortSignal) {
  const exhibit = await fetchFeaturedTaxonContinuum(genus, signal);
  const { media, graph, relationships } = exhibit;
  const taxonomy = exhibit.domains.find(item => item.domain === 'taxonomy');
  const recoveryHero = featuredSpecies(media.items, genus)[0];
  const homepageHero = homepageHeroMedia(media.items)[0];
  if (exhibit.genus !== genus || graph.status !== 'ok' || graph.evidence.genus !== genus
    || taxonomy?.state !== 'known' || relationships?.genus !== genus || relationships.isFallback
    || ![relationships.knowledge, relationships.geography, relationships.climate, relationships.pollinators,
      relationships.fungi, relationships.conservation, relationships.cultivation]
      .some(node => node.status === 'available' || node.status === 'empty')
    || media.status !== 'ok' || media.requested_genus !== genus || media.accepted_genus !== genus || !recoveryHero
    || homepageHero?.genus !== genus || homepageHero.scientific_name.trim().split(/\s+/)[0] !== genus) {
    throw new Error(`Incomplete featured exhibit for ${genus}`);
  }
  // The two homepage routes may rank different photos first. Load each distinct
  // first choice, bounded to two URLs, before changing the shared identity.
  const urls = new Set([recoveryHero.image_url, homepageHero.image_url]);
  await Promise.all(Array.from(urls, url => checkHeroPhoto(url, signal)));
  return exhibit;
}

function prefetchWindow(at: number) {
  const controller = new AbortController();
  const identity = resolveWindowGenus(at, controller.signal);
  // A failed speculative request has no visitor-visible effect.
  const exhibit = identity.then(({ genus }) => prepareExhibit(genus, controller.signal)).catch(() => null);
  return { at, controller, identity, exhibit };
}

export const DailyGenusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DailyGenusState>(() => ({
    genus: featuredGenusName(), continuum: null, continuumStatus: 'loading', diagnostic: null,
  }));

  useEffect(() => {
    let currentStart: number | null = null;
    let active: AbortController | undefined;
    let staged: ReturnType<typeof prefetchWindow> | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let hasDisplay = false;

    async function display(at: number, signal: AbortSignal, candidate?: ReturnType<typeof prefetchWindow>) {
      const current = () => !signal.aborted && Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS === at;
      let genus = featuredGenusName(at);
      try {
        // Resolve again at rollover: tomorrow's snapshot can change after preparation.
        const identity = await resolveWindowGenus(at, signal);
        genus = identity.genus;
        if (!current()) return;
        let continuum: FeaturedTaxonContinuum | null = null;
        if (candidate && (await candidate.identity).genus === genus) continuum = await candidate.exhibit;
        if (!current()) return;
        if (!continuum) {
          candidate?.controller.abort();
          // One boundary attempt on a missed or invalid prefetch. Only the initial
          // visit permits partial source coverage; never clear a working exhibit.
          continuum = await (hasDisplay ? prepareExhibit : fetchFeaturedTaxonContinuum)(genus, signal);
        }
        if (!current()) return;
        if (continuum.genus !== genus) throw new Error(`Unexpected featured genus for ${genus}`);
        hasDisplay = true;
        setState({ genus, continuum, continuumStatus: 'ready', diagnostic: identity.diagnostic });
      } catch (error) {
        if (!current()) return;
        const diagnostic = `[Featured taxon] ${genus}: ${String(error)}`;
        setState(previous => previous.continuum ? { ...previous, diagnostic }
          : { genus, continuum: null, continuumStatus: 'unavailable', diagnostic });
      }
    }

    function schedule() {
      clearTimeout(timer);
      if (document.hidden) return;
      const now = Date.now();
      const start = Math.floor(now / WINDOW_MS) * WINDOW_MS;
      const next = start + WINDOW_MS;
      if (staged && staged.at < start) {
        staged.controller.abort();
        staged = undefined;
      }
      if (currentStart !== start) {
        active?.abort();
        active = new AbortController();
        currentStart = start;
        void display(start, active.signal, staged?.at === start ? staged : undefined);
      }
      if (now < next - PREFETCH_LEAD_MS) {
        timer = setTimeout(schedule, next - PREFETCH_LEAD_MS - now);
      } else {
        if (staged?.at !== next) {
          staged?.controller.abort();
          staged = prefetchWindow(next);
        }
        timer = setTimeout(schedule, next - now);
      }
    }

    schedule();
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pageshow', schedule);
    return () => {
      clearTimeout(timer);
      active?.abort();
      staged?.controller.abort();
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('pageshow', schedule);
    };
  }, []);

  return <DailyGenusContext.Provider value={state}>{children}</DailyGenusContext.Provider>;
};
