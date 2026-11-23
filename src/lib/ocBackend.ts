const env = import.meta.env as Record<string, string | undefined>;

/**
 * Orchid Continuum Public API.
 *
 * Do not route this through VITE_BACKEND_BASE_URL, because that variable may be
 * used by other services. These OC data calls must point at the Orchid
 * Continuum backend that serves species, atlas, images, diagnostics, graph,
 * and mycorrhizal endpoints.
 */
export const OC_BACKEND_BASE = (
  env.VITE_ORCHID_CONTINUUM_API_BASE_URL ||
  env.VITE_OC_API_BASE_URL ||
  'https://orchid-continuum-public-api.onrender.com'
).replace(/\/$/, '');

/** Atlas occurrences data endpoint. */
export const ATLAS_OCCURRENCES_URL = `${OC_BACKEND_BASE}/atlas/occurrences`;

const DEFAULT_TIMEOUT = 12_000;
async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener('abort', () => controller.abort()); }
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
  finally { clearTimeout(timer); }
}

export interface GenusDaily { genus: string; species_count: number; common_name: string | null; conservation_status: string | null; image_url: string | null; date: string; is_demo: boolean; }
export async function fetchGenusOfDay(signal?: AbortSignal): Promise<GenusDaily | null> {
  const { data } = await getJson<GenusDaily>(`${OC_BACKEND_BASE}/api/genus/daily`, signal);
  return data;
}

export interface OccurrencePoint { id: string; lat: number; lng: number; species: string; country: string | null; source: 'continuum'; }
interface BackendOccurrence { id?: string | number; taxonomy_id?: string; decimal_latitude?: number; decimal_longitude?: number; decimalLatitude?: number; decimalLongitude?: number; latitude?: number; longitude?: number; lat?: number; lng?: number; lon?: number; x?: number; y?: number; species?: string; canonical_name?: string; scientific_name?: string; country?: string; properties?: Record<string, unknown>; }
function numOf(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
function extractRows<T = BackendOccurrence>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['results', 'occurrences', 'features', 'data', 'items', 'records', 'rows', 'points']) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}
function hasOccurrenceRowsShape(payload: unknown): boolean {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  return ['results', 'occurrences', 'features', 'data', 'items', 'records', 'rows', 'points']
    .some((key) => Array.isArray(o[key]));
}
function normalizeBackend(rows: unknown[]): OccurrencePoint[] {
  const out: OccurrencePoint[] = [];
  rows.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const r = raw as BackendOccurrence;
    const p = (r.properties && typeof r.properties === 'object' ? r.properties : {}) as Record<string, unknown>;
    const lat = numOf(r.decimal_latitude) ?? numOf(r.decimalLatitude) ?? numOf(r.latitude) ?? numOf(r.lat) ?? numOf(r.y)
      ?? numOf(p.decimal_latitude) ?? numOf(p.latitude) ?? numOf(p.lat);
    const lng = numOf(r.decimal_longitude) ?? numOf(r.decimalLongitude) ?? numOf(r.longitude) ?? numOf(r.lng) ?? numOf(r.lon) ?? numOf(r.x)
      ?? numOf(p.decimal_longitude) ?? numOf(p.longitude) ?? numOf(p.lng);
    if (lat === undefined || lng === undefined) return;
    const species = r.species || r.canonical_name || r.scientific_name
      || (p.species as string) || (p.canonical_name as string) || (p.scientific_name as string) || 'Orchidaceae';
    const country = (r.country ?? (p.country as string | undefined) ?? null) as string | null;
    out.push({ id: String(r.id ?? r.taxonomy_id ?? `oc-${i}`), lat, lng, species, country, source: 'continuum' });
  });
  return out;
}

export async function fetchAtlasOccurrences(limit = 500, signal?: AbortSignal): Promise<OccurrencePoint[]> {
  const primary = await getJson<unknown>(`${ATLAS_OCCURRENCES_URL}?limit=${limit}`, signal);
  if (primary.ok && primary.data) return normalizeBackend(extractRows(primary.data));
  return [];
}
export async function fetchGenusOccurrences(genus: string, limit = 500, signal?: AbortSignal): Promise<OccurrencePoint[]> {
  const outcome = await fetchGenusOccurrencesOutcome(genus, limit, signal);
  return outcome.status === 'ok' ? outcome.results : [];
}

export type GenusOccurrencesOutcome =
  | { status: 'ok'; results: OccurrencePoint[] }
  | { status: 'unavailable'; httpStatus: number };

/** Keep an Atlas outage distinct from a successful query with zero rows. */
export async function fetchGenusOccurrencesOutcome(
  genus: string,
  limit = 500,
  signal?: AbortSignal,
): Promise<GenusOccurrencesOutcome> {
  if (!genus) return { status: 'ok', results: [] };
  const q = encodeURIComponent(genus);
  const res = await getJson<unknown>(`${ATLAS_OCCURRENCES_URL}?genus=${q}&limit=${limit}`, signal);
  if (!res.ok || res.data === null) return { status: 'unavailable', httpStatus: res.status };
  if (!hasOccurrenceRowsShape(res.data)) return { status: 'unavailable', httpStatus: res.status };
  const rows = extractRows(res.data);
  const results = normalizeBackend(rows);
  if (rows.length > 0 && results.length === 0) return { status: 'unavailable', httpStatus: res.status };
  return { status: 'ok', results };
}

export interface SpeciesSearchResult { taxonomy_id: string; canonical_name?: string; scientific_name?: string; genus?: string; family?: string; conservation_status?: string | null; }
/**
 * Outcome of a species search, keeping a failed request apart from a genuine
 * empty answer. A network error, timeout, non-2xx status or a 2xx body that
 * carries no result list is `unavailable`: the service did not answer the
 * question, so nothing may be rendered as "no species matched".
 */
export type SpeciesSearchOutcome =
  | { status: 'ok'; results: SpeciesSearchResult[] }
  | { status: 'unavailable'; httpStatus: number };
export async function searchSpeciesOutcome(q: string, limit = 20, signal?: AbortSignal): Promise<SpeciesSearchOutcome> {
  const { ok, status, data } = await getJson<unknown>(`${OC_BACKEND_BASE}/api/species/search?q=${encodeURIComponent(q)}&limit=${limit}`, signal);
  if (!ok) return { status: 'unavailable', httpStatus: status };
  if (Array.isArray(data)) return { status: 'ok', results: data as SpeciesSearchResult[] };
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return { status: 'ok', results: (data as { results: SpeciesSearchResult[] }).results };
  }
  return { status: 'unavailable', httpStatus: status };
}
/**
 * Best-effort lookup for callers that only enrich a page and already treat
 * "no match" and "could not look it up" alike (they show no enrichment). A
 * search surface that tells a visitor what matched must use
 * searchSpeciesOutcome instead.
 */
export async function searchSpecies(q: string, limit = 20, signal?: AbortSignal): Promise<SpeciesSearchResult[]> {
  const outcome = await searchSpeciesOutcome(q, limit, signal);
  return outcome.status === 'ok' ? outcome.results : [];
}

export interface SpeciesDossierData { taxonomy_id: string; canonical_name?: string; scientific_name?: string; genus?: string; specific_epithet?: string; species?: string; family?: string; tribe?: string | null; subfamily?: string | null; authority?: string; common_name?: string | null; conservation_status?: string | null; iucn_code?: string | null; region?: string | null; habitat?: string | null; description?: string | null; representative_image_url?: string | null; hero_image_url?: string | null; }
/**
 * Outcome of looking a species record up by the public API's taxonomy_id.
 *
 * `reported_absent` means the species service itself answered 404/410 with a
 * JSON body of its own. It is NOT proof that no such taxon exists: this detail
 * endpoint 404s in production even for real ids its own search links to, so
 * callers must treat it like "no answer" and never as evidence of absence.
 * A bare framework or proxy route miss (`{"detail":"Not Found"}`,
 * `{"message":"Not Found"}`, an HTML or empty body), any other status, a
 * network error, a timeout or a 2xx body that is not a record is `unavailable`.
 */
export type SpeciesLookupOutcome =
  | { state: 'found'; data: SpeciesDossierData }
  | { state: 'reported_absent'; httpStatus: number }
  | { state: 'unavailable'; httpStatus: number };

/** A 404 body that names no record at all: a framework/proxy "no such route" answer. */
export function isRouteMissBody(body: string): boolean {
  const text = body.trim();
  if (!text) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return true; // HTML or plain text from a proxy or static host
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return true;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return true;
  const message = record.detail ?? record.message ?? record.error;
  return keys.length === 1 && typeof message === 'string' && /^not found\.?$/i.test(message.trim());
}

export async function lookupSpeciesById(taxonomyId: string, signal?: AbortSignal): Promise<SpeciesLookupOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener('abort', () => controller.abort()); }
  try {
    const res = await fetch(`${OC_BACKEND_BASE}/api/species/${encodeURIComponent(taxonomyId)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as unknown;
      return data && typeof data === 'object' && !Array.isArray(data)
        ? { state: 'found', data: data as SpeciesDossierData }
        : { state: 'unavailable', httpStatus: res.status };
    }
    if (res.status === 404 || res.status === 410) {
      const body = await res.text().catch(() => '');
      if (!isRouteMissBody(body)) return { state: 'reported_absent', httpStatus: res.status };
    }
    return { state: 'unavailable', httpStatus: res.status };
  } catch {
    return { state: 'unavailable', httpStatus: 0 };
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchSpeciesById(taxonomyId: string, signal?: AbortSignal): Promise<SpeciesDossierData | null> {
  const outcome = await lookupSpeciesById(taxonomyId, signal);
  return outcome.state === 'found' ? outcome.data : null;
}

export interface MycorrhizalPartner { fungal_taxon?: string; family?: string; type?: string; note?: string; }
export async function fetchMycorrhizal(taxonomyId: string, signal?: AbortSignal): Promise<{ status: number; partners: MycorrhizalPartner[] }> {
  const { ok, status, data } = await getJson<MycorrhizalPartner[] | { partners?: MycorrhizalPartner[] }>(`${OC_BACKEND_BASE}/api/mycorrhizal/${encodeURIComponent(taxonomyId)}`, signal);
  if (!ok || !data) return { status, partners: [] };
  const partners = Array.isArray(data) ? data : data.partners ?? [];
  return { status, partners };
}
export const MYCORRHIZAL_FALLBACK_COUNT = 462;
export async function fetchMycorrhizalStats(signal?: AbortSignal): Promise<number> {
  const { ok, data } = await getJson<{ associations?: number; total_associations?: number; count?: number; documented?: number }>(`${OC_BACKEND_BASE}/api/mycorrhizal/stats`, signal);
  if (ok && data) { const n = data.associations ?? data.total_associations ?? data.count ?? data.documented; if (typeof n === 'number' && n > 0) return n; }
  return MYCORRHIZAL_FALLBACK_COUNT;
}
export const GENERA_FALLBACK_COUNT = 744;
export async function fetchGeneraCount(signal?: AbortSignal): Promise<number> {
  const { ok, data } = await getJson<{ genera_count?: number; genus_count?: number; distinct_genera?: number; genera?: number; count?: number }>(`${OC_BACKEND_BASE}/api/atlas/stats`, signal);
  if (ok && data) { const n = data.genera_count ?? data.genus_count ?? data.distinct_genera ?? data.genera ?? data.count; if (typeof n === 'number' && n > 0) return n; }
  return GENERA_FALLBACK_COUNT;
}

export interface WebNodeData { count: number | null; summary: string; items: string[]; hasData: boolean; worstStatus?: 'CR' | 'EN' | 'VU' | 'LC' | null; }
export interface ContinuumGraphData { genus: string; speciesCount: number | null; description: string; isFallback: boolean; fungi: WebNodeData; pollinators: WebNodeData; climate: WebNodeData; geography: WebNodeData; conservation: WebNodeData; cultivation: WebNodeData; knowledge: WebNodeData; }
const EMPTY_NODE: WebNodeData = { count: null, summary: 'No data yet', items: [], hasData: false };
function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) { const v = o[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v); }
  return null;
}
function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return null;
}
function mapNode(raw: unknown, opts: { unit?: string; climate?: boolean } = {}): WebNodeData {
  if (!raw || typeof raw !== 'object') return EMPTY_NODE;
  const o = raw as Record<string, unknown>;
  const status = typeof o.status === 'string' ? o.status.toLowerCase() : '';
  const count = pickNum(o, ['count', 'total', 'records']);
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items: string[] = [];
  for (const it of rawItems) {
    if (items.length >= 6) break;
    if (typeof it === 'string') { if (it.trim()) items.push(it.trim()); continue; }
    if (it && typeof it === 'object') {
      const r = it as Record<string, unknown>;
      const s = pickStr(r, ['name', 'country', 'title', 'reference', 'citation', 'label', 'species']);
      if (s) { items.push(s); continue; }
      const mn = pickNum(r, ['min']); const mx = pickNum(r, ['max']);
      if (mn != null && mx != null) items.push(`${mn.toLocaleString()}–${mx.toLocaleString()} m`);
    }
  }
  const hasData = status === 'available' || (count != null && count > 0) || items.length > 0;
  if (!hasData) return EMPTY_NODE;
  let summary: string;
  if (opts.climate) {
    summary = items.find((s) => /m$/.test(s)) || (count != null ? `${count.toLocaleString()} records` : 'Profile available');
  } else if (count != null) {
    const unit = opts.unit || 'record';
    summary = `${count.toLocaleString()} ${unit}${count === 1 ? '' : 's'}`;
  } else {
    summary = 'Data available';
  }
  return { count: count ?? null, summary, items: items.slice(0, 3), hasData: true };
}

export async function fetchContinuumGraph(genus: string, signal?: AbortSignal): Promise<ContinuumGraphData> {
  // No local fallback graph: an empty genus is a caller error (the canonical
  // caller, fetchFeaturedTaxonContinuum, validates the genus first and treats a
  // rejection as "relationships unavailable").
  if (!genus) throw new Error('fetchContinuumGraph requires a genus');
  const g = genus;
  const q = encodeURIComponent(g);
  let speciesCount: number | null = null;
  const description = `Daily featured orchid genus from the Continuum taxonomy.`;

  const { ok, data } = await getJson<{
    genus?: string;
    hub?: { species_count?: number };
    nodes?: Record<string, unknown>;
  }>(`${OC_BACKEND_BASE}/api/continuum/graph?genus=${q}`, signal, 9000);

  const nodes: Record<string, unknown> = ok && data && data.nodes && typeof data.nodes === 'object' ? data.nodes : {};
  if (speciesCount == null && typeof data?.hub?.species_count === 'number') speciesCount = data.hub.species_count;

  return {
    genus: ok && data?.genus ? data.genus : g,
    speciesCount,
    description,
    isFallback: false,
    knowledge: mapNode(nodes.knowledge, { unit: 'species' }),
    geography: mapNode(nodes.geography, { unit: 'record' }),
    climate: mapNode(nodes.climate, { climate: true }),
    pollinators: mapNode(nodes.pollinators, { unit: 'link' }),
    fungi: mapNode(nodes.fungi, { unit: 'partnership' }),
    conservation: mapNode(nodes.conservation, { unit: 'record' }),
    cultivation: mapNode(nodes.cultivation, { unit: 'record' }),
  };
}
