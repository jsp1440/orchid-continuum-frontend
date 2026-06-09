import { LEGACY_ONRENDER_BASE_URL, BACKEND_BASE_URL, ATLAS_OCCURRENCES_URL } from './backendConfig';

/**
 * Base origin for the live genus/species/mycorrhizal APIs consumed here.
 *
 * Alias of {@link LEGACY_ONRENDER_BASE_URL} (the legacy onrender host) — the
 * actual host lives in the single source of truth at src/lib/backendConfig.ts.
 * Re-exported under this historical name for existing call sites.
 */
export const OC_BACKEND_BASE = LEGACY_ONRENDER_BASE_URL;

/** Atlas occurrences data endpoint — re-exported from backendConfig. */
export { ATLAS_OCCURRENCES_URL };
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
interface BackendOccurrence { id?: string | number; taxonomy_id?: string; decimal_latitude?: number; decimal_longitude?: number; latitude?: number; longitude?: number; lat?: number; lng?: number; species?: string; canonical_name?: string; scientific_name?: string; country?: string; }
function normalizeBackend(rows: BackendOccurrence[]): OccurrencePoint[] {
  const out: OccurrencePoint[] = [];
  rows.forEach((r, i) => {
    const lat = r.decimal_latitude ?? r.latitude ?? r.lat;
    const lng = r.decimal_longitude ?? r.longitude ?? r.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    out.push({ id: String(r.id ?? r.taxonomy_id ?? `oc-${i}`), lat, lng, species: r.species || r.canonical_name || r.scientific_name || 'Orchidaceae', country: r.country ?? null, source: 'continuum' });
  });
  return out;
}
export async function fetchAtlasOccurrences(limit = 500, signal?: AbortSignal): Promise<OccurrencePoint[]> {
  const primary = await getJson<BackendOccurrence[] | { results?: BackendOccurrence[]; occurrences?: BackendOccurrence[] }>(`${ATLAS_OCCURRENCES_URL}?limit=${limit}`, signal);
  if (primary.ok && primary.data) { const rows = Array.isArray(primary.data) ? primary.data : primary.data.results ?? primary.data.occurrences ?? []; return normalizeBackend(rows); }
  return [];
}
export async function fetchGenusOccurrences(genus: string, limit = 500, signal?: AbortSignal): Promise<OccurrencePoint[]> {
  if (!genus) return [];
  const q = encodeURIComponent(genus);
  const res = await getJson<BackendOccurrence[] | { results?: BackendOccurrence[]; occurrences?: BackendOccurrence[] }>(`${ATLAS_OCCURRENCES_URL}?genus=${q}&limit=${limit}`, signal);
  if (res.ok && res.data) { const rows = Array.isArray(res.data) ? res.data : res.data.results ?? res.data.occurrences ?? []; return normalizeBackend(rows); }
  return [];
}
export interface SpeciesSearchResult { taxonomy_id: string; canonical_name?: string; scientific_name?: string; genus?: string; family?: string; conservation_status?: string | null; }
export async function searchSpecies(q: string, limit = 20, signal?: AbortSignal): Promise<SpeciesSearchResult[]> {
  const { data } = await getJson<SpeciesSearchResult[] | { results?: SpeciesSearchResult[] }>(`${BACKEND_BASE_URL}/api/species/search?q=${encodeURIComponent(q)}&limit=${limit}`, signal);
  if (!data) return [];
  return Array.isArray(data) ? data : data.results ?? [];
}
export interface SpeciesDossierData { taxonomy_id: string; canonical_name?: string; scientific_name?: string; genus?: string; specific_epithet?: string; species?: string; family?: string; tribe?: string | null; subfamily?: string | null; authority?: string; common_name?: string | null; conservation_status?: string | null; iucn_code?: string | null; region?: string | null; habitat?: string | null; description?: string | null; representative_image_url?: string | null; hero_image_url?: string | null; }
export async function fetchSpeciesById(taxonomyId: string, signal?: AbortSignal): Promise<SpeciesDossierData | null> {
  const { data } = await getJson<SpeciesDossierData>(`${OC_BACKEND_BASE}/api/species/${encodeURIComponent(taxonomyId)}`, signal);
  return data;
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
function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') { const o = data as Record<string, unknown>; for (const k of ['results', 'data', 'items', 'records', 'partners', 'images']) { if (Array.isArray(o[k])) return o[k] as T[]; } }
  return [];
}
function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) { const v = o[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v); }
  return null;
}
function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return null;
}
async function getRaw<T = unknown>(path: string, signal?: AbortSignal): Promise<{ ok: boolean; data: T | null }> {
  const { ok, data } = await getJson<T>(`${OC_BACKEND_BASE}${path}`, signal, 8000);
  return { ok, data };
}
const CATTLEYA_FALLBACK: ContinuumGraphData = {
  genus: 'Cattleya', speciesCount: 113, description: 'Showy epiphytic orchids of Central & South America.', isFallback: true,
  fungi: { count: 14, summary: '14 partnerships', items: ['Tulasnella', 'Rhizoctonia', 'Ceratobasidium'], hasData: true },
  pollinators: { count: 8, summary: '8 linked', items: ['Euglossine bees', 'Bumblebees', 'Carpenter bees'], hasData: true },
  climate: { count: null, summary: 'Montane · 600–2,000m', items: ['Tropical montane', '600–2,000 m elevation'], hasData: true },
  geography: { count: 1202, summary: '21 countries · 1,202 records', items: ['Brazil', 'Colombia', 'Venezuela'], hasData: true },
  conservation: { count: 54, summary: '12 EN · 8 VU · 34 LC', items: ['12 Endangered', '8 Vulnerable', '34 Least Concern'], hasData: true, worstStatus: 'EN' },
  cultivation: { count: 23, summary: '23 grower records', items: ['Cattleya labiata', 'Cattleya mossiae', 'Cattleya warscewiczii'], hasData: true },
  knowledge: { count: 156, summary: '156 literature records', items: ['Taxonomic revisions', 'Field surveys', 'OREP extractions'], hasData: true },
};
function fungiNode(data: unknown): WebNodeData {
  const rows = asArray<Record<string, unknown>>(data); if (!rows.length) return EMPTY_NODE;
  const names = Array.from(new Set(rows.map((r) => pickStr(r, ['fungal_taxon', 'fungus', 'genus', 'taxon', 'name'])).filter((s): s is string => !!s)));
  const n = rows.length; return { count: n, summary: `${n} partnership${n === 1 ? '' : 's'}`, items: names.slice(0, 3), hasData: true };
}
function pollinatorNode(data: unknown): WebNodeData {
  const rows = asArray<Record<string, unknown>>(data); if (!rows.length) return EMPTY_NODE;
  const guilds = Array.from(new Set(rows.map((r) => pickStr(r, ['pollinator_guild', 'guild', 'pollinator', 'name'])).filter((s): s is string => !!s)));
  const n = rows.length; return { count: n, summary: `${n} linked`, items: guilds.slice(0, 3), hasData: true };
}
function climateNode(data: unknown): WebNodeData {
  if (!data || typeof data !== 'object') return EMPTY_NODE;
  const rows = asArray<Record<string, unknown>>(data); const o = (rows[0] ?? data) as Record<string, unknown>;
  const zone = pickStr(o, ['climate_zone', 'zone', 'biome', 'primary_zone']);
  const lo = pickNum(o, ['elevation_min', 'min_elevation', 'elev_min']); const hi = pickNum(o, ['elevation_max', 'max_elevation', 'elev_max']);
  if (!zone && lo == null && hi == null) return EMPTY_NODE;
  const elev = lo != null && hi != null ? `${lo.toLocaleString()}–${hi.toLocaleString()}m` : '';
  const summary = [zone, elev].filter(Boolean).join(' · ') || 'Profile available';
  return { count: null, summary, items: [zone, elev].filter((s): s is string => !!s), hasData: true };
}
function geographyNode(data: unknown): WebNodeData {
  if (!data || typeof data !== 'object') return EMPTY_NODE;
  const o = data as Record<string, unknown>;
  // Handle atlas harvester shape: { count: N, occurrences: [...] }
  const atlasCount = typeof o.count === 'number' ? o.count : null;
  const atlasOccurrences = Array.isArray(o.occurrences) ? o.occurrences : null;
  if (atlasCount != null || atlasOccurrences != null) {
    const total = atlasCount ?? (atlasOccurrences?.length ?? 0);
    if (total === 0) return EMPTY_NODE;
    // Derive country list from occurrence records.
    const countryCounts = new Map<string, number>();
    for (const pt of (atlasOccurrences ?? [])) {
      const c = (pt as Record<string, unknown>).country;
      if (typeof c === 'string' && c.trim()) {
        countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
      }
    }
    const topCountries = [...countryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);
    const countryCount = countryCounts.size;
    const parts: string[] = [];
    if (countryCount > 0) parts.push(`${countryCount} countries`);
    parts.push(`${total.toLocaleString()} records`);
    const items = topCountries.length > 0 ? topCountries : parts;
    return { count: total, summary: parts.join(' · '), items, hasData: true };
  }
  // Legacy summary shape: { countries, records }
  const countries = pickNum(o, ['countries', 'country_count', 'n_countries']); const records = pickNum(o, ['records', 'occurrences', 'count', 'total']);
  if (countries == null && records == null) return EMPTY_NODE;
  const parts: string[] = []; if (countries != null) parts.push(`${countries} countries`); if (records != null) parts.push(`${records.toLocaleString()} records`);
  return { count: records ?? countries ?? 0, summary: parts.join(' · '), items: parts, hasData: true };
}
function conservationNode(data: unknown): WebNodeData {
  if (!data || typeof data !== 'object') return EMPTY_NODE;
  const o = data as Record<string, unknown>; const breakdown = (o.breakdown ?? o.statuses ?? o) as Record<string, unknown>;
  const cr = pickNum(breakdown, ['CR', 'cr', 'critically_endangered']) ?? 0; const en = pickNum(breakdown, ['EN', 'en', 'endangered']) ?? 0;
  const vu = pickNum(breakdown, ['VU', 'vu', 'vulnerable']) ?? 0; const lc = pickNum(breakdown, ['LC', 'lc', 'least_concern']) ?? 0;
  const total = cr + en + vu + lc; if (total === 0) return EMPTY_NODE;
  const parts: string[] = []; if (cr) parts.push(`${cr} CR`); if (en) parts.push(`${en} EN`); if (vu) parts.push(`${vu} VU`); if (lc) parts.push(`${lc} LC`);
  const worst: WebNodeData['worstStatus'] = cr ? 'CR' : en ? 'EN' : vu ? 'VU' : 'LC';
  return { count: total, summary: parts.join(' · '), items: parts, hasData: true, worstStatus: worst };
}
function cultivationNode(data: unknown): WebNodeData {
  const rows = asArray<Record<string, unknown>>(data); const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const n = rows.length || pickNum(o, ['count', 'records', 'total']) || 0; if (!n) return EMPTY_NODE;
  const names = rows.map((r) => pickStr(r, ['species', 'name', 'canonical_name'])).filter((s): s is string => !!s);
  return { count: n, summary: `${n} grower record${n === 1 ? '' : 's'}`, items: names.slice(0, 3), hasData: true };
}
function knowledgeNode(data: unknown): WebNodeData {
  const rows = asArray<Record<string, unknown>>(data); const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const n = rows.length || pickNum(o, ['count', 'records', 'total', 'literature']) || 0; if (!n) return EMPTY_NODE;
  const titles = rows.map((r) => pickStr(r, ['title', 'reference', 'citation', 'source'])).filter((s): s is string => !!s);
  return { count: n, summary: `${n.toLocaleString()} literature record${n === 1 ? '' : 's'}`, items: titles.slice(0, 3), hasData: true };
}
/**
 * Fetch the live knowledge-graph data for a given genus.
 *
 * @param genus  The authoritative Genus of the Day — MUST come from
 *               DailyGenusContext (via useDailyGenus), never independently
 *               fetched here. Passing an empty string triggers the explicit
 *               system-unavailable diagnostic path.
 */
export async function fetchContinuumGraph(
  genus: string,
  signal?: AbortSignal,
): Promise<ContinuumGraphData> {
  if (!genus) {
    // Explicit diagnostic fallback — only reached if caller passes empty string.
    console.warn(
      '[ContinuumWeb] fetchContinuumGraph called with empty genus. ' +
      'Returning Cattleya fallback as a system-unavailable diagnostic.',
    );
    return { ...CATTLEYA_FALLBACK, isFallback: true };
  }
  const g = genus;
  const q = encodeURIComponent(g);

  // Fetch supplemental metadata (species_count, description) from /api/genus/daily.
  // This is OPTIONAL — it does NOT determine the genus, only enriches the label.
  let speciesCount: number | null = null;
  let description = `Daily featured orchid genus from the Continuum taxonomy.`;
  try {
    const daily = await fetchGenusOfDay(signal);
    if (daily && daily.genus.toLowerCase() === g.toLowerCase()) {
      speciesCount = typeof daily.species_count === 'number' ? daily.species_count : null;
      description = daily.common_name || description;
    }
  } catch { /* supplemental only — ignore failures */ }

  const [myc, pol, cli, geo, con, cul, lit] = await Promise.all([
    getRaw(`/api/species/mycorrhizal?genus=${q}`, signal),
    getRaw(`/api/species/pollinators?genus=${q}`, signal),
    getRaw(`/api/species/climate?genus=${q}`, signal),
    getJson<{ count?: number; occurrences?: unknown[] }>(`${ATLAS_OCCURRENCES_URL}?genus=${q}&limit=500`, signal, 8000),
    getRaw(`/api/species/conservation?genus=${q}`, signal),
    getRaw(`/api/species/cultivation?genus=${q}`, signal),
    getRaw(`/api/species/literature?genus=${q}`, signal),
  ]);
  return {
    genus: g,
    speciesCount,
    description,
    isFallback: false,
    fungi: myc.ok ? fungiNode(myc.data) : EMPTY_NODE,
    pollinators: pol.ok ? pollinatorNode(pol.data) : EMPTY_NODE,
    climate: cli.ok ? climateNode(cli.data) : EMPTY_NODE,
    geography: geo.ok ? geographyNode(geo.data) : EMPTY_NODE,
    conservation: con.ok ? conservationNode(con.data) : EMPTY_NODE,
    cultivation: cul.ok ? cultivationNode(cul.data) : EMPTY_NODE,
    knowledge: lit.ok ? knowledgeNode(lit.data) : EMPTY_NODE,
  };
}
