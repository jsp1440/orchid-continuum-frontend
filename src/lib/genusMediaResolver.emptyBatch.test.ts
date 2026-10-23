import { afterEach, expect, it, vi } from 'vitest';
import { fetchCalyxGenusMedia, publicGenusMediaItems } from './genusMediaResolver';

afterEach(() => vi.unstubAllGlobals());

function install(primaryStatus = 'no_approved_media', license = 'cc-by', acceptedGenus = 'Masdevallia') {
  const media = {
    id: 'fixture-photo', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/123/original.jpg',
    source: 'iNaturalist', license, rights_holder: 'Fixture photographer',
  };
  const card = {
    taxon_id: 'fixture-taxon', display_name: 'Masdevallia testii',
    full_scientific_name: 'Masdevallia testii', genus: 'Masdevallia',
    confidence: {}, caveats: [], unavailable_domains: [], provenance: [], representative_media: media,
  };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
    String(input).includes('/api/media/')
      ? { status: primaryStatus, requested_genus: 'Masdevallia', accepted_genus: 'Masdevallia', items: [] }
      : { contract: 'calyx-species-exhibit-v1', accepted_genus: acceptedGenus, publication_authority: false, graph_mutation: false, items: [card] },
  )));
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, media };
}

it('recovers an explicitly empty approved-media batch from the same canonical exhibit', async () => {
  const { fetcher, media } = install();
  const result = await fetchCalyxGenusMedia('Masdevallia');
  expect(result.status).toBe('ok');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String(fetcher.mock.calls[1][0])).toContain('/api/platform/homepage/genus/Masdevallia/species-exhibit');
  expect(publicGenusMediaItems(result.items)).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ image_url: media.url, scientific_name: 'Masdevallia testii', source_name: media.source, license: media.license, attribution: media.rights_holder });
  expect(result.summary).toMatchObject({ eligible_count: 1, returned_count: 1 });
});

it.each([
  ['missing license', '', 'Masdevallia'],
  ['different genus', 'cc-by', 'Vanda'],
])('retains the unavailable state for %s instead of inventing an approved image', async (_reason, license, acceptedGenus) => {
  const { fetcher } = install('no_approved_media', license, acceptedGenus);
  const result = await fetchCalyxGenusMedia('Masdevallia');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.status).toBe('no_approved_media');
  expect(result.items).toEqual([]);
});

it('does not override a primary invalid-genus decision with a fallback', async () => {
  const { fetcher } = install('invalid_genus');
  const result = await fetchCalyxGenusMedia('Masdevallia');
  expect(result.status).toBe('invalid_genus');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.items).toEqual([]);
});
