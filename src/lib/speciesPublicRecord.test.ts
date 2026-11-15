import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSpeciesById: vi.fn(),
  searchSpecies: vi.fn(),
}));

vi.mock('@/lib/ocBackend', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocBackend')>('@/lib/ocBackend');
  return {
    ...actual,
    fetchSpeciesById: mocks.fetchSpeciesById,
    searchSpecies: mocks.searchSpecies,
  };
});

const { fetchSpeciesPublicRecord } = await import('@/lib/speciesPublicRecord');

beforeEach(() => {
  mocks.fetchSpeciesById.mockReset();
  mocks.searchSpecies.mockReset();
});

describe('fetchSpeciesPublicRecord', () => {
  it('returns the detail record directly when /api/species/{id} answers', async () => {
    mocks.fetchSpeciesById.mockResolvedValue({
      taxonomy_id: '19550',
      canonical_name: 'Masdevallia abbreviata',
    });
    const record = await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata');
    expect(record?.canonical_name).toBe('Masdevallia abbreviata');
    expect(mocks.searchSpecies).not.toHaveBeenCalled();
  });

  it('falls back to the verified search index keyed on the route taxonomy id', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '99999', canonical_name: 'Masdevallia abbreviata var. other' },
      {
        taxonomy_id: '19550',
        canonical_name: 'Masdevallia abbreviata',
        genus: 'Masdevallia',
        representative_image_url: 'https://example.org/img.jpg',
      },
    ]);
    const record = await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata');
    expect(mocks.searchSpecies).toHaveBeenCalledWith(
      'Masdevallia abbreviata',
      10,
      undefined,
    );
    expect(record?.taxonomy_id).toBe('19550');
    expect(record?.canonical_name).toBe('Masdevallia abbreviata');
    expect(record?.representative_image_url).toBe('https://example.org/img.jpg');
  });

  it('preserves all modeled dossier details from the exact numeric-ID search hit', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '99999', canonical_name: 'Masdevallia abbreviata', hero_image_url: 'https://example.org/wrong.jpg' },
      {
        taxonomy_id: '19550',
        canonical_name: 'Masdevallia abbreviata',
        species: 'abbreviata',
        specific_epithet: 'abbreviata',
        tribe: 'Epidendreae',
        subfamily: 'Epidendroideae',
        authority: 'Rchb.f.',
        hero_image_url: 'https://example.org/exact.jpg',
        description: '  Source-supplied habitat description.  ',
        iucn_code: 'EN',
        common_name: null,
        region: 'Peru',
      },
    ]);

    const record = await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata');
    expect(record).toMatchObject({
      taxonomy_id: '19550',
      species: 'abbreviata',
      specific_epithet: 'abbreviata',
      tribe: 'Epidendreae',
      subfamily: 'Epidendroideae',
      authority: 'Rchb.f.',
      hero_image_url: 'https://example.org/exact.jpg',
      description: '  Source-supplied habitat description.  ',
      iucn_code: 'EN',
      common_name: null,
      region: 'Peru',
    });
    expect(record?.hero_image_url).not.toBe('https://example.org/wrong.jpg');
  });

  it('retains supplied optional fields for a uniquely matched name route', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '99999', canonical_name: 'Masdevallia abbreviata var. other', description: 'Wrong taxon' },
      {
        taxonomy_id: '19550',
        scientific_name: 'Masdevallia abbreviata',
        hero_image_url: 'https://example.org/name-match.jpg',
        description: 'Source-supplied notes',
        tribe: null,
        subfamily: null,
        iucn_code: null,
      },
    ]);

    const record = await fetchSpeciesPublicRecord('Masdevallia-abbreviata', null);
    expect(record?.taxonomy_id).toBe('19550');
    expect(record?.hero_image_url).toBe('https://example.org/name-match.jpg');
    expect(record?.description).toBe('Source-supplied notes');
    expect(record?.tribe).toBeNull();
    expect(record?.subfamily).toBeNull();
    expect(record?.iucn_code).toBeNull();
  });

  it('resolves a unique exact scientific-name route to its indexed taxon', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '19550', canonical_name: 'Masdevallia abbreviata', genus: 'Masdevallia' },
      { taxonomy_id: '19551', canonical_name: 'Masdevallia abbreviata var. other' },
    ]);
    const record = await fetchSpeciesPublicRecord('Masdevallia-abbreviata', null);
    expect(mocks.searchSpecies).toHaveBeenCalledWith('Masdevallia abbreviata', 10, undefined);
    expect(record?.taxonomy_id).toBe('19550');
    expect(record?.canonical_name).toBe('Masdevallia abbreviata');
  });

  it('refuses ambiguous exact scientific-name matches from different taxa', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '19550', canonical_name: 'Masdevallia abbreviata' },
      { taxonomy_id: '88888', scientific_name: 'Masdevallia abbreviata' },
    ]);
    expect(await fetchSpeciesPublicRecord('Masdevallia-abbreviata', null)).toBeNull();
  });

  it('can use a numeric route ID as a search query, but not as proof of identity', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '99999', canonical_name: 'Masdevallia abbreviata' },
      { taxonomy_id: '19550', canonical_name: 'Masdevallia abbreviata' },
    ]);
    const record = await fetchSpeciesPublicRecord('19550', null);
    expect(mocks.searchSpecies).toHaveBeenCalledWith('19550', 10, undefined);
    expect(record?.taxonomy_id).toBe('19550');
  });

  it('returns null rather than guessing when no index row matches the id', async () => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockResolvedValue([
      { taxonomy_id: '99999', canonical_name: 'Masdevallia abbreviata' },
    ]);
    const record = await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata');
    expect(record).toBeNull();
  });

  it.each(['___', '---', '', '19550oops', '1e5'])(
    'returns null without searching a malformed route ID %j', async (routeId) => {
    mocks.fetchSpeciesById.mockResolvedValue(null);
    const record = await fetchSpeciesPublicRecord(routeId, null);
    expect(record).toBeNull();
    expect(mocks.searchSpecies).not.toHaveBeenCalled();
  });
  it('skips all record lookups for a route aborted before hydration', async () => {
    const controller = new AbortController();
    controller.abort();

    expect(
      await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata', controller.signal),
    ).toBeNull();
    expect(mocks.fetchSpeciesById).not.toHaveBeenCalled();
    expect(mocks.searchSpecies).not.toHaveBeenCalled();
  });

  it('does not launch search fallback when route aborts during detail lookup', async () => {
    const controller = new AbortController();
    mocks.fetchSpeciesById.mockImplementation(async () => {
      controller.abort();
      return null;
    });

    expect(
      await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata', controller.signal),
    ).toBeNull();
    expect(mocks.searchSpecies).not.toHaveBeenCalled();
  });

  it('does not return a late matching index hit after route cancellation', async () => {
    const controller = new AbortController();
    mocks.fetchSpeciesById.mockResolvedValue(null);
    mocks.searchSpecies.mockImplementation(async () => {
      controller.abort();
      return [{ taxonomy_id: '19550', canonical_name: 'Masdevallia abbreviata' }];
    });

    expect(
      await fetchSpeciesPublicRecord('19550', 'Masdevallia abbreviata', controller.signal),
    ).toBeNull();
    expect(mocks.searchSpecies).toHaveBeenCalledTimes(1);
  });

});
