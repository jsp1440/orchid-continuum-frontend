/**
 * Regression for the 2026-11-07 live failure (#231): on the first request after
 * the Render backends idle, the homepage showed "evidence service did not
 * respond" and an empty Atlas lane, although the same page rendered the
 * photograph and 703 records ~25 s later. Each featured-genus fetcher must now
 * survive one unanswered first request and still fail closed afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGenusGraphEvidence } from './knowledgeGraph';
import { fetchCalyxGenusMedia } from './genusMediaResolver';
import { fetchSpeciesExhibit } from './speciesExhibit';

const GRAPH = {
  focal_node: { label: 'Cattleya' },
  graph: { node_count: 256, edge_count: 512 },
  pagination: { truncated: false, next_offset: null },
  domain_coverage: { taxonomy: { nodes: 256, edges: 512 } },
};
const MEDIA = {
  status: 'ok', requested_genus: 'Cattleya', accepted_genus: 'Cattleya', generated_at: null,
  items: [{
    media_id: 'oc-image:1', taxon_id: '7905', scientific_name: 'Cattleya aurantiaca', genus: 'Cattleya',
    image_url: 'https://media.example/c.jpg', thumbnail_url: 'https://media.example/c.jpg', source_name: 'EOL',
    source_record_url: null, license: 'cc-by-sa-3.0', attribution: null, media_kind: 'photograph', quality_score: null,
  }],
  summary: { eligible_count: 1, returned_count: 1, exclusion_counts: {} },
};

function hangOnce(body: unknown) {
  let calls = 0;
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(60_000);
  return pending;
}

describe('featured genus fetchers survive a cold start', () => {
  it('knowledge-graph coverage is ok after the first request times out', async () => {
    const fetcher = hangOnce(GRAPH);
    vi.stubGlobal('fetch', fetcher);
    const result = await settle(fetchGenusGraphEvidence('Cattleya'));
    expect(result.status).toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('knowledge-graph coverage still fails closed when the backend never answers', async () => {
    const fetcher = vi.fn(hangOnce(GRAPH).getMockImplementation()!);
    fetcher.mockImplementation((_i, init) => new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', fetcher);
    expect((await settle(fetchGenusGraphEvidence('Cattleya'))).status).toBe('unavailable');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('genus media no longer waits forever and returns the approved photograph after the retry', async () => {
    const fetcher = hangOnce(MEDIA);
    vi.stubGlobal('fetch', fetcher);
    const media = await settle(fetchCalyxGenusMedia('Cattleya'));
    expect(media.status).toBe('ok');
    expect(media.items.map((i) => i.scientific_name)).toEqual(['Cattleya aurantiaca']);
  });

  it('genus media reports a service error, never a substitute, when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn((_i: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    })));
    const media = await settle(fetchCalyxGenusMedia('Cattleya'));
    expect(media.status).toBe('service_error');
    expect(media.items).toEqual([]);
  });

  it('species exhibit no longer stays loading when the first request never answers', async () => {
    vi.stubGlobal('fetch', vi.fn((_i: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    })));
    const exhibit = await settle(fetchSpeciesExhibit('Cattleya'));
    expect(exhibit.status).toBe('unavailable');
  });
});
