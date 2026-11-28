import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchContinuumGraph } from './ocBackend';

afterEach(() => vi.unstubAllGlobals());

describe('public genus relationship availability', () => {
  it('keeps unqueried legacy and current domains apart from measured zero', async () => {
    const nodes = {
      fungi: { status: 'empty', source: null, count: 0 },
      pollinators: { status: 'unavailable', count: null, source: null, summary: 'Pollinator source unavailable' },
      climate: { status: 'empty', source: 'public.orchid_occurrence', count: 0, summary: 'No elevation records' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ genus: 'Cattleya', nodes })));
    const graph = await fetchContinuumGraph('Cattleya');
    expect(graph.fungi).toMatchObject({ status: 'unavailable', count: null, hasData: false });
    expect(graph.pollinators).toMatchObject({ status: 'unavailable', summary: 'Pollinator source unavailable' });
    expect(graph.climate).toMatchObject({ status: 'empty', count: 0, summary: 'No elevation records', hasData: false });
  });

  it('does not supply substitute evidence for a blank genus', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const graph = await fetchContinuumGraph(' ');
    expect(fetcher).not.toHaveBeenCalled();
    expect(graph.genus).toBe('');
    expect(graph.fungi).toMatchObject({ status: 'unavailable', count: null, items: [] });
  });
});
