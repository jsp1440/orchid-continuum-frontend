import { describe, expect, it } from 'vitest';

import { sanitizeSpeciesExhibitCards, type SpeciesExhibitCard } from '@/lib/speciesExhibit';

function card(overrides: Partial<SpeciesExhibitCard> = {}): SpeciesExhibitCard {
  return {
    taxon_id: '1',
    display_name: 'Laelia anceps',
    full_scientific_name: 'Laelia anceps Lindl.',
    authorship: 'Lindl.',
    accepted_name_status: 'canonical_table_record',
    genus: 'Laelia',
    image_count: 1,
    representative_media: {
      id: 1,
      url: 'https://example.test/1.jpg',
      source: 'GBIF',
      license: 'CC-BY',
      rights_holder: null,
      observer_name: null,
      gbif_occurrence_key: null,
      identification_state: 'source_record_not_independently_verified',
    },
    caption: 'Laelia anceps: occurs in — Mexico.',
    distinguishing_fact: 'Laelia anceps — occurs in: Mexico',
    evidence_state: 'available',
    confidence: {
      state: 'available',
      score: 0.9,
      label: 'high',
      basis: 'persisted edge',
    },
    provenance: [{ kind: 'taxonomy', source: 'orchid_taxonomy', record_id: '1' }],
    unavailable_domains: [],
    contradictions: [],
    caveats: [],
    links: {},
    ...overrides,
  };
}

describe('sanitizeSpeciesExhibitCards', () => {
  it('rejects duplicate taxon IDs and normalized species names', () => {
    const result = sanitizeSpeciesExhibitCards([
      card(),
      card({ taxon_id: '1', display_name: 'Laelia autumnalis' }),
      card({ taxon_id: '2', display_name: '  laelia   anceps  ' }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('rejects duplicate or non-http representative media URLs', () => {
    const result = sanitizeSpeciesExhibitCards([
      card(),
      card({
        taxon_id: '2',
        display_name: 'Laelia autumnalis',
        representative_media: {
          ...card().representative_media!,
          id: 2,
          url: 'https://example.test/1.jpg',
        },
        caption: 'Laelia autumnalis: occurs in — Mexico.',
      }),
      card({
        taxon_id: '3',
        display_name: 'Laelia speciosa',
        representative_media: {
          ...card().representative_media!,
          id: 3,
          url: 'javascript:alert(1)',
        },
        caption: 'Laelia speciosa: occurs in — Mexico.',
      }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('rejects repeated server-owned captions rather than inventing replacements', () => {
    const result = sanitizeSpeciesExhibitCards([
      card(),
      card({
        taxon_id: '2',
        display_name: 'Laelia autumnalis',
        representative_media: {
          ...card().representative_media!,
          id: 2,
          url: 'https://example.test/2.jpg',
        },
      }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('allows explicit unavailable captions without genus-level fallback', () => {
    const result = sanitizeSpeciesExhibitCards([
      card({ caption: null, distinguishing_fact: null }),
      card({
        taxon_id: '2',
        display_name: 'Laelia autumnalis',
        full_scientific_name: 'Laelia autumnalis (Lex.) Lindl.',
        representative_media: null,
        caption: null,
        distinguishing_fact: null,
        evidence_state: 'provisional',
      }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.caption === null)).toBe(true);
  });

  it('caps the public exhibit at nine distinct cards', () => {
    const cards = Array.from({ length: 12 }, (_, index) =>
      card({
        taxon_id: String(index + 1),
        display_name: `Laelia species${index + 1}`,
        full_scientific_name: `Laelia species${index + 1}`,
        representative_media: {
          ...card().representative_media!,
          id: index + 1,
          url: `https://example.test/${index + 1}.jpg`,
        },
        caption: `Laelia species${index + 1}: persisted relation — example ${index + 1}.`,
      }),
    );
    expect(sanitizeSpeciesExhibitCards(cards)).toHaveLength(9);
  });
});
