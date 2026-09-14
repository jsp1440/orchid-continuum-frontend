import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { genusProfileResearchHref } from '@/lib/genusProfileNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const source = readFileSync(resolve(process.cwd(), 'src/pages/GenusDetail.tsx'), 'utf8');

describe('Genus Profile → Research mounted handoff', () => {
  it('mounts the governed Research producer on the live genus profile', () => {
    expect(source).toContain('genusProfileResearchHref');
    expect(source).toContain("{ label: 'Research', to: genusProfileResearchHref(genus) }");
    expect(source).toContain('PLATFORM_LINKS(entry.genus).map');
  });

  it('preserves only the genus as explicit non-evidentiary Research context', () => {
    const url = new URL(genusProfileResearchHref('Phalaenopsis'), 'https://orchidcontinuum.test');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'genus',
      'origin',
    ]);
    expect(parseResearchRouteContext(url.searchParams)).toMatchObject({
      genus: 'Phalaenopsis',
      origin: 'genus-profile',
      contextIsEvidence: false,
    });

    for (const forbidden of [
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'occurrence_id',
      'record_id',
      'collector',
      'catalogue',
      'evidence',
      'confidence',
      'conclusion',
      'project',
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });
});
