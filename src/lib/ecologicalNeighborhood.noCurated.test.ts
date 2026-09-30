import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ecological neighborhood used to pad (or replace) harvested relationship
 * rows with "curated" cards built from the hand-authored genus dataset:
 * habitat, pollinator, mycorrhizal, range, elevation and conservation text with
 * no source. Only harvested rows may render; otherwise the honest gap cards.
 */

const db = vi.hoisted(() => ({ rows: [] as unknown[], error: null as unknown }));

vi.mock('@/lib/supabase', () => {
  const chain = {
    schema: () => chain,
    from: () => chain,
    select: () => chain,
    ilike: () => chain,
    not: () => chain,
    limit: async () => ({ data: db.rows, error: db.error }),
  };
  return { supabase: chain };
});

import { fetchSpeciesEcologicalNeighborhood } from './ecologicalNeighborhood';

const FABRICATED_FACTS = [
  'Fungus gnats',
  'Tulasnella',
  'Ceratobasidium',
  '1,900–2,200 m',
  'Ecuador (Pichincha)',
  'Endemic · Vulnerable',
  'curated genus data',
  'curated Dracula Genus of the Day profile',
];

beforeEach(() => {
  db.rows = [];
  db.error = null;
});

describe('fetchSpeciesEcologicalNeighborhood — no curated fallback cards', () => {
  it('outage / nothing harvested → only the honest gap cards', async () => {
    db.error = new Error('offline');
    const cards = await fetchSpeciesEcologicalNeighborhood('Dracula vampira');
    expect(cards.map((c) => c.type)).toEqual(['species', 'missing']);
    expect(cards.every((c) => c.confidenceClass === 'gap')).toBe(true);
    expect(cards.some((c) => c.confidenceClass === 'curated' || c.sourceView === 'src.lib.genusData.GENERA')).toBe(false);
    const text = JSON.stringify(cards);
    for (const fact of FABRICATED_FACTS) expect(text, fact).not.toContain(fact);
  });

  it('partial harvest → harvested rows only, never topped up with curated cards', async () => {
    // Synthetic shape of one harvested row.
    db.rows = [
      {
        relationship_id: 1,
        focal_species: 'Dracula vampira',
        focal_genus: 'Dracula',
        neighbor_name: 'Example neighbour',
        neighbor_type: 'co_occurring_orchid',
        relationship_category: 'co_occurring_orchid',
        title: 'Example neighbour',
        relationship_reason: 'Harvested co-occurrence row.',
        source_schema: 'oc_api',
        source_table: 'example_table',
      },
    ];
    const cards = await fetchSpeciesEcologicalNeighborhood('Dracula vampira');
    expect(cards.length).toBe(1);
    expect(cards[0].title).toBe('Example neighbour');
    expect(cards.some((c) => c.confidenceClass === 'curated' || c.sourceView === 'src.lib.genusData.GENERA')).toBe(false);
    const text = JSON.stringify(cards);
    for (const fact of FABRICATED_FACTS) expect(text, fact).not.toContain(fact);
  });
});
