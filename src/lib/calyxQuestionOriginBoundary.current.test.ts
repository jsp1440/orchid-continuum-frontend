import { describe, expect, it } from 'vitest';

import { ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN } from '@/features/atlas-next/calyxHandoff';
import { CLASSROOM_INVESTIGATION_ORIGIN } from '@/lib/classroomInvestigationNavigation';
import { FEATURED_TAXON_ORIGIN } from '@/lib/featuredTaxonNavigation';
import {
  governedCalyxGenusTurnContext,
  rejectsCalyxNavigationContext,
} from '@/lib/calyxRouteTrustBoundary';

const QUESTION =
  'question=What+evidence+supports+this%3F&question_source=user&question_is_evidence=false';

describe('Calyx routed question origin boundary', () => {
  it('keeps the Atlas occurrence-evidence question producer available to its dedicated adapter', () => {
    const search = `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&${QUESTION}`;

    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(governedCalyxGenusTurnContext(search)).toBeUndefined();
  });

  it('keeps the Classroom investigation question producer available to its dedicated adapter', () => {
    const search = `?genus=Phalaenopsis&origin=${CLASSROOM_INVESTIGATION_ORIGIN}&context_is_evidence=false&context_is_learner_draft=true&${QUESTION}`;

    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(governedCalyxGenusTurnContext(search)).toBeUndefined();
  });

  it('rejects routed question context from Research Station before generic fallback', () => {
    const search = `?genus=Phalaenopsis&origin=research-station&${QUESTION}`;

    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
  });

  it('rejects routed question context from unmanaged origins before generic fallback', () => {
    const search = `?genus=Phalaenopsis&origin=unknown-workspace&${QUESTION}`;

    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
  });

  it('rejects question context attached to a generic governed genus navigation route', () => {
    const search = `?genus=Phalaenopsis&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false&${QUESTION}`;

    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
  });

  it('fails closed even when an unapproved origin supplies only one question provenance key', () => {
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&origin=research-station&question_is_evidence=false',
      ),
    ).toBe(true);
  });
});
