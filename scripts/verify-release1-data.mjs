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
 *   warn    — reachable and not wrong, but not proof of data either (an empty
 *             read, which is indistinguishable from row-level security hiding
 *             every row);
 *   fail    — the target, or the production edge in front of it, answered
 *             wrongly: empty for a known taxon, a non-JSON "200", a JSON 5xx,
 *             an auth wall, a TLS error, a cross-origin redirect, a match for a
 *             nonsense name, a coordinate key in a taxon-page payload…;
 *   outage  — the target did not answer this run: network error, timeout,
 *             429, a non-JSON 502/503/504 gateway page, or a refusal
 *             identifiably issued by an egress proxy;
 *   skipped — not configured, or a prerequisite produced nothing to test.
 *
 * Privacy: NOTHING derived from response body or header text is recorded. The
 * report carries status codes, counts, booleans, fixed vocabulary terms and
 * text from this run's own configuration. A taxon name found by search is
 * referred to by the query that found it plus a short hash, never by its text,
 * so no coordinate, locality or other payload text can reach stdout, the
 * report file, a CI log or a step summary. The anon key is also scrubbed from
 * every string.
 *
 * Usage:
 *   VITE_API_BASE_URL=https://… VITE_SUPABASE_URL=https://… \
 *   VITE_SUPABASE_ANON_KEY=… node scripts/verify-release1-data.mjs \
 *     [--out report.json] [--summary summary.md]
 *
 * Exit codes: 0 PASS / PASS_WITH_WARNINGS · 1 FAIL · 2 NOT_CONFIGURED · 3 OUTAGE.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const VERIFIER_VERSION = 2;

/** Genera the member-facing search is expected to know. Queries, not counts. */
export const DEFAULT_KNOWN_TAXA = ['Cattleya', 'Dracula'];

/** A binomial no orchid carries. A match for it is a fabricated answer. */
export const DEFAULT_NONSENSE_TAXON = 'Zzyzxorchis nonexistens';

export const DEFAULT_TIMEOUT_MS = 60_000;

const MAX_SAME_ORIGIN_REDIRECTS = 3;

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
 * Where the raw Atlas inputs are generalised before they are drawn. Cited in
 * the report so a reader can check the claim rather than trust it.
 */
export const ATLAS_GENERALISATION_SOURCES = [
  'src/lib/atlasLocalitySafety.ts (/atlas: src/pages/Atlas.tsx, src/components/atlas/LiveAtlasMap.tsx)',
  'src/features/atlas-next/sensitivity.ts (/atlas-next)',
];

/**
 * How a coordinate key in a table payload is judged.
 *
 * `atlas_occurrences` and `species.occurrences` are the raw inputs to the Atlas
 * map and are generalised client-side (ATLAS_GENERALISATION_SOURCES) before
 * drawing, so their coordinate keys are reported, not failed.
 * `species_mycorrhizal` and the species API feed text surfaces that have no
 * business carrying a coordinate, so a key there fails.
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
  // The UI has an honest "no partners linked yet" state for this table, so an
  // empty read is a warning rather than a failure — but never a silent pass,
  // because row-level security hiding every row looks exactly the same.
  species_mycorrhizal: false,
};

// ---------------------------------------------------------------------------
// Coordinate-key detection
// ---------------------------------------------------------------------------

/**
 * The fixed vocabulary. The report names only these terms — never a key as the
 * payload spelled it, and never a parent key — so a payload cannot smuggle text
 * into the report through a key name.
 */
export const COORDINATE_VOCABULARY = Object.freeze([
  'bbox',
  'boundingbox',
  'centroid',
  'coordinates',
  'coords',
  'decimallatitude',
  'decimallongitude',
  'footprintwkt',
  'geojson',
  'geolocation',
  'geom',
  'geometry',
  'geopoint',
  'lat',
  'latitude',
  'latitudedecimal',
  'latlng',
  'latlon',
  'lng',
  'lnglat',
  'location',
  'lon',
  'longitude',
  'longitudedecimal',
  'lonlat',
  'point',
  'position',
  'verbatimcoordinates',
  'verbatimlatitude',
  'verbatimlongitude',
  'wkt',
  'x',
  'y',
]);
const COORDINATE_KEYS = new Set(COORDINATE_VOCABULARY);

/** Case and `_`, `-`, `.`, space separators are ignored; digits are not. */
export function coordinateTermOf(key) {
  if (typeof key !== 'string') return null;
  const term = key.toLowerCase().replace(/[\s_.-]/g, '');
  return COORDINATE_KEYS.has(term) ? term : null;
}

export function isCoordinateKey(key) {
  return coordinateTermOf(key) !== null;
}

/**
 * Which vocabulary terms appear anywhere in a payload, and how often. Returns
 * vocabulary terms and a count only — no path, no parent key, no value.
 */
export function scanCoordinateKeys(value) {
  const terms = new Set();
  let count = 0;
  const seen = new WeakSet();
  const walk = (v, depth) => {
    if (v === null || typeof v !== 'object' || depth > 32 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(v)) {
      const term = coordinateTermOf(key);
      if (term) {
        terms.add(term);
        count++;
      }
      walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return { coordinateKeys: [...terms].sort(), coordinateKeyCount: count };
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
    summary: args.summary || '',
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** Node/undici error codes only — a fixed-shape token, never a message. */
function errorCodeOf(error) {
  const raw = (error && (error.cause?.code || error.code)) || '';
  return typeof raw === 'string' && /^[A-Z0-9_]{2,48}$/.test(raw) ? raw : null;
}

const TLS_ERROR_CODE = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ALTNAME|HOSTNAME_MISMATCH/;

/**
 * Whether a refusal was issued by an egress proxy rather than the target.
 *
 * Only an identifiable proxy counts: a plain-text 403/407 carrying the proxy's
 * deny header or its known body. Anything else — an HTML login page, a WAF
 * page, a bare 403 — is the production edge answering, which is a failure of
 * the journey, not an outage of this run.
 */
function isIdentifiableProxyRefusal(status, headers, text) {
  if (status !== 403 && status !== 407) return false;
  const type = String(headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('text/plain')) return false;
  if (headers.get('x-deny-reason')) return true;
  return /^Host not in allowlist:/.test(text);
}

function headersOf(res) {
  const h = res && res.headers;
  return { get: (name) => (h && typeof h.get === 'function' ? h.get(name) : null) };
}

/**
 * One logical GET. Never throws, and never follows a redirect off the origin
 * it was aimed at: custom headers (the anon key) must not be forwarded to a
 * host nobody configured. The result holds only fixed-shape facts plus the
 * parsed JSON, which callers inspect and never record.
 */
export async function httpGet(fetchImpl, url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let current = url;
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(current, {
        method: 'GET',
        headers: { Accept: 'application/json', ...headers },
        signal: controller.signal,
        redirect: 'manual',
      });
      const h = headersOf(res);
      if (res.status >= 300 && res.status < 400) {
        const location = h.get('location');
        if (!location) return { kind: 'redirect-without-location', status: res.status, latencyMs: elapsed() };
        let next;
        try {
          next = new URL(location, current);
        } catch {
          return { kind: 'redirect-without-location', status: res.status, latencyMs: elapsed() };
        }
        if (next.origin !== new URL(current).origin) {
          return { kind: 'redirect-cross-origin', status: res.status, latencyMs: elapsed() };
        }
        if (hop >= MAX_SAME_ORIGIN_REDIRECTS) return { kind: 'redirect-loop', status: res.status, latencyMs: elapsed() };
        current = next.toString();
        continue;
      }
      const type = String(h.get('content-type') || '');
      const text = typeof res.text === 'function' ? await res.text() : '';
      let json;
      let isJson = false;
      if (/json/i.test(type) && text.length) {
        try {
          json = JSON.parse(text);
          isJson = true;
        } catch {
          isJson = false;
        }
      }
      return {
        kind: 'response',
        status: res.status,
        isJson,
        json,
        count: countFromContentRange(String(h.get('content-range') || '')),
        proxyRefusal: isIdentifiableProxyRefusal(res.status, h, text),
        latencyMs: elapsed(),
      };
    }
  } catch (error) {
    const aborted = controller.signal.aborted || (error && error.name === 'AbortError');
    const code = aborted ? null : errorCodeOf(error);
    return {
      kind: aborted ? 'timeout' : code && TLS_ERROR_CODE.test(code) ? 'tls-error' : 'network-error',
      errorCode: code,
      latencyMs: elapsed(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** PostgREST `Content-Range: 0-0/31073` or `*\/0`. Returns null when absent. */
export function countFromContentRange(value) {
  const m = typeof value === 'string' && value.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/**
 * Classify what the transport says before any check-specific judgement.
 * Returns null when the response is an ordinary answer for the check to judge.
 *
 * Outage means "the target did not answer this run". Fail means "the target,
 * or the production edge in front of it, answered wrongly". Anything not
 * identifiably an outage fails closed.
 */
export function classifyTransport(res) {
  switch (res.kind) {
    case 'timeout':
      return { status: 'outage', observation: 'timeout', detail: 'no response within the timeout' };
    case 'network-error':
      return { status: 'outage', observation: 'unreachable', errorCode: res.errorCode, detail: 'connection failed' };
    case 'tls-error':
      return { status: 'fail', observation: 'tls_error', errorCode: res.errorCode, detail: 'TLS handshake or certificate verification failed' };
    case 'redirect-cross-origin':
      return { status: 'fail', observation: 'cross_origin_redirect', detail: 'redirect to another origin refused; headers were not forwarded' };
    case 'redirect-loop':
      return { status: 'fail', observation: 'redirect_loop', detail: 'too many same-origin redirects' };
    case 'redirect-without-location':
      return { status: 'fail', observation: 'bad_redirect', detail: 'redirect without a usable Location' };
    default:
      break;
  }
  const s = res.status;
  if (s === 429) return { status: 'outage', observation: 'rate-limited', detail: 'HTTP 429' };
  if (res.proxyRefusal) {
    return { status: 'outage', observation: 'blocked-before-target', detail: 'refused by an identifiable egress proxy; the target did not answer' };
  }
  if ((s === 401 || s === 403 || s === 407) && !res.isJson) {
    return { status: 'fail', observation: 'auth_wall', detail: `non-JSON HTTP ${s} in front of the target` };
  }
  if (s >= 500) {
    if (!res.isJson && (s === 502 || s === 503 || s === 504)) {
      return { status: 'outage', observation: `gateway-${s}`, detail: 'non-JSON gateway error; the application did not answer' };
    }
    return { status: 'fail', observation: 'server_error', detail: `HTTP ${s} from the application (crash or statement timeout)` };
  }
  return null;
}

function check(id, fields) {
  return { id, ...fields };
}

function transportFields(res) {
  return res.kind === 'response'
    ? { httpStatus: res.status, isJson: res.isJson, latencyMs: res.latencyMs }
    : { httpStatus: res.status ?? null, latencyMs: res.latencyMs };
}

/** A stable, non-reversible reference to response-derived text. */
export function shortHash(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Species API checks (J3)
// ---------------------------------------------------------------------------

function nameOf(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.canonical_name || [entry.genus, entry.specific_epithet].filter(Boolean).join(' ') || '');
}

/**
 * Returns the check plus, OUT OF BAND, the name to look up next. The name is
 * response-derived, so it never goes into a check object.
 */
export async function checkSearch(fetchImpl, cfg, taxon) {
  const url = `${cfg.apiBase}/api/species/search?q=${encodeURIComponent(taxon)}`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs });
  const id = `species-api.search:${taxon}`;
  const base = { journey: 'J3', endpoint: '/api/species/search', query: taxon, ...transportFields(res) };
  const done = (fields, sampleName = '') => ({ check: check(id, { ...base, ...fields }), sampleName });
  const transport = classifyTransport(res);
  if (transport) return done(transport);
  if (res.status === 404) return done({ status: 'fail', observation: 'not-found', detail: 'search answered 404 for a known genus' });
  if (res.status !== 200) return done({ status: 'fail', observation: `http-${res.status}` });
  if (!res.isJson) return done({ status: 'fail', observation: 'non-json', detail: 'HTTP 200 without a JSON body (likely the SPA shell)' });
  if (!Array.isArray(res.json)) return done({ status: 'fail', observation: 'wrong-shape', detail: 'the UI maps the body as an array; this body is not one' });

  const scan = scanCoordinateKeys(res.json);
  const needle = taxon.toLowerCase();
  const matching = res.json.filter((e) => nameOf(e).toLowerCase().includes(needle) || String(e?.genus || '').toLowerCase() === needle);
  const withTaxonomyId = res.json.filter((e) => e && typeof e.taxonomy_id === 'string' && e.taxonomy_id);
  const counts = { observedCount: res.json.length, matchingCount: matching.length, withTaxonomyIdCount: withTaxonomyId.length, ...scan };
  if (scan.coordinateKeyCount) {
    return done({ ...counts, status: 'fail', observation: 'coordinate-keys-present', detail: 'taxon-search payload carries coordinate keys' });
  }
  if (!res.json.length) return done({ ...counts, status: 'fail', observation: 'empty', detail: 'reachable, but no results for a known genus' });
  if (!matching.length) {
    return done({ ...counts, status: 'fail', observation: 'present-but-unrelated', detail: 'results returned, none named for the queried genus' });
  }
  const sample = matching.find((e) => withTaxonomyId.includes(e)) || matching[0];
  return done({ ...counts, status: 'pass', observation: 'present' }, nameOf(sample));
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

/**
 * `name` is response-derived and only builds the request URL. The check
 * records the search that supplied it and a short hash, never the name.
 */
export async function checkByName(fetchImpl, cfg, name, searchCheck) {
  const id = `species-api.by-name:first-match-for:${searchCheck.query}`;
  const base = {
    journey: 'J3',
    endpoint: '/api/species/by-name/{name}',
    nameRef: `first matching search result for query '${searchCheck.query}'`,
    nameHash: name ? shortHash(name) : null,
    derivedFrom: searchCheck.id,
  };
  if (!name) {
    return check(id, {
      ...base,
      status: 'skipped',
      observation: searchCheck.status === 'outage' ? 'search-outage' : 'search-produced-no-name',
      detail: 'no name to look up',
    });
  }
  const url = `${cfg.apiBase}/api/species/by-name/${encodeURIComponent(name)}`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs });
  const fields = { ...base, ...transportFields(res) };
  const transport = classifyTransport(res);
  if (transport) return check(id, { ...fields, ...transport });
  if (res.status === 404) {
    return check(id, { ...fields, status: 'fail', observation: 'not-found', detail: 'a name returned by search is not resolvable by the taxon page' });
  }
  if (res.status !== 200) return check(id, { ...fields, status: 'fail', observation: `http-${res.status}` });
  if (!res.isJson) return check(id, { ...fields, status: 'fail', observation: 'non-json' });
  const scan = scanCoordinateKeys(res.json);
  if (scan.coordinateKeyCount) {
    return check(id, { ...fields, ...scan, status: 'fail', observation: 'coordinate-keys-present', detail: 'taxon-page payload carries coordinate keys' });
  }
  if (!looksLikeTaxonomy(res.json)) {
    return check(id, { ...fields, ...scan, status: 'fail', observation: 'wrong-shape', detail: 'no taxonomy_id with a canonical_name or genus' });
  }
  const taxonomyFieldsPresent = ['family', 'subfamily', 'tribe', 'genus', 'specific_epithet', 'authority'].filter(
    (k) => res.json[k] !== undefined && res.json[k] !== null && res.json[k] !== '',
  );
  return check(id, { ...fields, ...scan, status: 'pass', observation: 'present', taxonomyFieldsPresent });
}

/**
 * `route` says whether a known-name lookup proved the by-name route exists:
 * `{ proven: true }` or `{ proven: false, afterOutage: boolean }`.
 */
export async function checkNonsense(fetchImpl, cfg, route) {
  const name = cfg.nonsenseTaxon;
  const id = `species-api.by-name-nonsense:${name}`;
  const url = `${cfg.apiBase}/api/species/by-name/${encodeURIComponent(name)}`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs });
  const fields = { journey: 'J3', endpoint: '/api/species/by-name/{name}', query: name, ...transportFields(res), routeProvenByKnownLookup: route.proven };
  const transport = classifyTransport(res);
  if (transport) return check(id, { ...fields, ...transport });
  if (res.status === 200 && !res.isJson) return check(id, { ...fields, status: 'fail', observation: 'non-json', detail: 'HTTP 200 without JSON for a nonsense name' });
  if (res.status === 200 && looksLikeTaxonomy(res.json)) {
    return check(id, { ...fields, status: 'fail', observation: 'fabricated-match', detail: 'a taxonomy was returned for a name no orchid carries' });
  }
  const notFound = res.status === 404 || res.status === 410 || (res.status === 200 && looksLikeNotFound(res.json));
  if (!notFound) return check(id, { ...fields, status: 'fail', observation: `http-${res.status}`, detail: 'neither a not-found nor an outage' });
  if (!route.proven) {
    // A 404 from a route that does not exist looks identical to a positive
    // "no such taxon". Without a successful known-name lookup this check was
    // not evaluated, which is not the same as having failed. Whatever stopped
    // the known lookup is already reported as its own fail or outage.
    return check(id, {
      ...fields,
      status: 'skipped',
      observation: route.afterOutage ? 'route-unproven-after-outage' : 'route-unproven',
      detail: 'not-found observed, but no known-name lookup succeeded, so the route itself is unproven',
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

function supabaseFailure(res) {
  if (res.status === 401 || res.status === 403) return { observation: `http-${res.status}`, detail: 'anon key rejected or row-level policy denies anon read' };
  if (res.status === 404) return { observation: 'http-404', detail: 'table not exposed through the REST API' };
  if (res.status === 400) return { observation: 'http-400', detail: 'query rejected (a selected column may no longer exist)' };
  return { observation: `http-${res.status}` };
}

const journeyOf = (table) => (table === 'atlas_occurrences' ? 'J9' : 'J3/J9');

export const EMPTY_OR_HIDDEN_WARNING =
  'no rows readable with the anon key: the table is empty OR row-level security hides every row; this run cannot tell which';

export async function checkTableCount(fetchImpl, cfg, table) {
  const id = `supabase.count:${table}`;
  const url = `${cfg.supabaseUrl}/rest/v1/${table}?select=id&limit=1`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs, headers: supabaseHeaders(cfg.anonKey, { Prefer: 'count=exact' }) });
  const fields = { journey: journeyOf(table), table, ...transportFields(res) };
  const transport = classifyTransport(res);
  if (transport) return check(id, { ...fields, ...transport });
  if (res.status !== 200 && res.status !== 206) return check(id, { ...fields, status: 'fail', ...supabaseFailure(res) });
  if (!res.isJson || !Array.isArray(res.json)) return check(id, { ...fields, status: 'fail', observation: 'non-json' });
  const observedCount = res.count;
  const empty = observedCount === 0 || (observedCount === null && res.json.length === 0);
  const withCount = { ...fields, observedCount, countSource: observedCount === null ? 'unavailable' : 'content-range' };
  if (empty) {
    return check(id, {
      ...withCount,
      status: TABLE_REQUIRED_NON_EMPTY[table] ? 'fail' : 'warn',
      observation: 'empty_or_hidden',
      warning: EMPTY_OR_HIDDEN_WARNING,
    });
  }
  return check(id, { ...withCount, status: 'pass', observation: 'present' });
}

export async function checkTableUiColumns(fetchImpl, cfg, table) {
  const id = `supabase.ui-columns:${table}`;
  const select = UI_SELECTS[table].replace(/\s+/g, '');
  const url = `${cfg.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const res = await httpGet(fetchImpl, url, { timeoutMs: cfg.timeoutMs, headers: supabaseHeaders(cfg.anonKey) });
  const policy = TABLE_COORDINATE_POLICY[table];
  const fields = { journey: journeyOf(table), table, coordinatePolicy: policy, ...transportFields(res) };
  const transport = classifyTransport(res);
  if (transport) return check(id, { ...fields, ...transport });
  if (res.status !== 200 && res.status !== 206) return check(id, { ...fields, status: 'fail', ...supabaseFailure(res) });
  if (!res.isJson || !Array.isArray(res.json)) return check(id, { ...fields, status: 'fail', observation: 'non-json' });
  const scan = scanCoordinateKeys(res.json);
  const withKeys = { ...fields, observedRows: res.json.length, ...scan };
  if (scan.coordinateKeyCount && policy === 'forbidden') {
    return check(id, { ...withKeys, status: 'fail', observation: 'coordinate-keys-present', detail: 'member-facing text payload carries coordinate keys' });
  }
  if (!res.json.length) {
    // The select was accepted (no column drift) but proved nothing about data.
    // The count check owns the fail for required tables.
    return check(id, { ...withKeys, status: 'warn', observation: 'empty_or_hidden', warning: EMPTY_OR_HIDDEN_WARNING });
  }
  const generalised =
    policy === 'expected-raw-atlas-input' && scan.coordinateKeyCount
      ? { detail: 'raw Atlas input; generalised client-side before drawing', generalisedBy: ATLAS_GENERALISATION_SOURCES }
      : {};
  return check(id, { ...withKeys, status: 'pass', observation: 'present', ...generalised });
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
  if (!checks.length || checks.some((c) => c.status === 'skipped')) return 'NOT_CONFIGURED';
  if (checks.some((c) => c.status === 'warn')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

export const EXIT_CODES = { PASS: 0, PASS_WITH_WARNINGS: 0, FAIL: 1, NOT_CONFIGURED: 2, OUTAGE: 3 };

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
    let proven = false;
    let afterOutage = false;
    for (const taxon of cfg.knownTaxa) {
      const { check: searchCheck, sampleName } = await checkSearch(fetchImpl, cfg, taxon);
      checks.push(searchCheck);
      const byName = await checkByName(fetchImpl, cfg, sampleName, searchCheck);
      checks.push(byName);
      if (byName.status === 'pass') proven = true;
      if (searchCheck.status === 'outage' || byName.status === 'outage') afterOutage = true;
    }
    checks.push(await checkNonsense(fetchImpl, cfg, { proven, afterOutage }));
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

  const summary = { pass: 0, warn: 0, fail: 0, outage: 0, skipped: 0 };
  for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;
  const verdict = verdictOf(checks);

  const report = {
    tool: 'verify-release1-data',
    version: VERIFIER_VERSION,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    method: 'GET only; redirects never followed off-origin',
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
      "No response body or header text is recorded: only status codes, counts, booleans, fixed vocabulary terms and this run's own configuration.",
      'Names returned by search are referenced by query and a 12-hex sha256 prefix, never by text.',
    ],
  };
  return redact(report, [cfg.anonKey]);
}

/** Markdown for a CI step summary, built only from report fields. */
export function renderSummary(report) {
  const cell = (v) => String(v ?? '').replace(/[|\n\r`]/g, ' ');
  const lines = [
    '### Release 1 data verifier',
    '',
    `Verdict: \`${cell(report.verdict)}\` (exit ${cell(report.exitCode)})`,
    '',
    '| check | status | observation | observed count |',
    '|---|---|---|---|',
    ...report.checks.map((c) => `| ${cell(c.id)} | ${cell(c.status)} | ${cell(c.observation)} | ${cell(c.observedCount)} |`),
  ];
  const warnings = report.checks.filter((c) => c.status === 'warn');
  if (warnings.length) {
    lines.push('', '**Warnings**', '', ...warnings.map((c) => `- ${cell(c.id)}: ${cell(c.warning || c.observation)}`));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const cfg = resolveConfig(process.argv.slice(2), process.env);
  const report = await runVerification(cfg);
  const text = JSON.stringify(report, null, 2);
  if (cfg.out) writeFileSync(cfg.out, `${text}\n`);
  if (cfg.summary) appendFileSync(cfg.summary, renderSummary(report));
  process.stdout.write(`${text}\n`);
  process.exitCode = report.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    // No message: it could carry text from a response or the environment.
    process.stderr.write(`verify-release1-data crashed (${(error && error.name) || 'Error'})\n`);
    process.exitCode = 1;
  });
}
