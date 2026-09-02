import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { genusProfileSpeciesHref } from '@/lib/genusProfileNavigation';

const source = readFileSync(resolve(process.cwd(), 'src/pages/GenusDetail.tsx'), 'utf8');

describe('Genus Profile → Species mounted continuity', () => {
  it('mounts the canonical species-browser producer on both genus-level continuations', () => {
    expect(source).toContain('genusProfileSpeciesHref,');
    expect(source).toContain("{ label: 'Species', to: genusProfileSpeciesHref(genus) }");
    expect(source).toContain('to={genusProfileSpeciesHref(entry.genus)}');
    expect(source).not.toContain('to={`/species?genus=${encodeURIComponent(entry.genus)}`}');
  });

  it('preserves only the bounded genus into the Species browser', () => {
    const href = genusProfileSpeciesHref('Phalaenopsis');
    const url = new URL(href, 'https://orchid-continuum.test');

    expect(url.pathname).toBe('/species');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect([...url.searchParams.keys()]).toEqual(['genus']);

    for (const forbidden of [
      'origin',
      'context_is_evidence',
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'occurrenceId',
      'occurrence_id',
      'recordId',
      'collector',
      'catalogue',
      'evidence',
      'confidence',
      'conclusion',
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });
});
