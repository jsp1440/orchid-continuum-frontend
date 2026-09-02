import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { atlasWorkspaceSpeciesHref } from '@/lib/featuredTaxonNavigation';

const navbarSource = readFileSync(resolve(process.cwd(), 'src/components/orchid/Navbar.tsx'), 'utf8');
const speciesSource = readFileSync(resolve(process.cwd(), 'src/pages/Species.tsx'), 'utf8');

describe('Atlas workspace → Species genus handoff', () => {
  it('emits only the genus filter the Species surface consumes', () => {
    const url = new URL(atlasWorkspaceSpeciesHref('Cattleya'), 'https://continuum.local');
    expect(url.pathname).toBe('/species');
    expect(Object.fromEntries(url.searchParams)).toEqual({ genus: 'Cattleya' });
    expect([...url.searchParams.keys()]).toEqual(['genus']);
  });

  it('mounts the handoff in the shared navbar when Atlas has one active genus', () => {
    expect(navbarSource).toContain('atlasWorkspaceSpeciesHref');
    expect(navbarSource).toContain("l.route === '/species' && atlasGenus");
    expect(navbarSource).toContain('navigate(atlasWorkspaceSpeciesHref(atlasGenus))');
  });

  it('lands on a receiving surface that immediately acts on the genus', () => {
    expect(speciesSource).toContain("searchParams.get('genus')");
    expect(speciesSource).toContain('useState(() => genusFilter)');
    expect(speciesSource).toContain('Filtering by');
    expect(speciesSource).toContain('Genus: {genusFilter}');
  });

  it('does not carry Atlas locality, record, provenance, or evidence material', () => {
    const url = new URL(atlasWorkspaceSpeciesHref('Cattleya'), 'https://continuum.local');
    for (const key of [
      'locality', 'lat', 'lng', 'latitude', 'longitude',
      'occurrence', 'occurrenceId', 'recordId',
      'collector', 'catalogue', 'confidence', 'evidence',
      'context_is_evidence', 'origin',
    ]) {
      expect(url.searchParams.has(key)).toBe(false);
    }
  });

  it('fails closed rather than inventing an empty genus filter', () => {
    expect(() => atlasWorkspaceSpeciesHref('   ')).toThrow();
  });
});
