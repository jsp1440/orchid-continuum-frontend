import { describe, expect, it } from 'vitest';
import { speciesExhibitMediaCandidates } from '@/lib/speciesExhibitMedia';
import type { SpeciesExhibitCard, SpeciesExhibitMedia } from '@/lib/speciesExhibit';

function media(url: string, source = 'GBIF', license = 'CC-BY'): SpeciesExhibitMedia {
  return {
    id: url,
    url,
    source,
    license,
    rights_holder: 'Example',
    observer_name: null,
    gbif_occurrence_key: null,
    identification_state: 'source_record_not_independently_verified',
  };
}

function card(representative: SpeciesExhibitMedia | null, extras: SpeciesExhibitMedia[] = []): SpeciesExhibitCard {
  return {
    taxon_id: '1',
    display_name: 'Vanilla planifolia',
    full_scientific_name: 'Vanilla planifolia',
    authorship: null,
    accepted_name_status: 'canonical_table_record',
    genus: 'Vanilla',
    image_count: extras.length + (representative ? 1 : 0),
    representative_media: representative,
    media: extras,
    caption: null,
    distinguishing_fact: null,
    evidence_state: 'provisional',
    confidence: { state: 'unavailable', score: null, label: null, basis: 'test' },
    provenance: [],
    unavailable_domains: [],
    contradictions: [],
    caveats: [],
    links: {},
  } as SpeciesExhibitCard;
}

describe('species exhibit media candidates', () => {
  it('keeps the canonical representative first and provides bounded server-owned fallbacks', () => {
    const first = media('https://example.test/first.jpg');
    const second = media('https://example.test/second.jpg', 'iNaturalist');
    expect(speciesExhibitMediaCandidates(card(first, [first, second])).map((item) => item.url)).toEqual([
      first.url,
      second.url,
    ]);
  });

  it('rejects non-http media and never manufactures a replacement', () => {
    const invalid = media('data:image/png;base64,abc');
    expect(speciesExhibitMediaCandidates(card(null, [invalid]))).toEqual([]);
  });

  it('rejects media without source or license provenance', () => {
    const noSource = { ...media('https://example.test/no-source.jpg'), source: null };
    const noLicense = { ...media('https://example.test/no-license.jpg'), license: null };
    const valid = media('https://example.test/valid.jpg', 'iNaturalist', 'CC-BY');
    expect(speciesExhibitMediaCandidates(card(null, [noSource, noLicense, valid]))).toEqual([valid]);
  });

  it('caps candidates at five to keep fallback behavior bounded', () => {
    const extras = Array.from({ length: 8 }, (_, index) => media(`https://example.test/${index}.jpg`));
    expect(speciesExhibitMediaCandidates(card(null, extras))).toHaveLength(5);
  });
});
