import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: null, error: new Error('offline') })) },
  },
}));

import { fetchValidatedSpeciesOutcome } from './genusData';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('taxonomy validation outcome', () => {
  it('preserves an unavailable outcome when the backbone request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    await expect(fetchValidatedSpeciesOutcome('Dracula')).resolves.toEqual({
      status: 'unavailable',
      names: [],
    });
  });

  it('preserves an unavailable outcome for an unrecognized 2xx envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'temporarily unavailable' }),
      { status: 200 },
    )));
    await expect(fetchValidatedSpeciesOutcome('Dracula')).resolves.toEqual({
      status: 'unavailable',
      names: [],
    });
  });

  it('reports a successful empty backbone result separately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ results: [] }),
      { status: 200 },
    )));
    await expect(fetchValidatedSpeciesOutcome('Dracula')).resolves.toEqual({
      status: 'ok',
      names: [],
    });
  });

  it('returns validated binomials from a successful backbone result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ results: [{ genus: 'Dracula', specific_epithet: 'vampira' }] }),
      { status: 200 },
    )));
    await expect(fetchValidatedSpeciesOutcome('Dracula')).resolves.toEqual({
      status: 'ok',
      names: ['Dracula vampira'],
    });
  });
});
