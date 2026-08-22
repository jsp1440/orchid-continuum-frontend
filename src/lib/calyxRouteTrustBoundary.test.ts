import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { rejectsCalyxNavigationContext } from '@/lib/calyxRouteTrustBoundary';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  atlasWorkspaceCalyxHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';

const routeSource = readFileSync(
  resolve(process.cwd(), 'src/components/calyx/AtlasAwareCalyxRoute.tsx'),
  'utf8',
);

describe('Calyx governed genus route trust boundary', () => {
  it('accepts the canonical Atlas workspace and featured-taxon producers', () => {
    expect(rejectsCalyxNavigationContext(new URL(atlasWorkspaceCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(featuredTaxonCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
  });

  it.each([ATLAS_WORKSPACE_ORIGIN, FEATURED_TAXON_ORIGIN])(
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
});
