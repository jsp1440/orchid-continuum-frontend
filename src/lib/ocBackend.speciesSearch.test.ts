/**
 * Species search must keep "the service did not answer" apart from "the
 * service answered with no species". Both previously became `[]`, and the
 * Species page rendered an unreachable service as "0 results · No species
 * matched". Response bodies here are SYNTHETIC shapes (a result row and error
 * statuses); they assert nothing about any orchid.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchSpecies, searchSpeciesOutcome } from './ocBackend';

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })));
}

afterEach(() => { vi.unstubAllGlobals(); });

const ROW = { taxonomy_id: 'synthetic-1', canonical_name: 'Synthetic example' };

describe('searchSpeciesOutcome', () => {
  it('reports a genuine empty answer as ok with no results', async () => {
    respond(200, []);
    await expect(searchSpeciesOutcome('Dracula')).resolves.toEqual({ status: 'ok', results: [] });
    respond(200, { results: [] });
    await expect(searchSpeciesOutcome('Dracula')).resolves.toEqual({ status: 'ok', results: [] });
  });

  it('returns rows from either response shape', async () => {
    respond(200, [ROW]);
    await expect(searchSpeciesOutcome('Synthetic')).resolves.toEqual({ status: 'ok', results: [ROW] });
    respond(200, { results: [ROW] });
    await expect(searchSpeciesOutcome('Synthetic')).resolves.toEqual({ status: 'ok', results: [ROW] });
  });

  it('reports a non-2xx response as unavailable, not empty', async () => {
    respond(503, { detail: 'unavailable' });
    await expect(searchSpeciesOutcome('Dracula')).resolves.toEqual({ status: 'unavailable', httpStatus: 503 });
  });

  it('reports a network failure as unavailable, not empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(searchSpeciesOutcome('Dracula')).resolves.toEqual({ status: 'unavailable', httpStatus: 0 });
  });

  it('fails closed on a 2xx body that carries no result list', async () => {
    respond(200, { message: 'proxy page' });
    await expect(searchSpeciesOutcome('Dracula')).resolves.toEqual({ status: 'unavailable', httpStatus: 200 });
  });
});

describe('searchSpecies (best-effort enrichment callers)', () => {
  it('keeps its array contract: rows on success, [] on failure', async () => {
    respond(200, { results: [ROW] });
    await expect(searchSpecies('Synthetic')).resolves.toEqual([ROW]);
    respond(500, {});
    await expect(searchSpecies('Synthetic')).resolves.toEqual([]);
  });
});
