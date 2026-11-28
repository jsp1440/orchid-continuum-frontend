/**
 * Orchid Continuum — database access layer.
 * ----------------------------------------------------------------
 *
 * Single point of contact between the homepage UI (Living Gallery,
 * Atlas globe, species cards) AND the live Atlas workspace.
 *
 * BACKED BY TWO TABLES (database project):
 *
 *  1. species
 *     Curated, steward-reviewed orchid records. Used for the gallery,
 *     species cards, and as the canonical taxonomy + image library.
 *
 *  2. atlas_occurrences
 *     Real biodiversity occurrence records ingested from GBIF (and in
 *     the future iNaturalist + herbaria) via the `ingest-gbif-occurrences`
 *     edge function. Used to populate the homepage globe and the Atlas
 *     page with thousands of real georeferenced points.
 *
 *     The browser NEVER reads this table (or `species.occurrences`)
 *     directly any more: the Calyx backend reads it server-side and serves
 *     only generalised grid-cell centres with no locality text
 *     (`/atlas/public/occurrences`, `/atlas/public/curated-occurrences`).
 *     Precise coordinates never reach a public visitor's browser.
 *
 * Each atlas_occurrence row carries a `species_id` foreign key when the
 * GBIF binomial matches a row in `species`. Unlinked rows still render
 * on the globe and open a card that pulls habitat/conservation from any
 * curated row sharing the same genus.
 *
 * STRICT RULES:
 *   - We NEVER return AI-generated orchid imagery.
 *   - Images come ONLY from `species.image_url` or `atlas_occurrences.media_url`
 *     (which is a GBIF-provided photographer credit URL).
 *   - If a field is missing, we return `undefined` and the UI shows
 *     an explicit "Awaiting Orchid Continuum Record" placeholder.
 *   - Mycorrhizal data lives in `species_mycorrhizal`. When a row matches
 *     an atlas occurrence (by species_id or by canonical binomial), the
 *     fungal partner is attached to the point so the UI can surface it.
 */


import { supabase } from './supabase';
import { hasThreatAssessment } from './atlasLocalitySafety';
import { ATLAS_PUBLIC_CELLS_URL, ATLAS_PUBLIC_CURATED_URL, ATLAS_PUBLIC_OCCURRENCES_URL } from './backendConfig';

// ---------------------------------------------------------------------------
// Public record shapes
// ---------------------------------------------------------------------------

export interface LivingGalleryRecord {
  id: string;
  scientificName: string;
  cultivar?: string;
  isHybrid?: boolean;
  nativeRegion?: string;
  habitatDescription?: string;
  sourceCredit?: string;
  imageUrl?: string;
  isPlaceholder: boolean;
  taxonomyId?: string;
  atlasOccurrenceId?: string;
}

export interface PollinatorRecord {
  name?: string;
  taxon?: string;
  mechanism?: string;
}

export interface SpeciesTraits {
  phenology?: string;
  elevation_m?: [number, number];
  flower_size_cm?: number;
  spur_length_cm?: number;
  substrate?: string;
  economic?: boolean;
  vine_length_m?: number;
}

export interface AtlasOccurrencePoint {
  /** atlas_occurrences.id (uuid) OR `${speciesId}:${idx}` for curated points. */
  id: string;
  speciesId?: string;
  lat: number;
  lng: number;
  genus: string;
  species: string;
  canonicalName: string;
  country: string;
  countries: string[];
  region?: string;
  elevation_m?: number;
  habitat?: string;
  growthForm?: string;
  family?: string;
  subfamily?: string;
  tribe?: string;
  conservationStatus?: string;
  iucnCode?: string;
  imageUrl?: string;
  taxonomyId?: string;
  locality?: string;
  year?: number;
  pollinators: PollinatorRecord[];
  pollinatorTaxon?: string;
  /**
   * Fungal partner pulled from `species_mycorrhizal` when a row links to
   * this point's species (by species_id, or as a fallback by canonical
   * "Genus epithet" name). Undefined when no literature-backed
   * association is yet linked for the species — UIs MUST surface
   * "Relationship data not yet linked." in that case rather than invent.
   */
  mycorrhizal?: MycorrhizalRecord;
  dataset: string;
  verified: boolean;
  /**
   * `atlas_occurrences.source_record_id` — the identifier this record carries
   * in its originating dataset, so a point can always be traced back.
   */
  sourceRecordId?: string;
  /** `atlas_occurrences.accepted_name` when the source supplies one. */
  acceptedName?: string;
  /** `atlas_occurrences.biome` — undefined when the source did not record it. */
  biome?: string;
  /**
   * `atlas_occurrences.coordinate_uncertainty_m`. Carried through so that no
   * surface can draw a coordinate more precisely than its source claims, and
   * so locality protection has the figure it needs. Undefined means the source
   * stated no uncertainty — which is NOT the same as stating zero.
   */
  coordinateUncertaintyM?: number;
  /**
   * Cell size (degrees) the server already generalised this point to. The
   * point's lat/lng are that cell's centre, never the recorded site.
   */
  publicCellDeg?: number;
  /** Server-side generalisation notice ("Location generalised to about 11 km …"). */
  locationNotice?: string;
  /** Server-side generalisation reason (threat tier, uncertainty, unresolved, public floor). */
  locationReason?: string;
  /**
   * Whether a conservation assessment could actually be REACHED for this
   * record — by species_id, or by exact canonical binomial.
   *
   * False does not mean "not threatened". It means nobody has told the
   * Continuum either way, and surfaces must fail closed on it rather than
   * publishing a precise site by default. The live store makes this the normal
   * case: the conservation reference table holds nine species against 2,611
   * distinct names among the occurrences.
   */
  assessmentResolved?: boolean;
}


export interface MycorrhizalRecord {
  taxon?: string;
  family?: string;
  type?: string;
  note?: string;
  source?: string;
}

export interface AtlasSpeciesRecord {
  id: string;
  scientificName: string;
  genus: string;
  speciesEpithet?: string;
  family?: string;
  subfamily?: string;
  tribe?: string;
  authority?: string;
  commonName?: string;
  growthForm?: string;
  nativeRange?: string;
  country?: string;
  countries: string[];
  region?: string;
  habitatType?: string;
  habitatDescription?: string;
  elevation_m?: number;
  elevationRange?: [number, number];
  conservationStatus?: string;
  iucnCode?: string;
  climateZone?: string;
  climateNote?: string;
  imageUrl?: string;
  sourceCredit?: string;
  locality?: string;
  year?: number;
  lat?: number;
  lng?: number;
  pollinators: PollinatorRecord[];
  mycorrhizal?: MycorrhizalRecord;
  traits?: SpeciesTraits;
  dataset: string;
  sourceRecordId?: string;
  verified: boolean;
  isPlaceholder: boolean;
  taxonomyId?: string;
}

// ---------------------------------------------------------------------------
// Database row shapes
// ---------------------------------------------------------------------------

interface SpeciesOccurrence {
  /** Generalisation metadata from the server (curated points are generalised too). */
  public_location?: PublicLocationMeta;
  lat: number;
  lng: number;
  year?: number;
  locality?: string;
  elevation_m?: number;
  dataset?: string;
  verified?: boolean;
  source_id?: string;
}

interface SpeciesRow {
  id: string;
  slug: string | null;
  genus: string | null;
  epithet: string | null;
  common_name: string | null;
  authority: string | null;
  family: string | null;
  subfamily: string | null;
  tribe: string | null;
  region: string | null;
  countries: string[] | null;
  habitat: string | null;
  growth_form: string | null;
  ecology: string | null;
  description: string | null;
  conservation_status: string | null;
  iucn_code: string | null;
  image_url: string | null;
  occurrences: SpeciesOccurrence[] | null;
  pollinators: PollinatorRecord[] | null;
  traits: SpeciesTraits | null;
}

/** Generalisation metadata the server attaches to every public point. */
interface PublicLocationMeta {
  cell_deg: number;
  reason: string;
  notice: string;
}

interface AtlasOccurrenceRow {
  /** Present on every row served by the backend's public route. */
  public_location?: PublicLocationMeta;
  conservation_status?: string | null;
  iucn_code?: string | null;
  assessment_resolved?: boolean;
  id: string;
  scientific_name: string;
  accepted_name: string | null;
  genus: string | null;
  species: string | null;
  lat: number;
  lng: number;
  elevation_m: number | null;
  country: string | null;
  region: string | null;
  locality: string | null;
  habitat: string | null;
  biome: string | null;
  year: number | null;
  source_dataset: string;
  source_record_id: string | null;
  media_url: string | null;
  verified: boolean | null;
  coordinate_uncertainty_m: number | null;
  pollinator_data: PollinatorRecord[] | null;
  mycorrhizal_data: MycorrhizalRecord | null;
  species_id: string | null;
}

interface MycorrhizalRow {
  id: string;
  species_id: string | null;
  scientific_name: string;
  fungal_taxon: string | null;
  fungal_family: string | null;
  association_type: string | null;
  note: string | null;
  source: string | null;
}

interface FrontendOrchidImageRow {
  image_id: number;
  scientific_name: string | null;
  genus: string | null;
  species: string | null;
  image_url: string | null;
  image_source: string | null;
  license: string | null;
  country: string | null;
  photographer: string | null;
  created_at?: string | null;
}

// `occurrences` (curated points with raw coordinates and locality text) is NOT
// selected: curated points come generalised from the backend instead.
const SPECIES_COLUMNS =
  'id, slug, genus, epithet, common_name, authority, family, subfamily, tribe, region, countries, habitat, growth_form, ecology, description, conservation_status, iucn_code, image_url, pollinators, traits';

// ---------------------------------------------------------------------------
// Module-level cache (single fetch, many consumers)
// ---------------------------------------------------------------------------

let speciesCachePromise: Promise<SpeciesRow[]> | null = null;
let atlasCachePromise: Promise<AtlasOccurrenceRow[]> | null = null;
let mycorrhizalCachePromise: Promise<MycorrhizalRow[]> | null = null;
let liveStatus: 'unknown' | 'live' | 'offline' = 'unknown';

// ---------------------------------------------------------------------------
// Relationship read health
// ---------------------------------------------------------------------------
//
// The pollinator and mycorrhizal aggregates are built from the `species` and
// `species_mycorrhizal` reads. Both loaders resolve to rows even when the read
// failed, so an empty aggregate alone cannot tell "no relationship is recorded"
// from "the records could not be read". These flags keep the two apart; the
// profile pages read `didRelationshipReadFail()` before saying a relationship
// is not yet linked.
let speciesReadFailed = false;
let mycorrhizalReadFailed = false;
/** Bumped by resetOrchidContinuumCaches() so a superseded read cannot set a flag. */
let relationshipReadEpoch = 0;

/**
 * True when the most recent read behind a relationship aggregate failed, so an
 * empty (or short) result is NOT evidence that no relationship is recorded.
 * Pollinators come from the species read; mycorrhizal associations are
 * `species_mycorrhizal` rows joined to species, so either read failing counts.
 */
export function didRelationshipReadFail(kind: 'pollinators' | 'mycorrhiza'): boolean {
  return kind === 'pollinators' ? speciesReadFailed : speciesReadFailed || mycorrhizalReadFailed;
}

// ---------------------------------------------------------------------------
// Atlas occurrence load health
// ---------------------------------------------------------------------------
//
// The `atlas_occurrences` query intermittently 502s. `loadAtlasRows` wraps each
// page request in a retry-with-backoff (up to 2 retries). If a page ultimately
// fails after all retries AND we have not yet accumulated any rows, the atlas
// load is considered failed — the map UI reads `didAtlasLoadFail()` and shows a
// clear inline "Map data temporarily unavailable — retrying" message instead of
// a blank map.
let atlasLoadFailed = false;
/** True when some atlas pages loaded but a later page exhausted its retries. */
let atlasLoadIncomplete = false;
/** True when the load stopped at ATLAS_MAX_PAGES while the source still held more records. */
let atlasLoadCapped = false;

/** True when the atlas occurrence load exhausted its retries with no data. */
export function didAtlasLoadFail(): boolean {
  return atlasLoadFailed;
}

/**
 * True when the atlas occurrence load returned SOME rows but stopped early
 * because a later page exhausted its retries: the map is incomplete, which
 * must not be presented as a complete record set.
 */
export function didAtlasLoadIncomplete(): boolean {
  return atlasLoadIncomplete;
}

/**
 * True when the occurrence load stopped at the page cap (ATLAS_MAX_PAGES) while
 * the source held more records: the map shows only the first records, which
 * must be said rather than presented as the whole Atlas.
 */
export function didAtlasLoadCapped(): boolean {
  return atlasLoadCapped;
}

const ATLAS_PAGE_RETRIES = 2; // up to 2 retries (3 attempts) per page
const ATLAS_RETRY_BASE_MS = 600; // backoff: 600ms, then 1200ms
/** Records per request to the public occurrence route. */
export const ATLAS_PAGE_SIZE = 1000;
/** Pages fetched at once after the first one (small, to stay polite to the backend). */
export const ATLAS_PAGE_CONCURRENCY = 4;
/** Safety cap on pages per load (100k occurrences); hitting it sets didAtlasLoadCapped(). */
export const ATLAS_MAX_PAGES = 100;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PublicOccurrenceItem {
  id: string;
  scientific_name: string | null;
  accepted_name: string | null;
  genus: string | null;
  species: string | null;
  species_id: string | null;
  country: string | null;
  region: string | null;
  biome: string | null;
  year: number | null;
  elevation_band_m: number | null;
  source_dataset: string | null;
  source_record_id: string | null;
  media_url: string | null;
  verified: boolean | null;
  conservation_status: string | null;
  iucn_code: string | null;
  assessment_resolved: boolean;
  pollinator_data: PollinatorRecord[] | null;
  mycorrhizal_data: MycorrhizalRecord | null;
  location: { cell_lat: number; cell_lng: number; cell_deg: number; reason: string; notice: string };
}

interface PublicOccurrencePage {
  total: number | null;
  offset: number;
  scanned: number;
  next_offset: number | null;
  items: PublicOccurrenceItem[];
}

/**
 * Map one public item to the internal row shape. lat/lng are the CELL CENTRE
 * the server computed; locality, habitat text and coordinate uncertainty are
 * never present because the server never sends them.
 */
function publicItemToRow(item: PublicOccurrenceItem): AtlasOccurrenceRow | null {
  const loc = item.location;
  if (!loc || typeof loc.cell_lat !== 'number' || typeof loc.cell_lng !== 'number') return null;
  return {
    id: String(item.id),
    scientific_name: item.scientific_name ?? [item.genus, item.species].filter(Boolean).join(' '),
    accepted_name: item.accepted_name ?? null,
    genus: item.genus ?? null,
    species: item.species ?? null,
    lat: loc.cell_lat,
    lng: loc.cell_lng,
    elevation_m: item.elevation_band_m ?? null,
    country: item.country ?? null,
    region: item.region ?? null,
    locality: null,
    habitat: null,
    biome: item.biome ?? null,
    year: item.year ?? null,
    source_dataset: item.source_dataset ?? 'Orchid Continuum',
    source_record_id: item.source_record_id ?? null,
    media_url: item.media_url ?? null,
    verified: item.verified ?? null,
    coordinate_uncertainty_m: null,
    pollinator_data: Array.isArray(item.pollinator_data) ? item.pollinator_data : null,
    mycorrhizal_data: item.mycorrhizal_data ?? null,
    species_id: item.species_id ?? null,
    conservation_status: item.conservation_status ?? null,
    iucn_code: item.iucn_code ?? null,
    assessment_resolved: item.assessment_resolved,
    public_location: { cell_deg: loc.cell_deg, reason: loc.reason, notice: loc.notice },
  };
}

/**
 * Fetch one page of the public occurrence route with retry-with-backoff.
 * Returns `null` once all attempts are exhausted.
 */
async function fetchAtlasPageWithRetry(
  offset: number,
  pageSize: number,
  genus?: string,
): Promise<PublicOccurrencePage | null> {
  const genusParam = genus ? `&genus=${encodeURIComponent(genus)}` : '';
  for (let attempt = 0; attempt <= ATLAS_PAGE_RETRIES; attempt++) {
    try {
      const res = await fetch(`${ATLAS_PUBLIC_OCCURRENCES_URL}?offset=${offset}&limit=${pageSize}${genusParam}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const body = (await res.json()) as Partial<PublicOccurrencePage>;
        if (body && Array.isArray(body.items)) {
          return {
            total: typeof body.total === 'number' ? body.total : null,
            offset: typeof body.offset === 'number' ? body.offset : offset,
            scanned: typeof body.scanned === 'number' ? body.scanned : body.items.length,
            next_offset: typeof body.next_offset === 'number' ? body.next_offset : null,
            items: body.items,
          };
        }
      }
      console.warn(`[orchidContinuum] atlas page @${offset} failed (attempt ${attempt + 1}/${ATLAS_PAGE_RETRIES + 1}): HTTP ${res.status}`);
    } catch (err) {
      console.warn(`[orchidContinuum] atlas page @${offset} threw (attempt ${attempt + 1}/${ATLAS_PAGE_RETRIES + 1}):`, err);
    }
    if (attempt < ATLAS_PAGE_RETRIES) {
      await sleep(ATLAS_RETRY_BASE_MS * (attempt + 1));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Progressive load state (first page paints immediately)
// ---------------------------------------------------------------------------

export interface AtlasLoadProgress {
  /** Records received so far. */
  loaded: number;
  /** Records the source holds (from the first page), or null when unknown. */
  total: number | null;
  /** True once every page has arrived or failed. */
  done: boolean;
}

let atlasRowsSoFar: AtlasOccurrenceRow[] = [];
let atlasProgress: AtlasLoadProgress = { loaded: 0, total: null, done: false };
const atlasProgressListeners = new Set<() => void>();

function publishAtlasProgress(next: Partial<AtlasLoadProgress>): void {
  atlasProgress = { ...atlasProgress, ...next, loaded: atlasRowsSoFar.length };
  for (const listener of [...atlasProgressListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('[orchidContinuum] atlas progress listener threw:', err);
    }
  }
}

/** Current progress of the occurrence load. */
export function getAtlasLoadProgress(): AtlasLoadProgress {
  return atlasProgress;
}

/** Called after every page arrives (and once when the load finishes). Returns an unsubscribe. */
export function subscribeAtlasLoadProgress(listener: () => void): () => void {
  atlasProgressListeners.add(listener);
  return () => {
    atlasProgressListeners.delete(listener);
  };
}

/** Run `tasks` with at most `limit` in flight. */
async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
}

/**
 * Curated species points, generalised by the server, keyed by species id and
 * in their original order (ids `${speciesId}:${index}` stay stable).
 */
async function loadCuratedPublicOccurrences(): Promise<Map<string, SpeciesOccurrence[]>> {
  const out = new Map<string, SpeciesOccurrence[]>();
  try {
    const res = await fetch(ATLAS_PUBLIC_CURATED_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return out;
    const body = (await res.json()) as {
      items?: {
        species_id: string;
        index: number;
        year?: number | null;
        dataset?: string | null;
        verified?: boolean | null;
        elevation_band_m?: number | null;
        location?: { cell_lat: number; cell_lng: number; cell_deg: number; reason: string; notice: string };
      }[];
    };
    for (const item of body.items ?? []) {
      const loc = item.location;
      if (!loc || typeof loc.cell_lat !== 'number' || typeof loc.cell_lng !== 'number') continue;
      const list = out.get(item.species_id) ?? [];
      list[item.index] = {
        lat: loc.cell_lat,
        lng: loc.cell_lng,
        year: item.year ?? undefined,
        elevation_m: item.elevation_band_m ?? undefined,
        dataset: item.dataset ?? undefined,
        verified: item.verified ?? undefined,
        public_location: { cell_deg: loc.cell_deg, reason: loc.reason, notice: loc.notice },
      };
      out.set(item.species_id, list);
    }
  } catch (err) {
    console.warn('[orchidContinuum] curated occurrence fetch threw:', err);
  }
  return out;
}

async function loadSpeciesRows(): Promise<SpeciesRow[]> {
  if (speciesCachePromise) return speciesCachePromise;
  const epoch = relationshipReadEpoch;
  const markSpeciesRead = (failed: boolean) => {
    if (epoch === relationshipReadEpoch) speciesReadFailed = failed;
  };
  speciesCachePromise = (async () => {
    const PAGE = 1000;
    const all: SpeciesRow[] = [];
    let from = 0;
    const curatedPromise = loadCuratedPublicOccurrences();
    try {
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase
          .from('species')
          .select(SPECIES_COLUMNS)
          .order('genus', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          console.warn('[orchidContinuum] species fetch failed:', error.message);
          liveStatus = 'offline';
          markSpeciesRead(true);
          return all;
        }
        const batch = (data ?? []) as SpeciesRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      if (all.length > 0) liveStatus = 'live';
      markSpeciesRead(false);
      const curated = await curatedPromise;
      for (const row of all) {
        const occ = curated.get(row.id);
        row.occurrences = occ ? occ.filter(Boolean) : null;
      }
      return all;
    } catch (err) {
      console.warn('[orchidContinuum] species fetch threw:', err);
      liveStatus = 'offline';
      markSpeciesRead(true);
      return all;
    }
  })();
  return speciesCachePromise;
}

async function loadAtlasRows(): Promise<AtlasOccurrenceRow[]> {
  if (atlasCachePromise) return atlasCachePromise;
  atlasCachePromise = (async () => {
    atlasLoadFailed = false;
    atlasLoadIncomplete = false;
    atlasLoadCapped = false;
    // A local array: a load superseded by resetOrchidContinuumCaches() keeps
    // writing to its own rows, never to the next load's.
    const rows: AtlasOccurrenceRow[] = [];
    atlasRowsSoFar = rows;
    atlasProgress = { loaded: 0, total: null, done: false }; // nothing to announce yet

    const append = (page: PublicOccurrencePage) => {
      for (const item of page.items) {
        const row = publicItemToRow(item);
        if (row) rows.push(row);
      }
    };

    // First page alone: it carries the total and paints the map immediately.
    const first = await fetchAtlasPageWithRetry(0, ATLAS_PAGE_SIZE);
    if (first === null) {
      atlasLoadFailed = true;
      console.warn('[orchidContinuum] atlas load failed after retries — surfacing inline retry message.');
      publishAtlasProgress({ done: true });
      return [];
    }
    append(first);
    publishAtlasProgress({ total: first.total });

    if (first.total !== null) {
      // Remaining pages concurrently, at most ATLAS_PAGE_CONCURRENCY in flight.
      const offsets: number[] = [];
      let o = first.offset + first.scanned;
      for (; o < first.total && offsets.length < ATLAS_MAX_PAGES; o += ATLAS_PAGE_SIZE) {
        offsets.push(o);
      }
      if (o < first.total) atlasLoadCapped = true;
      await runWithConcurrency(
        offsets.map((offset) => async () => {
          const page = await fetchAtlasPageWithRetry(offset, ATLAS_PAGE_SIZE);
          if (page === null) {
            atlasLoadIncomplete = true;
            console.warn(`[orchidContinuum] atlas page @${offset} failed after retries — map is incomplete.`);
            return;
          }
          append(page);
          publishAtlasProgress({});
        }),
        ATLAS_PAGE_CONCURRENCY,
      );
    } else {
      // No total: follow next_offset sequentially.
      let next = first.next_offset;
      for (let i = 1; next !== null && i < ATLAS_MAX_PAGES; i++) {
        const page = await fetchAtlasPageWithRetry(next, ATLAS_PAGE_SIZE);
        if (page === null) {
          atlasLoadIncomplete = true;
          next = null;
          break;
        }
        append(page);
        publishAtlasProgress({});
        next = page.next_offset;
      }
      if (next !== null) atlasLoadCapped = true;
    }

    if (rows.length > 0) {
      liveStatus = 'live';
      atlasLoadFailed = false;
    }
    publishAtlasProgress({ done: true });
    return rows;
  })();
  return atlasCachePromise;
}

async function loadMycorrhizalRows(): Promise<MycorrhizalRow[]> {
  if (mycorrhizalCachePromise) return mycorrhizalCachePromise;
  const epoch = relationshipReadEpoch;
  const attempt = (async (): Promise<{ rows: MycorrhizalRow[]; failed: boolean }> => {
    try {
      const { data, error } = await supabase
        .from('species_mycorrhizal')
        .select('id, species_id, scientific_name, fungal_taxon, fungal_family, association_type, note, source');
      if (error) {
        console.warn('[orchidContinuum] mycorrhizal fetch failed:', error.message);
        return { rows: [], failed: true };
      }
      return { rows: (data ?? []) as MycorrhizalRow[], failed: false };
    } catch (err) {
      console.warn('[orchidContinuum] mycorrhizal fetch threw:', err);
      return { rows: [], failed: true };
    }
  })();
  const settled: Promise<MycorrhizalRow[]> = attempt.then(({ rows, failed }) => {
    if (epoch === relationshipReadEpoch) {
      mycorrhizalReadFailed = failed;
      // A failed read is not an empty table: do not keep it as the cached
      // answer, so the next consumer retries instead of inheriting "no rows".
      if (failed && mycorrhizalCachePromise === settled) mycorrhizalCachePromise = null;
    }
    return rows;
  });
  mycorrhizalCachePromise = settled;
  return settled;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function buildScientificName(row: SpeciesRow): string {
  const g = row.genus?.trim();
  const e = row.epithet?.trim();
  if (g && e) return `${g} ${e}`;
  if (g) return g;
  return row.slug ?? 'Unknown taxon';
}

function buildNativeRegion(row: SpeciesRow): string | undefined {
  if (row.region && row.region.trim()) return row.region.trim();
  if (row.countries && row.countries.length > 0) return row.countries.join(', ');
  return undefined;
}

function buildHabitatDescription(row: SpeciesRow): string | undefined {
  const candidates = [row.ecology, row.description, row.habitat];
  for (const c of candidates) {
    if (c && c.trim().length > 0) return c.trim();
  }
  return undefined;
}

function rowToGalleryRecord(row: SpeciesRow): LivingGalleryRecord {
  return {
    id: row.id,
    scientificName: buildScientificName(row),
    nativeRegion: buildNativeRegion(row),
    habitatDescription: buildHabitatDescription(row),
    sourceCredit: 'Orchid Continuum approved image library',
    imageUrl: row.image_url ?? undefined,
    isPlaceholder: false,
    taxonomyId: row.slug ?? row.id,
    atlasOccurrenceId:
      row.occurrences && row.occurrences.length > 0 ? `${row.id}:0` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Mycorrhizal index — fast lookup from `species_mycorrhizal` rows.
// A point is considered "mycorrhizally linked" if EITHER of these matches:
//   1. its `species_id` matches a `species_mycorrhizal.species_id`
//   2. its canonical "Genus epithet" matches `species_mycorrhizal.scientific_name`
// Only one literature-backed record is attached per point (the first match);
// no fabrication — undefined when nothing is linked.
// ---------------------------------------------------------------------------

interface MycorrhizalIndex {
  bySpeciesId: Map<string, MycorrhizalRecord>;
  byCanonical: Map<string, MycorrhizalRecord>;
}

function buildMycorrhizalIndex(rows: MycorrhizalRow[]): MycorrhizalIndex {
  const bySpeciesId = new Map<string, MycorrhizalRecord>();
  const byCanonical = new Map<string, MycorrhizalRecord>();
  for (const m of rows) {
    const rec = toMyco(m);
    if (m.species_id && !bySpeciesId.has(m.species_id)) {
      bySpeciesId.set(m.species_id, rec);
    }
    const sci = (m.scientific_name ?? '').trim().toLowerCase();
    if (sci && !byCanonical.has(sci)) {
      byCanonical.set(sci, rec);
    }
  }
  return { bySpeciesId, byCanonical };
}

// ---------------------------------------------------------------------------
// Conservation index
// ---------------------------------------------------------------------------
//
// Conservation status lives on `species`, not on `atlas_occurrences`. An
// ingested occurrence therefore only inherits an assessment when it carries a
// `species_id` — and many ingested rows do not.
//
// That gap is a SAFETY problem, not merely a display one: locality protection
// keys off the assessment, so an unlinked occurrence of a threatened species
// would have its precise coordinate published unprotected. Matching on the
// canonical binomial as well as the id closes most of it, using exactly the
// same conservative rule as the mycorrhizal index — exact name, first match,
// nothing inferred.

interface ConservationIndex {
  bySpeciesId: Map<string, { status?: string; iucn?: string }>;
  byCanonical: Map<string, { status?: string; iucn?: string }>;
}

function buildConservationIndex(rows: SpeciesRow[]): ConservationIndex {
  const bySpeciesId = new Map<string, { status?: string; iucn?: string }>();
  const byCanonical = new Map<string, { status?: string; iucn?: string }>();
  for (const r of rows) {
    if (!r.conservation_status && !r.iucn_code) continue;
    const rec = {
      status: r.conservation_status ?? undefined,
      iucn: r.iucn_code ?? undefined,
    };
    if (r.id && !bySpeciesId.has(r.id)) bySpeciesId.set(r.id, rec);
    const canonical = buildScientificName(r).trim().toLowerCase();
    if (canonical && !byCanonical.has(canonical)) byCanonical.set(canonical, rec);
  }
  return { bySpeciesId, byCanonical };
}

export function lookupConservation(
  idx: ConservationIndex | undefined,
  speciesId: string | undefined,
  canonicalName: string | undefined,
): { status?: string; iucn?: string } | undefined {
  if (!idx) return undefined;
  if (speciesId) {
    const hit = idx.bySpeciesId.get(speciesId);
    if (hit) return hit;
  }
  if (canonicalName) return idx.byCanonical.get(canonicalName.trim().toLowerCase());
  return undefined;
}

function lookupMyco(
  idx: MycorrhizalIndex | undefined,
  speciesId: string | undefined,
  canonicalName: string | undefined,
): MycorrhizalRecord | undefined {
  if (!idx) return undefined;
  if (speciesId) {
    const hit = idx.bySpeciesId.get(speciesId);
    if (hit) return hit;
  }
  if (canonicalName) {
    return idx.byCanonical.get(canonicalName.trim().toLowerCase());
  }
  return undefined;
}

/** Map a curated species occurrence (JSONB) to an atlas point. */
function curatedOccurrenceToPoint(
  row: SpeciesRow,
  occ: SpeciesOccurrence,
  index: number,
  mycoIdx?: MycorrhizalIndex,
): AtlasOccurrencePoint {
  const pollinators = Array.isArray(row.pollinators) ? row.pollinators : [];
  const canonical = buildScientificName(row);
  const mycorrhizal = lookupMyco(mycoIdx, row.id, canonical);
  return {
    id: `${row.id}:${index}`,
    speciesId: row.id,
    lat: occ.lat,
    lng: occ.lng,
    genus: row.genus ?? 'Unknown',
    species: row.epithet ?? '',
    canonicalName: canonical,
    country: (row.countries && row.countries[0]) ?? row.region ?? 'Unknown',
    countries: row.countries ?? [],
    region: row.region ?? undefined,
    elevation_m: occ.elevation_m,
    habitat: row.habitat ?? undefined,
    growthForm: row.growth_form ?? undefined,
    family: row.family ?? undefined,
    subfamily: row.subfamily ?? undefined,
    tribe: row.tribe ?? undefined,
    conservationStatus: row.conservation_status ?? undefined,
    iucnCode: row.iucn_code ?? undefined,
    // A curated point comes from a species row, so the assessment was reachable
    // whether or not that row carries one.
    assessmentResolved: hasThreatAssessment(row.iucn_code, row.conservation_status),
    imageUrl: row.image_url ?? undefined,
    taxonomyId: row.slug ?? row.id,
    locality: undefined,
    year: occ.year,
    publicCellDeg: occ.public_location?.cell_deg,
    locationNotice: occ.public_location?.notice,
    locationReason: occ.public_location?.reason,
    pollinators,
    pollinatorTaxon: pollinators[0]?.taxon ?? pollinators[0]?.name,
    mycorrhizal,
    dataset: occ.dataset ?? 'Orchid Continuum',
    verified: occ.verified ?? true,
  };
}

/** Map an atlas_occurrences row to an atlas point, enriching with curated species + mycorrhizal data. */
function atlasRowToPoint(
  row: AtlasOccurrenceRow,
  linkedSpecies?: SpeciesRow,
  mycoIdx?: MycorrhizalIndex,
  consIdx?: ConservationIndex,
): AtlasOccurrencePoint {
  const pollinators =
    row.pollinator_data ??
    (linkedSpecies && Array.isArray(linkedSpecies.pollinators)
      ? linkedSpecies.pollinators
      : []);
  const genus =
    row.genus ?? linkedSpecies?.genus ?? row.scientific_name.split(' ')[0] ?? 'Unknown';
  const species = row.species ?? linkedSpecies?.epithet ?? '';
  const canonical = species ? `${genus} ${species}` : row.scientific_name;
  const speciesId = row.species_id ?? linkedSpecies?.id;
  const mycorrhizal =
    lookupMyco(mycoIdx, speciesId, canonical) ??
    (row.mycorrhizal_data as MycorrhizalRecord | null | undefined) ??
    undefined;
  const conservation = lookupConservation(consIdx, speciesId, canonical);
  const iucnCode = linkedSpecies?.iucn_code ?? conservation?.iucn ?? row.iucn_code ?? undefined;
  const conservationStatus =
    linkedSpecies?.conservation_status ?? conservation?.status ?? row.conservation_status ?? undefined;
  return {
    id: row.id,
    speciesId,
    lat: row.lat,
    lng: row.lng,
    genus,
    species,
    canonicalName: canonical,
    country: row.country ?? linkedSpecies?.region ?? 'Unknown',
    countries:
      row.country ? [row.country] : linkedSpecies?.countries ?? [],
    region: row.region ?? linkedSpecies?.region ?? undefined,
    elevation_m: row.elevation_m ?? undefined,
    habitat: row.habitat ?? linkedSpecies?.habitat ?? undefined,
    growthForm: linkedSpecies?.growth_form ?? undefined,
    family: linkedSpecies?.family ?? undefined,
    subfamily: linkedSpecies?.subfamily ?? undefined,
    tribe: linkedSpecies?.tribe ?? undefined,
    conservationStatus,
    iucnCode,
    assessmentResolved: hasThreatAssessment(iucnCode, conservationStatus) || row.assessment_resolved === true,
    publicCellDeg: row.public_location?.cell_deg,
    locationNotice: row.public_location?.notice,
    locationReason: row.public_location?.reason,
    imageUrl: linkedSpecies?.image_url ?? row.media_url ?? undefined,
    taxonomyId: linkedSpecies?.slug ?? undefined,
    locality: row.locality ?? undefined,
    year: row.year ?? undefined,
    pollinators,
    pollinatorTaxon: pollinators[0]?.taxon ?? pollinators[0]?.name,
    mycorrhizal,
    dataset: row.source_dataset,
    verified: row.verified ?? false,
    sourceRecordId: row.source_record_id ?? undefined,
    acceptedName: row.accepted_name ?? undefined,
    biome: row.biome ?? undefined,
    coordinateUncertaintyM:
      typeof row.coordinate_uncertainty_m === 'number'
        ? row.coordinate_uncertainty_m
        : undefined,
  };
}

function rowToAtlasSpeciesRecord(
  row: SpeciesRow,
  occ?: SpeciesOccurrence,
  mycorrhizal?: MycorrhizalRecord,
): AtlasSpeciesRecord {
  const pollinators = Array.isArray(row.pollinators) ? row.pollinators : [];
  const traits = row.traits ?? undefined;
  const elevRange = Array.isArray(traits?.elevation_m)
    ? (traits!.elevation_m as [number, number])
    : undefined;
  return {
    id: row.id,
    scientificName: buildScientificName(row),
    genus: row.genus ?? '',
    speciesEpithet: row.epithet ?? undefined,
    family: row.family ?? undefined,
    subfamily: row.subfamily ?? undefined,
    tribe: row.tribe ?? undefined,
    authority: row.authority ?? undefined,
    commonName: row.common_name ?? undefined,
    growthForm: row.growth_form ?? undefined,
    nativeRange: buildNativeRegion(row),
    country: (row.countries && row.countries[0]) ?? undefined,
    countries: row.countries ?? [],
    region: row.region ?? undefined,
    habitatType: row.habitat ?? undefined,
    habitatDescription: buildHabitatDescription(row),
    elevation_m: occ?.elevation_m,
    elevationRange: elevRange,
    conservationStatus: row.conservation_status ?? undefined,
    iucnCode: row.iucn_code ?? undefined,
    climateZone: undefined,
    climateNote: undefined,
    imageUrl: row.image_url ?? undefined,
    sourceCredit: 'Orchid Continuum approved image library',
    locality: occ?.locality,
    year: occ?.year,
    lat: occ?.lat,
    lng: occ?.lng,
    pollinators,
    mycorrhizal,
    traits,
    dataset: occ?.dataset ?? 'Orchid Continuum',
    verified: occ?.verified ?? true,
    isPlaceholder: false,
    taxonomyId: row.slug ?? row.id,
  };
}

function atlasRowToSpeciesRecord(
  row: AtlasOccurrenceRow,
  linkedSpecies?: SpeciesRow,
  mycorrhizal?: MycorrhizalRecord,
): AtlasSpeciesRecord {
  if (linkedSpecies) {
    const base = rowToAtlasSpeciesRecord(
      linkedSpecies,
      {
        lat: row.lat,
        lng: row.lng,
        year: row.year ?? undefined,
        locality: row.locality ?? undefined,
        elevation_m: row.elevation_m ?? undefined,
        dataset: row.source_dataset,
        verified: row.verified ?? false,
        source_id: row.source_record_id,
      },
      mycorrhizal,
    );
    base.id = row.id;
    base.dataset = row.source_dataset;
    base.sourceRecordId = row.source_record_id;
    base.country = row.country ?? base.country;
    base.region = row.region ?? base.region;
    base.lat = row.lat;
    base.lng = row.lng;
    return base;
  }
  const genus = row.genus ?? row.scientific_name.split(' ')[0] ?? '';
  const species = row.species ?? row.scientific_name.split(' ')[1] ?? '';
  return {
    id: row.id,
    scientificName: row.scientific_name,
    genus,
    speciesEpithet: species || undefined,
    nativeRange: row.country
      ? row.region
        ? `${row.country} · ${row.region}`
        : row.country
      : undefined,
    country: row.country ?? undefined,
    countries: row.country ? [row.country] : [],
    region: row.region ?? undefined,
    habitatType: row.habitat ?? undefined,
    habitatDescription: row.habitat ?? undefined,
    elevation_m: row.elevation_m ?? undefined,
    imageUrl: row.media_url ?? undefined,
    sourceCredit: row.source_dataset,
    locality: row.locality ?? undefined,
    year: row.year ?? undefined,
    lat: row.lat,
    lng: row.lng,
    pollinators: row.pollinator_data ?? [],
    mycorrhizal: mycorrhizal ?? (row.mycorrhizal_data as MycorrhizalRecord | undefined),
    dataset: row.source_dataset,
    sourceRecordId: row.source_record_id,
    verified: row.verified ?? false,
    isPlaceholder: false,
  };
}

// ---------------------------------------------------------------------------
// Public API — gallery + atlas points + species cards
// ---------------------------------------------------------------------------

export async function fetchLivingGalleryRecords(): Promise<LivingGalleryRecord[]> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('v_frontend_orchid_images')
      .select('image_id, scientific_name, genus, species, image_url, image_source, license, country, photographer, created_at')
      .not('image_url', 'is', null)
      .limit(120);

    if (!error && Array.isArray(data) && data.length > 0) {
      liveStatus = 'live';

      return (data as FrontendOrchidImageRow[])
        .filter((row) => typeof row.image_url === 'string' && row.image_url.trim().length > 0)
        .map((row) => {
          const scientificName =
            row.scientific_name ||
            [row.genus, row.species].filter(Boolean).join(' ') ||
            'Unknown orchid';

          return {
            id: String(row.image_id),
            scientificName,
            nativeRegion: row.country ?? undefined,
            habitatDescription: row.country
              ? `Documented orchid image record from ${row.country}.`
              : 'Documented orchid image record from the Orchid Continuum image library.',
            sourceCredit: [
              row.image_source ? `Source: ${row.image_source}` : null,
              row.photographer ? `Photo: ${row.photographer}` : null,
              row.license ? `License: ${row.license}` : null,
              row.country ? `Country: ${row.country}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Orchid Continuum approved image library',
            imageUrl: row.image_url?.trim(),
            isPlaceholder: false,
            taxonomyId: scientificName,
            atlasOccurrenceId: undefined,
          };
        });
    }

    if (error) {
      console.warn('[orchidContinuum] api.v_frontend_orchid_images fetch failed:', error.message);
    }
  } catch (err) {
    console.warn('[orchidContinuum] api.v_frontend_orchid_images fetch threw:', err);
  }

  const rows = await loadSpeciesRows();
  return rows.filter((r) => !!r.image_url).map(rowToGalleryRecord);
}

/**
 * Returns ALL atlas occurrence points.
 * - Real GBIF/iNat/herbarium rows from `atlas_occurrences`.
 * - PLUS curated rows from `species.occurrences` (JSONB) — these are the
 *   homepage's hand-curated, image-rich "hero" points.
 * - Each point carries an optional `mycorrhizal` partner attached from
 *   `species_mycorrhizal` so the homepage's "Mycorrhizal linked only"
 *   filter and the diagnostics counter return real, literature-backed
 *   results — never fabricated.
 *
 * Points keep their dataset attribution so the data-source filter works.
 */
export async function fetchAtlasOccurrencePoints(): Promise<AtlasOccurrencePoint[]> {
  return fetchAtlasOccurrencePointsProgressive();
}

/**
 * Like {@link fetchAtlasOccurrencePoints}, but calls `onUpdate` as soon as the
 * first page of occurrences arrives and again after every later page, so a map
 * can paint immediately instead of waiting for every page. `progress` keeps the
 * counts honest ("showing 1,019 of 31,092 while loading").
 */
export async function fetchAtlasOccurrencePointsProgressive(
  onUpdate?: (points: AtlasOccurrencePoint[], progress: AtlasLoadProgress) => void,
): Promise<AtlasOccurrencePoint[]> {
  const [speciesRows, mycoRows] = await Promise.all([loadSpeciesRows(), loadMycorrhizalRows()]);

  const speciesById = new Map(speciesRows.map((r) => [r.id, r]));
  const mycoIdx = buildMycorrhizalIndex(mycoRows);
  const consIdx = buildConservationIndex(speciesRows);
  const out: AtlasOccurrencePoint[] = [];

  // Curated points (species.occurrences, generalised by the server)
  for (const row of speciesRows) {
    if (!row.occurrences || row.occurrences.length === 0) continue;
    row.occurrences.forEach((occ, i) => {
      if (typeof occ?.lat !== 'number' || typeof occ?.lng !== 'number') return;
      out.push(curatedOccurrenceToPoint(row, occ, i, mycoIdx));
    });
  }

  // Ingested occurrences, mapped incrementally as pages arrive.
  let mapped = 0;
  const mapNewRows = (rows: AtlasOccurrenceRow[]) => {
    for (; mapped < rows.length; mapped++) {
      const row = rows[mapped];
      const linked = row.species_id ? speciesById.get(row.species_id) : undefined;
      out.push(atlasRowToPoint(row, linked, mycoIdx, consIdx));
    }
  };
  const emit = () => {
    mapNewRows(atlasRowsSoFar);
    onUpdate?.(out.slice(), getAtlasLoadProgress());
  };
  const unsubscribe = onUpdate ? subscribeAtlasLoadProgress(emit) : () => undefined;
  try {
    if (onUpdate && atlasRowsSoFar.length > 0) emit();
    const atlasRows = await loadAtlasRows();
    mapNewRows(atlasRows);
  } finally {
    unsubscribe();
  }
  onUpdate?.(out.slice(), getAtlasLoadProgress());
  return out;
}

/**
 * Resolves with the points available after the FIRST page (fast paint);
 * `full` resolves with every point once all pages have arrived.
 */
export async function fetchAtlasOccurrencePointsLazy(): Promise<{
  initial: AtlasOccurrencePoint[];
  full: Promise<AtlasOccurrencePoint[]>;
}> {
  let resolveInitial: (points: AtlasOccurrencePoint[]) => void = () => undefined;
  const initialPromise = new Promise<AtlasOccurrencePoint[]>((resolve) => {
    resolveInitial = resolve;
  });
  let settled = false;
  const full = fetchAtlasOccurrencePointsProgressive((points, progress) => {
    if (!settled && (progress.loaded > 0 || progress.done)) {
      settled = true;
      resolveInitial(points);
    }
  });
  full.then(
    (points) => {
      if (!settled) {
        settled = true;
        resolveInitial(points);
      }
    },
    () => {
      if (!settled) {
        settled = true;
        resolveInitial([]);
      }
    },
  );
  const initial = await initialPromise;
  return { initial, full };
}

// ---------------------------------------------------------------------------
// World overview: record counts per generalised grid cell
// ---------------------------------------------------------------------------

/** Resolutions the backend's cell route offers (degrees). */
export const ATLAS_CELL_RESOLUTIONS = [5, 2, 1, 0.5, 0.1] as const;
export type AtlasCellResolution = (typeof ATLAS_CELL_RESOLUTIONS)[number];

/**
 * One cell of the public overview. The server counts every record into a cell
 * no finer than its own public cell (a CR record never below 1 degree) and
 * sends counts only: no record id, no name.
 */
export interface AtlasCell {
  lat: number;
  lng: number;
  cellDeg: number;
  cellKm: number;
  count: number;
  taxa: number;
}

export interface AtlasCellSummary {
  cells: AtlasCell[];
  /** Records counted in the returned cells. */
  recordCount: number;
  /** True when the server returned only its most populated cells. */
  truncated: boolean;
  resolution: number;
}

const atlasCellCache = new Map<string, Promise<AtlasCellSummary | null>>();

/**
 * Fetch the public cell summary. Resolves to `null` when the route is not
 * reachable (for example a backend that predates it), so the caller can fall
 * back to per-record points instead of showing an empty map.
 */
export function fetchAtlasCells(options: { resolution: AtlasCellResolution; genus?: string }): Promise<AtlasCellSummary | null> {
  const params = new URLSearchParams({ resolution: String(options.resolution) });
  if (options.genus) params.set('genus', options.genus);
  const key = params.toString();
  const cached = atlasCellCache.get(key);
  if (cached) return cached;
  const promise = (async (): Promise<AtlasCellSummary | null> => {
    try {
      const res = await fetch(`${ATLAS_PUBLIC_CELLS_URL}?${key}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        console.warn(`[orchidContinuum] atlas cells failed: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as {
        cells?: { cell_lat: unknown; cell_lng: unknown; cell_deg: unknown; cell_km: unknown; count: unknown; taxa: unknown }[];
        truncated?: unknown;
        resolution_deg?: unknown;
      };
      if (!body || !Array.isArray(body.cells)) return null;
      const cells: AtlasCell[] = [];
      for (const c of body.cells) {
        if (
          typeof c.cell_lat !== 'number' || typeof c.cell_lng !== 'number' ||
          typeof c.cell_deg !== 'number' || typeof c.count !== 'number' ||
          !(c.cell_deg >= 0.1) || c.count <= 0
        ) continue;
        cells.push({
          lat: c.cell_lat,
          lng: c.cell_lng,
          cellDeg: c.cell_deg,
          cellKm: typeof c.cell_km === 'number' ? c.cell_km : Math.round(c.cell_deg * 111),
          count: c.count,
          taxa: typeof c.taxa === 'number' ? c.taxa : 0,
        });
      }
      return {
        cells,
        recordCount: cells.reduce((sum, c) => sum + c.count, 0),
        truncated: body.truncated === true,
        resolution: typeof body.resolution_deg === 'number' ? body.resolution_deg : options.resolution,
      };
    } catch (err) {
      console.warn('[orchidContinuum] atlas cells threw:', err);
      return null;
    }
  })();
  atlasCellCache.set(key, promise);
  // A failure is not cached: the next call asks again.
  promise.then((result) => { if (result === null) atlasCellCache.delete(key); }, () => atlasCellCache.delete(key));
  return promise;
}

// ---------------------------------------------------------------------------
// Per-record points for one genus (server-side genus filter)
// ---------------------------------------------------------------------------

export interface AtlasGenusLoad {
  points: AtlasOccurrencePoint[];
  /** The genus holds more records than ATLAS_MAX_PAGES pages; only the first are present. */
  capped: boolean;
  /** No page could be read. */
  failed: boolean;
  /** A later page failed after its retries. */
  incomplete: boolean;
}

const atlasGenusCache = new Map<string, Promise<AtlasGenusLoad>>();

/**
 * Every public point of one genus: the backend filters by genus, so a genus is
 * loaded completely (up to ATLAS_MAX_PAGES pages) rather than whatever share of
 * it falls inside the first pages of the whole table. Curated species points of
 * the genus are included.
 */
export function fetchAtlasGenusPoints(genus: string): Promise<AtlasGenusLoad> {
  const key = genus.trim();
  const cached = atlasGenusCache.get(key);
  if (cached) return cached;
  const promise = (async (): Promise<AtlasGenusLoad> => {
    const [speciesRows, mycoRows] = await Promise.all([loadSpeciesRows(), loadMycorrhizalRows()]);
    const speciesById = new Map(speciesRows.map((r) => [r.id, r]));
    const mycoIdx = buildMycorrhizalIndex(mycoRows);
    const consIdx = buildConservationIndex(speciesRows);
    const points: AtlasOccurrencePoint[] = [];
    for (const row of speciesRows) {
      if ((row.genus ?? '').trim() !== key || !row.occurrences) continue;
      row.occurrences.forEach((occ, i) => {
        if (typeof occ?.lat !== 'number' || typeof occ?.lng !== 'number') return;
        points.push(curatedOccurrenceToPoint(row, occ, i, mycoIdx));
      });
    }
    let next: number | null = 0;
    let pages = 0;
    let failed = false;
    let incomplete = false;
    while (next !== null && pages < ATLAS_MAX_PAGES) {
      const page = await fetchAtlasPageWithRetry(next, ATLAS_PAGE_SIZE, key);
      if (page === null) {
        if (pages === 0) failed = true;
        else incomplete = true;
        next = null;
        break;
      }
      pages += 1;
      for (const item of page.items) {
        const row = publicItemToRow(item);
        if (!row) continue;
        const linked = row.species_id ? speciesById.get(row.species_id) : undefined;
        points.push(atlasRowToPoint(row, linked, mycoIdx, consIdx));
      }
      next = page.next_offset;
    }
    return { points, capped: next !== null, failed, incomplete };
  })();
  atlasGenusCache.set(key, promise);
  promise.then((result) => { if (result.failed) atlasGenusCache.delete(key); }, () => atlasGenusCache.delete(key));
  return promise;
}


export async function fetchAtlasOccurrence(
  occurrenceId: string,
  seed?: {
    genus?: string;
    canonicalName?: string;
    country?: string;
    region?: string;
    elevation_m?: number;
  },
): Promise<AtlasSpeciesRecord> {
  const [speciesRows, atlasRows, mycoRows] = await Promise.all([
    loadSpeciesRows(),
    loadAtlasRows(),
    loadMycorrhizalRows(),
  ]);

  // Composite curated id: `${speciesId}:${index}`
  if (occurrenceId.includes(':')) {
    const [speciesId, indexStr] = occurrenceId.split(':');
    const occIndex = Number.parseInt(indexStr ?? '0', 10) || 0;
    const row = speciesRows.find((r) => r.id === speciesId);
    if (row) {
      const occ = row.occurrences?.[occIndex];
      const myco = mycoRows.find((m) => m.species_id === row.id);
      return rowToAtlasSpeciesRecord(row, occ, myco ? toMyco(myco) : undefined);
    }
  } else {
    // Atlas occurrence uuid
    const row = atlasRows.find((r) => r.id === occurrenceId);
    if (row) {
      const linked = row.species_id
        ? speciesRows.find((s) => s.id === row.species_id)
        : speciesRows.find((s) => s.genus === row.genus && s.epithet === row.species);
      const myco =
        (linked && mycoRows.find((m) => m.species_id === linked.id)) ?? undefined;
      return atlasRowToSpeciesRecord(row, linked, myco ? toMyco(myco) : undefined);
    }
  }

  return {
    id: occurrenceId,
    scientificName: seed?.canonicalName ?? 'Awaiting Orchid Continuum Record',
    genus: seed?.genus ?? '',
    nativeRange: seed?.country
      ? seed.region
        ? `${seed.country} · ${seed.region}`
        : seed.country
      : undefined,
    country: seed?.country,
    countries: seed?.country ? [seed.country] : [],
    region: seed?.region,
    habitatDescription: undefined,
    elevation_m: seed?.elevation_m,
    conservationStatus: undefined,
    imageUrl: undefined,
    sourceCredit: undefined,
    pollinators: [],
    dataset: 'Orchid Continuum',
    verified: false,
    isPlaceholder: true,
  };
}

function toMyco(row: MycorrhizalRow): MycorrhizalRecord {
  return {
    taxon: row.fungal_taxon ?? undefined,
    family: row.fungal_family ?? undefined,
    type: row.association_type ?? undefined,
    note: row.note ?? undefined,
    source: row.source ?? undefined,
  };
}

/** Lookup an AtlasSpeciesRecord by species slug or id — used by /ecosystems/[species]. */
export async function fetchSpeciesProfileBySlug(slug: string): Promise<AtlasSpeciesRecord | null> {
  const [rows, mycoRows] = await Promise.all([loadSpeciesRows(), loadMycorrhizalRows()]);
  const row = rows.find((r) => r.slug === slug || r.id === slug);
  if (!row) return null;
  const myco = mycoRows.find((m) => m.species_id === row.id);
  return rowToAtlasSpeciesRecord(
    row,
    row.occurrences?.[0],
    myco ? toMyco(myco) : undefined,
  );
}

// ---------------------------------------------------------------------------
// Filter facets
// ---------------------------------------------------------------------------

export interface AtlasFacets {
  genera: string[];
  species: { genus: string; epithet: string; canonical: string }[];
  countries: string[];
  regions: string[];
  growthForms: string[];
  habitats: string[];
  conservationStatuses: string[];
  iucnCodes: string[];
  tribes: string[];
  subfamilies: string[];
  families: string[];
  pollinatorTaxa: string[];
  datasets: string[];
  totals: {
    species: number;
    occurrences: number;
    georeferenced: number;
    withImages: number;
    withPollinators: number;
    withConservation: number;
  };
}

function uniqSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim().length > 0)),
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Filter facets. `includeOccurrenceRows: false` builds them from the species
 * table alone, without starting the (capped, many-page) load of every
 * occurrence; the Atlas overview uses it so its world view stays one request.
 */
export async function fetchAtlasFacets(options: { includeOccurrenceRows?: boolean } = {}): Promise<AtlasFacets> {
  const [rows, atlasRows] = await Promise.all([
    loadSpeciesRows(),
    options.includeOccurrenceRows === false ? Promise.resolve([] as AtlasOccurrenceRow[]) : loadAtlasRows(),
  ]);

  const genera = uniqSorted([
    ...rows.map((r) => r.genus),
    ...atlasRows.map((r) => r.genus),
  ]);
  const species = rows
    .filter((r) => r.genus && r.epithet)
    .map((r) => ({
      genus: r.genus!,
      epithet: r.epithet!,
      canonical: `${r.genus} ${r.epithet}`,
    }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));

  const countries = uniqSorted([
    ...rows.flatMap((r) => r.countries ?? []),
    ...atlasRows.map((r) => r.country),
  ]);
  const regions = uniqSorted([
    ...rows.map((r) => r.region),
    ...atlasRows.map((r) => r.region),
  ]);
  const growthForms = uniqSorted(rows.map((r) => r.growth_form));
  const habitats = uniqSorted([
    ...rows.map((r) => r.habitat),
    ...atlasRows.map((r) => r.habitat),
  ]);
  const conservationStatuses = uniqSorted(rows.map((r) => r.conservation_status));
  const iucnCodes = uniqSorted(rows.map((r) => r.iucn_code));
  const tribes = uniqSorted(rows.map((r) => r.tribe));
  const subfamilies = uniqSorted(rows.map((r) => r.subfamily));
  const families = uniqSorted(rows.map((r) => r.family));
  const pollinatorTaxa = uniqSorted(
    rows.flatMap((r) =>
      (r.pollinators ?? []).flatMap((p) => [p.taxon, p.name]),
    ),
  );

  const datasets = new Set<string>();
  datasets.add('Orchid Continuum');
  for (const r of atlasRows) {
    if (r.source_dataset) datasets.add(r.source_dataset);
  }

  let curatedOcc = 0;
  for (const r of rows) {
    if (Array.isArray(r.occurrences)) curatedOcc += r.occurrences.length;
  }

  return {
    genera,
    species,
    countries,
    regions,
    growthForms,
    habitats,
    conservationStatuses,
    iucnCodes,
    tribes,
    subfamilies,
    families,
    pollinatorTaxa,
    datasets: Array.from(datasets).sort(),
    totals: {
      species: rows.length,
      occurrences: curatedOcc + atlasRows.length,
      georeferenced: curatedOcc + atlasRows.length,
      withImages: rows.filter((r) => !!r.image_url).length,
      withPollinators: rows.filter(
        (r) => Array.isArray(r.pollinators) && r.pollinators.length > 0,
      ).length,
      withConservation: rows.filter((r) => !!r.conservation_status).length,
    },
  };
}

export function isOrchidContinuumLive(): boolean {
  return liveStatus === 'live';
}

/**
 * Drop the module-level caches so the next consumer triggers a fresh
 * fetch of species / atlas_occurrences / species_mycorrhizal. Used by
 * the AtlasDebugPanel "Refresh" button so the team can verify the
 * mycorrhizal counter lighting up in real time as the table fills.
 */
export function resetOrchidContinuumCaches(): void {
  speciesCachePromise = null;
  atlasCachePromise = null;
  atlasRowsSoFar = [];
  atlasProgress = { loaded: 0, total: null, done: false };
  mycorrhizalCachePromise = null;
  liveStatus = 'unknown';
  speciesReadFailed = false;
  mycorrhizalReadFailed = false;
  relationshipReadEpoch += 1;
  atlasLoadFailed = false;
  atlasLoadIncomplete = false;
  atlasLoadCapped = false;
  atlasCellCache.clear();
  atlasGenusCache.clear();
}



// ---------------------------------------------------------------------------
// Filter predicate — shared by globe & Atlas
// ---------------------------------------------------------------------------

export interface AtlasFilterState {
  genera?: string[];
  species?: string[];
  countries?: string[];
  regions?: string[];
  growthForms?: string[];
  habitats?: string[];
  conservationStatuses?: string[];
  iucnCodes?: string[];
  tribes?: string[];
  subfamilies?: string[];
  pollinatorTaxa?: string[];
  datasets?: string[];
  verifiedOnly?: boolean;
  elevationMin?: number;
  elevationMax?: number;
  yearMin?: number;
  yearMax?: number;
  requireOccurrence?: boolean;
  requirePollinator?: boolean;
  requireMycorrhizal?: boolean;
  requireImage?: boolean;
}

const anyIn = (needle: string | undefined, hay?: string[]): boolean => {
  if (!hay || hay.length === 0) return true;
  return !!needle && hay.includes(needle);
};
const anyInArr = (needles: string[], hay?: string[]): boolean => {
  if (!hay || hay.length === 0) return true;
  return needles.some((n) => hay.includes(n));
};

export function applyAtlasFilters(
  points: AtlasOccurrencePoint[],
  f: AtlasFilterState,
): AtlasOccurrencePoint[] {
  return points.filter((p) => {
    if (!anyIn(p.genus, f.genera)) return false;
    if (!anyIn(p.canonicalName, f.species)) return false;
    if (!anyInArr(p.countries.length ? p.countries : [p.country], f.countries)) return false;
    if (!anyIn(p.region, f.regions)) return false;
    if (!anyIn(p.growthForm, f.growthForms)) return false;
    if (!anyIn(p.habitat, f.habitats)) return false;
    if (!anyIn(p.conservationStatus, f.conservationStatuses)) return false;
    if (!anyIn(p.iucnCode, f.iucnCodes)) return false;
    if (!anyIn(p.tribe, f.tribes)) return false;
    if (!anyIn(p.subfamily, f.subfamilies)) return false;
    if (!anyIn(p.dataset, f.datasets)) return false;
    if (f.verifiedOnly && !p.verified) return false;
    if (f.pollinatorTaxa && f.pollinatorTaxa.length > 0) {
      const taxa = p.pollinators.flatMap((pl) => [pl.taxon, pl.name]).filter(Boolean) as string[];
      if (!f.pollinatorTaxa.some((t) => taxa.includes(t))) return false;
    }
    if (typeof f.elevationMin === 'number' && (p.elevation_m ?? -Infinity) < f.elevationMin)
      return false;
    if (typeof f.elevationMax === 'number' && (p.elevation_m ?? Infinity) > f.elevationMax)
      return false;
    if (typeof f.yearMin === 'number' && (p.year ?? Infinity) < f.yearMin) return false;
    if (typeof f.yearMax === 'number' && (p.year ?? -Infinity) > f.yearMax) return false;

    if (f.requirePollinator && p.pollinators.length === 0) return false;

    if (f.requireImage && !p.imageUrl) return false;
    // Mycorrhizal linkage now resolved from `species_mycorrhizal` and attached
    // to each AtlasOccurrencePoint as `p.mycorrhizal`. Filter honestly.
    if (f.requireMycorrhizal && p.mycorrhizal == null) return false;

    return true;
  });
}


// ---------------------------------------------------------------------------
// Canonical species resolution
// ---------------------------------------------------------------------------
//
// Every orchid species in the Continuum has ONE canonical identity. The
// canonical slug is derived from the binomial (Genus species → "genus-species"),
// so the same URL works from any entry point: atlas point, gallery image,
// habitat journey, pollinator page, mycorrhiza page, intelligence graph.
// ---------------------------------------------------------------------------

export interface CanonicalSpecies {
  id: string;
  slug: string;
  scientificName: string;
  genus: string;
  epithet?: string;
  family?: string;
  subfamily?: string;
  tribe?: string;
  authority?: string;
  commonName?: string;
  growthForm?: string;
  habitat?: string;
  region?: string;
  countries: string[];
  conservationStatus?: string;
  iucnCode?: string;
  imageUrl?: string;
  pollinators: PollinatorRecord[];
  mycorrhizal?: MycorrhizalRecord;
  traits?: SpeciesTraits;
  occurrenceCount: number;
  curatedOccurrenceCount: number;
  ingestedOccurrenceCount: number;
  hasImage: boolean;
  hasPollinator: boolean;
  hasMycorrhizal: boolean;
  hasConservation: boolean;
}

export function canonicalSlug(scientific: string): string {
  return scientific
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export async function fetchCanonicalSpecies(slugOrName: string): Promise<CanonicalSpecies | null> {
  const [rows, atlasRows, mycoRows] = await Promise.all([
    loadSpeciesRows(),
    loadAtlasRows(),
    loadMycorrhizalRows(),
  ]);
  const decoded = decodeURIComponent(slugOrName).toLowerCase();
  const row = rows.find(
    (r) =>
      r.slug === decoded ||
      r.id === decoded ||
      canonicalSlug(buildScientificName(r)) === canonicalSlug(decoded) ||
      buildScientificName(r).toLowerCase() === decoded,
  );

  if (row) {
    const sci = buildScientificName(row);
    const myco = mycoRows.find((m) => m.species_id === row.id);
    const ingested = atlasRows.filter(
      (a) => a.species_id === row.id ||
        (a.genus === row.genus && a.species === row.epithet),
    ).length;
    const curated = Array.isArray(row.occurrences) ? row.occurrences.length : 0;
    return {
      id: row.id,
      slug: row.slug ?? canonicalSlug(sci),
      scientificName: sci,
      genus: row.genus ?? '',
      epithet: row.epithet ?? undefined,
      family: row.family ?? undefined,
      subfamily: row.subfamily ?? undefined,
      tribe: row.tribe ?? undefined,
      authority: row.authority ?? undefined,
      commonName: row.common_name ?? undefined,
      growthForm: row.growth_form ?? undefined,
      habitat: row.habitat ?? undefined,
      region: row.region ?? undefined,
      countries: row.countries ?? [],
      conservationStatus: row.conservation_status ?? undefined,
      iucnCode: row.iucn_code ?? undefined,
      imageUrl: row.image_url ?? undefined,
      pollinators: Array.isArray(row.pollinators) ? row.pollinators : [],
      mycorrhizal: myco ? toMyco(myco) : undefined,
      traits: row.traits ?? undefined,
      occurrenceCount: curated + ingested,
      curatedOccurrenceCount: curated,
      ingestedOccurrenceCount: ingested,
      hasImage: !!row.image_url,
      hasPollinator: Array.isArray(row.pollinators) && row.pollinators.length > 0,
      hasMycorrhizal: !!myco,
      hasConservation: !!row.conservation_status,
    };
  }

  // Unlinked GBIF binomial — synthesize a partial canonical record so
  // pages still render with explicit "Awaiting Orchid Continuum Record"
  // hydration placeholders.
  const atlasMatch = atlasRows.find(
    (a) =>
      canonicalSlug(a.scientific_name) === canonicalSlug(decoded) ||
      a.scientific_name.toLowerCase() === decoded,
  );
  if (atlasMatch) {
    const sci = atlasMatch.scientific_name;
    const ingested = atlasRows.filter((a) => a.scientific_name === sci).length;
    return {
      id: atlasMatch.id,
      slug: canonicalSlug(sci),
      scientificName: sci,
      genus: atlasMatch.genus ?? sci.split(' ')[0] ?? '',
      epithet: atlasMatch.species ?? undefined,
      countries: atlasMatch.country ? [atlasMatch.country] : [],
      pollinators: [],
      occurrenceCount: ingested,
      curatedOccurrenceCount: 0,
      ingestedOccurrenceCount: ingested,
      hasImage: false,
      hasPollinator: false,
      hasMycorrhizal: false,
      hasConservation: false,
    };
  }
  return null;
}

export async function fetchAllCanonicalSpecies(): Promise<CanonicalSpecies[]> {
  const [rows, atlasRows, mycoRows] = await Promise.all([
    loadSpeciesRows(),
    loadAtlasRows(),
    loadMycorrhizalRows(),
  ]);

  const out: CanonicalSpecies[] = [];
  const ingestedBySpeciesId = new Map<string, number>();
  const ingestedByName = new Map<string, number>();
  for (const a of atlasRows) {
    if (a.species_id) {
      ingestedBySpeciesId.set(a.species_id, (ingestedBySpeciesId.get(a.species_id) ?? 0) + 1);
    }
    const key = `${a.genus ?? ''}|${a.species ?? ''}`;
    ingestedByName.set(key, (ingestedByName.get(key) ?? 0) + 1);
  }

  for (const row of rows) {
    const sci = buildScientificName(row);
    const myco = mycoRows.find((m) => m.species_id === row.id);
    const curated = Array.isArray(row.occurrences) ? row.occurrences.length : 0;
    const ingested =
      ingestedBySpeciesId.get(row.id) ??
      ingestedByName.get(`${row.genus ?? ''}|${row.epithet ?? ''}`) ??
      0;
    out.push({
      id: row.id,
      slug: row.slug ?? canonicalSlug(sci),
      scientificName: sci,
      genus: row.genus ?? '',
      epithet: row.epithet ?? undefined,
      family: row.family ?? undefined,
      subfamily: row.subfamily ?? undefined,
      tribe: row.tribe ?? undefined,
      authority: row.authority ?? undefined,
      commonName: row.common_name ?? undefined,
      growthForm: row.growth_form ?? undefined,
      habitat: row.habitat ?? undefined,
      region: row.region ?? undefined,
      countries: row.countries ?? [],
      conservationStatus: row.conservation_status ?? undefined,
      iucnCode: row.iucn_code ?? undefined,
      imageUrl: row.image_url ?? undefined,
      pollinators: Array.isArray(row.pollinators) ? row.pollinators : [],
      mycorrhizal: myco ? toMyco(myco) : undefined,
      traits: row.traits ?? undefined,
      occurrenceCount: curated + ingested,
      curatedOccurrenceCount: curated,
      ingestedOccurrenceCount: ingested,
      hasImage: !!row.image_url,
      hasPollinator: Array.isArray(row.pollinators) && row.pollinators.length > 0,
      hasMycorrhizal: !!myco,
      hasConservation: !!row.conservation_status,
    });
  }
  return out.sort((a, b) => a.scientificName.localeCompare(b.scientificName));
}

// ---------------------------------------------------------------------------
// Ecological relationship aggregators — pollinators, mycorrhizae, biomes
// ---------------------------------------------------------------------------

export interface PollinatorAggregate {
  taxon: string;
  slug: string;
  name?: string;
  mechanism?: string;
  speciesCount: number;
  occurrenceCount: number;
  species: { id: string; scientificName: string; slug: string; imageUrl?: string }[];
}

export interface MycorrhizalAggregate {
  taxon: string;
  slug: string;
  family?: string;
  type?: string;
  speciesCount: number;
  species: { id: string; scientificName: string; slug: string; imageUrl?: string }[];
}

export interface BiomeAggregate {
  biome: string;
  slug: string;
  speciesCount: number;
  occurrenceCount: number;
  countries: string[];
  species: { id: string; scientificName: string; slug: string; imageUrl?: string; growthForm?: string }[];
}

export async function fetchPollinatorAggregates(): Promise<PollinatorAggregate[]> {
  const rows = await loadSpeciesRows();
  const atlasRows = await loadAtlasRows();
  const map = new Map<string, PollinatorAggregate>();
  for (const row of rows) {
    if (!Array.isArray(row.pollinators)) continue;
    for (const p of row.pollinators) {
      const taxon = p.taxon || p.name;
      if (!taxon) continue;
      const slug = canonicalSlug(taxon);
      const sci = buildScientificName(row);
      const existing = map.get(slug);
      const ingested = atlasRows.filter((a) => a.species_id === row.id).length;
      const curated = Array.isArray(row.occurrences) ? row.occurrences.length : 0;
      if (existing) {
        existing.speciesCount += 1;
        existing.occurrenceCount += curated + ingested;
        existing.species.push({
          id: row.id,
          scientificName: sci,
          slug: row.slug ?? canonicalSlug(sci),
          imageUrl: row.image_url ?? undefined,
        });
      } else {
        map.set(slug, {
          taxon,
          slug,
          name: p.name,
          mechanism: p.mechanism,
          speciesCount: 1,
          occurrenceCount: curated + ingested,
          species: [{
            id: row.id,
            scientificName: sci,
            slug: row.slug ?? canonicalSlug(sci),
            imageUrl: row.image_url ?? undefined,
          }],
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.speciesCount - a.speciesCount);
}

export async function fetchPollinator(slug: string): Promise<PollinatorAggregate | null> {
  const all = await fetchPollinatorAggregates();
  const decoded = decodeURIComponent(slug).toLowerCase();
  return all.find((p) => p.slug === decoded || canonicalSlug(p.taxon) === canonicalSlug(decoded)) ?? null;
}

export async function fetchMycorrhizalAggregates(): Promise<MycorrhizalAggregate[]> {
  const [rows, mycoRows] = await Promise.all([loadSpeciesRows(), loadMycorrhizalRows()]);
  if (mycoRows.length === 0) return [];
  const map = new Map<string, MycorrhizalAggregate>();
  for (const m of mycoRows) {
    const taxon = m.fungal_taxon ?? 'Awaiting taxon';
    const slug = canonicalSlug(taxon);
    const row = rows.find((r) => r.id === m.species_id);
    if (!row) continue;
    const sci = buildScientificName(row);
    const existing = map.get(slug);
    if (existing) {
      existing.speciesCount += 1;
      existing.species.push({
        id: row.id,
        scientificName: sci,
        slug: row.slug ?? canonicalSlug(sci),
        imageUrl: row.image_url ?? undefined,
      });
    } else {
      map.set(slug, {
        taxon,
        slug,
        family: m.fungal_family ?? undefined,
        type: m.association_type ?? undefined,
        speciesCount: 1,
        species: [{
          id: row.id,
          scientificName: sci,
          slug: row.slug ?? canonicalSlug(sci),
          imageUrl: row.image_url ?? undefined,
        }],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.speciesCount - a.speciesCount);
}

export async function fetchMycorrhiza(slug: string): Promise<MycorrhizalAggregate | null> {
  const all = await fetchMycorrhizalAggregates();
  const decoded = decodeURIComponent(slug).toLowerCase();
  return all.find((m) => m.slug === decoded || canonicalSlug(m.taxon) === canonicalSlug(decoded)) ?? null;
}

export async function fetchBiomeAggregates(): Promise<BiomeAggregate[]> {
  const [rows, atlasRows] = await Promise.all([loadSpeciesRows(), loadAtlasRows()]);
  const map = new Map<string, BiomeAggregate>();
  const speciesById = new Map(rows.map((r) => [r.id, r]));

  // Curated species-level habitat as the canonical biome label
  for (const row of rows) {
    const biome = row.habitat;
    if (!biome) continue;
    const slug = canonicalSlug(biome);
    const sci = buildScientificName(row);
    const curated = Array.isArray(row.occurrences) ? row.occurrences.length : 0;
    const ingested = atlasRows.filter((a) => a.species_id === row.id).length;
    const existing = map.get(slug);
    if (existing) {
      existing.speciesCount += 1;
      existing.occurrenceCount += curated + ingested;
      for (const c of row.countries ?? []) {
        if (!existing.countries.includes(c)) existing.countries.push(c);
      }
      existing.species.push({
        id: row.id,
        scientificName: sci,
        slug: row.slug ?? canonicalSlug(sci),
        imageUrl: row.image_url ?? undefined,
        growthForm: row.growth_form ?? undefined,
      });
    } else {
      map.set(slug, {
        biome,
        slug,
        speciesCount: 1,
        occurrenceCount: curated + ingested,
        countries: [...(row.countries ?? [])],
        species: [{
          id: row.id,
          scientificName: sci,
          slug: row.slug ?? canonicalSlug(sci),
          imageUrl: row.image_url ?? undefined,
          growthForm: row.growth_form ?? undefined,
        }],
      });
    }
  }

  // Ingested GBIF rows also contribute biome strings
  for (const a of atlasRows) {
    if (!a.biome && !a.habitat) continue;
    const biome = a.biome ?? a.habitat!;
    const slug = canonicalSlug(biome);
    const existing = map.get(slug);
    if (existing) {
      existing.occurrenceCount += 1;
      if (a.country && !existing.countries.includes(a.country)) {
        existing.countries.push(a.country);
      }
    } else if (a.species_id && speciesById.has(a.species_id)) {
      // skip — already counted above
    } else {
      map.set(slug, {
        biome,
        slug,
        speciesCount: 0,
        occurrenceCount: 1,
        countries: a.country ? [a.country] : [],
        species: [],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.speciesCount - a.speciesCount);
}

export async function fetchBiome(slug: string): Promise<BiomeAggregate | null> {
  const all = await fetchBiomeAggregates();
  const decoded = decodeURIComponent(slug).toLowerCase();
  return all.find((b) => b.slug === decoded || canonicalSlug(b.biome) === canonicalSlug(decoded)) ?? null;
}

// ---------------------------------------------------------------------------
// Atlas occurrences for a specific canonical species — used to highlight
// the species's points on the Atlas map when navigating from species cards.
// ---------------------------------------------------------------------------

export async function fetchOccurrencesForSpecies(
  speciesIdOrSlug: string,
): Promise<AtlasOccurrencePoint[]> {
  const canonical = await fetchCanonicalSpecies(speciesIdOrSlug);
  if (!canonical) return [];
  const all = await fetchAtlasOccurrencePoints();
  return all.filter(
    (p) =>
      p.speciesId === canonical.id ||
      (p.genus === canonical.genus &&
        (canonical.epithet ? p.species === canonical.epithet : true)),
  );
}

// ---------------------------------------------------------------------------
// Image library — every image carries a back-reference to its species,
// occurrence, habitat, source. Powers /gallery.
// ---------------------------------------------------------------------------

export interface OrchidImageAsset {
  id: string;
  imageUrl: string;
  scientificName: string;
  speciesSlug: string;
  speciesId?: string;
  genus?: string;
  habitat?: string;
  country?: string;
  region?: string;
  conservationStatus?: string;
  iucnCode?: string;
  occurrenceId?: string;
  lat?: number;
  lng?: number;
  source: string;
  sourceRecordId?: string;
  photographer?: string;
  license?: string;
  verified: boolean;
}

export async function fetchOrchidImageLibrary(): Promise<OrchidImageAsset[]> {
  const [rows, atlasRows] = await Promise.all([loadSpeciesRows(), loadAtlasRows()]);
  const out: OrchidImageAsset[] = [];
  const speciesById = new Map(rows.map((r) => [r.id, r]));

  // Steward-curated species library images
  for (const row of rows) {
    if (!row.image_url) continue;
    const sci = buildScientificName(row);
    out.push({
      id: `species:${row.id}`,
      imageUrl: row.image_url,
      scientificName: sci,
      speciesSlug: row.slug ?? canonicalSlug(sci),
      speciesId: row.id,
      genus: row.genus ?? undefined,
      habitat: row.habitat ?? undefined,
      country: row.countries?.[0],
      region: row.region ?? undefined,
      conservationStatus: row.conservation_status ?? undefined,
      iucnCode: row.iucn_code ?? undefined,
      source: 'Orchid Continuum',
      verified: true,
    });
  }

  // GBIF-attached photographer URLs (real images)
  for (const a of atlasRows) {
    if (!a.media_url) continue;
    const linked = a.species_id ? speciesById.get(a.species_id) : undefined;
    const sci = linked ? buildScientificName(linked) : a.scientific_name;
    out.push({
      id: `atlas:${a.id}`,
      imageUrl: a.media_url,
      scientificName: sci,
      speciesSlug: linked
        ? (linked.slug ?? canonicalSlug(sci))
        : canonicalSlug(sci),
      speciesId: linked?.id,
      genus: a.genus ?? linked?.genus ?? undefined,
      habitat: a.habitat ?? linked?.habitat ?? undefined,
      country: a.country ?? undefined,
      region: a.region ?? undefined,
      conservationStatus: linked?.conservation_status ?? undefined,
      iucnCode: linked?.iucn_code ?? undefined,
      occurrenceId: a.id,
      lat: a.lat,
      lng: a.lng,
      source: a.source_dataset,
      sourceRecordId: a.source_record_id,
      verified: a.verified ?? false,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Intelligence graph — nodes & edges connecting orchids ↔ habitats ↔
// pollinators ↔ fungi ↔ conservation. Used by /intelligence-graph.
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  kind: 'species' | 'genus' | 'pollinator' | 'mycorrhiza' | 'biome' | 'country' | 'iucn';
  label: string;
  weight: number;
  meta?: Record<string, string | number | undefined>;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

export async function fetchIntelligenceGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [rows, atlasRows, mycoRows] = await Promise.all([
    loadSpeciesRows(),
    loadAtlasRows(),
    loadMycorrhizalRows(),
  ]);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: GraphNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  // Genus rollups
  const generaCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.genus) generaCounts.set(r.genus, (generaCounts.get(r.genus) ?? 0) + 1);
  }
  for (const a of atlasRows) {
    if (a.genus) generaCounts.set(a.genus, (generaCounts.get(a.genus) ?? 0) + 1);
  }
  for (const [g, w] of generaCounts) {
    addNode({ id: `genus:${g}`, kind: 'genus', label: g, weight: w });
  }

  for (const row of rows) {
    const sci = buildScientificName(row);
    const speciesId = `species:${row.id}`;
    addNode({
      id: speciesId,
      kind: 'species',
      label: sci,
      weight: 1,
      meta: { slug: row.slug ?? canonicalSlug(sci) },
    });
    if (row.genus) edges.push({ source: speciesId, target: `genus:${row.genus}`, kind: 'in_genus' });
    if (row.habitat) {
      const bId = `biome:${canonicalSlug(row.habitat)}`;
      addNode({ id: bId, kind: 'biome', label: row.habitat, weight: 1 });
      edges.push({ source: speciesId, target: bId, kind: 'inhabits' });
    }
    if (row.iucn_code) {
      const id = `iucn:${row.iucn_code}`;
      addNode({ id, kind: 'iucn', label: row.iucn_code, weight: 1 });
      edges.push({ source: speciesId, target: id, kind: 'iucn_status' });
    }
    for (const c of row.countries ?? []) {
      const id = `country:${c}`;
      addNode({ id, kind: 'country', label: c, weight: 1 });
      edges.push({ source: speciesId, target: id, kind: 'occurs_in' });
    }
    for (const p of row.pollinators ?? []) {
      const taxon = p.taxon || p.name;
      if (!taxon) continue;
      const id = `pollinator:${canonicalSlug(taxon)}`;
      addNode({ id, kind: 'pollinator', label: taxon, weight: 1 });
      edges.push({ source: speciesId, target: id, kind: 'pollinated_by' });
    }
  }

  for (const m of mycoRows) {
    if (!m.species_id || !m.fungal_taxon) continue;
    const id = `mycorrhiza:${canonicalSlug(m.fungal_taxon)}`;
    addNode({ id, kind: 'mycorrhiza', label: m.fungal_taxon, weight: 1 });
    edges.push({ source: `species:${m.species_id}`, target: id, kind: 'mycorrhizal_with' });
  }

  return { nodes, edges };
}


// ---------------------------------------------------------------------------
// Atlas debug stats — surfaced in the Atlas admin/debug panel so the team
// can verify ingestion at a glance. All counts come from the live tables.
// ---------------------------------------------------------------------------

export interface AtlasDebugStats {
  total: number;
  withValidCoords: number;
  invalidCoords: number;
  georeferencedPercent: number;
  taxa: number;
  generaCount: number;
  countriesCount: number;
  withImagery: number;
  withElevation: number;
  withHabitat: number;
  withYear: number;
  verifiedCount: number;
  linkedToCuratedSpecies: number;
  byContinent: { continent: string; n: number }[];
  byGenus: { genus: string; n: number }[];
  byCountry: { country: string; n: number }[];
  byDataset: { dataset: string; n: number }[];
  curatedOccurrences: number;
  curatedSpecies: number;
  curatedWithImage: number;
  expectedRegionsCoverage: { region: string; n: number; ok: boolean }[];
  /**
   * Live counts from `species_mycorrhizal`. These power the homepage's
   * "Mycorrhizal linked" diagnostics counter — when zero, the UI explicitly
   * surfaces "No linked data available yet."
   */
  mycorrhizalRows: number;
  mycorrhizalDistinctFungi: number;
  mycorrhizalDistinctFungalFamilies: number;
  mycorrhizalLinkedToSpecies: number;
  mycorrhizalUnlinkedBinomials: number;
  /** Atlas points whose canonical name OR species_id matches a row in species_mycorrhizal. */
  atlasPointsWithMycorrhiza: number;
  /** Distinct fungal families with row counts, biggest first. */
  byFungalFamily: { family: string; n: number }[];
}


/** Lightweight continent classifier from country names. */
function countryToContinent(country: string | null | undefined): string {
  if (!country) return 'Unknown';
  const c = country.toLowerCase();
  const inList = (arr: string[]) => arr.some((x) => c.includes(x));
  if (inList(['united states', 'canada', 'mexico', 'guatemala', 'belize', 'honduras', 'nicaragua', 'costa rica', 'panama', 'cuba', 'jamaica', 'haiti', 'dominican', 'puerto rico', 'guadeloupe', 'martinique', 'bahamas', 'trinidad', 'el salvador'])) return 'N. America / Caribbean';
  if (inList(['colombia', 'venezuela', 'ecuador', 'peru', 'bolivia', 'brazil', 'chile', 'argentina', 'uruguay', 'paraguay', 'guyana', 'suriname', 'french guiana'])) return 'S. America';
  if (inList(['madagascar', 'south africa', 'kenya', 'tanzania', 'uganda', 'ethiopia', 'cameroon', 'gabon', 'congo', 'nigeria', 'angola', 'mozambique', 'zambia', 'zimbabwe', 'malawi', 'rwanda', 'burundi', 'ghana', 'ivory coast', 'liberia', 'sierra leone', 'guinea', 'senegal', 'sudan', 'somalia', 'réunion', 'reunion', 'mauritius', 'comoros', 'seychelles'])) return 'Africa / Madagascar';
  if (inList(['china', 'taipei', 'taiwan', 'japan', 'korea', 'mongolia', 'india', 'nepal', 'bhutan', 'pakistan', 'sri lanka', 'bangladesh', 'myanmar', 'thailand', 'viet nam', 'vietnam', 'laos', 'cambodia', 'malaysia', 'singapore', 'indonesia', 'philippines', 'borneo', 'brunei', 'hong kong', 'iran', 'turkey'])) return 'Asia / SE Asia';
  if (inList(['australia', 'new zealand', 'papua', 'new guinea', 'solomon', 'vanuatu', 'fiji', 'samoa', 'tonga', 'palau', 'micronesia', 'kiribati', 'tuvalu', 'marshall', 'nauru', 'cook islands', 'french polynesia', 'new caledonia'])) return 'Oceania / Pacific';
  if (inList(['united kingdom', 'germany', 'france', 'italy', 'spain', 'portugal', 'sweden', 'norway', 'finland', 'denmark', 'poland', 'romania', 'greece', 'austria', 'switzerland', 'czech', 'slovak', 'hungary', 'netherlands', 'belgium', 'ireland', 'iceland', 'russia', 'ukraine'])) return 'Europe';
  return 'Other';
}

const EXPECTED_REGIONS: { region: string; matches: string[] }[] = [
  { region: 'Southeast Asia', matches: ['Viet Nam', 'Thailand', 'Malaysia', 'Indonesia', 'Philippines', 'Cambodia', 'Laos', 'Myanmar', 'Singapore', 'Brunei'] },
  { region: 'Borneo', matches: ['Malaysia', 'Indonesia', 'Brunei'] },
  { region: 'New Guinea', matches: ['Papua New Guinea', 'Indonesia'] },
  { region: 'Madagascar', matches: ['Madagascar'] },
  { region: 'Australia', matches: ['Australia'] },
  { region: 'Central America', matches: ['Mexico', 'Guatemala', 'Belize', 'Honduras', 'Costa Rica', 'Panama', 'Nicaragua', 'El Salvador'] },
  { region: 'South America', matches: ['Colombia', 'Ecuador', 'Peru', 'Bolivia', 'Brazil', 'Venezuela', 'Chile', 'Argentina', 'French Guiana', 'Guyana', 'Suriname'] },
  { region: 'Africa', matches: ['South Africa', 'Kenya', 'Tanzania', 'Uganda', 'Gabon', 'Cameroon', 'Congo', 'Ethiopia', 'Nigeria', 'Angola', 'Mozambique', 'Réunion', 'Mauritius'] },
  { region: 'India / Himalaya', matches: ['India', 'Nepal', 'Bhutan', 'Pakistan', 'Sri Lanka'] },
  { region: 'Pacific Islands', matches: ['Papua New Guinea', 'Solomon Islands', 'Fiji', 'Vanuatu', 'New Caledonia', 'French Polynesia', 'Samoa'] },
];

export async function fetchAtlasDebugStats(): Promise<AtlasDebugStats> {
  const [rows, atlasRows, mycoRows] = await Promise.all([
    loadSpeciesRows(),
    loadAtlasRows(),
    loadMycorrhizalRows(),
  ]);

  const validRows = atlasRows.filter(
    (r) =>
      typeof r.lat === 'number' &&
      typeof r.lng === 'number' &&
      r.lat >= -90 && r.lat <= 90 &&
      r.lng >= -180 && r.lng <= 180 &&
      !(r.lat === 0 && r.lng === 0),
  );

  const continentCounts = new Map<string, number>();
  const genusCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const datasetCounts = new Map<string, number>();

  for (const r of validRows) {
    const continent = countryToContinent(r.country);
    continentCounts.set(continent, (continentCounts.get(continent) ?? 0) + 1);
    if (r.genus) genusCounts.set(r.genus, (genusCounts.get(r.genus) ?? 0) + 1);
    if (r.country) countryCounts.set(r.country, (countryCounts.get(r.country) ?? 0) + 1);
    datasetCounts.set(r.source_dataset, (datasetCounts.get(r.source_dataset) ?? 0) + 1);
  }

  const expectedRegionsCoverage = EXPECTED_REGIONS.map((er) => {
    const n = validRows.filter((r) =>
      r.country ? er.matches.some((m) => r.country!.toLowerCase().includes(m.toLowerCase())) : false,
    ).length;
    return { region: er.region, n, ok: n > 0 };
  });

  let curatedOcc = 0;
  for (const r of rows) {
    if (Array.isArray(r.occurrences)) curatedOcc += r.occurrences.length;
  }

  // -------------------------------------------------------------------------
  // Mycorrhizal table diagnostics — wire `species_mycorrhizal` into the panel.
  // -------------------------------------------------------------------------
  const distinctFungi = new Set<string>();
  const distinctFungalFamilies = new Set<string>();
  const fungalFamilyCounts = new Map<string, number>();
  let mycoLinkedToSpecies = 0;
  for (const m of mycoRows) {
    if (m.fungal_taxon) distinctFungi.add(m.fungal_taxon.trim().toLowerCase());
    if (m.fungal_family) {
      const f = m.fungal_family.trim();
      distinctFungalFamilies.add(f.toLowerCase());
      fungalFamilyCounts.set(f, (fungalFamilyCounts.get(f) ?? 0) + 1);
    }
    if (m.species_id) mycoLinkedToSpecies += 1;
  }
  const mycoUnlinked = mycoRows.length - mycoLinkedToSpecies;

  // Count atlas points the homepage "Mycorrhizal linked only" toggle would
  // currently surface — uses the SAME predicate as the AtlasOccurrencePoint
  // pipeline (species_id OR canonical binomial match).
  const mycoIdx = buildMycorrhizalIndex(mycoRows);
  let atlasPointsWithMycorrhiza = 0;
  for (const r of validRows) {
    const genus = r.genus ?? r.scientific_name.split(' ')[0] ?? '';
    const species = r.species ?? r.scientific_name.split(' ')[1] ?? '';
    const canonical = species ? `${genus} ${species}` : r.scientific_name;
    if (lookupMyco(mycoIdx, r.species_id ?? undefined, canonical)) {
      atlasPointsWithMycorrhiza += 1;
    }
  }

  const byFungalFamily = Array.from(fungalFamilyCounts.entries())
    .map(([family, n]) => ({ family, n }))
    .sort((a, b) => b.n - a.n);

  return {
    total: atlasRows.length,
    withValidCoords: validRows.length,
    invalidCoords: atlasRows.length - validRows.length,
    georeferencedPercent: atlasRows.length
      ? Math.round((validRows.length / atlasRows.length) * 1000) / 10
      : 0,
    taxa: new Set(validRows.map((r) => r.scientific_name)).size,
    generaCount: genusCounts.size,
    countriesCount: countryCounts.size,
    withImagery: validRows.filter((r) => !!r.media_url).length,
    withElevation: validRows.filter((r) => typeof r.elevation_m === 'number').length,
    withHabitat: validRows.filter((r) => !!r.habitat).length,
    withYear: validRows.filter((r) => typeof r.year === 'number').length,
    verifiedCount: validRows.filter((r) => r.verified === true).length,
    linkedToCuratedSpecies: validRows.filter((r) => !!r.species_id).length,
    byContinent: Array.from(continentCounts.entries())
      .map(([continent, n]) => ({ continent, n }))
      .sort((a, b) => b.n - a.n),
    byGenus: Array.from(genusCounts.entries())
      .map(([genus, n]) => ({ genus, n }))
      .sort((a, b) => b.n - a.n),
    byCountry: Array.from(countryCounts.entries())
      .map(([country, n]) => ({ country, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 30),
    byDataset: Array.from(datasetCounts.entries())
      .map(([dataset, n]) => ({ dataset, n }))
      .sort((a, b) => b.n - a.n),
    curatedOccurrences: curatedOcc,
    curatedSpecies: rows.length,
    curatedWithImage: rows.filter((r) => !!r.image_url).length,
    expectedRegionsCoverage,
    mycorrhizalRows: mycoRows.length,
    mycorrhizalDistinctFungi: distinctFungi.size,
    mycorrhizalDistinctFungalFamilies: distinctFungalFamilies.size,
    mycorrhizalLinkedToSpecies: mycoLinkedToSpecies,
    mycorrhizalUnlinkedBinomials: mycoUnlinked,
    atlasPointsWithMycorrhiza,
    byFungalFamily,
  };
}
