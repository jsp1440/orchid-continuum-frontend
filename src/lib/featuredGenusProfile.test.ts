import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURED_GENUS_PROFILE_CONTRACT,
  FEATURED_GENUS_SELECTION_CONTRACT,
  fetchFeaturedGenusProfile,
  fetchFeaturedGenusSelection,
  normalizeFeaturedGenusProfile,
  normalizeFeaturedGenusSelection,
} from '@/lib/featuredGenusProfile';

/**
 * Contract tests for the featured-genus-profile/v1 and
 * featured-genus-selection/v1 frontend read model. The module must fail
 * closed: anything off-contract becomes `unavailable`, never a partially
 * trusted scientific claim.
 */

function profilePayload(overrides: Record<string, unknown> = {}) {
  return {
    contract: FEATURED_GENUS_PROFILE_CONTRACT,
    status: 'ok',
    requested_genus: 'Cattleya',
    accepted_genus: 'Cattleya',
    generated_at: '2026-10-11T00:00:00+00:00',
    taxonomy: {
      state: 'known',
      recorded_species_count: 142,
      recorded_species_count_scope: 'accepted names in the OC taxonomy backbone',
      representative_names: ['Cattleya labiata', 'Cattleya trianae'],
    },
    media: { state: 'known', status: 'ok', returned_count: 9 },
    habitat: {
      state: 'known',
      climate_tag: 'tropical',
      collection_tag: 'epiphyte',
      min_elevation_m: 600,
      max_elevation_m: 1800,
      source: 'oc_widget.v_genus_of_day_cards',
    },
    knowledge_graph: { state: 'known', node_count: 58, edge_count: 121 },
    domains: {
      taxonomy: { state: 'known', linked_nodes: 12, linked_edges: 20 },
      pollinators: { state: 'unknown', linked_nodes: 0, linked_edges: 0 },
      conservation: { state: 'unavailable', linked_nodes: null, linked_edges: null },
    },
    gaps: ['pollinators'],
    provenance: { taxonomy: 'public.orchid_taxonomy' },
    notes: ['Knowledge-gap states describe our records, never the genus itself.'],
    ...overrides,
  };
}

function selectionPayload(overrides: Record<string, unknown> = {}) {
  return {
    contract: FEATURED_GENUS_SELECTION_CONTRACT,
    genus: 'Cattleya',
    source: 'deterministic_rotation',
    window: {
      index: 42,
      window_seconds: 43200,
      started_at: '2026-10-11T00:00:00+00:00',
      ends_at: '2026-10-11T12:00:00+00:00',
      seconds_remaining: 3600,
    },
    rotation: { candidates: ['Cattleya', 'Dracula'], candidate_count: 2 },
    override: { status: 'none' },
    selection_caution: null,
    ...overrides,
  };
}

describe('normalizeFeaturedGenusProfile', () => {
  it('accepts a full v1 payload and maps snake_case to the camelCase read model', () => {
    const profile = normalizeFeaturedGenusProfile(profilePayload());
    expect(profile).not.toBeNull();
    expect(profile?.acceptedGenus).toBe('Cattleya');
    expect(profile?.taxonomy.recordedSpeciesCount).toBe(142);
    expect(profile?.taxonomy.representativeNames).toEqual(['Cattleya labiata', 'Cattleya trianae']);
    expect(profile?.media.returnedCount).toBe(9);
    expect(profile?.habitat.minElevationM).toBe(600);
    expect(profile?.knowledgeGraph.edgeCount).toBe(121);
    expect(profile?.domains.pollinators.state).toBe('unknown');
    expect(profile?.domains.conservation.linkedNodes).toBeNull();
    expect(profile?.gaps).toEqual(['pollinators']);
  });

  it('rejects a payload from a different contract version', () => {
    expect(normalizeFeaturedGenusProfile(profilePayload({ contract: 'featured-genus-profile/v0' }))).toBeNull();
    expect(normalizeFeaturedGenusProfile(profilePayload({ contract: undefined }))).toBeNull();
  });

  it('rejects an out-of-vocabulary evidence state — absence is not a state', () => {
    const payload = profilePayload();
    (payload.taxonomy as Record<string, unknown>).state = 'absent';
    expect(normalizeFeaturedGenusProfile(payload)).toBeNull();
  });

  it('rejects a negative species count — counts can be null, never negative', () => {
    const payload = profilePayload();
    (payload.taxonomy as Record<string, unknown>).recorded_species_count = -3;
    expect(normalizeFeaturedGenusProfile(payload)).toBeNull();
  });

  it('accepts a below-sea-level elevation instead of voiding the whole profile', () => {
    const payload = profilePayload();
    (payload.habitat as Record<string, unknown>).min_elevation_m = -5;
    const profile = normalizeFeaturedGenusProfile(payload);
    expect(profile).not.toBeNull();
    expect(profile?.habitat.minElevationM).toBe(-5);
  });

  it('still rejects a non-finite elevation', () => {
    const payload = profilePayload();
    (payload.habitat as Record<string, unknown>).max_elevation_m = Number.POSITIVE_INFINITY;
    expect(normalizeFeaturedGenusProfile(payload)).toBeNull();
  });

  it('rejects representative names that are not all strings', () => {
    const payload = profilePayload();
    (payload.taxonomy as Record<string, unknown>).representative_names = ['Cattleya labiata', 7];
    expect(normalizeFeaturedGenusProfile(payload)).toBeNull();
  });

  it('rejects a malformed domain record', () => {
    const payload = profilePayload();
    (payload.domains as Record<string, unknown>).traits = { state: 'known' };
    expect(normalizeFeaturedGenusProfile(payload)).toBeNull();
  });
});

describe('normalizeFeaturedGenusSelection', () => {
  it('accepts a valid rotation selection', () => {
    const selection = normalizeFeaturedGenusSelection(selectionPayload());
    expect(selection).not.toBeNull();
    expect(selection?.genus).toBe('Cattleya');
    expect(selection?.source).toBe('deterministic_rotation');
    expect(selection?.windowSeconds).toBe(43200);
    expect(selection?.secondsRemaining).toBe(3600);
    expect(selection?.overrideStatus).toBe('none');
  });

  it('rejects a non-canonical genus carried by the selection', () => {
    expect(normalizeFeaturedGenusSelection(selectionPayload({ genus: 'not a genus' }))).toBeNull();
  });

  it('rejects an unknown selection source', () => {
    expect(normalizeFeaturedGenusSelection(selectionPayload({ source: 'random' }))).toBeNull();
  });

  it('rejects the wrong contract version', () => {
    expect(
      normalizeFeaturedGenusSelection(selectionPayload({ contract: 'featured-genus-selection/v9' })),
    ).toBeNull();
  });
});

describe('fetchFeaturedGenusProfile', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns the normalized profile for an on-contract response', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => profilePayload() });
    const result = await fetchFeaturedGenusProfile('Cattleya');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.profile.acceptedGenus).toBe('Cattleya');
    }
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/featured-genus/v1/profile/Cattleya');
  });

  it('maps a non-OK HTTP response to unavailable', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect((await fetchFeaturedGenusProfile('Cattleya')).status).toBe('unavailable');
  });

  it('passes an explicit invalid_genus verdict through', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ contract: FEATURED_GENUS_PROFILE_CONTRACT, status: 'invalid_genus' }),
    });
    expect((await fetchFeaturedGenusProfile('Cattleya')).status).toBe('invalid_genus');
  });

  it('maps an off-contract payload to unavailable rather than trusting it', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => profilePayload({ contract: 'v0' }) });
    expect((await fetchFeaturedGenusProfile('Cattleya')).status).toBe('unavailable');
  });

  it('maps a network failure to unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect((await fetchFeaturedGenusProfile('Cattleya')).status).toBe('unavailable');
  });

  it('rethrows when the caller aborts instead of masking it as unavailable', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));
    await expect(fetchFeaturedGenusProfile('Cattleya', controller.signal)).rejects.toThrow(/abort/i);
  });

  it('rejects a non-canonical genus before any request is made', async () => {
    await expect(fetchFeaturedGenusProfile('not a genus')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchFeaturedGenusSelection', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns the normalized selection for an on-contract response', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => selectionPayload() });
    const result = await fetchFeaturedGenusSelection();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.selection.genus).toBe('Cattleya');
      expect(result.selection.windowSeconds).toBe(43200);
    }
  });

  it('maps an off-contract selection payload to unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => selectionPayload({ genus: 'not a genus' }),
    });
    expect((await fetchFeaturedGenusSelection()).status).toBe('unavailable');
  });
});
