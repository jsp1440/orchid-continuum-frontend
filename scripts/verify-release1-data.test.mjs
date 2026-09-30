import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ATLAS_GENERALISATION_SOURCES,
  EXIT_CODES,
  UI_SELECTS,
  checkByName,
  checkNonsense,
  checkSearch,
  checkTableCount,
  checkTableUiColumns,
  classifyTransport,
  countFromContentRange,
  httpGet,
  isCoordinateKey,
  redact,
  renderSummary,
  resolveConfig,
  runVerification,
  scanCoordinateKeys,
  verdictOf,
} from './verify-release1-data.mjs';

// Every payload below is a SYNTHETIC SHAPE for exercising the classifier. None
// of it is captured production data, and no count here is a real count.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SCRIPT = join(HERE, 'verify-release1-data.mjs');

const API = 'https://species-api.test.invalid';
const SUPA = 'https://supabase.test.invalid';
const KEY = 'synthetic-anon-key-0123456789abcdef';

const headerMap = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
const json = (status, body, extraHeaders = {}) => ({
  status,
  headers: headerMap({ 'content-type': 'application/json; charset=utf-8', ...extraHeaders }),
  text: async () => JSON.stringify(body),
});
const html = (status, body = '<!doctype html><div id="root"></div>') => ({
  status,
  headers: headerMap({ 'content-type': 'text/html' }),
  text: async () => body,
});
const plain = (status, body, extraHeaders = {}) => ({
  status,
  headers: headerMap({ 'content-type': 'text/plain; charset=utf-8', ...extraHeaders }),
  text: async () => body,
});
const redirect = (status, location) => ({ status, headers: headerMap({ location }), text: async () => '' });
const networkDown = () => {
  throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
};
const tlsFailure = () => {
  throw new TypeError('fetch failed', { cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }) });
};
const hang = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });

/** A fetch whose answer is chosen by a URL predicate. Records every call. */
function routedFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    for (const [match, respond] of routes) {
      if (match(String(url))) return respond(String(url), init);
    }
    return json(404, { detail: 'Not Found' });
  };
  impl.calls = calls;
  return impl;
}

const cfg = (overrides = {}) => ({
  apiBase: API,
  supabaseUrl: SUPA,
  anonKey: KEY,
  knownTaxa: ['Cattleya'],
  nonsenseTaxon: 'Zzyzxorchis nonexistens',
  timeoutMs: 2000,
  ...overrides,
});

const summary = (name, extra = {}) => ({
  taxonomy_id: `tx-${name.replace(/\s+/g, '-')}`,
  canonical_name: name,
  genus: name.split(' ')[0],
  ...extra,
});

const searchCheckFor = (query, status = 'pass') => ({ id: `species-api.search:${query}`, query, status });

// ---------------------------------------------------------------------------

describe('coordinate-key detector', () => {
  it.each([
    'lat', 'lon', 'lng', 'latitude', 'Longitude', 'decimal_latitude', 'decimalLongitude', 'latitude_decimal',
    'geometry', 'geom', 'coordinates', 'location', 'point', 'x', 'Y', 'geo-location', 'bbox', 'centroid',
  ])('flags %s', (key) => expect(isCoordinateKey(key)).toBe(true));

  it.each(['locality_withheld', 'region', 'country', 'elevation_m', 'long_description', 'latest', 'genus', 'plateau', 'x1', 'max', 'yield'])(
    'does not flag %s',
    (key) => expect(isCoordinateKey(key)).toBe(false),
  );

  it('reports only vocabulary terms and a count: no path, no parent key, no value', () => {
    const payload = [{ canonical_name: 'X y', RIDGE_NEAR_VILLAGE: [{ Decimal_Latitude: 1.5, lng: 2.5 }] }, { geometry: { type: 'Point' } }];
    const scan = scanCoordinateKeys(payload);
    expect(scan).toEqual({ coordinateKeys: ['decimallatitude', 'geometry', 'lng'], coordinateKeyCount: 3 });
    expect(JSON.stringify(scan)).not.toMatch(/RIDGE|Decimal_Latitude|1\.5|2\.5|\$/);
  });

  it('survives cycles', () => {
    const a = { name: 'a' };
    a.self = a;
    expect(scanCoordinateKeys(a).coordinateKeyCount).toBe(0);
  });
});

describe('transport classification: outage vs fail', () => {
  const classify = async (respond) => classifyTransport(await httpGet(routedFetch([[() => true, respond]]), `${API}/x`, { timeoutMs: 30 }));

  it('network error and timeout are outages', async () => {
    expect(await classify(networkDown)).toMatchObject({ status: 'outage', observation: 'unreachable', errorCode: 'ECONNREFUSED' });
    expect(await classify(hang)).toMatchObject({ status: 'outage', observation: 'timeout' });
  });

  it('a TLS / certificate error fails as tls_error, not an outage', async () => {
    expect(await classify(tlsFailure)).toMatchObject({ status: 'fail', observation: 'tls_error', errorCode: 'CERT_HAS_EXPIRED' });
  });

  it('a non-JSON 502/503/504 gateway page is an outage', async () => {
    for (const s of [502, 503, 504]) expect(await classify(() => html(s))).toMatchObject({ status: 'outage', observation: `gateway-${s}` });
  });

  it('a JSON 5xx (app crash, statement timeout) fails', async () => {
    expect(await classify(() => json(500, { code: '57014', message: 'canceling statement due to statement timeout' }))).toMatchObject({
      status: 'fail',
      observation: 'server_error',
    });
    expect(await classify(() => json(503, { detail: 'db down' }))).toMatchObject({ status: 'fail', observation: 'server_error' });
    expect(await classify(() => plain(500, 'Internal Server Error'))).toMatchObject({ status: 'fail', observation: 'server_error' });
  });

  it('an HTML or unidentified plain-text 401/403 in front of production fails as auth_wall', async () => {
    expect(await classify(() => html(403, '<html>Sign in</html>'))).toMatchObject({ status: 'fail', observation: 'auth_wall' });
    expect(await classify(() => html(401))).toMatchObject({ status: 'fail', observation: 'auth_wall' });
    expect(await classify(() => plain(403, 'Forbidden'))).toMatchObject({ status: 'fail', observation: 'auth_wall' });
    expect(await classify(() => plain(407, 'Proxy Authentication Required'))).toMatchObject({ status: 'fail', observation: 'auth_wall' });
  });

  it('only an identifiable egress-proxy refusal is an outage', async () => {
    expect(await classify(() => plain(403, 'Forbidden', { 'x-deny-reason': 'host_not_allowed' }))).toMatchObject({
      status: 'outage',
      observation: 'blocked-before-target',
    });
    expect(await classify(() => plain(403, 'Host not in allowlist: species-api.test.invalid. Add this host…'))).toMatchObject({
      status: 'outage',
      observation: 'blocked-before-target',
    });
    // The proxy header on an HTML page is not the proxy's known shape.
    expect(await classify(() => ({ ...html(403), headers: headerMap({ 'content-type': 'text/html', 'x-deny-reason': 'x' }) }))).toMatchObject({
      status: 'fail',
      observation: 'auth_wall',
    });
  });

  it('429 is an outage', async () => {
    expect(await classify(() => json(429, {}))).toMatchObject({ status: 'outage', observation: 'rate-limited' });
  });
});

describe('redirects are never followed off-origin', () => {
  it('refuses a cross-origin redirect without forwarding the anon key', async () => {
    const f = routedFetch([[(u) => u.startsWith(SUPA), () => redirect(302, 'https://elsewhere.test.invalid/rest/v1/species')]]);
    const c = await checkTableCount(f, cfg(), 'species');
    expect(c).toMatchObject({ status: 'fail', observation: 'cross_origin_redirect' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].init.redirect).toBe('manual');
    expect(f.calls.some((call) => call.url.includes('elsewhere'))).toBe(false);
  });

  it('follows a same-origin redirect', async () => {
    const f = routedFetch([
      [(u) => u.includes('/api/species/search'), () => redirect(307, '/v2/search?q=Cattleya')],
      [(u) => u.includes('/v2/search'), () => json(200, [summary('Cattleya labiata')])],
    ]);
    const { check } = await checkSearch(f, cfg(), 'Cattleya');
    expect(check.status).toBe('pass');
    expect(f.calls.map((c) => new URL(c.url).origin)).toEqual([API, API]);
  });

  it('stops a same-origin redirect loop', async () => {
    const f = routedFetch([[() => true, () => redirect(302, '/again')]]);
    const { check } = await checkSearch(f, cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'fail', observation: 'redirect_loop' });
  });
});

describe('species search: outage vs empty vs present vs 404', () => {
  it('reports an outage when the host is unreachable', async () => {
    const { check } = await checkSearch(routedFetch([[() => true, networkDown]]), cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'outage', observation: 'unreachable' });
  });

  it('fails an empty result for a known genus', async () => {
    const { check } = await checkSearch(routedFetch([[() => true, () => json(200, [])]]), cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'fail', observation: 'empty', observedCount: 0 });
  });

  it('passes a present result and reports the observed count', async () => {
    const body = [summary('Cattleya labiata'), summary('Cattleya walkeriana'), summary('Laelia anceps')];
    const { check, sampleName } = await checkSearch(routedFetch([[() => true, () => json(200, body)]]), cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'pass', observation: 'present', observedCount: 3, matchingCount: 2 });
    expect(sampleName).toBe('Cattleya labiata');
    expect(JSON.stringify(check)).not.toContain('labiata');
  });

  it('fails a 404 search as not-found', async () => {
    const { check } = await checkSearch(routedFetch([[() => true, () => json(404, { detail: 'Not Found' })]]), cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'fail', observation: 'not-found' });
  });

  it('fails an HTML 200 (SPA shell) rather than believing it', async () => {
    const { check } = await checkSearch(routedFetch([[() => true, () => html(200)]]), cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'fail', observation: 'non-json' });
  });

  it('fails a taxon-search payload that carries coordinates', async () => {
    const body = [summary('Cattleya labiata', { decimal_latitude: -8.1, decimal_longitude: -35.0 })];
    const { check } = await checkSearch(routedFetch([[() => true, () => json(200, body)]]), cfg(), 'Cattleya');
    expect(check).toMatchObject({ status: 'fail', observation: 'coordinate-keys-present', coordinateKeys: ['decimallatitude', 'decimallongitude'] });
    expect(JSON.stringify(check)).not.toContain('-8.1');
  });
});

describe('by-name and the nonsense taxon', () => {
  it('passes a taxonomy and records a reference to the name, never the name', async () => {
    const f = routedFetch([[(u) => u.includes('/by-name/'), () => json(200, summary('Cattleya labiata', { family: 'Orchidaceae' }))]]);
    const c = await checkByName(f, cfg(), 'Cattleya labiata', searchCheckFor('Cattleya'));
    expect(c).toMatchObject({
      id: 'species-api.by-name:first-match-for:Cattleya',
      status: 'pass',
      nameRef: "first matching search result for query 'Cattleya'",
      taxonomyFieldsPresent: ['family', 'genus'],
    });
    expect(c.nameHash).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(c)).not.toContain('labiata');
    expect(f.calls[0].url).toBe(`${API}/api/species/by-name/Cattleya%20labiata`);
  });

  it('skips by-name when search produced nothing, naming why', async () => {
    const f = routedFetch([]);
    expect(await checkByName(f, cfg(), '', searchCheckFor('Cattleya', 'outage'))).toMatchObject({ status: 'skipped', observation: 'search-outage' });
    expect(await checkByName(f, cfg(), '', searchCheckFor('Cattleya', 'fail'))).toMatchObject({ status: 'skipped', observation: 'search-produced-no-name' });
    expect(f.calls).toHaveLength(0);
  });

  it('passes a positive 404 for nonsense once the route is proven', async () => {
    const c = await checkNonsense(routedFetch([[() => true, () => json(404, { detail: 'Species not found' })]]), cfg(), { proven: true });
    expect(c).toMatchObject({ status: 'pass', observation: 'not-found' });
  });

  it('never fails the nonsense check because the known lookup was unproven', async () => {
    const f = routedFetch([[() => true, () => json(404, { detail: 'Not Found' })]]);
    expect(await checkNonsense(f, cfg(), { proven: false, afterOutage: true })).toMatchObject({ status: 'skipped', observation: 'route-unproven-after-outage' });
    expect(await checkNonsense(f, cfg(), { proven: false, afterOutage: false })).toMatchObject({ status: 'skipped', observation: 'route-unproven' });
  });

  it('search 503 / timeout with a nonsense 404 is an OUTAGE, not a FAIL', async () => {
    for (const searchResponse of [() => html(503), hang]) {
      const f = routedFetch([
        [(u) => u.includes('/api/species/search'), searchResponse],
        [(u) => u.includes('/by-name/'), () => json(404, { detail: 'Not Found' })],
      ]);
      const report = await runVerification(cfg({ supabaseUrl: '', anonKey: '', timeoutMs: 30 }), f);
      const nonsense = report.checks.find((c) => c.id.startsWith('species-api.by-name-nonsense'));
      expect(nonsense).toMatchObject({ status: 'skipped', observation: 'route-unproven-after-outage' });
      expect(report.checks.some((c) => c.status === 'fail')).toBe(false);
      expect(report.verdict).toBe('OUTAGE');
    }
  });

  it('keeps a nonsense gateway outage distinct from not-found', async () => {
    const c = await checkNonsense(routedFetch([[() => true, () => html(502)]]), cfg(), { proven: true });
    expect(c).toMatchObject({ status: 'outage', observation: 'gateway-502' });
  });

  it('fails a fabricated match for a nonsense name, proven route or not', async () => {
    const f = routedFetch([[() => true, () => json(200, summary('Zzyzxorchis nonexistens'))]]);
    expect(await checkNonsense(f, cfg(), { proven: true })).toMatchObject({ status: 'fail', observation: 'fabricated-match' });
    expect(await checkNonsense(f, cfg(), { proven: false, afterOutage: true })).toMatchObject({ status: 'fail', observation: 'fabricated-match' });
  });
});

describe('Supabase tables', () => {
  it('reads the observed count from Content-Range and sends the anon key only as headers', async () => {
    const f = routedFetch([[() => true, () => json(206, [{ id: 'a' }], { 'content-range': '0-0/4242' })]]);
    const c = await checkTableCount(f, cfg(), 'atlas_occurrences');
    expect(c).toMatchObject({ status: 'pass', observation: 'present', observedCount: 4242, countSource: 'content-range' });
    expect(f.calls[0].url).toBe(`${SUPA}/rest/v1/atlas_occurrences?select=id&limit=1`);
    expect(f.calls[0].url).not.toContain(KEY);
    expect(f.calls[0].init.method).toBe('GET');
    expect(f.calls[0].init.headers.apikey).toBe(KEY);
  });

  it('fails an empty required table; warns (never silently passes) an empty or RLS-hidden optional one', async () => {
    const empty = routedFetch([[() => true, () => json(200, [], { 'content-range': '*/0' })]]);
    expect(await checkTableCount(empty, cfg(), 'species')).toMatchObject({ status: 'fail', observation: 'empty_or_hidden' });
    const myco = await checkTableCount(empty, cfg(), 'species_mycorrhizal');
    expect(myco).toMatchObject({ status: 'warn', observation: 'empty_or_hidden' });
    expect(myco.warning).toMatch(/row-level security/);
    expect(await checkTableUiColumns(empty, cfg(), 'species_mycorrhizal')).toMatchObject({ status: 'warn', observation: 'empty_or_hidden' });
  });

  it('an empty optional table makes the run PASS_WITH_WARNINGS, surfaced in the summary', async () => {
    const f = routedFetch([
      [(u) => u.includes('species_mycorrhizal'), () => json(200, [], { 'content-range': '*/0' })],
      [(u) => u.includes('select=id&'), () => json(206, [{ id: 'a' }], { 'content-range': '0-0/7' })],
      [(u) => u.includes('/rest/v1/'), () => json(200, [{ id: 'a' }])],
    ]);
    const report = await runVerification(cfg({ apiBase: '' }), f);
    const supabaseOnly = { ...report, checks: report.checks.filter((c) => c.id.startsWith('supabase')) };
    expect(verdictOf(supabaseOnly.checks)).toBe('PASS_WITH_WARNINGS');
    expect(report.summary.warn).toBe(2);
    expect(renderSummary(supabaseOnly)).toMatch(/\*\*Warnings\*\*[\s\S]*supabase\.count:species_mycorrhizal/);
  });

  it('fails a rejected anon key (JSON 401) and a JSON 500 on the UI select', async () => {
    expect(await checkTableCount(routedFetch([[() => true, () => json(401, { message: 'JWT' })]]), cfg(), 'species')).toMatchObject({
      status: 'fail',
      observation: 'http-401',
    });
    expect(await checkTableUiColumns(routedFetch([[() => true, () => json(500, { code: '57014' })]]), cfg(), 'atlas_occurrences')).toMatchObject({
      status: 'fail',
      observation: 'server_error',
    });
  });

  it('fails a UI column select the table rejects (schema drift)', async () => {
    const c = await checkTableUiColumns(routedFetch([[() => true, () => json(400, { message: 'column does not exist' })]]), cfg(), 'atlas_occurrences');
    expect(c).toMatchObject({ status: 'fail', observation: 'http-400' });
  });

  it('reports raw Atlas coordinates without failing, citing the real generaliser; fails them on a text surface', async () => {
    const withCoords = routedFetch([[() => true, () => json(200, [{ id: 'a', lat: 1, lng: 2 }])]]);
    const atlas = await checkTableUiColumns(withCoords, cfg(), 'atlas_occurrences');
    expect(atlas).toMatchObject({ status: 'pass', coordinateKeys: ['lat', 'lng'], coordinateKeyCount: 2 });
    expect(atlas.generalisedBy[0]).toMatch(/^src\/lib\/atlasLocalitySafety\.ts/);
    const myco = await checkTableUiColumns(withCoords, cfg(), 'species_mycorrhizal');
    expect(myco).toMatchObject({ status: 'fail', observation: 'coordinate-keys-present' });
  });

  it('parses Content-Range', () => {
    expect(countFromContentRange('0-0/31073')).toBe(31073);
    expect(countFromContentRange('*/0')).toBe(0);
    expect(countFromContentRange('')).toBeNull();
  });
});

describe('the cited generalisation sources are the ones the Atlas uses', () => {
  it('/atlas renders through src/lib/atlasLocalitySafety.ts', () => {
    const [atlas, next] = ATLAS_GENERALISATION_SOURCES.map((s) => s.split(' ')[0]);
    expect(existsSync(join(REPO, atlas))).toBe(true);
    expect(existsSync(join(REPO, next))).toBe(true);
    expect(readFileSync(join(REPO, 'src/pages/Atlas.tsx'), 'utf8')).toContain("from '@/lib/atlasLocalitySafety'");
    expect(readFileSync(join(REPO, 'src/components/atlas/LiveAtlasMap.tsx'), 'utf8')).toContain("from '@/lib/atlasLocalitySafety'");
    expect(readFileSync(join(REPO, 'src/features/atlas-next/AtlasNextShell.tsx'), 'utf8')).toContain("from './sensitivity'");
  });
});

describe('report', () => {
  const healthy = () =>
    routedFetch([
      [(u) => u.includes('/api/species/search'), () => json(200, [summary('Cattleya labiata')])],
      [(u) => u.includes('/by-name/Cattleya'), () => json(200, summary('Cattleya labiata'))],
      [(u) => u.includes('/by-name/'), () => json(404, { detail: 'Species not found' })],
      [(u) => u.includes('/rest/v1/') && u.includes('select=id&'), () => json(206, [{ id: 'a' }], { 'content-range': '0-0/7' })],
      [(u) => u.includes('/rest/v1/'), () => json(200, [{ id: 'a' }])],
    ]);

  it('passes end to end and exits 0', async () => {
    const report = await runVerification(cfg(), healthy());
    expect(report.verdict).toBe('PASS');
    expect(report.exitCode).toBe(EXIT_CODES.PASS);
    expect(report.summary).toMatchObject({ fail: 0, outage: 0, warn: 0 });
  });

  it('only ever issues GET requests with manual redirects', async () => {
    const f = healthy();
    await runVerification(cfg(), f);
    expect(f.calls.length).toBeGreaterThan(0);
    expect(f.calls.every((c) => c.init.method === 'GET' && c.init.redirect === 'manual')).toBe(true);
  });

  it('never includes the anon key', async () => {
    const leaky = routedFetch([[() => true, networkDown]]);
    const outage = await runVerification(cfg(), leaky);
    expect(outage.verdict).toBe('OUTAGE');
    expect(outage.exitCode).toBe(EXIT_CODES.OUTAGE);
    expect(JSON.stringify(outage)).not.toContain(KEY);
    expect(outage.targets.anonKeyProvided).toBe(true);
    expect(JSON.stringify(await runVerification(cfg(), healthy()))).not.toContain(KEY);
  });

  it('is NOT_CONFIGURED without targets and never calls fetch', async () => {
    const f = routedFetch([]);
    const report = await runVerification(resolveConfig([], {}), f);
    expect(report.verdict).toBe('NOT_CONFIGURED');
    expect(report.exitCode).toBe(EXIT_CODES.NOT_CONFIGURED);
    expect(f.calls).toHaveLength(0);
  });

  it('ranks fail > outage > not-configured > warnings > pass', () => {
    expect(verdictOf([{ status: 'outage' }, { status: 'fail' }])).toBe('FAIL');
    expect(verdictOf([{ status: 'outage' }, { status: 'skipped' }])).toBe('OUTAGE');
    expect(verdictOf([{ status: 'warn' }, { status: 'skipped' }])).toBe('NOT_CONFIGURED');
    expect(verdictOf([{ status: 'pass' }, { status: 'warn' }])).toBe('PASS_WITH_WARNINGS');
    expect(verdictOf([{ status: 'pass' }])).toBe('PASS');
  });

  it('redacts keys and values alike', () => {
    expect(redact({ [KEY]: [`x${KEY}y`] }, [KEY])).toEqual({ '[redacted]': ['x[redacted]y'] });
  });
});

describe('configuration', () => {
  it('reads the same variable names the app reads', () => {
    const c = resolveConfig([], { VITE_API_BASE_URL: `${API}/`, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: ` ${KEY} ` });
    expect(c).toMatchObject({ apiBase: API, supabaseUrl: SUPA, anonKey: KEY });
    expect(resolveConfig([], { NEXT_PUBLIC_API_BASE_URL: API }).apiBase).toBe(API);
  });

  it('lets CLI args override the environment and rejects relative origins', () => {
    const c = resolveConfig(['--api-base', '/api', '--supabase-url=https://other.test.invalid', '--taxa', 'Masdevallia, Dracula'], { VITE_API_BASE_URL: API });
    expect(c.apiBase).toBe('');
    expect(c.supabaseUrl).toBe('https://other.test.invalid');
    expect(c.knownTaxa).toEqual(['Masdevallia', 'Dracula']);
  });

  it('keeps UI_SELECTS in lockstep with the columns the app selects', () => {
    const source = readFileSync(join(REPO, 'src/lib/orchidContinuum.ts'), 'utf8');
    const constant = (name) => source.match(new RegExp(`const ${name} =\\s*'([^']+)'`))[1];
    expect(UI_SELECTS.species).toBe(constant('SPECIES_COLUMNS'));
    expect(UI_SELECTS.atlas_occurrences).toBe(constant('ATLAS_COLUMNS'));
    expect(UI_SELECTS.species_mycorrhizal).toBe(source.match(/\.from\('species_mycorrhizal'\)\s*\.select\('([^']+)'\)/)[1]);
  });

  it('hard-codes no origin or key', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(script).not.toMatch(/onrender\.com|databasepad\.com|supabase\.co\b/);
  });
});

// ---------------------------------------------------------------------------
// End to end: the real script, a real HTTP server, planted markers
// ---------------------------------------------------------------------------

/**
 * Plants a locality marker and coordinates in every place a response can carry
 * text: keys, parent keys, values, names, error bodies, header values, the
 * redirect Location and the Content-Range. Then asserts none of it reaches
 * stdout, stderr, the report file or the step summary.
 */
const MARK = 'LOCMARK_ridge_2km_N_of_village';
const LAT = '-12.3456789';
const LNG = '45.6789012';

/** Marker text in every key and value, but no coordinate-vocabulary key. */
function plantedText(i) {
  return {
    taxonomy_id: `tx-${MARK}-${i}`,
    canonical_name: `Cattleya ${MARK} ${LAT}`,
    genus: 'Cattleya',
    specific_epithet: `${MARK}`,
    family: `Orchidaceae ${MARK}`,
    locality: `${MARK} at ${LAT},${LNG}`,
    [`${MARK}_${LAT}`]: { [`${MARK}_child`]: `${MARK} ${LNG}` },
  };
}

/** The same, plus coordinates nested under a marker-named parent key. */
function plantedRecord(i) {
  return {
    ...plantedText(i),
    [`${MARK}_parent`]: { lat: Number(LAT), lng: Number(LNG), decimal_latitude: `${MARK} ${LAT}` },
  };
}

function scenarioServer(scenario) {
  const extra = { 'x-planted': `${MARK} ${LAT}`, 'content-type': `application/json; note=${MARK}` };
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { ...extra, ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;
    if (scenario === 'healthy') {
      if (p === '/api/species/search') return send(res, 200, [plantedText(1), plantedText(2)]);
      if (p.startsWith('/api/species/by-name/Zzyzx')) return send(res, 404, { detail: `not found ${MARK} ${LAT}` });
      if (p.startsWith('/api/species/by-name/')) return send(res, 200, plantedRecord(3));
      if (p.startsWith('/rest/v1/')) {
        return send(res, 206, [plantedRecord(4)], { 'content-range': '0-0/9' });
      }
    } else {
      if (p === '/api/species/search') return send(res, 500, { detail: `${MARK} ${LAT} crash` });
      if (p.startsWith('/api/species/by-name/')) {
        res.writeHead(403, { 'content-type': 'text/html', 'x-planted': MARK });
        return res.end(`<html>${MARK} ${LAT}</html>`);
      }
      if (p.includes('species_mycorrhizal')) {
        res.writeHead(302, { location: `http://elsewhere.invalid/${MARK}/${LAT}` });
        return res.end();
      }
      if (p.startsWith('/rest/v1/')) {
        res.writeHead(503, { 'content-type': 'text/html' });
        return res.end(`<html>${MARK} ${LNG}</html>`);
      }
    }
    return send(res, 404, { detail: `${MARK}` });
  });
}

async function runScript(scenario) {
  const server = scenarioServer(scenario);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), 'verify-release1-data-'));
  const out = join(dir, 'report.json');
  const summaryPath = join(dir, 'summary.md');
  try {
    const child = spawn(process.execPath, [SCRIPT, '--out', out, '--summary', summaryPath, '--taxa', 'Cattleya', '--timeout-ms', '5000'], {
      // A minimal environment: no proxy, no inherited credentials.
      env: {
        PATH: process.env.PATH ?? '',
        NO_PROXY: '127.0.0.1,localhost',
        VITE_API_BASE_URL: base,
        VITE_SUPABASE_URL: base,
        VITE_SUPABASE_ANON_KEY: KEY,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const code = await new Promise((r) => child.on('close', r));
    return { code, stdout, stderr, report: readFileSync(out, 'utf8'), summary: readFileSync(summaryPath, 'utf8') };
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

const assertNoPlantedText = (outputs) => {
  for (const [name, text] of Object.entries(outputs)) {
    for (const needle of [MARK, 'LOCMARK', LAT, LNG, 'elsewhere', KEY]) {
      expect(`${name}: ${text.includes(needle) ? `contains ${needle}` : 'clean'}`).toBe(`${name}: clean`);
    }
  }
};

describe('no response-derived text reaches any output (end to end)', () => {
  it('healthy target with planted markers', async () => {
    const r = await runScript('healthy');
    const report = JSON.parse(r.report);
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    // Search carries marker text but no coordinate key, so it passes and hands a
    // marker-laden name to by-name — which the report must reference, not copy.
    expect(byId['species-api.search:Cattleya']).toMatchObject({ status: 'pass', observedCount: 2 });
    expect(byId['species-api.by-name:first-match-for:Cattleya']).toMatchObject({
      status: 'fail',
      observation: 'coordinate-keys-present',
      coordinateKeys: ['decimallatitude', 'lat', 'lng'],
    });
    expect(byId['species-api.by-name:first-match-for:Cattleya'].nameHash).toMatch(/^[0-9a-f]{12}$/);
    expect(byId['supabase.ui-columns:species_mycorrhizal']).toMatchObject({ status: 'fail', observation: 'coordinate-keys-present' });
    expect(byId['supabase.count:atlas_occurrences']).toMatchObject({ status: 'pass', observedCount: 9 });
    expect(r.code).toBe(EXIT_CODES.FAIL);
    assertNoPlantedText({ stdout: r.stdout, stderr: r.stderr, report: r.report, summary: r.summary });
  }, 20000);

  it('hostile target (JSON 500, HTML 403, cross-origin redirect, gateway 503) with planted markers', async () => {
    const r = await runScript('hostile');
    const report = JSON.parse(r.report);
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId['species-api.search:Cattleya']).toMatchObject({ status: 'fail', observation: 'server_error' });
    expect(byId['species-api.by-name-nonsense:Zzyzxorchis nonexistens']).toMatchObject({ status: 'fail', observation: 'auth_wall' });
    expect(byId['supabase.count:species_mycorrhizal']).toMatchObject({ status: 'fail', observation: 'cross_origin_redirect' });
    expect(byId['supabase.count:species']).toMatchObject({ status: 'outage', observation: 'gateway-503' });
    assertNoPlantedText({ stdout: r.stdout, stderr: r.stderr, report: r.report, summary: r.summary });
  }, 20000);
});
