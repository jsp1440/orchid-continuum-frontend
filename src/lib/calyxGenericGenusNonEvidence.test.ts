import { describe, expect, it } from 'vitest';

import { atlasNextCalyxHref } from '@/features/atlas-next/researchHandoff';
import { buildCalyxTurnContext } from '@/lib/calyxConversation';
import {
  calyxNavigationContextIsExplicitlyNonEvidentiary,
  rejectsCalyxNavigationContext,
} from '@/lib/calyxRouteTrustBoundary';
import {
  atlasWorkspaceCalyxHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';
import { genusProfileCalyxHref } from '@/lib/genusProfileNavigation';

function routeContext(search: string): Record<string, unknown> {
  return (buildCalyxTurnContext({
    projectId: 'calyx-speak',
    uploadedFiles: [],
    routeSearch: search,
  }).route_context ?? {}) as Record<string, unknown>;
}

describe('governed generic genus → Calyx non-evidence boundary', () => {
  it('carries the validated Atlas Next non-evidence declaration into the turn context', () => {
    const href = atlasNextCalyxHref({ genus: 'Phalaenopsis' });
    expect(href).not.toBeNull();
    const search = new URL(href!, 'https://orchidcontinuum.org').search;

    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(true);
    expect(routeContext(search)).toMatchObject({
      origin: 'atlas-next',
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      featured_taxon_is_evidence: false,
    });
  });

  it('requires the same explicit marker for every governed generic genus producer', () => {
    const hrefs = [
      featuredTaxonCalyxHref('Phalaenopsis'),
      atlasWorkspaceCalyxHref('Phalaenopsis'),
      genusProfileCalyxHref('Phalaenopsis'),
      atlasNextCalyxHref({ genus: 'Phalaenopsis' })!,
    ];

    for (const href of hrefs) {
      const search = new URL(href, 'https://orchidcontinuum.org').search;
      expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(true);
      expect(rejectsCalyxNavigationContext(search)).toBe(false);
      expect(routeContext(search)).toHaveProperty('featured_taxon_is_evidence', false);
    }
  });

  it('fails the mounted route boundary closed when Atlas Next omits or contradicts the marker', () => {
    const missing = '?genus=Phalaenopsis&origin=atlas-next';
    const truthy = '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=true';
    const malformed = '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=FALSE';

    for (const search of [missing, truthy, malformed]) {
      expect(rejectsCalyxNavigationContext(search)).toBe(true);
      expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(false);
      // Even if a lower-level helper is called directly, it never manufactures
      // the explicit scientific-trust marker for an invalid arrival. The live
      // AtlasAwareCalyxRoute rejects these URLs before CalyxWorkspace mounts.
      expect(routeContext(search)).not.toHaveProperty('featured_taxon_is_evidence');
    }
  });

  it('does not forward Atlas locality, occurrence, evidence, or conclusion material', () => {
    const href = atlasNextCalyxHref({ genus: 'Phalaenopsis' })!;
    const search = `${new URL(href, 'https://orchidcontinuum.org').search}` +
      '&latitude=-12.4&longitude=-77.1&locality=protected&occurrence_id=secret-1' +
      '&collector=private&evidence=claimed&confidence=0.99&conclusion=claimed';
    // Any locality/occurrence/evidence/conclusion key outside the producer's
    // allowlist rejects the entire arrival rather than being silently stripped,
    // so none of it — and no manufactured genus context — reaches the turn.
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    const context = routeContext(search);

    for (const forbidden of [
      'latitude',
      'longitude',
      'locality',
      'occurrence_id',
      'collector',
      'evidence',
      'confidence',
      'conclusion',
      'featured_taxon',
      'featured_taxon_is_evidence',
    ]) {
      expect(context).not.toHaveProperty(forbidden);
    }
  });
});
