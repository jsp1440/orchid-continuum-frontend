/**
 * speciesFeature — live data loader for the homepage "Species in Focus"
 * carousel.
 *
 * TAXONOMY CONTRACT:
 * Orchid species identities are full binomials or taxonomy-backed records.
 * A bare species epithet such as "labiata" is NOT a valid display/routing key,
 * because the same epithet can occur in different genera. Any backend row that
 * supplies genus + species/specific_epithet is normalized to a full binomial
 * before it reaches the UI.
 */

import { OC_BACKEND, IMAGES_BACKEND_BASE_URL } from './backendConfig';

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
  image?: string;
  /** Neighbour-mode only. */
  relationship?: string;
}

// ---------------------------------------------------------------------------
// Session-level favorites (in-memory only — never localStorage)
// ---------------------------------------------------------------------------

const favorites = new Set<string>();
const favListeners = new Set<() => void>();
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

export function getFavoritesSet(): ReadonlySet<string> {
  return favorites;
}

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
// Favorites → account sync status
// ---------------------------------------------------------------------------

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
// Payload helpers
// ---------------------------------------------------------------------------

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function pick(obj: Record<string, unknown> | undefined | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as Record<string, unknown>;
  for (const key of ['results', 'data', 'species', 'images', 'items', 'records', 'rows', 'taxa']) {
    const v = obj[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    if (v && typeof v === 'object') {
      const nested = extractArray(v);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeGenus(raw?: string): string | undefined {
  const g = (raw || '').trim();
  if (!g) return undefined;
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
}

function normalizeEpithet(raw?: string): string | undefined {
  const e = (raw || '').trim();
  if (!e) return undefined;
  return e.toLowerCase();
}

function looksLikeBinomial(name: string): boolean {
  return /^[A-Z][A-Za-z-]+\s+[a-z][a-z-]+/.test(name.trim());
}

/**
 * Convert a loosely-shaped taxonomy/image row into the only species identity we
 * allow the UI to use: a full binomial such as "Oncidium sotoanum".
 */
function normalizeBinomial(row: Record<string, unknown>, fallbackGenus?: string): string | undefined {
  const taxon = asObject(row.taxon);

  const genus = normalizeGenus(
    pick(row, ['genus', 'genus_name', 'accepted_genus', 'parsed_genus']) ||
      pick(taxon, ['genus', 'genus_name']) ||
      fallbackGenus,
  );

  const epithet = normalizeEpithet(
    pick(row, [
      'specific_epithet',
      'specificEpithet',
      'species_epithet',
      'epithet',
      'species',
      'accepted_species',
      'parsed_species',
    ]) || pick(taxon, ['specific_epithet', 'species_epithet', 'epithet', 'species']),
  );

  const explicit =
    pick(row, [
      'accepted_scientific_name',
      'scientific_name',
      'scientificName',
      'canonical_name',
      'species_name',
      'name',
    ]) || pick(taxon, ['accepted_scientific_name', 'scientific_name', 'canonical_name', 'name']);

  const cleaned = (explicit || '').trim().replace(/\s+/g, ' ');

  if (looksLikeBinomial(cleaned)) return cleaned;

  if (genus && cleaned && !/\s/.test(cleaned) && cleaned.toLowerCase() !== genus.toLowerCase()) {
    return `${genus} ${normalizeEpithet(cleaned)}`;
  }

  if (genus && epithet && epithet.toLowerCase() !== genus.toLowerCase()) {
    return `${genus} ${epithet}`;
  }

  return undefined;
}

function imageFrom(row: Record<string, unknown>): string | undefined {
  const taxon = asObject(row.taxon);
  return (
    pick(row, [
      'image_url',
      'imageUrl',
      'representative_image_url',
      'hero_image_url',
      'photo_url',
      'photoUrl',
      'url',
      'image',
      'thumbnail_url',
      'medium_url',
      'original_url',
    ]) || pick(taxon, ['image_url', 'representative_image_url', 'hero_image_url', 'image'])
  );
}

/** Map one loosely-typed species record into a FeaturedSpecies, or null. */
function toFeatured(row: Record<string, unknown>, fallbackGenus?: string): FeaturedSpecies | null {
  const taxon = asObject(row.taxon);
  const env = asObject(row.oc_env_intel ?? row.env_intel ?? row.environment ?? row.ecology);

  const name = normalizeBinomial(row, fallbackGenus);
  if (!name || !looksLikeBinomial(name)) return null;

  const genus =
    normalizeGenus(
      pick(row, ['genus', 'genus_name', 'accepted_genus', 'parsed_genus']) ||
        pick(taxon, ['genus', 'genus_name']) ||
        name.split(/\s+/)[0],
    ) || name.split(/\s+/)[0];

  return {
    name,
    genus,
    image: imageFrom(row),
    family: pick(row, ['family', 'family_name']) || pick(taxon, ['family']) || 'Orchidaceae',
    conservation:
      pick(row, [
        'conservation_status',
        'conservationStatus',
        'iucn_status',
        'iucn',
        'status',
        'redlist_status',
      ]) || pick(env, ['conservation_status', 'iucn_status', 'status']),
    habitat:
      pick(row, ['habitat', 'habitat_type', 'habitatType']) ||
      pick(env, ['habitat', 'habitat_type']),
    elevation:
      pick(row, ['elevation', 'elevation_range', 'elevationRange', 'altitude', 'altitude_range']) ||
      pick(env, ['elevation', 'elevation_range', 'altitude_range']),
    pollinator:
      pick(row, ['pollinator', 'pollinator_guild', 'pollinatorGuild', 'pollinators', 'pollination']) ||
      pick(env, ['pollinator', 'pollinator_guild', 'pollinators']),
    mycorrhizal:
      pick(env, ['mycorrhizal', 'mycorrhizal_partner', 'mycorrhizalPartner', 'fungal_partner', 'mycobiont', 'fungi']) ||
      pick(row, ['mycorrhizal', 'mycorrhizal_partner', 'fungal_partner']),
    distribution:
      pick(row, ['distribution', 'native_range', 'nativeRange', 'range', 'region', 'country', 'geographic_range']) ||
      pick(env, ['distribution', 'native_range', 'region']),
    climate:
      pick(env, ['climate', 'climate_notes', 'climate_adaptation', 'climateAdaptation', 'climate_zone', 'climate_adaptation_notes']) ||
      pick(row, ['climate', 'climate_notes', 'climate_adaptation']),
  };
}

// ---------------------------------------------------------------------------
// Fetch with timeout + single retry
// ---------------------------------------------------------------------------

async function fetchOnce(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
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
 * last-resort fallback so the UI never fabricates species.
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

async function searchSpecies(url: string, limit: number, fallbackGenus: string, signal?: AbortSignal, retry = false): Promise<FeaturedSpecies[]> {
  let payload = await fetchOnce(url, 7000, signal);
  if (!payload && retry && !signal?.aborted) {
    await wait(2500, signal);
    if (signal?.aborted) return [];
    payload = await fetchOnce(url, 7000, signal);
  }
  if (!payload) return [];

  const out: FeaturedSpecies[] = [];
  const seen = new Set<string>();
  for (const row of extractArray(payload)) {
    const feature = toFeatured(row, fallbackGenus);
    if (!feature) continue;
    const key = feature.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchGenusImageHarvester(genus: string, limit: number, signal?: AbortSignal): Promise<FeaturedSpecies[]> {
  const g = normalizeGenus(genus);
  if (!g) return [];

  const payload = await fetchOnce(
    `${IMAGES_BACKEND_BASE_URL}/images/genus/${encodeURIComponent(g)}?limit=${Math.max(20, limit * 3)}`,
    12000,
    signal,
  );
  if (!payload) return [];

  const out: FeaturedSpecies[] = [];
  const seen = new Set<string>();
  for (const row of extractArray(payload)) {
    const feature = toFeatured(row, g);
    if (!feature) continue;
    const key = feature.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
    if (out.length >= limit) break;
  }
  return out;
}

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
 * Resolution order:
 *   1. /api/species/search?genus={genus} — taxonomy backbone search.
 *   2. /api/search?q={genus} — legacy search path.
 *   3. /images/genus/{genus} — image harvester rows with genus+epithet.
 *   4. Cattleya-only curated fallback.
 */
export async function fetchFeaturedSpecies(limit = 4, signal?: AbortSignal, genus = 'Cattleya'): Promise<FeaturedSpecies[]> {
  const g = normalizeGenus(genus) || 'Cattleya';
  const requested = Math.max(1, limit);

  const taxonomyPool = await searchSpecies(
    `${OC_BACKEND}/api/species/search?genus=${encodeURIComponent(g)}&limit=50`,
    50,
    g,
    signal,
    true,
  );
  if (taxonomyPool.length > 0) return shuffle(taxonomyPool).slice(0, requested);

  const legacyPool = await searchSpecies(
    `${OC_BACKEND}/api/search?q=${encodeURIComponent(g)}&limit=50`,
    50,
    g,
    signal,
    false,
  );
  if (legacyPool.length > 0) return shuffle(legacyPool).slice(0, requested);

  const harvesterPool = await searchGenusImageHarvester(g, 50, signal);
  if (harvesterPool.length > 0) return shuffle(harvesterPool).slice(0, requested);

  if (signal?.aborted) return [];
  if (g.toLowerCase() === 'cattleya') {
    return shuffle(CATTLEYA_FALLBACK).slice(0, Math.min(requested, CATTLEYA_FALLBACK.length));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Session-level caching (keyed per genus)
// ---------------------------------------------------------------------------

const memoryByGenus = new Map<string, FeaturedSpecies[]>();
const inFlightByGenus = new Map<string, Promise<FeaturedSpecies[]>>();

function sessionKey(genus: string): string {
  // v4 invalidates earlier caches before the image-harvester binomial fallback.
  return `oc:species-in-focus:v4:${genus.trim().toLowerCase()}`;
}

function readSessionCache(genus: string): FeaturedSpecies[] | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(genus));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const safe = parsed.filter((x) => x && typeof x.name === 'string' && looksLikeBinomial(x.name));
      return safe.length > 0 ? (safe as FeaturedSpecies[]) : null;
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

export async function getFeaturedSpeciesCached(limit = 4, signal?: AbortSignal, genus = 'Cattleya'): Promise<FeaturedSpecies[]> {
  const g = normalizeGenus(genus) || 'Cattleya';
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
