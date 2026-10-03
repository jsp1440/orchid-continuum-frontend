/**
 * genusData — genus rotation (identity only) and live genus data helpers.
 *
 * Used by the /genus/:name detail page. The rotation holds genus NAMES only;
 * every factual field is resolved from a live Orchid Continuum backend.
 */

import { supabase } from '@/lib/supabase';
import {
  BACKEND_BASE_URL,
  IMAGES_BACKEND_BASE_URL,
  LEGACY_ONRENDER_BASE_URL,
} from '@/lib/backendConfig';
import type { FeaturedSpecies } from '@/lib/speciesFeature';


/**
 * A genus in the local rotation / genus-profile index.
 *
 * SCIENTIFIC-INTEGRITY CONTRACT: this is IDENTITY + NAVIGATION context only.
 * It deliberately carries no taxon facts (no species counts, tribe, native
 * range, elevation, habitat, pollinators, mycorrhizal partners, conservation
 * status, descriptions or species plates). The previous hand-authored values
 * had no source, citation or review record and were shown to visitors as if
 * they were Continuum data. Every factual field on a genus page must come from
 * a live Orchid Continuum backend contract and carry that provenance; when the
 * backend is unavailable the UI shows an honest unavailable / empty state.
 *
 * `noFabricatedFallbackData.sourceScan.test.ts` fails if factual fields reappear here.
 */
export interface GenusEntry {
  genus: string;
  family: 'Orchidaceae';
}

/**
 * Genus rotation, keyed by day-of-week (0 Sun ... 6 Sat). Names only.
 */
export const GENERA: Record<number, GenusEntry> = {
  0: { genus: 'Vanilla', family: 'Orchidaceae' },
  1: { genus: 'Dracula', family: 'Orchidaceae' },
  2: { genus: 'Masdevallia', family: 'Orchidaceae' },
  3: { genus: 'Cattleya', family: 'Orchidaceae' },
  4: { genus: 'Dendrobium', family: 'Orchidaceae' },
  5: { genus: 'Bulbophyllum', family: 'Orchidaceae' },
  6: { genus: 'Catasetum', family: 'Orchidaceae' },
};

/** Case-insensitive lookup of a genus by name across the rotation. */
export function lookupGenus(name: string): GenusEntry | undefined {
  const key = name.trim().toLowerCase();
  return Object.values(GENERA).find((g) => g.genus.toLowerCase() === key);
}

// ---------------------------------------------------------------------------
// Backend origins
// ---------------------------------------------------------------------------
//
// ARCHITECTURE RULE: the frontend NEVER talks to iNaturalist, GBIF, or any
// other external API directly. Every photo / species / genus request goes
// through an Orchid Continuum backend, which validates results against the
// taxonomic database before returning them. This guarantees only verified
// orchid data ever reaches the UI.
//
// This module imports the named origins it needs directly from the single
// source of truth in src/lib/backendConfig.ts (no local aliases):
//
//   BACKEND_BASE_URL        — taxonomy / genus-photo APIs (api.orchidcontinuum.org)
//   IMAGES_BACKEND_BASE_URL — trusted genus image library (orchidcontinuumharvester2.onrender.com)
//   LEGACY_ONRENDER_BASE_URL — legacy search / species-image APIs (orchidcontinuum.onrender.com)

// ---------------------------------------------------------------------------
// Backend warm-up
// ---------------------------------------------------------------------------
//
// The Render-hosted harvester backends spin down when idle and can take 30s+
// to answer the FIRST request after a cold start. To hide that latency we fire
// a cheap, fire-and-forget warm-up ping the moment the app loads — long before
// the user actually asks for any genus images — so the API instances are awake
// and ready by the time a real request arrives.

/** Guard so the warm-up only ever runs once per page load. */
let backendsWarmed = false;

/**
 * Wake both Render backends with a cheap, fire-and-forget request. Safe to call
 * on every page mount: it no-ops after the first call, swallows all errors, and
 * never blocks (returns immediately). Call this as early as possible (e.g. from
 * a top-level component's mount effect) so cold starts finish before the user
 * requests any images.
 */
export function warmBackends(): void {
  if (backendsWarmed || typeof window === 'undefined') return;
  backendsWarmed = true;

  const ping = (base: string, path: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    fetch(`${base}${path}`, { signal: ctrl.signal, mode: 'cors' })
      .then(() => console.log(`[warmBackends] ✓ warmed ${base}${path}`))
      .catch(() => {
        /* cold-start / CORS / network — the request still wakes the instance */
      })
      .finally(() => clearTimeout(timer));
  };

  // Hit a lightweight endpoint on each backend. Even a 404 wakes the dyno.
  console.log('[warmBackends] ➜ pinging harvester backends to beat cold start');
  ping(IMAGES_BACKEND_BASE_URL, '/health');
  ping(IMAGES_BACKEND_BASE_URL, '/');
  ping(BACKEND_BASE_URL, '/api/genus/daily');
}

/** Fetch JSON from an arbitrary base origin with a timeout; null on any error. */
async function ocFetchFrom<T>(
  base: string,
  path: string,
  signal?: AbortSignal,
  timeoutMs = 7000,
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Fetch JSON from the OC backend with a timeout; resolves to null on any error. */
async function ocFetch<T>(
  path: string,
  signal?: AbortSignal,
  timeoutMs = 7000,
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${BACKEND_BASE_URL}${path}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Pull the first array we can find out of a loosely-typed backend payload. */
function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const p = payload as Record<string, unknown> | null;
  if (!p) return [];
  for (const key of ['photos', 'results', 'data', 'species', 'items', 'records', 'images']) {
    const v = p[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function hasRecognizedArrayPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return ['photos', 'results', 'data', 'species', 'items', 'records', 'images']
    .some((key) => Array.isArray(p[key]));
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/**
 * A rich species observation returned by the Orchid Continuum backend, used
 * by the full Genus of the Day panel. Every record is an orchid that the
 * backend has confirmed against the Continuum taxonomic database.
 */
export interface SpeciesPhoto {
  image: string;
  species: string;
  commonName?: string;
  place?: string;
  conservation?: string;
  photographer?: string;
}

/** Normalise an iNat "square" thumbnail to the medium size, if present. */
function toMedium(url: string): string {
  return url.replace('square', 'medium');
}

/** Map one loosely-typed backend photo record into a SpeciesPhoto, or null. */
function toSpeciesPhoto(r: Record<string, unknown>): SpeciesPhoto | null {
  const nested = (r.taxon as Record<string, unknown>) ?? {};
  const image = pick(r, ['photo_url', 'photoUrl', 'image', 'image_url', 'url', 'medium_url']);
  if (!image) return null;
  const species =
    pick(r, ['species', 'scientific_name', 'scientificName', 'canonical_name', 'name']) ||
    pick(nested, ['name', 'scientific_name', 'canonical_name']);
  if (!species) return null;
  return {
    image: toMedium(image),
    species,
    commonName:
      pick(r, ['common_name', 'commonName', 'preferred_common_name', 'vernacular_name']) ||
      pick(nested, ['preferred_common_name', 'common_name']),
    place: pick(r, ['place', 'place_guess', 'country', 'region', 'location']),
    conservation:
      pick(r, ['conservation_status', 'conservationStatus', 'status', 'status_name', 'iucn']) ||
      pick((nested.conservation_status as Record<string, unknown>) ?? {}, ['status_name', 'status']),
    photographer: pick(r, ['photographer', 'observer', 'user', 'user_login', 'login', 'credit']),
  };
}

/**
 * Fetch up to `limit` verified orchid species photos for a genus from the
 * Orchid Continuum backend (NOT iNaturalist directly).
 *
 *   GET /api/genus/{genus}/photos?limit={limit}
 *
 * The backend confirms the genus exists in our taxonomy, then returns only
 * photos for accepted orchid taxa within that genus. Resolves to [] when the
 * endpoint is unavailable or returns nothing — callers then render a clean
 * "Photos coming soon" placeholder grid rather than any external content.
 */
export async function fetchGenusSpecies(
  genus: string,
  signal?: AbortSignal,
  limit = 30,
): Promise<SpeciesPhoto[]> {
  const payload = await ocFetch<unknown>(
    `/api/genus/${encodeURIComponent(genus)}/photos?limit=${limit}`,
    signal,
  );
  if (!payload) return [];
  const out: SpeciesPhoto[] = [];
  const seen = new Set<string>();
  for (const r of extractArray(payload)) {
    const sp = toSpeciesPhoto(r);
    if (!sp) continue;
    const key = `${sp.species}|${sp.image}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sp);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Back-compat helper used by the genus detail page: returns just the photo
 * URLs from {@link fetchGenusSpecies}, sourced via the OC backend.
 */
export async function fetchGenusPhotos(
  genus: string,
  signal?: AbortSignal,
  limit = 9,
): Promise<string[]> {
  const species = await fetchGenusSpecies(genus, signal, limit);
  return species.map((s) => s.image).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Trusted genus image library  (v_orchid_images_trusted → orchid_taxonomy)
// ---------------------------------------------------------------------------
//
// Consumes the dedicated backend image endpoint:
//
//   GET /images/genus/{genus}
//
// which the FastAPI harvester serves from the quality-filtered, taxonomy-joined
// view `v_orchid_images_trusted` (918k rows over the 5M-row orchid_images
// table). The backend returns ONE image per distinct scientific_name (DISTINCT
// ON + RANDOM, max 20) using:
//
//   SELECT DISTINCT ON (ot.scientific_name)
//          ot.scientific_name, v.image_url, v.image_source, v.image_license
//   FROM v_orchid_images_trusted v
//   JOIN orchid_taxonomy ot ON v.taxonomy_id = ot.id
//   WHERE ot.genus = :genus AND v.image_url IS NOT NULL
//   ORDER BY ot.scientific_name, RANDOM()
//   LIMIT 20;
//
// These are real, backbone-validated orchid photographs from the OC approved
// library — NEVER iNaturalist/GBIF direct, NEVER AI-generated. When the
// endpoint is unavailable or returns nothing, callers keep the forest-green
// "Image pending" placeholder.

/** One trusted image row for a distinct scientific name within a genus. */
export interface GenusImage {
  scientific_name: string;
  /** Primary (first / preferred) image URL — kept for back-compat. */
  image_url: string;
  /**
   * ALL candidate image URLs the backend returned for this scientific name,
   * in priority order. The UI tries each in turn (see {@link FallbackImage}):
   * if one fails to load / is a broken image, it automatically advances to the
   * next so a single dead URL never forces the "Image pending" placeholder.
   */
  image_urls: string[];
  image_source?: string;
  image_license?: string;
}

// ---------------------------------------------------------------------------
// Per-genus trusted-image localStorage cache (keyed by genus + day)
// ---------------------------------------------------------------------------
//
// The
// resolved trusted images for a genus are cached for the current local day so
// repeat visits to the same genus render instantly and we avoid re-waking the
// Render harvester backend (which can be slow on a cold start). The cache is
// invalidated automatically when the day rolls over, since the day is baked
// into the key.

/** Cached trusted-image list for one genus on a given local day. */
interface CachedGenusImages {
  genus: string;
  date: string;
  writtenAt: number;
  images: GenusImage[];
}

/** YYYY-MM-DD for "today" (UTC date portion of the ISO timestamp). */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Storage key for a genus's images on "today" (case-insensitive genus). */
function genusImagesCacheKey(genus: string): string {
  return `oc_genus_images_v3_${genus.trim().toLowerCase()}_${todayKey()}`;
}

/** Read today's cached images for a genus, or null if absent/stale/invalid. */
function readGenusImagesCache(genus: string): GenusImage[] | null {
  try {
    const raw = localStorage.getItem(genusImagesCacheKey(genus));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGenusImages;
    if (parsed.date !== todayKey()) return null;
    if (!Array.isArray(parsed.images)) return null;
    return parsed.images;
  } catch {
    return null;
  }
}

/** Write a genus's images to today's cache, pruning stale image-cache keys. */
function writeGenusImagesCache(genus: string, images: GenusImage[]): void {
  try {
    const key = genusImagesCacheKey(genus);
    // Prune stale image-cache entries (other genera / previous days) so storage
    // doesn't grow unbounded — keep only today's entry for this genus.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('oc_genus_images_') && k !== key) {
        localStorage.removeItem(k);
      }
    }
    const payload: CachedGenusImages = {
      genus: genus.trim(),
      date: todayKey(),
      writtenAt: Date.now(),
      images,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* storage may be unavailable / full — non-fatal, just skip caching */
  }
}

// ---------------------------------------------------------------------------
// Server-side image cache (Supabase `genus-images` edge function)
// ---------------------------------------------------------------------------
//
// In addition to the per-browser localStorage cache above, we keep a SHARED
// server-side cache in Supabase so that the FIRST visitor of the day warms it
// for EVERYONE — across browsers, devices, and incognito sessions — without
// re-hitting the cold-start-prone Render harvester. The edge function exposes:
//   { action:'get', genus }            → cached images (instant) or []
//   { action:'put', genus, images }    → store browser-harvested images
// The browser is responsible for harvesting (the edge runtime cannot reach the
// external harvester), then it writes the result back via 'put'.

/** Read a genus's images from the shared server cache; [] on miss/error. */
async function readServerImageCache(genus: string, limit = 200): Promise<GenusImage[]> {
  try {
    const { data, error } = await supabase.functions.invoke('genus-images', {
      body: { action: 'get', genus, limit },
    });
    if (error) return [];
    const imgs = (data as { images?: GenusImage[] } | null)?.images;
    return Array.isArray(imgs) ? imgs : [];
  } catch {
    return [];
  }
}
/** Persist a genus's images to the shared server cache (fire-and-forget). */
function writeServerImageCache(genus: string, images: GenusImage[]): void {
  if (!images.length) return;
  try {
    void supabase.functions.invoke('genus-images', {
      body: { action: 'put', genus, images },
    });
  } catch {
    /* non-fatal — the localStorage cache still covers this browser */
  }
}

/**
 * Where a resolved set of genus images ultimately came from. Surfaced to the UI
 * (DailyGenusFeature / GenusDetail) as a small, non-intrusive source indicator
 * so users and admins can see image-source health at a glance:
 *   • 'live'        — fetched directly from the Render harvester #2 this request.
 *   • 'cache'       — served instantly from this browser's localStorage day cache.
 *   • 'proxy'       — served from the shared Supabase server-side cache/proxy.
 *   • 'inaturalist' — FALLBACK only: a Plantae-only photo pulled directly from
 *                     the public iNaturalist API because the trusted OC library
 *                     had nothing. Tagged distinctly so curators can tell at a
 *                     glance which photos are NOT from the vetted OC library.
 *   • 'empty'       — the trusted harvester answered successfully with no usable rows.
 *   • 'pending'     — no source returned a verifiable answer; UI shows "Image pending".
 */
export type ImageSource = 'live' | 'cache' | 'proxy' | 'inaturalist' | 'empty' | 'pending';

/** A resolved genus-image set tagged with the source it came from. */
export interface GenusImageResult {
  images: GenusImage[];
  source: ImageSource;
}




/**
 * Fetch up to `limit` trusted images for a genus AND report where they came
 * from, fastest-source-first:
 *   1. localStorage  (instant, this browser, this day)        → source 'cache'
 *   2. Supabase shared server cache / proxy  (cross-device)   → source 'proxy'
 *   3. the Render harvester #2 backend  (slow on cold start)  → source 'live'
 *
 * Any successful harvester result is written back to BOTH caches so the next
 * visitor — on any device — gets it instantly. Resolves to an empty list with
 * source 'pending' on total failure so the UI falls back to the "Image pending"
 * placeholder rather than any fabricated imagery.
 */
export async function fetchGenusImagesWithSource(
  genus: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<GenusImageResult> {
  const g = (genus || '').trim();
  if (!g) {
    console.warn('[fetchGenusImages] called with empty genus — returning []');
    return { images: [], source: 'pending' };
  }

  // ── 1. localStorage fast path (instant, no network) ──
  const cached = readGenusImagesCache(g);
  if (cached && cached.length > 0) {
    console.log(
      `[fetchGenusImages] ⚡ localStorage HIT for "${g}" — ${cached.length} image(s)`,
    );
    return { images: cached.slice(0, limit), source: 'cache' };
  }

  // ── 2. Shared server cache / proxy (Supabase edge function) ──
  if (!signal?.aborted) {
const server = await readServerImageCache(g, limit);
    if (server.length > 0) {
      console.log(
        `[fetchGenusImages] ⚡ server cache HIT for "${g}" — ${server.length} image(s)`,
      );
      // Mirror into localStorage so subsequent same-day visits skip the network.
      writeGenusImagesCache(g, server);
      return { images: server.slice(0, limit), source: 'proxy' };
    }
  }

  // ── 3. Harvester with retry-with-backoff (cold-start tolerant) ──
  // A cold Render dyno routinely needs 20–40s to answer the first request, so
  // the first attempt waits longest. The first non-empty result wins and is
  // persisted to BOTH caches.
  //
  // IMPORTANT: We distinguish a *cold-start timeout* (worth retrying — the dyno
  // is just waking up) from a *hard network / CORS failure* (status 0 "Load
  // failed"). A CORS/network failure will NEVER succeed by retrying, so when we
  // see one we break out of the loop immediately and skip straight to the
  // iNaturalist fallback rather than burning up to ~80s on doomed retries.
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 3000;
  const TIMEOUTS_MS = [40000, 20000, 20000];
  let sawSuccessfulEmpty = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { images: [], source: 'pending' };
    console.log(`[fetchGenusImages] ➜ harvester attempt ${attempt}/${MAX_ATTEMPTS} for "${g}"`);
    const { images: result, networkError, answered } = await fetchGenusImagesOnce(
      g,
      signal,
      limit,
      TIMEOUTS_MS[attempt - 1] ?? 20000,
    );
    if (result.length > 0) {
      writeGenusImagesCache(g, result);
      writeServerImageCache(g, result); // warm the shared cache for everyone
      return { images: result, source: 'live' };
    }
    if (answered) sawSuccessfulEmpty = true;
    if (networkError) {
      // Hard CORS / network failure — retrying cannot help. Bail to fallback.
      console.warn(
        `[fetchGenusImages] harvester unreachable (network/CORS) for "${g}" — skipping remaining retries and using fallback`,
      );
      break;
    }
    if (attempt < MAX_ATTEMPTS && !signal?.aborted) {
      console.warn(
        `[fetchGenusImages] empty result on attempt ${attempt} — retrying in ${BACKOFF_MS}ms`,
      );
      await new Promise((r) => setTimeout(r, BACKOFF_MS));
    }
  }

  // ── 4. iNaturalist FALLBACK (Plantae-only, per-species) ──
  // The trusted OC library + both caches returned nothing (or the harvester was
  // unreachable). As a last resort we pull Plantae-only photos straight from
  // iNaturalist so the grid shows real plants rather than "Image pending"
  // placeholders. Where we have a curated species list for the genus (see
  // GENUS_FALLBACK_SPECIES) we query each SPECIES separately so the 4-card grid
  // gets one distinct photo per species — iNaturalist often returns only 1–2
  // photos for a bare genus query, which starved the grid. Results are tagged
  // distinctly (source:'inaturalist') so curators can tell at a glance the
  // photos did NOT come from the vetted OC library and may need review. We
  // deliberately do NOT write them to either trusted-image cache.
  if (!signal?.aborted) {
    const inat = await fetchInaturalistGenusImages(g, limit, signal);
    if (inat.length > 0) {
      console.log(
        `[fetchGenusImages] using iNaturalist fallback for "${g}" — ${inat.length} photo(s)`,
      );
      return { images: inat, source: 'inaturalist' };
    }
  }

  // A successful trusted-harvester response with zero usable rows is evidence
  // of an empty result. If no source answered successfully, preserve outage.
  return { images: [], source: sawSuccessfulEmpty ? 'empty' : 'pending' };
}


/**
 * iNaturalist genus-photo fallback.
 *
 *
 * ⚠ POLICY NOTE: This intentionally calls the public iNaturalist API directly
 * from the frontend — a deliberate exception to the "backend-validated images
 * only" rule documented above, added at explicit request. To keep non-plant
 * results (moths, fungi, etc.) out of the UI we apply two hard guards:
 *   1. iconic_taxon_name MUST be exactly "Plantae" — anything else is rejected.
 *   2. The taxon `name` MUST start with the requested genus.
 *
 *   GET https://api.inaturalist.org/v1/taxa?q={genus}&rank=genus&photos=true
 *
 * Returns a single GenusImage built from the first qualifying result's
 * default_photo.medium_url, or null when nothing qualifies / the request fails.
 */
async function fetchInaturalistGenusImage(
  genus: string,
  signal?: AbortSignal,
): Promise<GenusImage | null> {
  const g = (genus || '').trim();
  if (!g) return null;
  const url =
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(g)}` +
    `&rank=genus&photos=true`;
  try {
    const payload = await ocFetchFrom<{ results?: Record<string, unknown>[] }>(
      '',
      url,
      signal,
      8000,
    );
    const results = Array.isArray(payload?.results) ? payload!.results : [];
    const lowerGenus = g.toLowerCase();
    for (const r of results) {
      // GUARD 1: only true plants — never moths, fungi, or any other kingdom.
      const iconic = typeof r.iconic_taxon_name === 'string'
        ? r.iconic_taxon_name
        : '';
      if (iconic !== 'Plantae') continue;

      // GUARD 2: the taxon name must start with the requested genus.
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name || !name.toLowerCase().startsWith(lowerGenus)) continue;

      const photo = (r.default_photo as Record<string, unknown>) ?? {};
      const medium =
        typeof photo.medium_url === 'string' ? photo.medium_url.trim() : '';
      if (!medium) continue;

      const attribution =
        typeof photo.attribution === 'string' ? photo.attribution.trim() : '';
      const license =
        typeof photo.license_code === 'string' ? photo.license_code.trim() : '';

      console.log(
        `[fetchGenusImages] iNaturalist fallback HIT for "${g}" — ${name}`,
      );
      return {
        scientific_name: name,
        image_url: medium,
        image_urls: [medium],
        image_source: attribution || 'iNaturalist',
        image_license: license || undefined,
      };
    }
    console.warn(
      `[fetchGenusImages] iNaturalist fallback: no Plantae result starting with "${g}"`,
    );
    return null;
  } catch (err) {
    console.warn('[fetchGenusImages] iNaturalist fallback failed for', g, err);
    return null;
  }
}

/**
 * Curated per-genus species lists for the iNaturalist fallback.
 *
 * iNaturalist's bare genus query (rank=genus) frequently returns only 1–2
 * usable default photos for a genus, which starves the 4-card "Species in
 * Focus" grid. When a genus appears here we instead query each LISTED SPECIES
 * separately (rank=species) so the grid gets one distinct, real photo per
 * species. The four Catasetum species below were chosen because they are
 * well-documented on iNaturalist and representative of the genus.
 *
 * Keys are lower-cased genus names; values are full binomials.
 */
const GENUS_FALLBACK_SPECIES: Record<string, string[]> = {
  catasetum: [
    'Catasetum macrocarpum',
    'Catasetum fimbriatum',
    'Catasetum cristatum',
    'Catasetum saccatum',
    'Catasetum expansum',
    'Catasetum discolor',
    'Catasetum splendens',
  ],
};

/**
 * iNaturalist single-SPECIES photo fallback (Plantae-only).
 *
 * Queries iNaturalist for one specific binomial and returns the first
 * qualifying Plantae photo. Same two hard guards as the genus fallback:
 *   1. iconic_taxon_name MUST be exactly "Plantae".
 *   2. The taxon `name` MUST start with the requested binomial (genus +
 *      epithet) so we never grab a different species or a bare genus match.
 *
 *   GET https://api.inaturalist.org/v1/taxa?q={species}&rank=species&photos=true
 *
 * Returns a GenusImage labelled with the FULL binomial, or null when nothing
 * qualifies / the request fails.
 */
async function fetchInaturalistSpeciesImage(
  species: string,
  signal?: AbortSignal,
): Promise<GenusImage | null> {
  const s = (species || '').trim();
  if (!s) return null;
  const url =
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(s)}` +
    `&rank=species&photos=true`;
  try {
    const payload = await ocFetchFrom<{ results?: Record<string, unknown>[] }>(
      '',
      url,
      signal,
      8000,
    );
    const results = Array.isArray(payload?.results) ? payload!.results : [];
    const lowerSpecies = s.toLowerCase();
    for (const r of results) {
      // GUARD 1: only true plants — never moths, fungi, or any other kingdom.
      const iconic =
        typeof r.iconic_taxon_name === 'string' ? r.iconic_taxon_name : '';
      if (iconic !== 'Plantae') continue;

      // GUARD 2: the taxon name must match the requested binomial.
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name || !name.toLowerCase().startsWith(lowerSpecies)) continue;

      const photo = (r.default_photo as Record<string, unknown>) ?? {};
      const medium =
        typeof photo.medium_url === 'string' ? photo.medium_url.trim() : '';
      if (!medium) continue;

      const attribution =
        typeof photo.attribution === 'string' ? photo.attribution.trim() : '';
      const license =
        typeof photo.license_code === 'string' ? photo.license_code.trim() : '';

      console.log(
        `[fetchGenusImages] iNaturalist species fallback HIT — ${name}`,
      );
      return {
        scientific_name: name,
        image_url: medium,
        image_urls: [medium],
        image_source: attribution || 'iNaturalist',
        image_license: license || undefined,
      };
    }
    console.warn(
      `[fetchGenusImages] iNaturalist species fallback: no Plantae result for "${s}"`,
    );
    return null;
  } catch (err) {
    console.warn(
      '[fetchGenusImages] iNaturalist species fallback failed for',
      s,
      err,
    );
    return null;
  }
}

/**
 * iNaturalist genus fallback that returns UP TO `limit` Plantae-only photos.
 *
 * When the genus has a curated species list (see {@link GENUS_FALLBACK_SPECIES})
 * we query each of those SPECIES separately and return one photo per species —
 * this is what lets the 4-card grid fill for genera like Catasetum, which only
 * yield 1–2 photos from a bare genus query. Otherwise we fall back to the
 * single bare-genus query ({@link fetchInaturalistGenusImage}).
 *
 * Every returned photo is guaranteed iconic_taxon_name === 'Plantae'.
 */
async function fetchInaturalistGenusImages(
  genus: string,
  limit = 4,
  signal?: AbortSignal,
): Promise<GenusImage[]> {
  const g = (genus || '').trim();
  if (!g) return [];

  const speciesList = GENUS_FALLBACK_SPECIES[g.toLowerCase()];
  if (speciesList && speciesList.length > 0) {
    console.log(
      `[fetchGenusImages] iNaturalist per-species fallback for "${g}" — querying ${speciesList.length} species individually`,
    );
    // Query each species in parallel so the grid populates quickly.
    const settled = await Promise.all(
      speciesList
        .slice(0, limit)
        .map((sp) => fetchInaturalistSpeciesImage(sp, signal)),
    );
    const out: GenusImage[] = [];
    const seen = new Set<string>();
    for (const img of settled) {
      if (!img) continue;
      const key = binomialOf(img.scientific_name) || img.image_url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(img);
    }
    if (out.length > 0) return out.slice(0, limit);
    // If per-species lookups all failed, fall through to the genus query below.
  }

  // No curated list (or per-species all failed) → single bare-genus photo.
  const single = await fetchInaturalistGenusImage(g, signal);
  return single ? [single] : [];
}

// ---------------------------------------------------------------------------
// "Species in Focus" → DYNAMIC NEIGHBORING GENERA
// ---------------------------------------------------------------------------
//
// The Species-in-Focus grid shows the featured genus's ECOLOGICAL NEIGHBOURS —
// other orchid genera that share the SAME geographic region and habitat. This
// is derived 100% DYNAMICALLY for ANY featured genus (it updates automatically
// when the Genus of the Day rolls over) and is NEVER hardcoded per genus:
//
//   1. We pull the featured genus's occurrence cloud from the OC Atlas
//      (fetchGenusOccurrences) to learn WHERE it grows — its countries and a
//      latitude/longitude bounding box.
//   2. We pull a broad multi-genus occurrence cloud (fetchAtlasOccurrences) and
//      keep only the points that fall inside the featured genus's range. The
//      OTHER genera at those points are its co-occurring neighbours; we rank
//      them by how often they co-occur and take the top four.
//   3. For each neighbour we fetch ONE real, Plantae-only iNaturalist photo via
//      its most-recorded representative species.
//   4. We read each genus's pollinator guild from its iNaturalist taxon
//      description and synthesise a one-sentence ecological RELATIONSHIP that
//      compares the featured genus's pollination strategy with the neighbour's.

/** One neighbouring orchid genus that shares the featured genus's region. */
export interface NeighborGenus {
  /** Neighbour genus name shown as the card heading (e.g. "Gongora"). */
  genus: string;
  /** Shared geographic region / habitat shown beneath the genus name. */
  region: string;
  /** A well-documented species in this genus, used only to fetch one photo. */
  representativeSpecies: string;
  /** Resolved iNaturalist photo URL (filled in by fetchNeighborGenera). */
  image?: string;
  /**
   * One-sentence ecological relationship comparing this neighbour's pollination
   * strategy with the featured genus's, derived from iNaturalist descriptions.
   */
  relationship?: string;
}

/**
 * Optional curated SEED neighbours, used only as a last-resort fallback when
 * the live occurrence Atlas returns nothing for a genus (e.g. a cold backend).
 * The dynamic path below is always tried FIRST; these are never preferred over
 * real occurrence-derived neighbours and exist only so the section is never
 * empty. They carry no genus-specific ecology — just names + a representative
 * species for the photo lookup.
 */
export const NEIGHBOR_GENERA: Record<string, NeighborGenus[]> = {
  catasetum: [
    { genus: 'Gongora', region: 'Shared lowland forest range', representativeSpecies: 'Gongora quinquenervis' },
    { genus: 'Stanhopea', region: 'Shared lowland forest range', representativeSpecies: 'Stanhopea tigrina' },
    { genus: 'Epidendrum', region: 'Shared lowland forest range', representativeSpecies: 'Epidendrum nocturnum' },
    { genus: 'Sobralia', region: 'Shared lowland forest range', representativeSpecies: 'Sobralia macrantha' },
  ],
};

// --- Pollinator-guild extraction from iNaturalist taxon descriptions ----------

/**
 * Pollinator keyword groups scanned out of a free-text taxon description. The
 * FIRST group with a keyword hit wins, giving a short, human-readable guild
 * label. Order matters: more specific groups (fungus gnats, hummingbirds) come
 * before broader ones (flies, birds) so we report the most informative match.
 */
const POLLINATOR_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'fungus gnats', re: /\bfungus[-\s]?gnats?\b|\bmycetophilid/i },
  { label: 'euglossine (orchid) bees', re: /\beuglossin|orchid bees?\b/i },
  { label: 'carpenter bees', re: /\bcarpenter bees?\b|\bxylocopa\b/i },
  { label: 'bumblebees', re: /\bbumble ?bees?\b|\bbombus\b/i },
  { label: 'stingless bees', re: /\bstingless bees?\b|\bmelipon/i },
  { label: 'bees', re: /\bbees?\b|\bapoidea\b|\bhymenoptera\b/i },
  { label: 'hummingbirds', re: /\bhummingbirds?\b|\btrochilid/i },
  { label: 'moths', re: /\bmoths?\b|\bsphingid|\bhawk ?moth/i },
  { label: 'butterflies', re: /\bbutterfl/i },
  { label: 'wasps', re: /\bwasps?\b/i },
  { label: 'beetles', re: /\bbeetles?\b|\bcoleopter/i },
  { label: 'carrion & fruit flies', re: /\bcarrion\b|\bfruit ?flies?\b/i },
  { label: 'flies', re: /\bflies\b|\bfly\b|\bdipter/i },
  { label: 'birds', re: /\bbirds?\b/i },
];

/** Scan a free-text description for the first recognised pollinator guild. */
function extractPollinatorGuild(text: string): string | null {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  // Only trust the sentence(s) that actually mention pollination, so we don't
  // misread an incidental "bee" elsewhere in the article.
  const pollSentences = t
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /pollinat|pollen|pollinia/.test(s))
    .join(' ');
  const haystack = pollSentences || t;
  for (const { label, re } of POLLINATOR_PATTERNS) {
    if (re.test(haystack)) return label;
  }
  return null;
}

/** Simple per-session cache of resolved guilds, keyed by lower-case genus. */
const guildCache = new Map<string, string | null>();

/**
 * Fetch a genus's pollinator guild from its iNaturalist taxon description.
 *
 *   GET https://api.inaturalist.org/v1/taxa?q={genus}&rank=genus
 *
 * Reads the first Plantae result's `wikipedia_summary` and extracts the
 * pollinator guild via {@link extractPollinatorGuild}. Returns null when no
 * description is available or no guild keyword is found.
 */
export async function fetchInatPollinatorGuild(
  genus: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const g = (genus || '').trim();
  if (!g) return null;
  const key = g.toLowerCase();
  if (guildCache.has(key)) return guildCache.get(key)!;
  const url =
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(g)}&rank=genus`;
  try {
    const payload = await ocFetchFrom<{ results?: Record<string, unknown>[] }>(
      '',
      url,
      signal,
      8000,
    );
    const results = Array.isArray(payload?.results) ? payload!.results : [];
    let guild: string | null = null;
    for (const r of results) {
      const iconic =
        typeof r.iconic_taxon_name === 'string' ? r.iconic_taxon_name : '';
      if (iconic !== 'Plantae') continue;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name || !name.toLowerCase().startsWith(key)) continue;
      const summary =
        typeof r.wikipedia_summary === 'string' ? r.wikipedia_summary : '';
      guild = extractPollinatorGuild(summary);
      break;
    }
    guildCache.set(key, guild);
    return guild;
  } catch {
    guildCache.set(key, null);
    return null;
  }
}

/**
 * Synthesise a single-sentence ecological RELATIONSHIP comparing the featured
 * genus's pollination strategy with a neighbour's. Fully generic — works for
 * any pair of guilds (or when one/both are unknown).
 */
export function buildRelationshipSentence(
  focalGenus: string,
  focalGuild: string | null,
  neighborGenus: string,
  neighborGuild: string | null,
): string {
  if (focalGuild && neighborGuild) {
    if (focalGuild === neighborGuild) {
      return `Both ${focalGenus} and ${neighborGenus} are pollinated by ${focalGuild}, so they compete for the same couriers where their ranges overlap.`;
    }
    return `Where ${focalGenus} courts ${focalGuild}, ${neighborGenus} instead draws ${neighborGuild} — partitioning the pollinators they share in this habitat.`;
  }
  if (neighborGuild) {
    return `${neighborGenus} shares ${focalGenus}'s forests and leans on ${neighborGuild} to move its pollen.`;
  }
  if (focalGuild) {
    return `${neighborGenus} grows alongside ${focalGenus}, whose flowers rely on ${focalGuild} in this same habitat.`;
  }
  return `${neighborGenus} co-occurs with ${focalGenus} here, drawing on the same community of pollinators that links this orchid neighbourhood.`;
}

// --- Dynamic neighbour discovery from OC occurrence data ----------------------

/** Title-case a genus token (first letter upper, rest lower). */
function titleCaseGenus(name: string): string {
  const t = (name || '').trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Derive a short shared-region label from a list of country names. */
function regionLabel(countries: string[]): string {
  const top = countries.filter(Boolean).slice(0, 2);
  if (top.length === 0) return 'Shared geographic range';
  return `Co-occurs in ${top.join(' & ')}`;
}

/**
 * Discover up to four neighbouring genera that co-occur with the featured
 * genus, derived ENTIRELY from the live OC occurrence Atlas. Returns each
 * neighbour with a representative species (most-recorded co-occurring species),
 * a shared-region label, and the raw co-occurrence count. Resolves to [] when
 * the Atlas is unavailable so callers can fall back to the seed list.
 */
async function discoverNeighborGenera(
  genus: string,
  signal?: AbortSignal,
  limit = 4,
): Promise<NeighborGenus[]> {
  const focal = (genus || '').trim();
  if (!focal) return [];
  const focalLower = focal.toLowerCase();
  try {
    const { fetchGenusOccurrences, fetchAtlasOccurrences } = await import(
      '@/lib/ocBackend'
    );

    // 1. Where does the featured genus grow? Countries + lat/lng bounding box.
    const focalPts = await fetchGenusOccurrences(focal, 500, signal);
    if (signal?.aborted) return [];
    const focalCountries = new Set<string>();
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const p of focalPts) {
      if (p.country) focalCountries.add(p.country.toLowerCase());
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const haveBox = focalPts.length > 0 && minLat <= maxLat;
    // Pad the bounding box ~2° so neighbours just outside the sampled points
    // still count as sharing the range.
    const pad = 2;
    const inBox = (lat: number, lng: number) =>
      haveBox &&
      lat >= minLat - pad &&
      lat <= maxLat + pad &&
      lng >= minLng - pad &&
      lng <= maxLng + pad;

    // 2. Broad multi-genus occurrence cloud → keep only co-occurring points.
    const all = await fetchAtlasOccurrences(2000, signal);
    if (signal?.aborted) return [];

    interface Agg {
      count: number;
      countries: Map<string, number>;
      species: Map<string, number>;
    }
    const byGenus = new Map<string, Agg>();
    for (const p of all) {
      const gName = (p.species || '').trim().split(/\s+/)[0];
      if (!gName) continue;
      const gLower = gName.toLowerCase();
      if (gLower === focalLower) continue;
      const sameCountry =
        !!p.country && focalCountries.has(p.country.toLowerCase());
      const sameBox = inBox(p.lat, p.lng);
      // Require an actual range overlap. If we have no focal range info at all
      // we cannot judge co-occurrence, so skip (callers fall back to the seed).
      if (!focalCountries.size && !haveBox) continue;
      if (!sameCountry && !sameBox) continue;

      let agg = byGenus.get(gLower);
      if (!agg) {
        agg = { count: 0, countries: new Map(), species: new Map() };
        byGenus.set(gLower, agg);
      }
      agg.count += 1;
      if (p.country) {
        agg.countries.set(p.country, (agg.countries.get(p.country) ?? 0) + 1);
      }
      if (/\s/.test(p.species)) {
        agg.species.set(p.species, (agg.species.get(p.species) ?? 0) + 1);
      }
    }
    // 3. Rank co-occurring genera by overlap count; take the top `limit`.
    const ranked = [...byGenus.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, Math.max(1, limit));

    return ranked.map(([gLower, agg]) => {
      const display = titleCaseGenus(gLower);
      const topSpecies =
        [...agg.species.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
        display;
      const topCountries = [...agg.countries.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c);
      return {
        genus: display,
        region: regionLabel(topCountries),
        representativeSpecies: topSpecies,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Supabase photo cache  (public.genus_photo_cache)
// ---------------------------------------------------------------------------
//
// A SHARED, cross-device cache of the iNaturalist photos we resolve for a genus
// — both its neighbouring-genera cards AND extra species photos used by the
// rotating carousel. The first visitor to view a genus warms it for everyone:
// on every subsequent page load we read this table FIRST and only call
// iNaturalist when the cache is empty. Columns:
//   genus, species_name, image_url, attribution, license,
//   ecological_relationship, region, cached_date
//
// `kind` is encoded implicitly: rows with a non-null ecological_relationship are
// NEIGHBOUR cards; rows without are plain species photos for the carousel pool.

/** One cached photo row from public.genus_photo_cache. */
interface CachedPhotoRow {
  genus: string;
  species_name: string;
  image_url: string;
  attribution: string | null;
  license: string | null;
  ecological_relationship: string | null;
  region: string | null;
}

/** Read all cached photo rows for a genus; [] on miss/error. */
async function readGenusPhotoCache(genus: string): Promise<CachedPhotoRow[]> {
  const g = (genus || '').trim();
  if (!g) return [];
  try {
    const { data, error } = await supabase
      .from('genus_photo_cache')
      .select(
        'genus, species_name, image_url, attribution, license, ecological_relationship, region',
      )
      .ilike('genus', g);
    if (error || !Array.isArray(data)) return [];
    return data as CachedPhotoRow[];
  } catch {
    return [];
  }
}

/** Upsert resolved photos for a genus into the shared cache (fire-and-forget). */
function writeGenusPhotoCache(
  genus: string,
  rows: {
    species_name: string;
    image_url: string;
    attribution?: string;
    license?: string;
    ecological_relationship?: string;
    region?: string;
  }[],
): void {
  const g = (genus || '').trim();
  if (!g || rows.length === 0) return;
  const payload = rows
    .filter((r) => r.species_name && r.image_url)
    .map((r) => ({
      genus: g,
      species_name: r.species_name,
      image_url: r.image_url,
      attribution: r.attribution ?? null,
      license: r.license ?? null,
      ecological_relationship: r.ecological_relationship ?? null,
      region: r.region ?? null,
      cached_date: new Date().toISOString().slice(0, 10),
    }));
  if (payload.length === 0) return;
  try {
    void supabase
      .from('genus_photo_cache')
      .upsert(payload, { onConflict: 'genus,species_name', ignoreDuplicates: false })
      .then(() => {
        /* non-fatal */
      });
  } catch {
    /* storage unavailable — localStorage / in-memory paths still work */
  }
}

/**
 * Resolve the neighbouring genera for a featured genus and fully enrich each
 * card. Works for ANY genus and refreshes automatically with the Genus of the
 * Day. For each neighbour it:
 *   • fetches ONE real Plantae-only iNaturalist photo (via its representative
 *     species, falling back to a bare-genus photo), and
 *   • derives a one-sentence ecological RELATIONSHIP comparing the featured
 *     genus's pollinator guild with the neighbour's (both read live from
 *     iNaturalist taxon descriptions).
 *
 * CACHING: we ALWAYS check the shared Supabase `genus_photo_cache` table first.
 * If neighbour rows (rows carrying an ecological_relationship) already exist for
 * this genus, we return them INSTANTLY without touching iNaturalist. Only on a
 * cache miss do we discover + fetch live, then write the result back so every
 * subsequent visitor — on any device — loads instantly.
 *
 * Neighbour discovery is dynamic (OC occurrence Atlas); only if the Atlas
 * returns nothing do we fall back to the curated seed list so the section is
 * never empty. Resolves to [] when neither source yields neighbours.
 */
export async function fetchNeighborGenera(
  genus: string,
  signal?: AbortSignal,
  limit = 4,
): Promise<NeighborGenus[]> {
  const focal = (genus || '').trim();
  if (!focal) return [];

  // 0. Shared Supabase cache fast path — instant for any previously-viewed genus.
  try {
    const cachedRows = await readGenusPhotoCache(focal);
    if (signal?.aborted) return [];
    const neighbourRows = cachedRows.filter(
      (r) =>
        r.ecological_relationship &&
        typeof r.image_url === 'string' &&
        r.image_url.trim().length > 0,
    );
    if (neighbourRows.length > 0) {
      return neighbourRows.slice(0, limit).map((r) => ({
        genus: r.species_name,
        region: r.region || 'Shared geographic range',
        representativeSpecies: r.species_name,
        image: r.image_url.trim(),
        relationship: r.ecological_relationship || undefined,
      }));
    }
  } catch {
    /* cache miss / error — fall through to live discovery */
  }

  // 1. Dynamic discovery from the live occurrence Atlas (preferred).
  let list = await discoverNeighborGenera(focal, signal, limit);
  if (signal?.aborted) return [];

  // 2. Fall back to the curated seed only when discovery found nothing.
  if (list.length === 0) {
    list = NEIGHBOR_GENERA[focal.toLowerCase()] ?? [];
  }
  if (list.length === 0) return [];

  // Featured genus's own pollinator guild (looked up once, reused per card).
  const focalGuild = await fetchInatPollinatorGuild(focal, signal);
  if (signal?.aborted) return [];

  // 3. Enrich every neighbour in parallel: photo + pollinator guild → sentence.
  const resolved = await Promise.all(
    list.map(async (n) => {
      const [img, neighborGuild] = await Promise.all([
        fetchInaturalistSpeciesImage(n.representativeSpecies, signal).then(
          (hit) => hit ?? fetchInaturalistGenusImage(n.genus, signal),
        ),
        fetchInatPollinatorGuild(n.genus, signal),
      ]);
      return {
        ...n,
        image: img?.image_url,
        relationship: buildRelationshipSentence(
          focal,
          focalGuild,
          n.genus,
          neighborGuild,
        ),
        _attribution: img?.image_source,
        _license: img?.image_license,
      };
    }),
  );

  // 4. Persist successful photo fetches to the shared cache for everyone.
  if (!signal?.aborted) {
    writeGenusPhotoCache(
      focal,
      resolved
        .filter((n) => n.image)
        .map((n) => ({
          species_name: n.genus, // neighbour cards key on the GENUS name
          image_url: n.image as string,
          attribution: (n as { _attribution?: string })._attribution,
          license: (n as { _license?: string })._license,
          ecological_relationship: n.relationship,
          region: n.region,
        })),
    );
  }

  return resolved.map(({ _attribution, _license, ...n }) => n) as NeighborGenus[];
}

// ---------------------------------------------------------------------------
// Carousel rotation pool — extra species photos for the featured genus
// ---------------------------------------------------------------------------
//
// The Species-in-Focus carousel slowly rotates photos: every tick the hero is
// replaced by the top-left grid card, the grid shifts left, and a NEW photo is
// loaded into the freed right slot. That "next photo" comes from this pool of
// the featured genus's own species photos. We read the shared Supabase cache
// FIRST (instant), and only call the trusted OC library / iNaturalist on a miss,
// writing every successful result back so the pool loads instantly next time.

/** A lightweight rotation-pool photo card. */
export interface RotationPhoto {
  /** Scientific name (binomial where possible). */
  name: string;
  /** Genus token, for the card sub-line. */
  genus: string;
  /** Resolved photo URL. */
  image: string;
}

/**
 * Build the carousel rotation pool for a genus. Returns up to `limit` distinct
 * species photos, cache-first (Supabase `genus_photo_cache`), then live via
 * {@link fetchGenusImages}. Successful live fetches are written back to the
 * shared cache. Never repeats a species (deduped by binomial).
 */
export async function fetchGenusRotationPool(
  genus: string,
  signal?: AbortSignal,
  limit = 12,
): Promise<RotationPhoto[]> {
  const focal = (genus || '').trim();
  if (!focal) return [];
  const titleGenus = titleCaseGenus(focal);

  const seen = new Set<string>();
  const out: RotationPhoto[] = [];
  const push = (name: string, image: string) => {
    if (!name || !image) return;
    const key = binomialOf(name) || name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, genus: name.split(/\s+/)[0] || titleGenus, image });
  };

  // 1. Cache first — species rows (no ecological_relationship) for this genus.
  try {
    const cachedRows = await readGenusPhotoCache(focal);
    if (signal?.aborted) return out;
    for (const r of cachedRows) {
      if (r.ecological_relationship) continue; // skip neighbour rows
      push(r.species_name, r.image_url);
      if (out.length >= limit) return out;
    }
  } catch {
    /* fall through to live */
  }

  // 2. Live — trusted OC library, then iNaturalist fallback (handled inside).
  try {
    const images = await fetchGenusImages(focal, signal, Math.max(limit, 12));
    if (signal?.aborted) return out;
    const fresh: { species_name: string; image_url: string; attribution?: string; license?: string }[] = [];
    for (const img of images) {
      const before = out.length;
      push(img.scientific_name, img.image_url);
      if (out.length > before) {
        fresh.push({
          species_name: img.scientific_name,
          image_url: img.image_url,
          attribution: img.image_source,
          license: img.image_license,
        });
      }
      if (out.length >= limit) break;
    }
    if (fresh.length > 0 && !signal?.aborted) writeGenusPhotoCache(focal, fresh);
  } catch {
    /* keep whatever the cache yielded */
  }

  return out;
}





/**
 * Back-compat wrapper around {@link fetchGenusImagesWithSource} that returns
 * just the image list (dropping the source tag). Existing callers that don't
 * need the source health indicator keep working unchanged.
 *
 * When the Orchid Continuum backends return NOTHING, this falls back to a
 * single Plantae-only iNaturalist photo (see {@link fetchInaturalistGenusImage})
 * so the grid shows a real photo rather than the "Image pending" placeholder.
 */
export async function fetchGenusImages(
  genus: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<GenusImage[]> {
  const { images } = await fetchGenusImagesWithSource(genus, signal, limit);
  if (images.length > 0) return images;

  // OC backend / caches returned empty → try the iNaturalist fallback.
  const inat = await fetchInaturalistGenusImage(genus, signal);
  return inat ? [inat] : [];
}



/**
 * A single network attempt for {@link fetchGenusImages} (no retry/cache).
 *
 * Returns `{ images, networkError, answered }`:
 *   • images       — the parsed trusted images (empty on any miss).
 *   • networkError — TRUE only for a hard, unrecoverable transport failure
 *                    (status 0 "Load failed" — i.e. CORS rejection, DNS, or the
 *                    host being unreachable). It is FALSE for a cold-start
 *                    timeout (worth retrying) and for a caller abort. Callers
 *                    use this to stop retrying a doomed CORS request and fall
 *                    straight through to the iNaturalist fallback.
 */
async function fetchGenusImagesOnce(
  g: string,
  signal?: AbortSignal,
  limit = 20,
  timeoutMs = 40000,
): Promise<{ images: GenusImage[]; networkError: boolean; answered: boolean }> {
  const url = `${IMAGES_BACKEND_BASE_URL}/images/genus/${encodeURIComponent(g)}?limit=${limit}`;
  console.log(`[fetchGenusImages] ➜ requesting (timeout ${timeoutMs}ms):`, url);



  // Inline fetch with verbose logging (instead of the silent ocFetchFrom) so we
  // can see exactly what the images backend returns — status, body, or error.
  // We use our OWN abort controller for the timeout and track WHY an abort
  // happened so a cold-start timeout doesn't masquerade as a network failure.
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);

  let payload: unknown = null;
  try {
    const t0 = performance.now();
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    const ms = Math.round(performance.now() - t0);
    console.log(
      `[fetchGenusImages] ⇠ HTTP ${res.status} ${res.statusText} in ${ms}ms`,
      { url, ok: res.ok, type: res.type },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable body>');
      console.warn('[fetchGenusImages] non-OK response body:', text.slice(0, 500));
      return { images: [], networkError: false, answered: false };
    }
    payload = await res.json();
    console.log('[fetchGenusImages] parsed JSON payload:', payload);
  } catch (err) {
    if (signal?.aborted) {
      // Caller aborted (component unmount / new genus requested) — expected.
      console.log('[fetchGenusImages] request cancelled by caller for', url);
      return { images: [], networkError: false, answered: false };
    }
    if (timedOut) {
      // Our own cold-start timeout fired — the retry loop will try again.
      console.warn(
        `[fetchGenusImages] timed out after ${timeoutMs}ms (likely cold start) for`,
        url,
        '— will retry if attempts remain',
      );
      return { images: [], networkError: false, answered: false };
    }
    // Hard transport failure: CORS rejection, DNS failure, or the host being
    // unreachable (surfaces as a TypeError / status-0 "Load failed"). Retrying
    // cannot recover from this, so we report networkError:true and let the
    // caller fall through to the iNaturalist fallback. Logged as a WARNING (not
    // an error) because it is a fully-handled, expected condition.
    console.warn(
      '[fetchGenusImages] harvester unreachable (network/CORS) for',
      url,
      '— falling back to iNaturalist.',
      '\n  detail:',
      err instanceof Error ? err.message : String(err),
    );
    return { images: [], networkError: true, answered: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }


  if (!hasRecognizedArrayPayload(payload)) {
    console.warn('[fetchGenusImages] unrecognized payload shape — treating source as unavailable');
    return { images: [], networkError: false, answered: false };
  }

  const arr = extractArray(payload);
  console.log(`[fetchGenusImages] extracted ${arr.length} raw record(s) from payload`);

  // Group ALL candidate URLs per distinct scientific name so the UI can fall
  // back from a broken URL to the next one (rather than dropping straight to
  // the "Image pending" placeholder). The first URL seen for a name is treated
  // as the primary; any further URLs for that same name become fallbacks.
  const byName = new Map<string, GenusImage>();
  const order: string[] = [];
  for (const r of arr) {
    // Reconstruct the full binomial when the API returns separate genus +
    // species epithet fields (e.g. harvester2: { genus:'Cattleya', species:'labiata' })
    // rather than a pre-joined scientific_name. This is the common shape from
    // orchidcontinuumharvester2.onrender.com/images/genus/{genus}.
    const rawGenus = pick(r, ['genus']);
    const rawEpithet = pick(r, ['species']);
    const reconstructed =
      rawGenus && rawEpithet && !rawEpithet.includes(' ')
        ? `${rawGenus} ${rawEpithet}`
        : null;
    const name =
      reconstructed ??
      pick(r, [
        'scientific_name',
        'scientificName',
        'canonical_name',
        'name',
      ]);
    // Collect every URL-bearing field on the record, in preference order.
    const urls = [
      pick(r, ['image_url']),
      pick(r, ['imageUrl']),
      pick(r, ['url']),
      pick(r, ['photo_url']),
      pick(r, ['image']),
      pick(r, ['medium_url']),
      pick(r, ['original_url']),
    ].filter((u): u is string => Boolean(u));
    if (!name || urls.length === 0) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      // Append any new fallback URLs for a name we've already seen.
      for (const u of urls) {
        if (!existing.image_urls.includes(u)) existing.image_urls.push(u);
      }
      continue;
    }
    const deduped: string[] = [];
    for (const u of urls) if (!deduped.includes(u)) deduped.push(u);
    byName.set(key, {
      scientific_name: name,
      image_url: deduped[0],
      image_urls: deduped,
      image_source: pick(r, ['image_source', 'imageSource', 'source', 'credit']),
      image_license: pick(r, ['image_license', 'imageLicense', 'license', 'rights']),
    });
    order.push(key);
  }

  const out: GenusImage[] = [];
  for (const key of order) {
    const img = byName.get(key);
    if (img) out.push(img);
    if (out.length >= limit) break;
  }
  console.log(
    `[fetchGenusImages] ✓ returning ${out.length} usable image(s) for "${g}"`,
    out.slice(0, 3),
  );

  // Persist a non-empty result so subsequent same-day visits are instant and
  // don't re-hit the harvester. We deliberately skip caching empty results so a
  // transient cold-start miss never sticks for the rest of the day.
  if (out.length > 0) {
    writeGenusImagesCache(g, out);
  }

  return { images: out, networkError: false, answered: true };
}


/** Public binomial normaliser (lower-case genus + epithet) for image matching. */
export function binomialOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[×x]\s+/g, ' ')
    .replace(/\b(var|subsp|ssp|f|forma|cv)\.?\b.*/i, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/**
 * Build a binomial → GenusImage map from a fetched image list.
 *
 * When MULTIPLE records share the same binomial (the backend can return more
 * than one row per species), we MERGE all of their candidate URLs into a single
 * GenusImage so the per-plate <FallbackImage> has the maximum number of URLs to
 * try. This is what rescues species like Cattleya labiata / trianae / mossiae
 * whose first DB URL is broken: the merged list carries the remaining working
 * URLs, so FallbackImage skips the dead one and renders the next photo instead
 * of the "Image pending" placeholder.
 */
export function buildImageMap(images: GenusImage[]): Map<string, GenusImage> {
  const m = new Map<string, GenusImage>();
  for (const img of images) {
    const b = binomialOf(img.scientific_name);
    if (!b) continue;
    const candidates = img.image_urls?.length
      ? img.image_urls
      : img.image_url
        ? [img.image_url]
        : [];
    const existing = m.get(b);
    if (existing) {
      // Merge new candidate URLs (dedup) onto the already-recorded species.
      for (const u of candidates) {
        if (u && !existing.image_urls.includes(u)) existing.image_urls.push(u);
      }
      if (!existing.image_url && existing.image_urls.length) {
        existing.image_url = existing.image_urls[0];
      }
      continue;
    }
    const deduped: string[] = [];
    for (const u of candidates) if (u && !deduped.includes(u)) deduped.push(u);
    m.set(b, {
      scientific_name: img.scientific_name,
      image_url: deduped[0] ?? img.image_url,
      image_urls: deduped,
      image_source: img.image_source,
      image_license: img.image_license,
    });
  }
  return m;
}


/**
 * Validated orchid species name from the Orchid Continuum taxonomic backbone.
 *   GET /api/species/search?genus={genus}&limit={limit}
 * These names are the source of truth for what may appear in the UI.
 *
 * Returns FULL binomial names (e.g. "Cattleya labiata"), reconstructing the
 * binomial from genus + specific-epithet fields when the backend only supplies
 * an epithet. Results are ordered by "species richness" — records with the
 * highest occurrence / record counts first — so the 9 most-documented species
 * fill the 3x3 grid.
 */
export async function fetchValidatedSpecies(
  genus: string,
  signal?: AbortSignal,
  limit = 30,
): Promise<string[]> {
  const payload = await ocFetch<unknown>(
    `/api/species/search?genus=${encodeURIComponent(genus)}&limit=${limit}`,
    signal,
  );
  if (!payload) return [];

  const ranked: { name: string; rank: number }[] = [];
  const seen = new Set<string>();

  for (const r of extractArray(payload)) {
    const nested = (r.taxon as Record<string, unknown>) ?? {};

    // Try to find a complete scientific / canonical name first.
    let name =
      pick(r, ['canonical_name', 'scientific_name', 'scientificName', 'species_name']) ||
      pick(nested, ['canonical_name', 'scientific_name', 'name']) ||
      pick(r, ['species', 'name']) ||
      '';

    // Resolve the genus + epithet pieces so we can always build a binomial.
    const recGenus =
      pick(r, ['genus', 'genus_name']) ||
      pick(nested, ['genus', 'genus_name']) ||
      genus;
    const epithet = pick(r, [
      'specific_epithet',
      'specificEpithet',
      'epithet',
      'species_epithet',
    ]);

    // If the resolved name has no space (genus-only) but we have an epithet,
    // reconstruct the full binomial.
    if (name && !/\s/.test(name.trim()) && epithet) {
      name = `${name.trim()} ${epithet.trim()}`;
    } else if ((!name || !/\s/.test(name.trim())) && epithet) {
      name = `${recGenus} ${epithet.trim()}`;
    } else if (name && /\s/.test(name.trim())) {
      // already a binomial — keep it
    } else if (epithet) {
      name = `${recGenus} ${epithet.trim()}`;
    }

    name = (name || '').trim();
    // Discard genus-only names — we only want full binomials in the grid.
    if (!name || !/\s/.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // "Richness" proxy: prefer species with the most occurrence/record counts.
    const rankRaw =
      pick(r, [
        'occurrence_count',
        'occurrences',
        'record_count',
        'records',
        'count',
        'num_records',
        'observation_count',
      ]) || '0';
    const rank = Number(rankRaw) || 0;
    ranked.push({ name, rank });
  }

  // Most species-rich first; preserve original order when counts are equal.
  ranked.sort((a, b) => b.rank - a.rank);
  return ranked.map((r) => r.name);
}


// ---------------------------------------------------------------------------
// "Species in Focus" — NEW two-step backend flow
// ---------------------------------------------------------------------------
//
// The legacy /images/genus/{genus} endpoint NO LONGER EXISTS. The backend now
// serves species photos per FULL scientific name. The homepage "Species in
// Focus" grid is therefore built in two steps against the live OC backend
// (https://orchidcontinuum.onrender.com, see backendConfig.ts):
//
//   1. GET /api/search?q={genus}&limit={limit}
//        → a list of FULL scientific names (e.g. "Catasetum expansum").
//   2. For EACH name:
//        GET /api/species/{scientific_name}/images?limit=1
//        → one approved photo for that species.
//
// The two are stitched together into FeaturedSpecies cards. Any species whose
// image lookup fails simply renders the clean "Image pending" placeholder — we
// never fabricate an image.

/** One species image record shape returned by /api/species/{name}/images. */
function pickImageUrl(r: Record<string, unknown>): string | undefined {
  return pick(r, [
    'image_url',
    'imageUrl',
    'url',
    'photo_url',
    'photoUrl',
    'image',
    'medium_url',
    'thumbnail_url',
    'original_url',
  ]);
}

/**
 * Step 1: search the OC backbone for up to `limit` species names in a genus.
 *   GET /api/search?q={genus}&limit={limit}
 * Returns FULL binomial names, deduped, in the order the backend supplies them.
 */
export async function fetchSpeciesNames(
  query: string,
  signal?: AbortSignal,
  limit = 6,
): Promise<string[]> {
  const q = (query || '').trim();
  if (!q) return [];
  // IMPORTANT: this legacy search API lives on the legacy onrender host
  // (orchidcontinuum.onrender.com), NOT on the canonical BACKEND_BASE_URL
  // (api.orchidcontinuum.org), which does not serve this route.
  const payload = await ocFetchFrom<unknown>(
    LEGACY_ONRENDER_BASE_URL,
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    signal,
    12000,
  );
  if (!payload) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of extractArray(payload)) {
    const nested = (r.taxon as Record<string, unknown>) ?? {};
    let name =
      pick(r, ['scientific_name', 'scientificName', 'canonical_name', 'species_name']) ||
      pick(nested, ['scientific_name', 'canonical_name', 'name']) ||
      pick(r, ['species', 'name']) ||
      '';
    const recGenus =
      pick(r, ['genus', 'genus_name']) || pick(nested, ['genus', 'genus_name']);
    const epithet = pick(r, [
      'specific_epithet',
      'specificEpithet',
      'epithet',
      'species_epithet',
    ]);
    // Reconstruct a binomial when only a genus + epithet are supplied.
    if (name && !/\s/.test(name.trim()) && epithet) {
      name = `${name.trim()} ${epithet.trim()}`;
    } else if ((!name || !/\s/.test(name.trim())) && epithet && recGenus) {
      name = `${recGenus} ${epithet.trim()}`;
    }
    name = (name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fetch ONE approved photo for a full scientific name.
 *
 * The legacy per-species endpoint /images/species/{name} DOES NOT EXIST and
 * returns 404 on the images backend. The ONLY confirmed-working image endpoint
 * is the genus library:
 *
 *   GET {IMAGES_BACKEND_BASE_URL}/images/genus/{genus}?limit=6
 *
 * So we derive the genus from the requested scientific name (its first token —
 * i.e. the genus of the day currently being displayed) and call that endpoint
 * instead. We then return the image whose record best matches the requested
 * scientific name, falling back to the first image the genus returns. Resolves
 * to undefined when the endpoint yields nothing.
 */
export async function fetchSpeciesImage(
  scientificName: string,
  signal?: AbortSignal,
  limit = 6,
): Promise<string | undefined> {
  const name = (scientificName || '').trim();
  if (!name) return undefined;

  // PRIMARY: per-species image endpoint on the legacy onrender host.
  //   GET orchidcontinuum.onrender.com/api/species/{name}/images
  // Shape: { status, data: { species, count, images: [{ image_url, source_name }] } }
  const speciesPayload = await ocFetchFrom<unknown>(
    LEGACY_ONRENDER_BASE_URL,
    `/api/species/${encodeURIComponent(name)}/images`,
    signal,
    10000,
  );
  if (speciesPayload) {
    const records = extractArray(speciesPayload);
    for (const r of records) {
      const url = pickImageUrl(r);
      if (url) return url;
    }
  }

  // FALLBACK: genus image library on the harvester backend.
  //   GET orchidcontinuumharvester2.onrender.com/images/genus/{genus}?limit=6
  const genus = name.split(/\s+/)[0];
  if (!genus) return undefined;
  const genusPayload = await ocFetchFrom<unknown>(
    IMAGES_BACKEND_BASE_URL,
    `/images/genus/${encodeURIComponent(genus)}?limit=6`,
    signal,
    12000,
  );
  if (!genusPayload) return undefined;
  const records = extractArray(genusPayload);
  const wanted = name.toLowerCase();
  // Prefer the record whose name matches the requested species…
  for (const r of records) {
    const rawGenus = pick(r, ['genus']);
    const rawEpithet = pick(r, ['species']);
    const recName = rawGenus && rawEpithet && !rawEpithet.includes(' ')
      ? `${rawGenus} ${rawEpithet}`.toLowerCase()
      : (pick(r, ['scientific_name', 'scientificName', 'canonical_name', 'name']) || '').toLowerCase();
    if (recName && recName === wanted) {
      const url = pickImageUrl(r);
      if (url) return url;
    }
  }
  // …otherwise first usable image from the genus.
  for (const r of records) {
    const url = pickImageUrl(r);
    if (url) return url;
  }
  return undefined;
}


/**
 * Build the homepage "Species in Focus" cards using the NEW two-step backend
 * flow described above:
 *   1. /api/search?q={genus}&limit={limit}            → species names
 *   2. /api/species/{name}/images?limit=1 (per name)  → one image per species
 *
 * Image lookups run in parallel. A species whose image lookup fails still
 * appears (its card shows the "Image pending" placeholder). Resolves to [] only
 * when the search step itself returns no species.
 */
export async function fetchSpeciesInFocus(
  genus: string,
  signal?: AbortSignal,
  limit = 6,
): Promise<FeaturedSpecies[]> {
  const g = (genus || '').trim();
  if (!g) return [];

  // Step 1 — species names.
  const names = await fetchSpeciesNames(g, signal, limit);
  if (signal?.aborted || names.length === 0) return [];

  // Step 2 — one image per species, in parallel.
  // Pass the FULL binomial to fetchSpeciesImage so it can match the correct
  // species record; passing only the genus token caused every card to get the
  // same first-genus-image rather than the per-species photo.
  const images = await Promise.all(
    names.map((name) => fetchSpeciesImage(name, signal, 6)),
  );
  if (signal?.aborted) return [];

  return names.map((name, i) => ({
    name,
    genus: name.split(/\s+/)[0] || titleCaseGenus(g),
    family: 'Orchidaceae',
    image: images[i],
  }));
}



/**
 * Ecology data for a single species, confirmed against the Orchid Continuum
 * backend. `confirmed` is true only when the backend returns a matching
 * orchid record — otherwise no ecological fields are populated and callers
 * must NOT invent values.
 */
export interface SpeciesEcology {
  confirmed: boolean;
  habitat?: string;
  region?: string;
}

/**
 * Look up a species in the Orchid Continuum backend and return only the
 * ecological fields the backend actually provides. If the backend returns no
 * match (or errors), resolves to { confirmed: false } so the caller shows
 * just species name, origin, and photographer — never fabricated ecology.
 */
export async function fetchSpeciesEcology(
  species: string,
  signal?: AbortSignal,
): Promise<SpeciesEcology> {
  try {
    const { searchSpecies, fetchSpeciesById } = await import('@/lib/ocBackend');
    const matches = await searchSpecies(species, 5, signal);
    const match = matches.find((m) => {
      const fam = (m.family ?? '').toLowerCase();
      const name = (m.canonical_name || m.scientific_name || '').toLowerCase();
      return fam.includes('orchidaceae') && name.includes(species.toLowerCase().split(' ')[0]);
    }) ?? matches.find((m) => (m.family ?? '').toLowerCase().includes('orchidaceae'));
    if (!match) return { confirmed: false };
    const dossier = await fetchSpeciesById(match.taxonomy_id, signal);
    return {
      confirmed: true,
      habitat: dossier?.habitat || undefined,
      region: dossier?.region || undefined,
    };
  } catch {
    return { confirmed: false };
  }
}

/**
 * Normalise a scientific name to its lower-case binomial (genus + epithet),
 * stripping authorities, hybrid markers, and infraspecific ranks.
 */
function toBinomial(name: string): string {
  return name
    .toLowerCase()
    .replace(/[×x]\s+/g, ' ')
    .replace(/\b(var|subsp|ssp|f|forma|cv)\.?\b.*/i, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/**
 * True if `photoSpecies` matches a name in the validated OC species set.
 * Comparison is done at the binomial level so authorities and rank suffixes
 * never cause false negatives. Returns true if the binomial appears in the
 * set, or if the photo carries only a genus-level name that the set covers.
 */
export function isValidatedName(
  photoSpecies: string,
  validatedBinomials: Set<string>,
): boolean {
  if (validatedBinomials.size === 0) return true; // nothing to validate against
  const b = toBinomial(photoSpecies);
  if (validatedBinomials.has(b)) return true;
  // Genus-only photo label: accept if any validated name shares the genus.
  const genus = b.split(' ')[0];
  if (b === genus) {
    for (const v of validatedBinomials) {
      if (v.split(' ')[0] === genus) return true;
    }
  }
  return false;
}

/** Build a Set of validated binomials for fast lookup. */
export function buildValidatedSet(names: string[]): Set<string> {
  return new Set(names.map(toBinomial).filter(Boolean));
}

/** Map an iNaturalist conservation status to a colour + short code. */
export function conservationBadge(status?: string): { code: string; color: string; bg: string } {
  const s = (status ?? '').toLowerCase();
  if (/critically|^cr\b|cr$/.test(s)) return { code: 'CR', color: '#fff', bg: '#b91c1c' };
  if (/endangered|^en\b|en$/.test(s)) return { code: 'EN', color: '#fff', bg: '#dc2626' };
  if (/vulnerable|^vu\b|vu$/.test(s)) return { code: 'VU', color: '#1a1a1a', bg: '#f59e0b' };
  if (/near.?threatened|^nt\b|nt$/.test(s)) return { code: 'NT', color: '#1a1a1a', bg: '#fde047' };
  if (/least.?concern|^lc\b|lc$/.test(s)) return { code: 'LC', color: '#fff', bg: '#16a34a' };
  if (/data.?deficient|^dd\b|dd$/.test(s)) return { code: 'DD', color: '#fff', bg: '#6b7280' };
  return { code: 'NE', color: '#fff', bg: '#52525b' };
}

const COUNTRY_FLAGS: Record<string, string> = {
  ecuador: '🇪🇨', colombia: '🇨🇴', peru: '🇵🇪', brazil: '🇧🇷', brasil: '🇧🇷',
  venezuela: '🇻🇪', bolivia: '🇧🇴', mexico: '🇲🇽', 'costa rica': '🇨🇷',
  panama: '🇵🇦', guatemala: '🇬🇹', 'united states': '🇺🇸', usa: '🇺🇸',
  australia: '🇦🇺', indonesia: '🇮🇩', philippines: '🇵🇭', thailand: '🇹🇭',
  vietnam: '🇻🇳', india: '🇮🇳', china: '🇨🇳', 'papua new guinea': '🇵🇬',
  madagascar: '🇲🇬', 'south africa': '🇿🇦', malaysia: '🇲🇾', japan: '🇯🇵',
  nepal: '🇳🇵', 'sri lanka': '🇱🇰', taiwan: '🇹🇼', cuba: '🇨🇺',
};

/** Best-effort country name + flag emoji from a free-text place string. */
export function placeToFlag(place?: string): { flag: string; country: string } {
  if (!place) return { flag: '🌍', country: '' };
  const lower = place.toLowerCase();
  for (const [name, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (lower.includes(name)) {
      return { flag, country: name.replace(/\b\w/g, (c) => c.toUpperCase()) };
    }
  }
  // Fall back to the last comma-separated token as a region label.
  const parts = place.split(',').map((p) => p.trim()).filter(Boolean);
  return { flag: '🌍', country: parts[parts.length - 1] ?? place };
}
