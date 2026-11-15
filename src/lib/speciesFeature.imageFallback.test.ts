import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal('fetch', mocks.fetch);

const { fetchGenusSpeciesQueue } = await import('@/lib/speciesFeature');

beforeEach(() => {
  mocks.fetch.mockReset();
});

const response = (rows: unknown[]) => ({ ok: true, json: async () => ({ items: rows }) });
const photo = {
  genus: 'Cattleya',
  specific_epithet: 'labiata',
  image_url: 'https://static.inaturalist.org/photos/123/orchid.jpg',
};

describe('genus image fallback', () => {
  it('tries the harvester after a successful but empty public image response', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([photo]))
      .mockResolvedValueOnce(response([]));
    const result = await fetchGenusSpeciesQueue(12, undefined, 'Cattleya');
    expect(result.some((species) => species.name === 'Cattleya labiata' && species.image === photo.image_url)).toBe(true);
    expect(String(mocks.fetch.mock.calls[1][0])).toContain('/images/genus/Cattleya');
  });

  it('tries the harvester when the public source returns only excluded specimen media', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response([{ ...photo, image_url: 'https://example.com/herbarium/specimen.jpg' }]))
      .mockResolvedValueOnce(response([photo]))
      .mockResolvedValueOnce(response([]));
    const result = await fetchGenusSpeciesQueue(12, undefined, 'Cattleya');
    expect(result.some((species) => species.name === 'Cattleya labiata' && species.image === photo.image_url)).toBe(true);
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/images/genus/'))).toHaveLength(2);
  });

  it('does not call the harvester when the public image source has a usable photograph', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response([photo]))
      .mockResolvedValueOnce(response([]));
    await fetchGenusSpeciesQueue(12, undefined, 'Cattleya');
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/images/genus/'))).toHaveLength(1);
  });

  it('does not request images or taxonomy when cancelled before starting', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await fetchGenusSpeciesQueue(12, controller.signal, 'Cattleya');
    expect(result).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not request taxonomy or show a curated fallback after an image request is cancelled', async () => {
    const controller = new AbortController();
    mocks.fetch.mockImplementationOnce(async () => {
      controller.abort();
      return response([]);
    });
    const result = await fetchGenusSpeciesQueue(12, controller.signal, 'Cattleya');
    expect(result).toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not fall back after cancellation', async () => {
    const controller = new AbortController();
    mocks.fetch.mockImplementationOnce(async () => {
      controller.abort();
      return response([]);
    });
    await fetchGenusSpeciesQueue(12, controller.signal, 'Cattleya');
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/images/genus/'))).toHaveLength(1);
  });
});
