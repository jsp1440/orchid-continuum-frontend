import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GENUS_PROFILE_ORIGIN, genusProfileAtlasHref } from '@/lib/genusProfileNavigation';

const source = readFileSync(resolve(process.cwd(), 'src/pages/GenusDetail.tsx'), 'utf8');

describe('Genus Profile → Atlas mounted handoff', () => {
  it('mounts the canonical genus-profile Atlas builder on the live GenusDetail page', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*genusProfileAtlasHref[^}]*\}\s*from ['"]@\/lib\/genusProfileNavigation['"]/,
    );
    expect(source).toContain("{ label: 'Atlas', to: genusProfileAtlasHref(genus) }");
    expect(source).toContain('PLATFORM_LINKS(entry.genus).map');
    expect(source).not.toContain("{ label: 'Atlas', to: '/atlas' }");
  });

  it('preserves the genus without borrowing the Genus of the Day origin or exposing extra context', () => {
    const href = genusProfileAtlasHref('Phalaenopsis');
    const url = new URL(href, 'https://orchid-continuum.invalid');

    expect(url.pathname).toBe('/atlas');
    expect(url.searchParams.get('genera')).toBe('Phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(GENUS_PROFILE_ORIGIN);
    expect(url.searchParams.get('origin')).not.toBe('homepage-featured-taxon');
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genera', 'origin'].sort(),
    );
  });
});
