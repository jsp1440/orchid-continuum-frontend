import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ATLAS_NEXT_CALYX_ORIGIN,
  atlasNextCalyxHref,
} from '@/features/atlas-next/researchHandoff';
import { rejectsCalyxNavigationContext } from '@/lib/calyxRouteTrustBoundary';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  atlasWorkspaceCalyxHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN, genusProfileCalyxHref } from '@/lib/genusProfileNavigation';

const routeSource = readFileSync(
  resolve(process.cwd(), 'src/components/calyx/AtlasAwareCalyxRoute.tsx'),
  'utf8',
);
const genusProfileSource = readFileSync(resolve(process.cwd(), 'src/pages/GenusDetail.tsx'), 'utf8');

describe('Calyx governed genus route trust boundary', () => {
  it('accepts the canonical Atlas workspace, featured-taxon, Genus Profile, and Atlas Next producers', () => {
    expect(rejectsCalyxNavigationContext(new URL(atlasWorkspaceCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(featuredTaxonCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(genusProfileCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(atlasNextCalyxHref({ genus: 'Phalaenopsis' })!, 'https://orchidcontinuum.org').search)).toBe(false);
  });

  it.each([
    ATLAS_WORKSPACE_ORIGIN,
    FEATURED_TAXON_ORIGIN,
    GENUS_PROFILE_ORIGIN,
    ATLAS_NEXT_CALYX_ORIGIN,
  ])(
    'rejects %s when the non-evidence declaration is missing or promoted',
    (origin) => {
      expect(rejectsCalyxNavigationContext(`?genus=Phalaenopsis&origin=${origin}`)).toBe(true);
      expect(
        rejectsCalyxNavigationContext(
          `?genus=Phalaenopsis&origin=${origin}&context_is_evidence=true`,
        ),
      ).toBe(true);
    },
  );

  it.each(['taxon', 'species', 'subject_id', 'record_id', 'project_id'])(
    'rejects a governed genus arrival that also carries conflicting %s identity',
    (key) => {
      expect(
        rejectsCalyxNavigationContext(
          `?genus=Phalaenopsis&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false&${key}=Phalaenopsis%20aphrodite`,
        ),
      ).toBe(true);
    },
  );

  it('accepts legitimate Research Station genus-only and matching exact-species arrivals', () => {
    expect(
      rejectsCalyxNavigationContext('?genus=Phalaenopsis&origin=research-station'),
    ).toBe(false);
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=research-station',
      ),
    ).toBe(false);
    expect(
      rejectsCalyxNavigationContext('?taxon=canonical%3Ataxon%3A123&origin=research-station'),
    ).toBe(false);
  });

  it.each([
    '?genus=Phalaenopsis&taxon=&origin=research-station',
    '?genus=Phalaenopsis&taxon=%2Fetc%2Fpasswd&origin=research-station',
    '?genus=Paphiopedilum&taxon=Phalaenopsis%20amabilis&origin=research-station',
    '?genus=Phalaenopsis&taxon=canonical%3Ataxon%3A123&origin=research-station',
  ])('rejects malformed or contradictory Research Station exact identity: %s', (search) => {
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });

  it('does not reinterpret unrelated governed adapters through this generic boundary', () => {
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&origin=research-station&context_is_evidence=true',
      ),
    ).toBe(false);
    expect(
      rejectsCalyxNavigationContext('?genus=Phalaenopsis&origin=atlas-next-occurrence-evidence'),
    ).toBe(false);
  });

  it('is mounted before the Calyx workspace can consume a tampered route', () => {
    expect(routeSource).toContain('rejectsCalyxNavigationContext(location.search)');
    expect(routeSource).toContain('if (rejectedNavigationContext)');
    expect(routeSource.indexOf('if (rejectedNavigationContext)')).toBeLessThan(
      routeSource.lastIndexOf('<CalyxWorkspace />'),
    );
    expect(routeSource).toContain('Open Calyx without carried context');
  });

  it('mounts the direct Genus Profile producer on the live cross-Continuum action', () => {
    expect(genusProfileSource).toContain('genusProfileCalyxHref');
    expect(genusProfileSource).toContain("{ label: 'Ask Calyx', to: genusProfileCalyxHref(genus) }");
  });
});
