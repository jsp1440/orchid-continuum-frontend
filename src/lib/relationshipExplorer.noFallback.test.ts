import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/genusData', async () => ({
  ...(await vi.importActual<typeof import('@/lib/genusData')>('@/lib/genusData')),
  fetchGenusImagesWithSource: vi.fn(async () => ({ images: [], source: 'pending' })),
}));

import {
  TEST_SPECIES,
  fetchRelationshipExplorerPayload,
  normalizePayload,
  type RelationshipExplorerPayload,
} from './relationshipExplorer';

/**
 * The Relationship Explorer used to merge a hand-written "safe MVP" payload
 * into partial API responses and relabel the result `source: "api"`. Nothing
 * from a local fallback may appear in any payload, and `source: "api"` may only
 * label fields the API actually returned.
 */

// Strings that only ever existed in the removed local payloads.
const FALLBACK_MARKERS = [
  'safe-mvp',
  'Safe MVP',
  'Build 203C',
  'Thouars',
  "Darwin's orchid",
  'Comet orchid',
  'Fragrant dendrobium',
  '(Luer) Luer',
  'atlas_seed',
  'atlas_partial',
  'needs_occurrence_data',
  'fungal partner candidate',
  'literature_mycorrhiza_symbiosis_claims',
  'seed/protocorm dependency',
  'moderate_reasoning_confidence',
  'v_species_globi_interaction_summary_v1',
  'interaction partner available',
];

function assertNoFallbackContent(payload: RelationshipExplorerPayload) {
  const text = JSON.stringify(payload);
  for (const marker of FALLBACK_MARKERS) expect(text, marker).not.toContain(marker);
}

function stubFetch(response: () => Response | Promise<Response>) {
  const fn = vi.fn(async () => response());
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('relationshipExplorer — outage', () => {
  it.each(TEST_SPECIES)('network failure for %s → source "unavailable", every layer null', async (name) => {
    stubFetch(() => {
      throw new TypeError('network down');
    });
    const payload = await fetchRelationshipExplorerPayload(name);
    expect(payload.source).toBe('unavailable');
    expect(payload.atlas_summary).toBeNull();
    expect(payload.mycorrhiza_claims).toBeNull();
    expect(payload.fungal_dependency).toBeNull();
    expect(payload.reasoning).toBeNull();
    expect(payload.interaction_summary).toBeNull();
    expect(payload.species_profile?.author ?? null).toBeNull();
    expect(payload.species_profile?.common_name ?? null).toBeNull();
    expect(payload.species_profile?.description ?? null).toBeNull();
    expect(Object.values(payload.cards).some(Boolean)).toBe(false);
    assertNoFallbackContent(payload);
  });

  it('non-2xx and non-object bodies are "unavailable", not "api"', async () => {
    stubFetch(() => new Response('oops', { status: 502 }));
    expect((await fetchRelationshipExplorerPayload('Angraecum sesquipedale')).source).toBe('unavailable');

    stubFetch(() => new Response(JSON.stringify(['not', 'an', 'object']), { status: 200 }));
    expect((await fetchRelationshipExplorerPayload('Angraecum sesquipedale')).source).toBe('unavailable');
  });
});

describe('relationshipExplorer — partial API payloads', () => {
  it('keeps API fields, leaves omitted fields null, and never merges fallback data', async () => {
    // Synthetic partial shape: the API answered with an atlas summary only.
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            scientific_name: 'Angraecum sesquipedale',
            atlas_summary: { occurrence_count: 3, atlas_readiness: null, atlas_confidence_score: null, countries: null, elevation_range: null },
          }),
          { status: 200 },
        ),
    );
    const payload = await fetchRelationshipExplorerPayload('Angraecum sesquipedale');
    expect(payload.source).toBe('api');
    expect(payload.atlas_summary?.occurrence_count).toBe(3);
    expect(payload.species_profile).toBeNull();
    expect(payload.mycorrhiza_claims).toBeNull();
    expect(payload.fungal_dependency).toBeNull();
    expect(payload.reasoning).toBeNull();
    expect(payload.cards).toMatchObject({
      atlas_summary: true,
      species_profile: false,
      mycorrhiza_claims: false,
      fungal_dependency: false,
      reasoning: false,
    });
    assertNoFallbackContent(payload);
  });

  it('an API card flag cannot claim a layer the payload does not carry', () => {
    const payload = normalizePayload('Cattleya maxima', {
      cards: { mycorrhiza_claims: true, reasoning: true, atlas_summary: true },
    });
    expect(payload?.source).toBe('api');
    expect(payload?.cards.mycorrhiza_claims).toBe(false);
    expect(payload?.cards.reasoning).toBe(false);
    expect(payload?.cards.atlas_summary).toBe(false);
  });

  it('nothing labelled source "api" originates from a fallback, for every test species', async () => {
    for (const name of TEST_SPECIES) {
      stubFetch(() => new Response(JSON.stringify({ scientific_name: name }), { status: 200 }));
      const payload = await fetchRelationshipExplorerPayload(name);
      expect(payload.source).toBe('api');
      // With an empty API body, no relationship layer can be present at all.
      expect(payload.atlas_summary).toBeNull();
      expect(payload.species_profile).toBeNull();
      expect(payload.mycorrhiza_claims).toBeNull();
      expect(payload.fungal_dependency).toBeNull();
      expect(payload.reasoning).toBeNull();
      expect(payload.interaction_summary).toBeNull();
      assertNoFallbackContent(payload);
    }
  });
});
