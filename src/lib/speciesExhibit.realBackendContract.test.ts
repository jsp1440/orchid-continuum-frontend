import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSpeciesExhibit } from '@/lib/speciesExhibit';
import realBackend from './__fixtures__/speciesExhibit.realBackend.json';

/**
 * Cross-boundary contract test.
 *
 * The fixture in `__fixtures__/speciesExhibit.realBackend.json` is the VERBATIM
 * output of the backend `build_species_exhibit()` service (calyx-species-exhibit-v1)
 * run against a seeded PostgreSQL with real Phalaenopsis taxa — captured by the
 * companion backend test `test_calyx_species_exhibit_integration.py`. Running that
 * real payload through the frontend's own `fetchSpeciesExhibit` parser proves the
 * two halves of the Species Exhibit slice actually interoperate on real data:
 * the contract is accepted, provenance survives the boundary, and an empty genus
 * fails closed rather than fabricating cards.
 */

const phalaenopsis = (realBackend as Record<string, unknown>).phalaenopsis;
const dracula = (realBackend as Record<string, unknown>).dracula;

function mockFetchOnceWith(payload: unknown, status = 200) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
  vi.stubGlobal('fetch', vi.fn(async () => res));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Species Exhibit real backend payload → frontend contract', () => {
  it('accepts the real calyx-species-exhibit-v1 payload and preserves provenance', async () => {
    mockFetchOnceWith(phalaenopsis);
    const result = await fetchSpeciesExhibit('Phalaenopsis');

    expect(result.status).toBe('ok');
    expect(result.response?.contract).toBe('calyx-species-exhibit-v1');
    expect(result.response?.publication_authority).toBe(false);
    expect(result.response?.graph_mutation).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);

    const amabilis = result.items.find((c) => c.full_scientific_name.includes('amabilis'));
    expect(amabilis).toBeDefined();
    // media provenance survives the service -> JSON -> frontend boundary
    expect(amabilis!.representative_media?.url).toContain('amabilis_1.jpg');
    expect(amabilis!.representative_media?.license).toBe('CC-BY-NC');
    expect(amabilis!.representative_media?.source).toBe('iNaturalist');
    // a persisted-graph-backed distinguishing fact + confidence come through
    expect(amabilis!.distinguishing_fact).toContain('has trait');
    expect(amabilis!.confidence.state).toBe('available');
    expect(amabilis!.provenance.map((p) => p.kind)).toEqual(
      expect.arrayContaining(['taxonomy', 'media', 'knowledge_graph']),
    );

    // a taxon without a graph edge is NOT given a fabricated caption
    const schilleriana = result.items.find((c) =>
      c.full_scientific_name.includes('schilleriana'),
    );
    expect(schilleriana?.caption).toBeNull();
    expect(schilleriana?.confidence.state).toBe('unavailable');
  });

  it('fails closed (unavailable) for an empty-genus real payload instead of fabricating cards', async () => {
    mockFetchOnceWith(dracula);
    const result = await fetchSpeciesExhibit('Dracula');
    expect(result.status).toBe('unavailable');
    expect(result.items).toEqual([]);
  });

  it('rejects a tampered contract as a service error', async () => {
    mockFetchOnceWith({ ...(phalaenopsis as object), graph_mutation: true });
    const result = await fetchSpeciesExhibit('Phalaenopsis');
    expect(result.status).toBe('service_error');
    expect(result.items).toEqual([]);
  });
});
