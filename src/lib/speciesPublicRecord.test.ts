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
});
