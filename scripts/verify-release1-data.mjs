#!/usr/bin/env node
/**
 * Release 1 data verifier (read-only).
 *
 * Journeys J3 (species search and taxon pages) and J9 (Atlas) read from two
 * data planes the development sandbox cannot reach:
 *
 *   1. the public species API (`src/lib/api.ts` → `speciesApi`), configured
 *      with VITE_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL);
 *   2. the Supabase REST tables `species`, `atlas_occurrences` and
 *      `species_mycorrhizal` (`src/lib/orchidContinuum.ts`), configured with
 *      VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 *
 * This script issues GET requests only. It writes nothing, mutates nothing,
 * and never hard-codes a URL, key or expected count: every number in the report
 * is one the target returned during this run.
 *
 * Each check ends in exactly one state:
 *   pass    — reachable and the payload is what the member-facing UI needs;
 *   fail    — reachable, but the answer is wrong (empty for a known taxon,
 *             non-JSON "200", a match for a nonsense name, a coordinate key in
 *             a taxon-page payload, a rejected anon key, a missing column…);
 *   outage  — could not get an answer (network error, timeout, 5xx, 429);
 *   skipped — not configured, or a prerequisite check produced nothing to use.
 *
 * Privacy: the report carries status codes, counts, key NAMES and key PATHS.
 * It never carries payload values, so no coordinate or locality text can reach
 * a CI log through it, and the anon key is scrubbed from every string.
 *
 * Usage:
 *   VITE_API_BASE_URL=https://… VITE_SUPABASE_URL=https://… \
 *   VITE_SUPABASE_ANON_KEY=… node scripts/verify-release1-data.mjs [--out report.json]
 *
 * Exit codes: 0 PASS · 1 FAIL · 2 NOT_CONFIGURED · 3 OUTAGE.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const VERIFIER_VERSION = 1;

/** Genera the member-facing search is expected to know. Queries, not counts. */
export const DEFAULT_KNOWN_TAXA = ['Cattleya', 'Dracula'];

/** A binomial no orchid carries. A match for it is a fabricated answer. */
export const DEFAULT_NONSENSE_TAXON = 'Zzyzxorchis nonexistens';

export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * The column lists the UI selects (src/lib/orchidContinuum.ts). Selecting them
 * verbatim is what catches schema drift: PostgREST answers 400 for a column
 * that no longer exists, which is exactly how the Atlas goes blank. A unit test
 * keeps these in lockstep with the source.
 */
export const UI_SELECTS = {
  species:
    'id, slug, genus, epithet, common_name, authority, family, subfamily, tribe, region, countries, habitat, growth_form, ecology, description, conservation_status, iucn_code, image_url, occurrences, pollinators, traits',
  atlas_occurrences:
    'id, scientific_name, accepted_name, genus, species, lat, lng, elevation_m, country, region, locality, habitat, biome, year, source_dataset, source_record_id, media_url, verified, coordinate_uncertainty_m, pollinator_data, mycorrhizal_data, species_id',
  species_mycorrhizal:
    'id, species_id, scientific_name, fungal_taxon, fungal_family, association_type, note, source',
};

/**
 * How a coordinate key in a table payload is judged.
 *
 * `atlas_occurrences` and `species.occurrences` are the raw inputs to the Atlas
 * map; every rendering path generalises them through
 * src/features/atlas-next/sensitivity.ts before drawing. Their coordinate keys
 * are reported, not failed. `species_mycorrhizal` and the species API feed text
 * surfaces that have no business carrying a coordinate, so a key there fails.
 */
const TABLE_COORDINATE_POLICY = {
  species: 'expected-raw-atlas-input',
  atlas_occurrences: 'expected-raw-atlas-input',
  species_mycorrhizal: 'forbidden',
};

/** Tables whose emptiness breaks a Release 1 journey outright. */
const TABLE_REQUIRED_NON_EMPTY = {
  species: true,
  atlas_occurrences: true,
  // The UI has an honest "no partners linked yet" state for this table.
  species_mycorrhizal: false,
};

// ---------------------------------------------------------------------------
// Coordinate-key detection
// ---------------------------------------------------------------------------

const COORDINATE_KEYS = new Set([
  'lat',
  'lon',
  'lng',
  'latitude',
  'longitude',
  'latlng',
  'latlon',
  'lnglat',
  'lonlat',
  'decimallatitude',
  'decimallongitude',
  'verbatimlatitude',
  'verbatimlongitude',
  'verbatimcoordinates',
  'geometry',
  'geom',
  'geojson',
  'coordinates',
  'coords',
  'footprintwkt',
  'wkt',
]);

/** `decimal_latitude`, `decimalLatitude` and `Decimal-Latitude` are one key. */
export function isCoordinateKey(key) {
  if (typeof key !== 'string') return false;
  return COORDINATE_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ''));
}

/**
 * Every JSON path at which a coordinate-bearing key appears. Paths only — the
 * values are never returned, so a caller cannot accidentally log a locality.
 */
export function findCoordinateKeyPaths(value, path = '$', out = [], seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 32) return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, i) => findCoordinateKeyPaths(item, `${path}[${i}]`, out, seen, depth + 1));
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isCoordinateKey(key)) out.push(childPath);
    findCoordinateKeyPaths(child, childPath, out, seen, depth + 1);
  }
  return out;
}

/** Distinct coordinate key names, for a compact report line. */
function distinctKeyNames(paths) {
  return [...new Set(paths.map((p) => p.split('.').pop().replace(/\[\d+\]$/, '')))].sort();
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Same rule as isUsableApiOrigin in src/lib/api.ts: absolute http(s) or nothing. */
export function usableOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  } catch {
    return '';
  }
  return value.trim().replace(/\/+$/, '');
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[token.slice(2)] = next;
        i++;
      } else {
        args[token.slice(2)] = 'true';
      }
    }
  }
  return args;
}

/**
 * Resolve configuration from CLI args, then from the environment variable
 * names the app itself reads. Nothing falls back to a literal.
 */
export function resolveConfig(argv = [], env = {}) {
  const args = parseArgs(argv);
  const listOf = (raw, fallback) =>
    raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : fallback;
  const timeout = Number(args['timeout-ms'] ?? env.VERIFY_TIMEOUT_MS);
  return {
    apiBase: usableOrigin(args['api-base'] ?? env.VITE_API_BASE_URL ?? env.NEXT_PUBLIC_API_BASE_URL),
    rawApiBase: args['api-base'] ?? env.VITE_API_BASE_URL ?? env.NEXT_PUBLIC_API_BASE_URL ?? '',
    supabaseUrl: usableOrigin(args['supabase-url'] ?? env.VITE_SUPABASE_URL),
    rawSupabaseUrl: args['supabase-url'] ?? env.VITE_SUPABASE_URL ?? '',
    anonKey: String(args['supabase-anon-key'] ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
    knownTaxa: listOf(args.taxa, DEFAULT_KNOWN_TAXA),
    nonsenseTaxon: args.nonsense || DEFAULT_NONSENSE_TAXON,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    out: args.out || '',
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * One GET. Never throws. The body is parsed only when the server says it is
 * JSON: a Render static site answers unknown paths with the SPA shell at 200,
 * and a verifier that believed that would report HTML as data.
 */
export async function httpGet(fetchImpl, url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
      redirect: 'follow',
    });
    const contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    const contentRange = (res.headers && res.headers.get && res.headers.get('content-range')) || '';
    const text = await res.text();
    const isJson = /json/i.test(contentType);
    let json;
    let jsonError = false;
    if (isJson && text.length) {
      try {
        json = JSON.parse(text);
      } catch {
        jsonError = true;
      }
    }
    return {
      kind: 'response',
      status: res.status,
      contentType,
      contentRange,
      isJson: isJson && !jsonError,
      json,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const aborted = controller.signal.aborted || (error && error.name === 'AbortError');
    return {
      kind: aborted ? 'timeout' : 'network-error',
      message: aborted ? `no response within ${timeoutMs} ms` : String((error && error.message) || error),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** An outage is "no answer", which is a different fact from "a wrong answer". */
export function outageOf(res) {
  if (res.kind === 'timeout') return { observation: 'timeout', detail: res.message };
  if (res.kind === 'network-error') return { observation: 'unreachable', detail: res.message };
  if (res.status >= 500) return { observation: `http-${res.status}`, detail: 'server error' };
  if (res.status === 429) return { observation: 'rate-limited', detail: 'HTTP 429' };
  // A refusal the target itself issued is JSON (PostgREST and the species API
  // both answer JSON). A plain-text or HTML 401/403/407 comes from something in
  // between — an egress proxy, a WAF, a challenge page — and says nothing about
  // the data. Calling it a data failure would be a false red.
  if ([401, 403, 407].includes(res.status) && !res.isJson) {
    return { observation: 'blocked-before-target', detail: `non-JSON HTTP ${res.status} from an intermediary; the target did not answer` };
  }
  return null;
}

function check(id, fields) {
  return { id, ...fields };
}

function transportFields(res) {
  return res.kind === 'response'
    ? { httpStatus: res.status, contentType: res.contentType || null, latencyMs: res.latencyMs }
    : { httpStatus: null, latencyMs: res.latencyMs };
}

// ---------------------------------------------------------------------------
// Species API checks (J3)
// ---------------------------------------------------------------------------

function nameOf(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.canonical_name || [entry.genus, entry.specific_epithet].filter(Boolean).join(' ') || '');
}

export async function checkSearch(fetchImpl, cfg, taxon) {
  const url = `${cfg.apiBase}/api/species/search?q=${encodeURIComponent(taxon)}`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs });
  const id = `species-api.search:${taxon}`;
  const base = { journey: 'J3', endpoint: '/api/species/search', query: taxon, ...transportFields(res) };
  const outage = outageOf(res);
  if (outage) return { check: check(id, { ...base, status: 'outage', ...outage }), sampleName: '' };
  if (res.status === 404) {
    return { check: check(id, { ...base, status: 'fail', observation: 'not-found', detail: 'search answered 404 for a known genus' }), sampleName: '' };
  }
  if (res.status !== 200) {
    return { check: check(id, { ...base, status: 'fail', observation: `http-${res.status}` }), sampleName: '' };
  }
  if (!res.isJson) {
    return {
      check: check(id, { ...base, status: 'fail', observation: 'non-json', detail: 'HTTP 200 without a JSON body (likely the SPA shell or a proxy page)' }),
      sampleName: '',
    };
  }
  if (!Array.isArray(res.json)) {
    return {
      check: check(id, { ...base, status: 'fail', observation: 'wrong-shape', detail: 'the UI maps the body as an array; this body is not one' }),
      sampleName: '',
    };
  }
  const coordinatePaths = findCoordinateKeyPaths(res.json);
  const observedCount = res.json.length;
  const needle = taxon.toLowerCase();
  const matching = res.json.filter((e) => nameOf(e).toLowerCase().includes(needle) || String(e?.genus || '').toLowerCase() === needle);
  const withTaxonomyId = res.json.filter((e) => e && typeof e.taxonomy_id === 'string' && e.taxonomy_id);
  const fields = {
    ...base,
    observedCount,
    matchingCount: matching.length,
    withTaxonomyIdCount: withTaxonomyId.length,
    coordinateKeyPaths: coordinatePaths.slice(0, 20),
  };
  if (coordinatePaths.length) {
    return {
      check: check(id, { ...fields, status: 'fail', observation: 'coordinate-keys-present', detail: `taxon-search payload carries ${distinctKeyNames(coordinatePaths).join(', ')}` }),
      sampleName: nameOf(matching[0]),
    };
  }
  if (observedCount === 0) {
    return { check: check(id, { ...fields, status: 'fail', observation: 'empty', detail: 'reachable, but no results for a known genus' }), sampleName: '' };
  }
  if (matching.length === 0) {
    return {
      check: check(id, { ...fields, status: 'fail', observation: 'present-but-unrelated', detail: 'results returned, none named for the queried genus' }),
      sampleName: '',
    };
  }
  const sample = matching.find((e) => withTaxonomyId.includes(e)) || matching[0];
  return { check: check(id, { ...fields, status: 'pass', observation: 'present' }), sampleName: nameOf(sample) };
}

function looksLikeTaxonomy(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const hasId = typeof body.taxonomy_id === 'string' && body.taxonomy_id.length > 0;
  const hasName = Boolean(body.canonical_name || body.genus);
  return hasId && hasName;
}

function looksLikeNotFound(body) {
  if (body === null) return true;
  if (Array.isArray(body)) return body.length === 0;
  if (typeof body !== 'object') return false;
  const text = [body.detail, body.error, body.message, body.status].filter((v) => typeof v === 'string').join(' ');
  return /not[\s_-]*found|no such|unknown taxon/i.test(text);
}

export async function checkByName(fetchImpl, cfg, name, sourceCheckId) {
  const id = `species-api.by-name:${name || '(none)'}`;
  const base = { journey: 'J3', endpoint: '/api/species/by-name/{name}', query: name || null, derivedFrom: sourceCheckId };
  if (!name) {
    return check(id, { ...base, status: 'skipped', observation: 'no-name-to-look-up', detail: `${sourceCheckId} produced no matching name` });
  }
  const url = `${cfg.apiBase}/api/species/by-name/${encodeURIComponent(name)}`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs });
  const fields = { ...base, ...transportFields(res) };
  const outage = outageOf(res);
  if (outage) return check(id, { ...fields, status: 'outage', ...outage });
  if (res.status === 404) {
    return check(id, { ...fields, status: 'fail', observation: 'not-found', detail: 'a name returned by search is not resolvable by the taxon page' });
  }
  if (res.status !== 200) return check(id, { ...fields, status: 'fail', observation: `http-${res.status}` });
  if (!res.isJson) return check(id, { ...fields, status: 'fail', observation: 'non-json' });
  const coordinatePaths = findCoordinateKeyPaths(res.json);
  const withPaths = { ...fields, coordinateKeyPaths: coordinatePaths.slice(0, 20) };
  if (coordinatePaths.length) {
    return check(id, {
      ...withPaths,
      status: 'fail',
      observation: 'coordinate-keys-present',
      detail: `taxon-page payload carries ${distinctKeyNames(coordinatePaths).join(', ')}`,
    });
  }
  if (!looksLikeTaxonomy(res.json)) {
    return check(id, { ...withPaths, status: 'fail', observation: 'wrong-shape', detail: 'no taxonomy_id with a canonical_name or genus' });
  }
  const taxonomyFields = ['family', 'subfamily', 'tribe', 'genus', 'specific_epithet', 'authority'].filter(
    (k) => res.json[k] !== undefined && res.json[k] !== null && res.json[k] !== '',
  );
  return check(id, { ...withPaths, status: 'pass', observation: 'present', taxonomyFieldsPresent: taxonomyFields });
}

export async function checkNonsense(fetchImpl, cfg, routeProven) {
  const name = cfg.nonsenseTaxon;
  const id = `species-api.by-name-nonsense:${name}`;
  const url = `${cfg.apiBase}/api/species/by-name/${encodeURIComponent(name)}`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs });
  const fields = { journey: 'J3', endpoint: '/api/species/by-name/{name}', query: name, ...transportFields(res), routeProvenByKnownLookup: routeProven };
  const outage = outageOf(res);
  if (outage) return check(id, { ...fields, status: 'outage', ...outage });
  if (res.status === 200 && !res.isJson) {
    return check(id, { ...fields, status: 'fail', observation: 'non-json', detail: 'HTTP 200 without JSON for a nonsense name' });
  }
  if (res.status === 200 && looksLikeTaxonomy(res.json)) {
    return check(id, { ...fields, status: 'fail', observation: 'fabricated-match', detail: 'a taxonomy was returned for a name no orchid carries' });
  }
  const notFound = res.status === 404 || res.status === 410 || (res.status === 200 && looksLikeNotFound(res.json));
  if (!notFound) {
    return check(id, { ...fields, status: 'fail', observation: `http-${res.status}`, detail: 'neither a not-found nor an outage' });
  }
  if (!routeProven) {
    // A 404 from a route that does not exist looks identical to a positive
    // "no such taxon". Without a successful known-name lookup it proves nothing.
    return check(id, {
      ...fields,
      status: 'fail',
      observation: 'not-found-route-unproven',
      detail: 'not-found observed, but no known-name lookup succeeded, so the route itself may be missing',
    });
  }
  return check(id, { ...fields, status: 'pass', observation: 'not-found' });
}

// ---------------------------------------------------------------------------
// Supabase checks (J3 / J9)
// ---------------------------------------------------------------------------

function supabaseHeaders(anonKey, extra = {}) {
  return { apikey: anonKey, Authorization: `Bearer ${anonKey}`, ...extra };
}

/** PostgREST `Content-Range: 0-0/31073` or `*\/0`. Returns null when absent. */
export function countFromContentRange(value) {
  const m = typeof value === 'string' && value.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

function supabaseFailure(res) {
  if (res.status === 401 || res.status === 403) return { observation: `http-${res.status}`, detail: 'anon key rejected or row-level policy denies anon read' };
  if (res.status === 404) return { observation: 'http-404', detail: 'table not exposed through the REST API' };
  if (res.status === 400) return { observation: 'http-400', detail: 'query rejected (a selected column may no longer exist)' };
  return { observation: `http-${res.status}` };
}

export async function checkTableCount(fetchImpl, cfg, table) {
  const id = `supabase.count:${table}`;
  const url = `${cfg.supabaseUrl}/rest/v1/${table}?select=id&limit=1`;
  const res = await httpGet(fetchImpl, url, {
    timeoutMs: cfg.timeoutMs,
    headers: supabaseHeaders(cfg.anonKey, { Prefer: 'count=exact' }),
  });
  const fields = { journey: table === 'atlas_occurrences' ? 'J9' : 'J3/J9', table, ...transportFields(res) };
  const outage = outageOf(res);
  if (outage) return check(id, { ...fields, status: 'outage', ...outage });
  if (res.status !== 200 && res.status !== 206) return check(id, { ...fields, status: 'fail', ...supabaseFailure(res) });
  if (!res.isJson || !Array.isArray(res.json)) return check(id, { ...fields, status: 'fail', observation: 'non-json' });
  const observedCount = countFromContentRange(res.contentRange);
  const empty = observedCount === 0 || (observedCount === null && res.json.length === 0);
  const withCount = { ...fields, observedCount, countSource: observedCount === null ? 'unavailable' : 'content-range' };
  if (empty && TABLE_REQUIRED_NON_EMPTY[table]) {
    return check(id, { ...withCount, status: 'fail', observation: 'empty', detail: 'reachable, but no rows are readable with the anon key' });
  }
  return check(id, { ...withCount, status: 'pass', observation: empty ? 'empty' : 'present' });
}

export async function checkTableUiColumns(fetchImpl, cfg, table) {
  const id = `supabase.ui-columns:${table}`;
  const select = UI_SELECTS[table].replace(/\s+/g, '');
  const url = `${cfg.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs, headers: supabaseHeaders(cfg.anonKey) });
  const policy = TABLE_COORDINATE_POLICY[table];
  const fields = { journey: table === 'atlas_occurrences' ? 'J9' : 'J3/J9', table, coordinatePolicy: policy, ...transportFields(res) };
  const outage = outageOf(res);
  if (outage) return check(id, { ...fields, status: 'outage', ...outage });
  if (res.status !== 200 && res.status !== 206) return check(id, { ...fields, status: 'fail', ...supabaseFailure(res) });
  if (!res.isJson || !Array.isArray(res.json)) return check(id, { ...fields, status: 'fail', observation: 'non-json' });
  const coordinatePaths = findCoordinateKeyPaths(res.json);
  const keyNames = distinctKeyNames(coordinatePaths);
  const withKeys = { ...fields, observedRows: res.json.length, coordinateKeysSeen: keyNames };
  if (coordinatePaths.length && policy === 'forbidden') {
    return check(id, { ...withKeys, status: 'fail', observation: 'coordinate-keys-present', detail: `member-facing payload carries ${keyNames.join(', ')}` });
  }
  return check(id, {
    ...withKeys,
    status: 'pass',
    observation: res.json.length ? 'present' : 'empty',
    detail:
      policy === 'expected-raw-atlas-input' && keyNames.length
        ? 'raw Atlas input; public rendering generalises it in src/features/atlas-next/sensitivity.ts'
        : undefined,
  });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Replace every occurrence of each secret in every string of the report. */
export function redact(value, secrets) {
  const live = secrets.filter((s) => typeof s === 'string' && s.length >= 8);
  if (!live.length) return value;
  const scrub = (s) => live.reduce((acc, secret) => acc.split(secret).join('[redacted]'), s);
  const walk = (v) => {
    if (typeof v === 'string') return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, c]) => [scrub(k), walk(c)]));
    return v;
  };
  return walk(value);
}

export function verdictOf(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'FAIL';
  if (checks.some((c) => c.status === 'outage')) return 'OUTAGE';
  if (checks.some((c) => c.status === 'skipped')) return 'NOT_CONFIGURED';
  return checks.length ? 'PASS' : 'NOT_CONFIGURED';
}

export const EXIT_CODES = { PASS: 0, FAIL: 1, NOT_CONFIGURED: 2, OUTAGE: 3 };

function originOnly(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function runVerification(cfg, fetchImpl = globalThis.fetch) {
  const checks = [];

  if (!cfg.apiBase) {
    checks.push(
      check('species-api', {
        journey: 'J3',
        status: 'skipped',
        observation: 'not-configured',
        detail: cfg.rawApiBase
          ? 'VITE_API_BASE_URL is set but is not an absolute http(s) origin'
          : 'set VITE_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL) or pass --api-base',
      }),
    );
  } else {
    let routeProven = false;
    for (const taxon of cfg.knownTaxa) {
      const { check: searchCheck, sampleName } = await checkSearch(fetchImpl, cfg, taxon);
      checks.push(searchCheck);
      const byName = await checkByName(fetchImpl, cfg, sampleName, searchCheck.id);
      checks.push(byName);
      if (byName.status === 'pass') routeProven = true;
    }
    checks.push(await checkNonsense(fetchImpl, cfg, routeProven));
  }

  if (!cfg.supabaseUrl || !cfg.anonKey) {
    checks.push(
      check('supabase', {
        journey: 'J3/J9',
        status: 'skipped',
        observation: 'not-configured',
        detail: !cfg.supabaseUrl
          ? cfg.rawSupabaseUrl
            ? 'VITE_SUPABASE_URL is set but is not an absolute http(s) origin'
            : 'set VITE_SUPABASE_URL or pass --supabase-url'
          : 'set VITE_SUPABASE_ANON_KEY (the public anon key; never a service-role key)',
      }),
    );
  } else {
    for (const table of Object.keys(UI_SELECTS)) {
      checks.push(await checkTableCount(fetchImpl, cfg, table));
      checks.push(await checkTableUiColumns(fetchImpl, cfg, table));
    }
  }

  const summary = { pass: 0, fail: 0, outage: 0, skipped: 0 };
  for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;
  const verdict = verdictOf(checks);

  const report = {
    tool: 'verify-release1-data',
    version: VERIFIER_VERSION,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    method: 'GET only',
    targets: {
      speciesApiOrigin: cfg.apiBase ? originOnly(cfg.apiBase) : null,
      supabaseOrigin: cfg.supabaseUrl ? originOnly(cfg.supabaseUrl) : null,
      anonKeyProvided: Boolean(cfg.anonKey),
    },
    verdict,
    exitCode: EXIT_CODES[verdict],
    summary,
    checks,
    notes: [
      'Counts are observed during this run; none are expected values.',
      'Payload values are never recorded; only key names and paths.',
    ],
  };
  return redact(report, [cfg.anonKey]);
}

async function main() {
  const cfg = resolveConfig(process.argv.slice(2), process.env);
  const report = await runVerification(cfg);
  const text = JSON.stringify(report, null, 2);
  if (cfg.out) writeFileSync(cfg.out, `${text}\n`);
  process.stdout.write(`${text}\n`);
  process.exitCode = report.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    // Never echo the environment: the message is scrubbed of the key first.
    const key = String(process.env.VITE_SUPABASE_ANON_KEY || '');
    const message = String((error && error.message) || error);
    process.stderr.write(`verify-release1-data crashed: ${key.length >= 8 ? message.split(key).join('[redacted]') : message}\n`);
    process.exitCode = 1;
  });
}
