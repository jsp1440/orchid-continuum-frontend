import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GENUS_PROFILE_ORIGIN,
  genusProfileResearchHref,
} from '@/lib/genusProfileNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const source = readFileSync(resolve(process.cwd(), 'src/pages/ResearchCenter.tsx'), 'utf8');

describe('Research Center Genus Profile arrival', () => {
  it('keeps the governed genus and attributes it to the Genus Profile', () => {
    const url = new URL(genusProfileResearchHref('Phalaenopsis'), 'https://orchidcontinuum.test');
    expect(parseResearchRouteContext(url.searchParams)).toMatchObject({
      origin: GENUS_PROFILE_ORIGIN,
      genus: 'Phalaenopsis',
      contextIsEvidence: false,
    });

    expect(source).toContain("routeContext?.origin === GENUS_PROFILE_ORIGIN");
    expect(source).toContain("'Continuing from the Genus Profile'");
  });

  it('does not route a Genus Profile arrival through Genus of the Day attribution', () => {
    expect(source).toContain('arrivedFromGenusProfile');
    expect(source).toContain("arrivedFromGenusProfile\n                        ? 'Continuing from the Genus Profile'");
  });
});
