import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCalyxGenusMedia } from './genusMediaResolver';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('genusMediaResolver', () => {
  it('exports fetchCalyxGenusMedia as a function', () => {
    expect(typeof fetchCalyxGenusMedia).toBe('function');
  });

  it('shares one network request for concurrent callers of the same genus', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        requested_genus: 'Dracula',
        accepted_genus: 'Dracula',
        generated_at: '2026-08-14T00:00:00Z',
        items: [
          {
            media_id: 'm1',
            taxon_id: 't1',
            scientific_name: 'Dracula vampira',
            genus: 'Dracula',
            image_url: 'https://example.org/dracula.jpg',
            thumbnail_url: 'https://example.org/dracula-thumb.jpg',
            source_name: 'approved-source',
            source_record_url: null,
            license: 'CC BY',
            attribution: 'Photographer',
            media_kind: 'photograph',
            quality_score: 0.9,
          },
        ],
        summary: { eligible_count: 1, returned_count: 1, exclusion_counts: {} },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([
      fetchCalyxGenusMedia('Dracula'),
      fetchCalyxGenusMedia('Dracula'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.items[0]?.scientific_name).toBe('Dracula vampira');
    expect(b.items[0]?.image_url).toBe('https://example.org/dracula.jpg');
  });

  it('does not turn a service failure into a no-media scientific claim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await fetchCalyxGenusMedia('Masdevallia');

    expect(result.status).toBe('service_error');
    expect(result.items).toEqual([]);
  });
});
