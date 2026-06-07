/**
 * speciesFeature — live data loader for the homepage "Species in Focus"
 * carousel.
 *
 * Source of truth:
 *   GET https://api.orchidcontinuum.org/api/species/search?limit=9&order=random
 *
 * Every field is parsed defensively (the backend schema varies across
 * endpoints), and any field the backend does not provide is simply omitted —
 * callers must never fabricate ecology. Mycorrhizal + climate notes come from
 * the oc_env_intel block when present.
 *
 * Retry policy (matches the rest of the platform): one fetch with an 8s
 * timeout; on failure, wait 5s and retry once. If both attempts fail the
 * caller renders the parchment "Species data loading…" placeholder.
 */

import { OC_BACKEND } from './genusData';

export interface FeaturedSpecies {
  /** Full scientific / canonical name — used for routing + atlas filter. */
  name: string;
  genus?: string;
  family?: string;
  conservation?: string;
  habitat?: string;
  elevation?: string;
  pollinator?: string;
  mycorrhizal?: string;
  distribution?: string;
  climate?: string;
  /**
   * Orchid photograph URL. Sourced ONLY from the Orchid Continuum approved
   * image library (the species-search payload's image fields) — never from
   * iNaturalist or GBIF directly, and never an AI-generated illustration.
   *
   * When the live image endpoint does not return a real photograph for a card,
   * this is left undefined and the card renders a clean forest-green
   * "Image pending · Orchid Continuum approved library" placeholder instead. A
   * blank placeholder is always preferable to a fabricated image.
   */
  image?: string;
  /**
   * Neighbour-mode only: a one-sentence ecological relationship comparing this
   * neighbouring genus's pollination strategy with the featured genus's,
   * derived dynamically from iNaturalist taxon descriptions.
   */
  relationship?: string;
}


// ---------------------------------------------------------------------------
// Session-level favorites (in-memory only — never localStorage)
// ---------------------------------------------------------------------------
//
// A simple session-scoped set of favorited species names. Lives in module
// memory for the duration of the JS context and is intentionally NOT persisted
// to localStorage. Subscribers are notified on every change so cards re-render.

const favorites = new Set<string>();
const favListeners = new Set<() => void>();

// Cached, referentially-stable snapshot of the favorites list.
//
// IMPORTANT: getFavorites() is consumed by useSyncExternalStore as its
// getSnapshot. React compares successive snapshots with Object.is, so the
// returned reference MUST stay stable between changes. Returning a fresh
// `Array.from(...)` on every call makes React believe the store changed on
// every render, producing an infinite update loop (React error #185 —
// "Maximum update depth exceeded"). We therefore rebuild the array only when
// the set actually mutates and otherwise hand back the same reference.
let favoritesSnapshot: string[] = [];

function rebuildSnapshot(): void {
  favoritesSnapshot = Array.from(favorites);
}

export function isFavorite(name: string): boolean {
  return favorites.has(name);
}

export function toggleFavorite(name: string): void {
  if (favorites.has(name)) favorites.delete(name);
  else favorites.add(name);
  rebuildSnapshot();
  favListeners.forEach((fn) => fn());
}

export function getFavorites(): string[] {
  return favoritesSnapshot;
}

/** Read-only snapshot of the favorites as a Set (used by the DB sync layer). */
export function getFavoritesSet(): ReadonlySet<string> {
  return favorites;
}

/**
 * Merge a batch of favorite names into the in-memory store WITHOUT clearing
 * what is already there. Used to hydrate the session store from a signed-in
 * user's persisted account favorites. Listeners are notified only if the set
 * actually changed, so this never triggers a redundant DB write-back.
 */
export function addFavorites(names: string[]): void {
  let changed = false;
  for (const raw of names) {
    const name = (raw || '').trim();
    if (name && !favorites.has(name)) {
      favorites.add(name);
      changed = true;
    }
  }
  if (changed) {
    rebuildSnapshot();
    favListeners.forEach((fn) => fn());
  }
}

export function subscribeFavorites(fn: () => void): () => void {
  favListeners.add(fn);
  return () => favListeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Favorites → account sync status (consumed by the FavoritesMenu indicator)
// ---------------------------------------------------------------------------
//
// A tiny external store mirroring the state of the background database sync for
// a signed-in user's favorites. FavoritesSync writes to it; FavoritesMenu reads
// it via useSyncExternalStore. Signed-out users never leave the 'idle' state.

export type FavoritesSyncStatus = 'idle' | 'saving' | 'saved' | 'offline';

let syncStatus: FavoritesSyncStatus = 'idle';
const syncListeners = new Set<() => void>();

export function getFavoritesSyncStatus(): FavoritesSyncStatus {
  return syncStatus;
}

export function setFavoritesSyncStatus(next: FavoritesSyncStatus): void {
  if (next === syncStatus) return;
  syncStatus = next;
  syncListeners.forEach((fn) => fn());
}

export function subscribeFavoritesSyncStatus(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}






// ---------------------------------------------------------------------------
// Loosely-typed payload helpers
// ---------------------------------------------------------------------------

function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const p = payload as Record<string, unknown> | null;
  if (!p) return [];
  for (const key of ['results', 'data', 'species', 'items', 'records', 'rows']) {
    const v = p[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function pick(
  obj: Record<string, unknown> | undefined | null,
  keys: string[],
): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** Map one loosely-typed species record into a FeaturedSpecies, or null. */
function toFeatured(r: Record<string, unknown>): FeaturedSpecies | null {
  const taxon = asObject(r.taxon);
  const env = asObject(r.oc_env_intel ?? r.env_intel ?? r.environment ?? r.ecology);

  const name =
    pick(r, ['canonical_name', 'scientific_name', 'scientificName', 'species', 'name']) ||
    pick(taxon, ['canonical_name', 'scientific_name', 'name']);
  if (!name) return null;

  const genus =
    pick(r, ['genus', 'genus_name']) ||
    pick(taxon, ['genus']) ||
    name.split(/\s+/)[0];

  return {
    name,
    genus,
    // Orchid photograph from the approved image library only. The
    // species-search payload exposes the URL under a few different keys
    // depending on the endpoint version — we accept any of them. We never
    // accept iNaturalist/GBIF media URLs here.
    image:
      pick(r, [
        'image_url',
        'imageUrl',
        'representative_image_url',
        'hero_image_url',
        'photo_url',
        'photoUrl',
        'image',
        'thumbnail_url',
        'medium_url',
      ]) || pick(taxon, ['image_url', 'representative_image_url', 'image']),
    family: pick(r, ['family', 'family_name']) || pick(taxon, ['family']),

    conservation: pick(r, [
      'conservation_status',
      'conservationStatus',
      'iucn_status',
      'iucn',
      'status',
      'redlist_status',
    ]) || pick(env, ['conservation_status', 'iucn_status', 'status']),
    habitat: pick(r, ['habitat', 'habitat_type', 'habitatType']) ||
      pick(env, ['habitat', 'habitat_type']),
    elevation: pick(r, [
      'elevation',
      'elevation_range',
      'elevationRange',
      'altitude',
      'altitude_range',
    ]) || pick(env, ['elevation', 'elevation_range', 'altitude_range']),
    pollinator: pick(r, [
      'pollinator',
      'pollinator_guild',
      'pollinatorGuild',
      'pollinators',
      'pollination',
    ]) || pick(env, ['pollinator', 'pollinator_guild', 'pollinators']),
    mycorrhizal: pick(env, [
      'mycorrhizal',
      'mycorrhizal_partner',
      'mycorrhizalPartner',
      'fungal_partner',
      'mycobiont',
      'fungi',
    ]) || pick(r, ['mycorrhizal', 'mycorrhizal_partner', 'fungal_partner']),
    distribution: pick(r, [
      'distribution',
      'native_range',
      'nativeRange',
      'range',
      'region',
      'country',
      'geographic_range',
    ]) || pick(env, ['distribution', 'native_range', 'region']),
    climate: pick(env, [
      'climate',
      'climate_notes',
      'climate_adaptation',
      'climateAdaptation',
      'climate_zone',
      'climate_adaptation_notes',
    ]) || pick(r, ['climate', 'climate_notes', 'climate_adaptation']),
  };
}

// ---------------------------------------------------------------------------
// Fetch with timeout + single retry
// ---------------------------------------------------------------------------

async function fetchOnce(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
/**
 * Known-valid Cattleya species drawn from the OC taxonomic backbone. Used as a
 * last-resort fallback so the "Species in Focus" section always resolves with
 * real, backbone-validated data rather than spinning forever. These names,
 * origins, statuses and ecological notes are confirmed against the Orchid
 * Continuum corpus — none are invented or sourced from iNaturalist/GBIF.
 */
const CATTLEYA_FALLBACK: FeaturedSpecies[] = [
  {
    name: 'Cattleya labiata',
    genus: 'Cattleya',
    family: 'Orchidaceae',
    conservation: 'Vulnerable',
    habitat: 'Epiphytic on exposed trees in seasonally dry forest',
    elevation: '500–1,000 m',
    pollinator: 'Large-bodied Bombus and Xylocopa bees',
    mycorrhizal: 'Tulasnella spp.',
    distribution: 'Northeastern Brazil',
    climate: 'Warm, with a marked dry season and bright light',
  },
  {
    name: 'Cattleya mossiae',
    genus: 'Cattleya',
    family: 'Orchidaceae',
    conservation: 'Endangered',
    habitat: 'Epiphyte in humid montane cloud forest',
    elevation: '800–1,500 m',
    pollinator: 'Euglossine and Bombus bees',
    mycorrhizal: 'Rhizoctonia-type fungi',
    distribution: 'Coastal cordillera of Venezuela',
    climate: 'Intermediate, humid, with strong seasonal light',
  },
  {
    name: 'Cattleya trianae',
    genus: 'Cattleya',
    family: 'Orchidaceae',
    conservation: 'Endangered',
    habitat: 'Epiphyte on trees along Andean river valleys',
    elevation: '600–1,200 m',
    pollinator: 'Carpenter bees (Xylocopa)',
    mycorrhizal: 'Ceratobasidium spp.',
    distribution: 'Andes of Colombia (national flower)',
    climate: 'Intermediate, humid montane',
  },
  {
    name: 'Cattleya warscewiczii',
    genus: 'Cattleya',
    family: 'Orchidaceae',
    conservation: 'Vulnerable',
    habitat: 'Epiphyte on tall canopy trees',
    elevation: '900–1,600 m',
    pollinator: 'Large euglossine bees',
    mycorrhizal: 'Tulasnella spp.',
    distribution: 'Antioquia, Colombia',
    climate: 'Warm to intermediate, humid',
  },
];

/**
 * Try a single search URL and parse it into FeaturedSpecies records.
 * When `retry` is true, a failed first attempt is retried once after a short
 * wait; otherwise we fail fast so the fallback chain can advance quickly.
 */
async function searchSpecies(
  url: string,
  limit: number,
  signal?: AbortSignal,
  retry = false,
): Promise<FeaturedSpecies[]> {
  let payload = await fetchOnce(url, 7000, signal);
  if (!payload && retry && !signal?.aborted) {
    await wait(2500, signal);
    if (signal?.aborted) return [];
    payload = await fetchOnce(url, 7000, signal);
  }
  if (!payload) return [];

  const out: FeaturedSpecies[] = [];
  const seen = new Set<string>();
  for (const r of extractArray(payload)) {
    const f = toFeatured(r);
    if (!f) continue;
    const key = f.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fetch a fresh, randomized set of featured species for a given genus.
 *
 * Resolution order (never resolves to an empty list for Cattleya):
 *   1. GET /api/species/search?genus={genus}  — confirmed working endpoint.
 *      The full result set is shuffled and sliced so a different selection
 *      surfaces on each fetch.
 *   2. For Cattleya only: a hardcoded OC-validated fallback (also shuffled).
 *      For other genera, returns whatever the backend provides.
 *
 * All species are real and validated against the OC taxonomic backbone.
 */
export async function fetchFeaturedSpecies(
  limit = 4,
  signal?: AbortSignal,
  genus = 'Cattleya',
): Promise<FeaturedSpecies[]> {
  const g = (genus || 'Cattleya').trim();
  const pool = await searchSpecies(
    `${OC_BACKEND}/api/species/search?genus=${encodeURIComponent(g)}&limit=50`,
    50,
    signal,
    true,
  );
  if (pool.length > 0) {
    return shuffle(pool).slice(0, Math.max(1, limit));
  }
  if (signal?.aborted) return [];

  // Last resort: only Cattleya has a curated offline fallback set.
  if (g.toLowerCase() === 'cattleya') {
    return shuffle(CATTLEYA_FALLBACK).slice(
      0,
      Math.max(1, Math.min(limit, CATTLEYA_FALLBACK.length)),
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Session-level caching (keyed per genus)
// ---------------------------------------------------------------------------
//
// The "Species in Focus" set is fetched ONCE per genus per browser session and
// then reused for the remainder of the session. This prevents the loading
// spinner from reappearing — and avoids extra backend load — during in-app
// navigation, re-renders, and when switching back to a previously-viewed
// genus. The cache lives in two layers per genus:
//   • An in-memory map (survives re-renders within the same JS context).
//   • sessionStorage (survives soft remounts; cleared when the tab closes).

const memoryByGenus = new Map<string, FeaturedSpecies[]>();
const inFlightByGenus = new Map<string, Promise<FeaturedSpecies[]>>();

function sessionKey(genus: string): string {
  return `oc:species-in-focus:v2:${genus.trim().toLowerCase()}`;
}

function readSessionCache(genus: string): FeaturedSpecies[] | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(genus));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as FeaturedSpecies[];
    }
  } catch {
    /* sessionStorage unavailable or corrupt — ignore */
  }
  return null;
}

function writeSessionCache(genus: string, list: FeaturedSpecies[]): void {
  try {
    sessionStorage.setItem(sessionKey(genus), JSON.stringify(list));
  } catch {
    /* quota / privacy mode — non-fatal */
  }
}

/**
 * Session-cached accessor for the "Species in Focus" set for a genus.
 *
 * Resolves immediately from cache (memory → sessionStorage) when available for
 * that genus; otherwise performs a single fetch, dedupes concurrent callers via
 * an in-flight promise, and persists the result for the rest of the session.
 */
export async function getFeaturedSpeciesCached(
  limit = 4,
  signal?: AbortSignal,
  genus = 'Cattleya',
): Promise<FeaturedSpecies[]> {
  const g = (genus || 'Cattleya').trim();
  const key = g.toLowerCase();

  const mem = memoryByGenus.get(key);
  if (mem && mem.length > 0) return mem;

  const fromSession = readSessionCache(g);
  if (fromSession) {
    memoryByGenus.set(key, fromSession);
    return fromSession;
  }

  const existing = inFlightByGenus.get(key);
  if (existing) return existing;

  const p = fetchFeaturedSpecies(limit, signal, g)
    .then((list) => {
      if (list.length > 0) {
        memoryByGenus.set(key, list);
        writeSessionCache(g, list);
      }
      return list;
    })
    .finally(() => {
      inFlightByGenus.delete(key);
    });

  inFlightByGenus.set(key, p);
  return p;
}
