/**
 * Atlas Explorer — where occurrence records come from.
 *
 * Two providers, one normalised, locality-safe record shape (Darwin Core term
 * names):
 *
 * 1. `calyx-viewport` — `GET /atlas/occurrences/query` on the Calyx backend.
 *    Bounded by viewport, zoom and limit; the server applies the locality
 *    policy before anything is sent. Preferred whenever it reports an
 *    available source.
 * 2. `canonical-store` — the existing canonical `atlas_occurrences` loader
 *    (`fetchAtlasOccurrencePoints`). It is the store the published Atlas reads
 *    today. Every record is passed through the shared locality policy here
 *    before it reaches state, and viewport filtering/clustering happens
 *    client-side.
 *
 * The interface always names which provider produced what is on screen. When
 * neither can answer, it says so; nothing is substituted.
 */

import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  atlasSensitivityResolution,
  resolveAtlasLocation,
} from '@/lib/atlasLocalitySafety';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { assessmentClass, bboxParam, type AssessmentClass, type Viewport } from './geo';

export type ProviderId = 'calyx-viewport' | 'canonical-store';

export interface ExplorerOccurrence {
  /** Internal surrogate key. Never a provider key that could be resolved back to a precise site. */
  occurrenceID: string;
  /** Identifier in the originating dataset; withheld whenever locality text is withheld. */
  sourceRecordId: string | null;
  taxonID: string | null;
  /** Grouping key for richness: taxonID when known, else the lower-cased name. */
  taxonKey: string;
  scientificName: string;
  genus: string | null;
  decimalLatitude: number;
  decimalLongitude: number;
  coordinateUncertaintyInMeters: number | null;
  countryCode: string | null;
  year: number | null;
  month: number | null;
  basisOfRecord: string | null;
  datasetName: string | null;
  institutionCode: string | null;
  license: string | null;
  rightsHolder: string | null;
  references: string | null;
  locality: string | null;
  iucnCategory: string | null;
  assessment: AssessmentClass;
  generalised: boolean;
  generalisationCellDeg: number;
  generalisationReason: string;
  generalisationNotice: string | null;
  provider: ProviderId;
  /**
   * Whether the source stated this record's family. Backend records are always
   * stated (the service serves only family = Orchidaceae). Canonical-store
   * records state it only when linked to a curated species row.
   */
  familyStated: boolean;
}

/** The Atlas is an Orchidaceae atlas. */
export const ATLAS_FAMILY = 'Orchidaceae';

export function isOutOfFamily(family: string | null | undefined): boolean {
  const stated = (family ?? '').trim();
  return stated !== '' && stated.toLowerCase() !== ATLAS_FAMILY.toLowerCase();
}

export interface BackendCluster {
  cell_id: string;
  latitude: number;
  longitude: number;
  count: number;
  taxon_count: number;
  top_genera: string[];
  year_min: number | null;
  year_max: number | null;
  generalised_count: number;
}

export interface BackendSource {
  source_id: string;
  label: string;
  configured: boolean;
  state: 'available' | 'source_not_configured' | 'unavailable';
  detail?: string | null;
}

export interface BackendQueryResponse {
  contract_version: 'oc-atlas-occurrence-query-v1';
  source: BackendSource;
  mode: 'points' | 'clusters';
  cell_deg: number | null;
  total_in_view: number;
  total_is_exact: boolean;
  points: Record<string, unknown>[];
  clusters: BackendCluster[];
  next_cursor: string | null;
  truncated: boolean;
  truncation_reason: string | null;
  attribution: { dataset_name: string; record_count: number; licenses: string[] }[];
}

export interface ExplorerFilters {
  genus: string | null;
  scientificName: string | null;
  taxonId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: number[];
}

export const EMPTY_FILTERS: ExplorerFilters = {
  genus: null,
  scientificName: null,
  taxonId: null,
  yearFrom: null,
  yearTo: null,
  months: [],
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Normalise one backend `PublicOccurrence`. The server has already generalised it. */
export function fromBackendPoint(raw: Record<string, unknown>): ExplorerOccurrence | null {
  const lat = num(raw.decimalLatitude);
  const lng = num(raw.decimalLongitude);
  const id = str(raw.occurrenceID);
  const name = str(raw.scientificName);
  if (lat === null || lng === null || !id || !name) return null;
  const taxonID = str(raw.taxonID);
  const iucn = str(raw.iucnCategory);
  return {
    occurrenceID: id,
    sourceRecordId: null,
    taxonID,
    taxonKey: taxonID ?? name.toLowerCase(),
    scientificName: name,
    genus: str(raw.genus),
    decimalLatitude: lat,
    decimalLongitude: lng,
    coordinateUncertaintyInMeters: num(raw.coordinateUncertaintyInMeters),
    countryCode: str(raw.countryCode),
    year: num(raw.year),
    month: num(raw.month),
    basisOfRecord: str(raw.basisOfRecord),
    datasetName: str(raw.datasetName),
    institutionCode: str(raw.institutionCode),
    license: str(raw.license),
    rightsHolder: str(raw.rightsHolder),
    references: str(raw.references),
    locality: str(raw.locality),
    iucnCategory: iucn,
    assessment: assessmentClass({
      iucnCategory: iucn,
      assessmentResolved: typeof raw.assessmentResolved === 'boolean' ? raw.assessmentResolved : null,
    }),
    generalised: raw.generalised === true,
    generalisationCellDeg: num(raw.generalisationCellDeg) ?? 0,
    generalisationReason: str(raw.generalisationReason) ?? 'none',
    generalisationNotice: str(raw.generalisationNotice),
    provider: 'calyx-viewport',
    familyStated: true,
  };
}

/**
 * Project a canonical-store point through the shared public locality policy.
 * Precise coordinates and withheld locality text never leave this function.
 */
export function fromCanonicalPoint(point: AtlasOccurrencePoint): ExplorerOccurrence | null {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180 ||
    (point.lat === 0 && point.lng === 0)
  ) {
    return null;
  }
  // A record a source states is not an orchid (e.g. Hypoxis, Hypoxidaceae) is
  // excluded from the Orchidaceae Atlas outright.
  if (isOutOfFamily(point.family)) return null;
  const shown = resolveAtlasLocation(point, 'public');
  const name =
    (point.acceptedName || point.canonicalName || `${point.genus ?? ''} ${point.species ?? ''}`).trim();
  if (!name) return null;
  const resolution = atlasSensitivityResolution(point);
  const genus = point.genus && point.genus !== 'Unknown' ? point.genus : null;
  return {
    occurrenceID: point.id,
    sourceRecordId: shown.policy.localityTextAllowed ? point.sourceRecordId ?? null : null,
    taxonID: point.taxonomyId ?? null,
    taxonKey: point.taxonomyId ?? name.toLowerCase(),
    scientificName: name,
    genus,
    decimalLatitude: shown.lat,
    decimalLongitude: shown.lng,
    coordinateUncertaintyInMeters:
      typeof point.coordinateUncertaintyM === 'number' ? point.coordinateUncertaintyM : null,
    countryCode: point.country || null,
    year: typeof point.year === 'number' ? point.year : null,
    month: null,
    basisOfRecord: null,
    datasetName: point.dataset || null,
    institutionCode: null,
    license: null,
    rightsHolder: null,
    references: null,
    locality: shown.policy.localityTextAllowed ? point.locality ?? null : null,
    iucnCategory: point.iucnCode ?? null,
    assessment:
      resolution === 'assessed-threatened'
        ? 'threatened'
        : resolution === 'unresolved'
          ? 'unresolved'
          : 'not-threatened',
    generalised: shown.policy.generalised,
    generalisationCellDeg: shown.policy.cellDeg,
    generalisationReason: shown.policy.reason,
    generalisationNotice: shown.policy.notice || null,
    provider: 'canonical-store',
    familyStated: !!point.family?.trim(),
  };
}

export function matchesFilters(o: ExplorerOccurrence, f: ExplorerFilters): boolean {
  if (f.taxonId && o.taxonID !== f.taxonId) return false;
  if (f.genus && o.genus !== f.genus) return false;
  if (f.scientificName && o.scientificName.toLowerCase() !== f.scientificName.toLowerCase()) return false;
  if (f.yearFrom !== null && (o.year === null || o.year < f.yearFrom)) return false;
  if (f.yearTo !== null && (o.year === null || o.year > f.yearTo)) return false;
  if (f.months.length && (o.month === null || !f.months.includes(o.month))) return false;
  return true;
}

export function queryUrl(
  base: string,
  view: Viewport,
  filters: ExplorerFilters,
  opts: { limit?: number; mode?: 'auto' | 'points' | 'clusters' } = {},
): string {
  const params = new URLSearchParams({
    bbox: bboxParam(view),
    zoom: view.zoom.toFixed(2),
    limit: String(opts.limit ?? 1000),
    mode: opts.mode ?? 'auto',
  });
  if (filters.taxonId) params.set('taxon_id', filters.taxonId);
  else if (filters.scientificName) params.set('scientific_name', filters.scientificName);
  if (filters.genus) params.set('genus', filters.genus);
  if (filters.yearFrom !== null) params.set('year_from', String(filters.yearFrom));
  if (filters.yearTo !== null) params.set('year_to', String(filters.yearTo));
  if (filters.months.length) params.set('months', filters.months.join(','));
  return `${base.replace(/\/$/, '')}/atlas/occurrences/query?${params.toString()}`;
}

/** Small LRU for viewport responses; panning back and forth should not refetch. */
export class ResponseCache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();
  constructor(
    private readonly max = 64,
    private readonly ttlMs = 120_000,
    private readonly now: () => number = () => Date.now(),
  ) {}
  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }
  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), value });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }
}

const backendCache = new ResponseCache<BackendQueryResponse>();

export type BackendOutcome =
  | { kind: 'ok'; response: BackendQueryResponse; cached: boolean }
  | { kind: 'source-unavailable'; source: BackendSource }
  | { kind: 'unreachable'; detail: string };

export async function queryBackend(
  view: Viewport,
  filters: ExplorerFilters,
  signal: AbortSignal,
  opts: { base?: string; fetchImpl?: typeof fetch } = {},
): Promise<BackendOutcome> {
  const url = queryUrl(opts.base ?? CALYX_BACKEND_BASE_URL, view, filters);
  const cached = backendCache.get(url);
  if (cached) return { kind: 'ok', response: cached, cached: true };
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { signal, headers: { accept: 'application/json' } });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error;
    return { kind: 'unreachable', detail: 'The Calyx Atlas service could not be reached.' };
  }
  if (!res.ok) {
    return { kind: 'unreachable', detail: `The Calyx Atlas service answered ${res.status}.` };
  }
  let body: BackendQueryResponse;
  try {
    body = (await res.json()) as BackendQueryResponse;
  } catch {
    return { kind: 'unreachable', detail: 'The Calyx Atlas service returned an unreadable response.' };
  }
  if (body?.contract_version !== 'oc-atlas-occurrence-query-v1' || !body.source) {
    return { kind: 'unreachable', detail: 'The Calyx Atlas service returned an unexpected contract.' };
  }
  if (body.source.state !== 'available') return { kind: 'source-unavailable', source: body.source };
  backendCache.set(url, body);
  return { kind: 'ok', response: body, cached: false };
}

/** Datasets and licences for the records currently in view, for on-map attribution. */
export function attributionOf(records: readonly ExplorerOccurrence[]): { dataset: string; count: number; licenses: string[] }[] {
  const by = new Map<string, { count: number; licenses: Set<string> }>();
  for (const r of records) {
    const key = r.datasetName ?? 'Unattributed source';
    const entry = by.get(key) ?? { count: 0, licenses: new Set<string>() };
    entry.count += 1;
    if (r.license) entry.licenses.add(r.license);
    by.set(key, entry);
  }
  return [...by.entries()]
    .map(([dataset, e]) => ({ dataset, count: e.count, licenses: [...e.licenses].sort() }))
    .sort((a, b) => b.count - a.count || a.dataset.localeCompare(b.dataset));
}
