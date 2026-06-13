/**
 * featuredGenus — the SINGLE SOURCE OF TRUTH for the "Genus of the Day" system.
 *
 * Every homepage element that must stay synchronized (the DailyGenusFeature
 * panel, the SpeciesInFocus species cards, and the HomeAtlas occurrence map)
 * derives its genus from THIS module so all four are guaranteed to show the
 * same genus within the same 12-hour window.
 *
 * ROTATION CONTRACT
 * -----------------
 *   • Deterministic — derived purely from the current UTC clock, so every
 *     visitor worldwide sees the same genus at the same moment.
 *   • Changes every 12 hours (two distinct genera per UTC day).
 *   • Cycles predictably through curated genera with local fallback species
 *     plates, so the public homepage never disappears if a live endpoint is
 *     cold, empty, or temporarily unavailable.
 *
 * The window index is: floor(epochMillis / 12h) mod LIST.length.
 */

import { supabase } from '@/lib/supabase';
import {
  GENERA,
  lookupGenus,
  buildLocalNarrative,
  genusForToday,
  type GenusEntry,
} from '@/lib/genusData';

/** Length of one rotation window, in milliseconds (12 hours). */
export const WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Fixed, ordered rotation list of homepage-safe genera.
 *
 * Keep this list restricted to curated local `GENERA` entries until the live
 * backend guarantees species + image results for every candidate genus. This is
 * intentional: Genus of the Day should always render, even during backend cold
 * starts or partial outages.
 */
export const FEATURED_GENERA: string[] = [
  'Cattleya',
  'Dracula',
  'Masdevallia',
  'Dendrobium',
  'Bulbophyllum',
  'Catasetum',
  'Vanilla',
  'Phalaenopsis',
];

/** Approximate accepted-species counts for genera NOT in the local GENERA set. */
const SPECIES_COUNT_FALLBACK: Record<string, number> = {
  Phalaenopsis: 70,
  Oncidium: 330,
  Paphiopedilum: 80,
  Vanda: 80,
  Cymbidium: 55,
  Pleurothallis: 1100,
  Maxillaria: 650,
  Epidendrum: 1500,
  Stanhopea: 60,
};

/**
 * Index into {@link FEATURED_GENERA} for the current 12-hour UTC window.
 * `now` is injectable for testing; defaults to the live clock.
 */
export function featuredGenusIndex(now: number = Date.now()): number {
  const windowNumber = Math.floor(now / WINDOW_MS);
  const len = FEATURED_GENERA.length;
  return ((windowNumber % len) + len) % len;
}

/** The featured genus NAME for the current 12-hour UTC window. */
export function featuredGenusName(now: number = Date.now()): string {
  return FEATURED_GENERA[featuredGenusIndex(now)];
}

/**
 * The featured genus as a full {@link GenusEntry}. Returns the curated local
 * entry when available (exact species count + ecology); otherwise synthesizes
 * a usable entry around the genus name with an approximate species count.
 */
export function featuredGenusEntry(now: number = Date.now()): GenusEntry {
  const name = featuredGenusName(now);
  const local = lookupGenus(name);
  if (local) return local;

  // Synthesize from a sensible template so the panel always renders fully.
  const template = genusForToday();
  return {
    ...template,
    genus: name,
    speciesCount: SPECIES_COUNT_FALLBACK[name] ?? template.speciesCount,
    description:
      `${name} is a genus in the orchid family (Orchidaceae). Each 12-hour ` +
      `window the Orchid Continuum spotlights a different genus from across ` +
      `the tribe to explore its species, geography, and ecological partners.`,
    regions: template.regions,
    plates: template.plates,
  };
}

/** Milliseconds remaining until the featured genus rotates to the next one. */
export function msUntilNextRotation(now: number = Date.now()): number {
  return WINDOW_MS - (now % WINDOW_MS);
}

/**
 * Fetch an AI-generated 2-3 sentence description highlighting what makes the
 * genus remarkable, via the shared, cached `genus-narrative` edge function.
 * Falls back to a locally-composed, science-grounded summary so the homepage
 * always has a real, grounded description even when the AI service is offline.
 */
export async function fetchFeaturedNarrative(
  entry: GenusEntry,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('genus-narrative', {
      body: { genus: entry.genus },
    });
    if (signal?.aborted) return entry.description;
    const narrative = (data as { narrative?: string } | null)?.narrative;
    if (!error && typeof narrative === 'string' && narrative.trim().length > 0) {
      return narrative.trim();
    }
  } catch {
    /* fall through to local narrative */
  }
  // Grounded local fallback (native range + a pollinator / fungal partner).
  const local = buildLocalNarrative(entry);
  return local || entry.description;
}
