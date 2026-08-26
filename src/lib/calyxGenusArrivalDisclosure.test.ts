import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { ATLAS_NEXT_CALYX_ORIGIN } from '@/features/atlas-next/researchHandoff';
import { ATLAS_WORKSPACE_ORIGIN, FEATURED_TAXON_ORIGIN } from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN } from '@/lib/genusProfileNavigation';
import {
  calyxNavigationContextIsExplicitlyNonEvidentiary,
} from '@/lib/calyxRouteTrustBoundary';

/**
 * Every governed genus origin has to say on screen what it carried.
 *
 * The machine-readable half of this boundary — `featured_taxon_is_evidence:
 * false` in the turn envelope — is covered elsewhere. This is about the half a
 * person sees. They are separate mechanisms and they drifted: `atlas-next` was
 * added to the trust boundary when its producer landed, so the declaration was
 * emitted correctly, while the banner still tested for two named origins and
 * silently showed a reader arriving from an occurrence map nothing at all.
 *
 * That is the arrival where silence costs the most. Someone who has just been
 * clicking occurrence records is the likeliest of any visitor to read a
 * carried genus as one of them.
 *
 * The route is asserted through its source rather than by mounting it, because
 * the property is "no governed origin is left out of the condition" — a render
 * test proves the origins someone remembered to write a case for, which is
 * exactly the thing that was wrong.
 */

const ROUTE_SOURCE = readFileSync(
  new URL('../components/calyx/AtlasAwareCalyxRoute.tsx', import.meta.url),
  'utf8',
);

/** Origins whose whole payload is a genus, and which therefore share a banner. */
const GENUS_ONLY_ORIGINS = [
  { name: 'FEATURED_TAXON_ORIGIN', value: FEATURED_TAXON_ORIGIN, flag: 'fromFeaturedTaxon' },
  { name: 'GENUS_PROFILE_ORIGIN', value: GENUS_PROFILE_ORIGIN, flag: 'fromGenusProfile' },
  { name: 'ATLAS_NEXT_CALYX_ORIGIN', value: ATLAS_NEXT_CALYX_ORIGIN, flag: 'fromAtlasNextGenus' },
];

describe('a governed genus arrival is disclosed to the reader, not only to the backend', () => {
  it.each(GENUS_ONLY_ORIGINS)('trusts $name at the boundary', ({ value }) => {
    const search = `?genus=Phalaenopsis&origin=${value}&context_is_evidence=false`;
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(true);
  });

  it.each(GENUS_ONLY_ORIGINS)('gates the genus banner on $name too', ({ flag }) => {
    // The condition that decides whether the reader is told anything.
    const condition = /\{\(([^)]*)\) && genus \? \(/.exec(ROUTE_SOURCE)?.[1] ?? '';
    expect(condition, 'genus banner condition not found in the route').not.toBe('');
    expect(condition).toContain(flag);
  });

  it('gives each genus origin its own wording rather than one origin\'s label for all', () => {
    // A shared banner is fine; telling a reader they came from Genus of the
    // Day when they came from a map is not.
    expect(ROUTE_SOURCE).toContain('Continuing from Genus of the Day');
    expect(ROUTE_SOURCE).toContain('Continuing from the Genus Profile');
    expect(ROUTE_SOURCE).toContain('Continuing from the Atlas Next map');
  });

  it('keeps the Atlas evidence origin on its own banner, not the genus one', () => {
    // atlas-workspace carries an Atlas evidence context and has different
    // things to say. Folding it into the genus banner would understate it.
    expect(ATLAS_WORKSPACE_ORIGIN).not.toBe(ATLAS_NEXT_CALYX_ORIGIN);
    expect(ROUTE_SOURCE).toContain('Continuing from Atlas');
  });

  it('still refuses a genus origin that dropped its declaration', () => {
    for (const { value } of GENUS_ONLY_ORIGINS) {
      expect(
        calyxNavigationContextIsExplicitlyNonEvidentiary(`?genus=Phalaenopsis&origin=${value}`),
      ).toBe(false);
    }
  });
});
