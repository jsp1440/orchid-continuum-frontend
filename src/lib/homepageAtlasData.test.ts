import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHomepageAtlasGenus } from './homepageAtlasData';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('homepageAtlasData', () => {
  it('keeps a successful empty response distinct from a backend failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ occurrences: [] }),
    }));

    const result = await loadHomepageAtlasGenus('Dracula');

    expect(result.status).toBe('empty');
    expect(result.httpStatus).toBe(200);
  });

  it('reports a non-OK response as a service error rather than scientific absence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await loadHomepageAtlasGenus('Dracula');

    expect(result.status).toBe('error');
    expect(result.httpStatus).toBe(503);
  });

  it('normalizes only valid georeferenced occurrence rows and keeps optional evidence optional', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        occurrences: [
          {
            id: '1',
            scientific_name: 'Dracula vampira',
            decimal_latitude: 4.8,
            decimal_longitude: -75.7,
            country: 'Colombia',
            elevation_m: 1900,
          },
          {
            id: 'bad',
            scientific_name: 'Dracula vampira',
            decimal_latitude: 999,
            decimal_longitude: -75.7,
          },
        ],
      }),
    }));

    const result = await loadHomepageAtlasGenus('Dracula');

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.points).toHaveLength(1);
    expect(result.points[0].species).toBe('Dracula vampira');
    expect(result.points[0].elevationM).toBe(1900);
    expect(result.points[0].habitat).toBeNull();
  });
});
