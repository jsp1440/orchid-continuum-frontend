import { describe, expect, it } from 'vitest';

import {
  ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
  atlasOccurrenceEvidenceCalyxHref,
} from '@/features/atlas-next/calyxHandoff';
import { buildCalyxTurnContext } from '@/lib/calyxConversation';
import { rejectsCalyxNavigationContext } from '@/lib/calyxRouteTrustBoundary';

function turn(search: string) {
  return buildCalyxTurnContext({
    projectId: 'calyx-speak',
    uploadedFiles: [],
    routeSearch: search,
  });
}

describe('Atlas occurrence-evidence → Calyx route boundary', () => {
  it('accepts the canonical producer with no question', () => {
    const href = atlasOccurrenceEvidenceCalyxHref('Phalaenopsis');
    expect(href).not.toBeNull();
    const search = new URL(href!, 'https://orchidcontinuum.org').search;
    expect(rejectsCalyxNavigationContext(search)).toBe(false);
  });

  it('accepts the complete user-question provenance triple and keeps it non-evidentiary', () => {
    const href = atlasOccurrenceEvidenceCalyxHref(
      'Phalaenopsis',
      'Which occurrence evidence supports this distribution?',
    );
    expect(href).not.toBeNull();
    const search = new URL(href!, 'https://orchidcontinuum.org').search;
    expect(rejectsCalyxNavigationContext(search)).toBe(false);

    const context = turn(search) as { route_context?: Record<string, unknown> };
    expect(context.route_context).toMatchObject({
      origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      question_source: 'user',
      question_is_evidence: false,
    });
  });

  it.each([
    'latitude=9.9',
    'longitude=-84.1',
    'locality=protected-site',
    'occurrence_id=occ-123',
    'record_id=rec-123',
    'project_id=project-123',
    'taxon=Phalaenopsis%20amabilis',
    'evidence=present',
    'confidence=0.9',
    'citation=doi%3A10.1%2Fexample',
    'provenance=internal',
  ])('rejects poisoned Atlas occurrence-evidence context carrying %s', (extra) => {
    const search = `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&${extra}`;
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    const context = turn(search) as { route_context?: unknown };
    expect(context.route_context).toBeUndefined();
  });

  it.each([
    `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=What%20supports%20this%3F`,
    `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=What%20supports%20this%3F&question_source=user`,
    `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=What%20supports%20this%3F&question_source=atlas&question_is_evidence=false`,
    `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=What%20supports%20this%3F&question_source=user&question_is_evidence=true`,
    `?genus=Phalaenopsis&origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=&question_source=user&question_is_evidence=false`,
  ])('rejects incomplete or promoted question provenance: %s', (search) => {
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    const context = turn(search) as { route_context?: unknown };
    expect(context.route_context).toBeUndefined();
  });

  it.each([
    'phalaenopsis',
    'Phalaenopsis amabilis',
    '../Phalaenopsis',
    'Costa Rica',
    '',
  ])('rejects non-canonical Atlas occurrence-evidence genus %s', (genus) => {
    const params = new URLSearchParams({
      genus,
      origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
    });
    expect(rejectsCalyxNavigationContext(`?${params.toString()}`)).toBe(true);
  });
});
