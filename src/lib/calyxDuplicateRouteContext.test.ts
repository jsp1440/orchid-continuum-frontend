import { describe, expect, it } from 'vitest';
import { buildCalyxTurnContext } from './calyxConversation';
import { rejectsCalyxNavigationContext } from './calyxRouteTrustBoundary';
import { featuredTaxonCalyxHref, atlasWorkspaceCalyxHref } from './featuredTaxonNavigation';
import { atlasNextCalyxHref } from '@/features/atlas-next/researchHandoff';
import { atlasOccurrenceEvidenceCalyxHref, parseAtlasCalyxQuestionContext } from '@/features/atlas-next/calyxHandoff';

const arrivals = [
  featuredTaxonCalyxHref('Laelia'),
  atlasWorkspaceCalyxHref('Laelia'),
  atlasNextCalyxHref({ genus: 'Laelia' })!,
  atlasOccurrenceEvidenceCalyxHref('Laelia', 'Why does this matter?')!,
];

describe('Calyx carried identity and provenance are singular', () => {
  it.each(arrivals)('preserves the canonical producer handoff %s', (href) => {
    const search = new URL(href, 'https://orchid.test').search;
    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(buildCalyxTurnContext({ projectId: 'calyx-speak', uploadedFiles: [], routeSearch: search }))
      .toHaveProperty('route_context.featured_taxon.accepted_name', 'Laelia');
  });

  for (const extra of ['genus=Vanilla', 'origin=research-station', 'genus=Laelia']) {
    it.each(arrivals)(`refuses ${extra} appended to %s without forwarding partial context`, (href) => {
      const search = `${new URL(href, 'https://orchid.test').search}&${extra}`;
      expect(rejectsCalyxNavigationContext(search)).toBe(true);
      expect(buildCalyxTurnContext({ projectId: 'calyx-speak', uploadedFiles: [], routeSearch: search }))
        .not.toHaveProperty('route_context');
    });
  }

  it.each(['true', 'false'])('refuses repeated non-evidence markers, including %s', (value) => {
    const search = `?genus=Laelia&origin=homepage-featured-taxon&context_is_evidence=false&context_is_evidence=${value}`;
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    expect(buildCalyxTurnContext({ projectId: 'calyx-speak', uploadedFiles: [], routeSearch: search }))
      .not.toHaveProperty('route_context');
  });

  it.each(['origin=classroom-investigation', 'question=Conflicting+question', 'question_source=system', 'question_is_evidence=true'])(
    'refuses ambiguous Atlas question provenance: %s', (extra) => {
      const href = atlasOccurrenceEvidenceCalyxHref('Laelia', 'Why?')!;
      const search = `${new URL(href, 'https://orchid.test').search}&${extra}`;
      expect(parseAtlasCalyxQuestionContext(search)).toBeNull();
      expect(rejectsCalyxNavigationContext(search)).toBe(true);
      expect(buildCalyxTurnContext({ projectId: 'calyx-speak', uploadedFiles: [], routeSearch: search }))
        .not.toHaveProperty('route_context');
    },
  );
});
