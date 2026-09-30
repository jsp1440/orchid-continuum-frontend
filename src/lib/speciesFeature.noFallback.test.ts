import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFeaturedSpecies, fetchGenusSpeciesQueue } from './speciesFeature';

/**
 * speciesFeature must never serve a hand-authored species list. It used to
 * fall back to a local Cattleya list carrying unsourced conservation,
 * elevation, pollinator and mycorrhizal text with no fallback flag.
 */

// Taxon "facts" the removed local list carried. None may ever be returned.
const FABRICATED_FACTS = [
  'Vulnerable',
  'Endangered',
  'Bombus',
  'Xylocopa',
  'Tulasnella',
  'Ceratobasidium',
  'Rhizoctonia',
  'Northeastern Brazil',
  'Antioquia',
  '500–1,000 m',
  'national flower',
];

function stubFetch(handler: (url: string) => { status: number; body?: unknown } | 'throw') {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const result = handler(url);
    if (result === 'throw') throw new TypeError('network down');
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('speciesFeature — no local species fallback', () => {
  it('returns [] for Cattleya when every live source is down (outage)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(() => 'throw');
    const pending = fetchFeaturedSpecies(4, undefined, 'Cattleya');
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([]);
  });

  it('returns [] for the Cattleya queue when every live source answers 5xx', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(() => ({ status: 503 }));
    const pending = fetchGenusSpeciesQueue(12, undefined, 'Cattleya');
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([]);
  });

  it('partial payload: only fields the backend sent are present; nothing is filled in', async () => {
    // Synthetic error-state shape: a taxonomy row with a name and no ecology.
    stubFetch((url) =>
      url.includes('/api/species/search')
        ? { status: 200, body: { results: [{ scientific_name: 'Cattleya labiata' }] } }
        : { status: 404 },
    );
    const out = await fetchFeaturedSpecies(4, undefined, 'Cattleya');
    expect(out.map((s) => s.name)).toEqual(['Cattleya labiata']);
    const [row] = out;
    for (const field of ['conservation', 'pollinator', 'mycorrhizal', 'elevation', 'distribution', 'habitat', 'climate'] as const) {
      expect(row[field], field).toBeFalsy();
    }
    const text = JSON.stringify(out);
    for (const fact of FABRICATED_FACTS) expect(text).not.toContain(fact);
  });
});
