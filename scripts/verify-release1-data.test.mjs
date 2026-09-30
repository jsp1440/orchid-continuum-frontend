import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXIT_CODES,
  UI_SELECTS,
  checkByName,
  checkNonsense,
  checkSearch,
  checkTableCount,
  checkTableUiColumns,
  countFromContentRange,
  findCoordinateKeyPaths,
  isCoordinateKey,
  redact,
  resolveConfig,
  runVerification,
  verdictOf,
} from './verify-release1-data.mjs';

// Every payload below is a SYNTHETIC SHAPE for exercising the classifier. None
// of it is captured production data, and no count here is a real count.

const API = 'https://species-api.test.invalid';
const SUPA = 'https://supabase.test.invalid';
const KEY = 'synthetic-anon-key-0123456789abcdef';

const json = (status, body, extraHeaders = {}) => ({
  status,
  headers: new Map(Object.entries({ 'content-type': 'application/json; charset=utf-8', ...extraHeaders })),
  text: async () => JSON.stringify(body),
});
const html = (status, body = '<!doctype html><div id="root"></div>') => ({
  status,
  headers: new Map([['content-type', 'text/html']]),
  text: async () => body,
});
const networkDown = () => {
  throw new TypeError('fetch failed');
};

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

describe('coordinate-key detector', () => {
  it.each(['lat', 'lon', 'lng', 'latitude', 'Longitude', 'decimal_latitude', 'decimalLongitude', 'geometry', 'geom', 'coordinates'])(
    'flags %s',
    (key) => expect(isCoordinateKey(key)).toBe(true),
  );

  it.each(['locality_withheld', 'region', 'country', 'elevation_m', 'long_description', 'latest', 'genus', 'plateau'])(
    'does not flag %s',
    (key) => expect(isCoordinateKey(key)).toBe(false),
  );

  it('returns nested paths and never values', () => {
    const payload = [{ canonical_name: 'X y', occurrences: [{ lat: 1.5, lng: 2.5 }] }, { geometry: { type: 'Point' } }];
    const paths = findCoordinateKeyPaths(payload);
    expect(paths).toEqual(['$[0].occurrences[0].lat', '$[0].occurrences[0].lng', '$[1].geometry']);
    expect(JSON.stringify(paths)).not.toContain('1.5');
  });

  it('survives cycles', () => {
    const a = { name: 'a' };
    a.self = a;
    expect(findCoordinateKeyPaths(a)).toEqual([]);
  });
});

describe('species search: outage vs empty vs present vs 404', () => {
  it('reports an outage when the host is unreachable', async () => {
    const { check } = await checkSearch(routedFetch([[() => true, networkDown]]), cfg(), 'Cattleya');
    expect(check.status).toBe('outage');
    expect(check.observation).toBe('unreachable');
  });

  it('reports an outage for a 503 (cold start / down), not a failure', async () => {
    const { check } = await checkSearch(routedFetch([[() => true, () => json(503, { detail: 'unavailable' })]]), cfg(), 'Cattleya');
    expect(check.status).toBe('outage');
    expect(check.observation).toBe('http-503');
  });

  it('reports an outage on timeout', async () => {
    const hang = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const { check } = await checkSearch(routedFetch([[() => true, hang]]), cfg({ timeoutMs: 20 }), 'Cattleya');
    expect(check.status).toBe('outage');
    expect(check.observation).toBe('timeout');
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
    expect(check.status).toBe('fail');
    expect(check.observation).toBe('coordinate-keys-present');
    expect(JSON.stringify(check)).not.toContain('-8.1');
  });
});

describe('by-name and the nonsense taxon', () => {
  it('passes a taxonomy for a name search returned', async () => {
    const f = routedFetch([[(u) => u.includes('/by-name/'), () => json(200, summary('Cattleya labiata', { family: 'Orchidaceae' }))]]);
    const c = await checkByName(f, cfg(), 'Cattleya labiata', 'species-api.search:Cattleya');
    expect(c).toMatchObject({ status: 'pass', taxonomyFieldsPresent: ['family', 'genus'] });
    expect(f.calls[0].url).toBe(`${API}/api/species/by-name/Cattleya%20labiata`);
  });

  it('skips by-name when search produced nothing to look up', async () => {
    const f = routedFetch([]);
    const c = await checkByName(f, cfg(), '', 'species-api.search:Cattleya');
    expect(c.status).toBe('skipped');
    expect(f.calls).toHaveLength(0);
  });

  it('passes a positive 404 for nonsense once the route is proven', async () => {
    const c = await checkNonsense(routedFetch([[() => true, () => json(404, { detail: 'Species not found' })]]), cfg(), true);
    expect(c).toMatchObject({ status: 'pass', observation: 'not-found' });
  });

  it('does not accept a nonsense 404 when no known lookup proved the route', async () => {
    const c = await checkNonsense(routedFetch([[() => true, () => json(404, { detail: 'Not Found' })]]), cfg(), false);
    expect(c).toMatchObject({ status: 'fail', observation: 'not-found-route-unproven' });
  });

  it('keeps a nonsense outage distinct from not-found', async () => {
    const c = await checkNonsense(routedFetch([[() => true, () => json(502, {})]]), cfg(), true);
    expect(c).toMatchObject({ status: 'outage', observation: 'http-502' });
  });

  it('fails a fabricated match for a nonsense name', async () => {
    const c = await checkNonsense(routedFetch([[() => true, () => json(200, summary('Zzyzxorchis nonexistens'))]]), cfg(), true);
    expect(c).toMatchObject({ status: 'fail', observation: 'fabricated-match' });
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

  it('fails an empty required table and passes an empty optional one', async () => {
    const empty = routedFetch([[() => true, () => json(200, [], { 'content-range': '*/0' })]]);
    expect((await checkTableCount(empty, cfg(), 'species')).status).toBe('fail');
    expect(await checkTableCount(empty, cfg(), 'species_mycorrhizal')).toMatchObject({ status: 'pass', observation: 'empty' });
  });

  it('fails a rejected anon key and reports an outage for a 502', async () => {
    expect((await checkTableCount(routedFetch([[() => true, () => json(401, { message: 'JWT' })]]), cfg(), 'species')).observation).toBe('http-401');
    expect((await checkTableCount(routedFetch([[() => true, () => json(502, {})]]), cfg(), 'species')).status).toBe('outage');
  });

  it('treats a non-JSON 403 (egress proxy / WAF) as an outage, not a rejected key', async () => {
    const proxy = () => ({ status: 403, headers: new Map([['content-type', 'text/plain']]), text: async () => 'Host not in allowlist' });
    const c = await checkTableCount(routedFetch([[() => true, proxy]]), cfg(), 'species');
    expect(c).toMatchObject({ status: 'outage', observation: 'blocked-before-target' });
    const s = await checkSearch(routedFetch([[() => true, proxy]]), cfg(), 'Cattleya');
    expect(s.check).toMatchObject({ status: 'outage', observation: 'blocked-before-target' });
  });

  it('fails a UI column select the table rejects (schema drift)', async () => {
    const c = await checkTableUiColumns(routedFetch([[() => true, () => json(400, { message: 'column does not exist' })]]), cfg(), 'atlas_occurrences');
    expect(c).toMatchObject({ status: 'fail', observation: 'http-400' });
  });

  it('reports raw Atlas coordinates without failing, but fails them on a text surface', async () => {
    const withCoords = routedFetch([[() => true, () => json(200, [{ id: 'a', lat: 1, lng: 2 }])]]);
    const atlas = await checkTableUiColumns(withCoords, cfg(), 'atlas_occurrences');
    expect(atlas).toMatchObject({ status: 'pass', coordinateKeysSeen: ['lat', 'lng'] });
    const myco = await checkTableUiColumns(withCoords, cfg(), 'species_mycorrhizal');
    expect(myco).toMatchObject({ status: 'fail', observation: 'coordinate-keys-present' });
  });

  it('parses Content-Range', () => {
    expect(countFromContentRange('0-0/31073')).toBe(31073);
    expect(countFromContentRange('*/0')).toBe(0);
    expect(countFromContentRange('')).toBeNull();
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
    expect(report.summary).toMatchObject({ fail: 0, outage: 0 });
  });

  it('only ever issues GET requests', async () => {
    const f = healthy();
    await runVerification(cfg(), f);
    expect(f.calls.length).toBeGreaterThan(0);
    expect(f.calls.every((c) => c.init.method === 'GET')).toBe(true);
  });

  it('never includes the anon key, even when an error message echoes it', async () => {
    const leaky = routedFetch([
      [
        () => true,
        () => {
          throw new Error(`connect failed for apikey=${KEY}`);
        },
      ],
    ]);
    const report = await runVerification(cfg(), leaky);
    const text = JSON.stringify(report);
    expect(report.verdict).toBe('OUTAGE');
    expect(report.exitCode).toBe(EXIT_CODES.OUTAGE);
    expect(text).not.toContain(KEY);
    expect(text).toContain('[redacted]');
    expect(report.targets.anonKeyProvided).toBe(true);
  });

  it('never includes the anon key in a healthy report either', async () => {
    const text = JSON.stringify(await runVerification(cfg(), healthy()));
    expect(text).not.toContain(KEY);
  });

  it('is NOT_CONFIGURED without targets and never calls fetch', async () => {
    const f = routedFetch([]);
    const report = await runVerification(resolveConfig([], {}), f);
    expect(report.verdict).toBe('NOT_CONFIGURED');
    expect(report.exitCode).toBe(EXIT_CODES.NOT_CONFIGURED);
    expect(f.calls).toHaveLength(0);
  });

  it('ranks fail above outage above not-configured', () => {
    expect(verdictOf([{ status: 'outage' }, { status: 'fail' }])).toBe('FAIL');
    expect(verdictOf([{ status: 'outage' }, { status: 'skipped' }])).toBe('OUTAGE');
    expect(verdictOf([{ status: 'pass' }, { status: 'skipped' }])).toBe('NOT_CONFIGURED');
  });

  it('redacts keys and values alike', () => {
    expect(redact({ [KEY]: [`x${KEY}y`] }, [KEY])).toEqual({ '[redacted]': ['x[redacted]y'] });
  });
});

describe('configuration', () => {
  it('reads the same variable names the app reads', () => {
    const c = resolveConfig([], {
      VITE_API_BASE_URL: `${API}/`,
      VITE_SUPABASE_URL: SUPA,
      VITE_SUPABASE_ANON_KEY: ` ${KEY} `,
    });
    expect(c).toMatchObject({ apiBase: API, supabaseUrl: SUPA, anonKey: KEY });
    expect(resolveConfig([], { NEXT_PUBLIC_API_BASE_URL: API }).apiBase).toBe(API);
  });

  it('lets CLI args override the environment and rejects relative origins', () => {
    const c = resolveConfig(['--api-base', '/api', '--supabase-url=https://other.test.invalid', '--taxa', 'Masdevallia, Dracula'], {
      VITE_API_BASE_URL: API,
    });
    expect(c.apiBase).toBe('');
    expect(c.supabaseUrl).toBe('https://other.test.invalid');
    expect(c.knownTaxa).toEqual(['Masdevallia', 'Dracula']);
  });

  it('keeps UI_SELECTS in lockstep with the columns the app selects', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../src/lib/orchidContinuum.ts'), 'utf8');
    const constant = (name) => source.match(new RegExp(`const ${name} =\\s*'([^']+)'`))[1];
    expect(UI_SELECTS.species).toBe(constant('SPECIES_COLUMNS'));
    expect(UI_SELECTS.atlas_occurrences).toBe(constant('ATLAS_COLUMNS'));
    const myco = source.match(/\.from\('species_mycorrhizal'\)\s*\.select\('([^']+)'\)/)[1];
    expect(UI_SELECTS.species_mycorrhizal).toBe(myco);
  });

  it('hard-codes no origin or key', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const script = readFileSync(resolve(here, 'verify-release1-data.mjs'), 'utf8');
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(script).not.toMatch(/onrender\.com|databasepad\.com|supabase\.co\b/);
  });
});
