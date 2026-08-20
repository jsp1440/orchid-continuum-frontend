import { describe, expect, it } from 'vitest';
import {
  authoredScientificName,
  buildRepresentativePlates,
  dedupeByTaxonIdentity,
  deriveEcologicalEvidence,
  displayScientificName,
  hasAuthorship,
  normalizedMediaKey,
  normalizedTaxonKey,
  selectRepresentativeMedia,
} from '@/lib/genusProfileDataQuality';

/**
 * FRONTEND-DATA-QUALITY-003 regressions.
 *
 * Each block pins one of the confirmed defects from issue #83 so the repaired
 * behaviour cannot silently revert.
 */

describe('scientific name normalisation (author strings)', () => {
  it('renders genus + specific epithet and never the author string', () => {
    expect(displayScientificName('Cattleya labiata Lindl.')).toBe('Cattleya labiata');
    expect(displayScientificName('Dracula vampira (Luer) Luer')).toBe('Dracula vampira');
    expect(displayScientificName('Masdevallia veitchiana Rchb.f.')).toBe('Masdevallia veitchiana');
  });

  it('drops infraspecific ranks and identification qualifiers from the display name', () => {
    expect(displayScientificName('Cattleya labiata var. rubra Lindl.')).toBe('Cattleya labiata');
    expect(displayScientificName('Phalaenopsis cf. amabilis')).toBe('Phalaenopsis');
    expect(displayScientificName('Dracula sp.')).toBe('Dracula');
  });

  it('normalises casing and hybrid markers without inventing an epithet', () => {
    expect(displayScientificName('cattleya LABIATA')).toBe('Cattleya labiata');
    expect(displayScientificName('Laelia × gouldiana')).toBe('Laelia gouldiana');
    expect(displayScientificName('Bulbophyllum')).toBe('Bulbophyllum');
    expect(displayScientificName('   ')).toBe('');
  });

  it('preserves the full authored name for provenance', () => {
    const authored = authoredScientificName('  Cattleya   labiata  Lindl. ');
    expect(authored).toBe('Cattleya labiata Lindl.');
    expect(hasAuthorship(authored)).toBe(true);
    expect(hasAuthorship('Cattleya labiata')).toBe(false);
  });

  it('treats names differing only by authorship as one taxon identity', () => {
    expect(normalizedTaxonKey('Cattleya labiata Lindl.')).toBe(
      normalizedTaxonKey('Cattleya labiata'),
    );
  });
});

describe('media identity normalisation', () => {
  it('treats the same photograph as one image across query strings and casing', () => {
    expect(normalizedMediaKey('https://cdn.example.org/Photos/A.jpg?size=large')).toBe(
      normalizedMediaKey('https://cdn.example.org/photos/a.jpg?size=small'),
    );
  });

  it('distinguishes genuinely different photographs', () => {
    expect(normalizedMediaKey('https://cdn.example.org/a.jpg')).not.toBe(
      normalizedMediaKey('https://cdn.example.org/b.jpg'),
    );
  });

  it('returns an empty key for unusable input rather than a false identity', () => {
    expect(normalizedMediaKey('')).toBe('');
    expect(normalizedMediaKey(undefined as unknown as string)).toBe('');
  });
});

describe('representative media selection', () => {
  const items = [
    { scientific_name: 'Cattleya labiata Lindl.', image_url: 'https://cdn.example.org/1.jpg' },
    // Same species under a different authored name — must not take a second tile.
    { scientific_name: 'Cattleya labiata', image_url: 'https://cdn.example.org/2.jpg' },
    // Same photograph under a different query string — must not repeat.
    { scientific_name: 'Cattleya mossiae', image_url: 'https://cdn.example.org/1.jpg?w=2' },
    { scientific_name: 'Cattleya trianae', image_url: 'https://cdn.example.org/3.jpg' },
  ];

  it('shows each species once and each photograph once', () => {
    const selected = selectRepresentativeMedia(items);
    expect(selected.map((item) => item.scientific_name)).toEqual([
      'Cattleya labiata Lindl.',
      'Cattleya trianae',
    ]);
  });

  it('excludes photographs already rendered elsewhere on the page', () => {
    const selected = selectRepresentativeMedia(items, {
      exclude: [normalizedMediaKey('https://cdn.example.org/1.jpg')],
    });
    expect(selected.map((item) => item.image_url)).toEqual([
      'https://cdn.example.org/2.jpg',
      'https://cdn.example.org/3.jpg',
    ]);
  });

  it('honours the tile limit so one genus cannot flood the gallery', () => {
    expect(selectRepresentativeMedia(items, { limit: 1 })).toHaveLength(1);
    expect(selectRepresentativeMedia(items, { limit: 0 })).toEqual([]);
  });

  it('drops records with no usable image URL instead of rendering a blank tile', () => {
    const selected = selectRepresentativeMedia([
      { scientific_name: 'Cattleya labiata', image_url: '' },
      { scientific_name: '', image_url: 'https://cdn.example.org/4.jpg' },
    ]);
    expect(selected).toEqual([]);
  });
});

describe('representative species plates', () => {
  const plates = [
    { species: 'Dracula vampira', image: 'https://cdn.example.org/v.jpg' },
    // Duplicate species (authored variant) — must not produce a second plate.
    { species: 'Dracula vampira (Luer) Luer', image: 'https://cdn.example.org/v2.jpg' },
    { species: 'Dracula chimaera', image: 'https://cdn.example.org/c.jpg' },
  ];

  it('renders one plate per taxon identity', () => {
    const built = buildRepresentativePlates(plates, {
      nameOf: (plate) => plate.species,
      urlsOf: (plate) => [plate.image],
    });
    expect(built.map((plate) => plate.displayName)).toEqual([
      'Dracula vampira',
      'Dracula chimaera',
    ]);
  });

  it('never offers the same photograph to two plates', () => {
    const built = buildRepresentativePlates(
      [
        { species: 'Dracula vampira', image: 'https://cdn.example.org/shared.jpg' },
        { species: 'Dracula chimaera', image: 'https://cdn.example.org/shared.jpg?v=2' },
      ],
      { nameOf: (plate) => plate.species, urlsOf: (plate) => [plate.image] },
    );
    expect(built[0].urls).toEqual(['https://cdn.example.org/shared.jpg']);
    // The second plate has no photograph left of its own — the caller drops it
    // rather than repeating the first plate's image.
    expect(built[1].urls).toEqual([]);
  });

  it('keeps the authored name out of the display name but available as provenance', () => {
    const [plate] = buildRepresentativePlates(
      [{ species: 'Cattleya labiata Lindl.', image: 'https://cdn.example.org/a.jpg' }],
      { nameOf: (entry) => entry.species, urlsOf: (entry) => [entry.image] },
    );
    expect(plate.displayName).toBe('Cattleya labiata');
    expect(plate.authoredName).toBe('Cattleya labiata Lindl.');
  });

  it('deduplicates plain species lists by taxon identity', () => {
    expect(
      dedupeByTaxonIdentity(
        ['Cattleya labiata Lindl.', 'Cattleya labiata', 'Cattleya trianae'],
        (name) => name,
      ),
    ).toEqual(['Cattleya labiata Lindl.', 'Cattleya trianae']);
  });
});

describe('ecological evidence states', () => {
  it('reports available only for canonical linked evidence', () => {
    const evidence = deriveEcologicalEvidence({
      serviceAnswered: true,
      hasLinkedEvidence: true,
      linkedSummary: '8 linked pollination records',
    });
    expect(evidence).toMatchObject({
      state: 'available',
      reason: 'linked-evidence',
      scope: 'genus',
      detail: '8 linked pollination records',
    });
  });

  it('refuses to call a client-side fallback summary evidence', () => {
    const evidence = deriveEcologicalEvidence({
      serviceAnswered: true,
      hasLinkedEvidence: true,
      isFallback: true,
      linkedSummary: '8 linked',
    });
    expect(evidence.state).toBe('unavailable');
    expect(evidence.reason).toBe('no-linked-evidence');
  });

  it('marks curated genus text as provisional, never as verified evidence', () => {
    const evidence = deriveEcologicalEvidence({
      serviceAnswered: true,
      hasLinkedEvidence: false,
      curatedGenusSummary: 'Fungus gnats (Bradysia, Mycetophilidae)',
    });
    expect(evidence.state).toBe('provisional');
    expect(evidence.reason).toBe('curated-genus-summary');
    expect(evidence.scope).toBe('genus');
  });

  it('separates an unreachable service from an empty knowledge graph', () => {
    const unreachable = deriveEcologicalEvidence({ serviceAnswered: false });
    expect(unreachable.state).toBe('unavailable');
    expect(unreachable.reason).toBe('service-unavailable');
    expect(unreachable.detail).not.toMatch(/\b0\b|zero/i);

    const emptyGraph = deriveEcologicalEvidence({ serviceAnswered: true, hasLinkedEvidence: false });
    expect(emptyGraph.state).toBe('unavailable');
    expect(emptyGraph.reason).toBe('no-linked-evidence');
    expect(emptyGraph.detail).toMatch(/knowledge gap/i);
  });

  it('ignores placeholder summaries that assert nothing', () => {
    const evidence = deriveEcologicalEvidence({
      serviceAnswered: true,
      hasLinkedEvidence: true,
      linkedSummary: 'No data yet',
    });
    expect(evidence.state).toBe('unavailable');
  });
});
