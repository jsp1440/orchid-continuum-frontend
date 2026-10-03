// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: { images: [] }, error: null })) },
  },
}));

import { fetchGenusImagesWithSource } from './genusData';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('genus image outcome', () => {
  it('reports empty only when the trusted harvester answered successfully', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ images: [] }), { status: 200 })));
    const pending = fetchGenusImagesWithSource('Testorchis');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ images: [], source: 'empty' });
  });

  it('reports pending when no remote source answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    await expect(fetchGenusImagesWithSource('Testorchis')).resolves.toEqual({ images: [], source: 'pending' });
  });

  it('reports pending for a 2xx error envelope instead of confirming an empty result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'temporarily unavailable' }), { status: 200 })));
    const pending = fetchGenusImagesWithSource('Testorchis');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ images: [], source: 'pending' });
  });

  it('reports pending when a recognized image array contains only malformed rows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ images: [{ detail: 'temporarily unavailable' }] }), { status: 200 })));
    const pending = fetchGenusImagesWithSource('Testorchis');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ images: [], source: 'pending' });
  });
});
