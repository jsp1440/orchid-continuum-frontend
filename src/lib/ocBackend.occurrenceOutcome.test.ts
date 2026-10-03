import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGenusOccurrencesOutcome } from './ocBackend';

afterEach(() => vi.unstubAllGlobals());

describe('genus occurrence outcome', () => {
  it('preserves a successful empty response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));
    await expect(fetchGenusOccurrencesOutcome('Dracula')).resolves.toEqual({ status: 'ok', results: [] });
  });

  it('reports network and HTTP failures as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(fetchGenusOccurrencesOutcome('Dracula')).resolves.toEqual({
      status: 'unavailable',
      httpStatus: 503,
    });
  });

  it('reports a 2xx error envelope as unavailable, not successfully empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'temporarily unavailable' }), { status: 200 })));
    await expect(fetchGenusOccurrencesOutcome('Dracula')).resolves.toEqual({
      status: 'unavailable',
      httpStatus: 200,
    });
  });

  it('reports a recognized array containing only malformed rows as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [{ detail: 'temporarily unavailable' }] }), { status: 200 })));
    await expect(fetchGenusOccurrencesOutcome('Dracula')).resolves.toEqual({
      status: 'unavailable',
      httpStatus: 200,
    });
  });

  it('reports non-object rows as unavailable without rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [null, 'error'] }), { status: 200 })));
    await expect(fetchGenusOccurrencesOutcome('Dracula')).resolves.toEqual({
      status: 'unavailable',
      httpStatus: 200,
    });
  });
});
