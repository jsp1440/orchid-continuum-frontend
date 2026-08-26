import { describe, expect, it } from 'vitest';

import {
  ATLAS_NEXT_RESEARCH_ORIGIN,
  atlasNextResearchHref,
} from '@/features/atlas-next/researchHandoff';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const GENUS = 'Phalaenopsis';
const PROJECT_ID = 'naocc-phalaenopsis';

const PROTECTED_VALUES = [
  '14.5995',
  '120.9842',
  'Sitio Malabon ridge, exact grove',
  'GBIF:2401991234',
  'PH-AMAB-0091',
];

function expectNoProtectedLeak(value: unknown): void {
  const serialized = JSON.stringify(value) ?? '';
  for (const protectedValue of PROTECTED_VALUES) {
    expect(serialized).not.toContain(protectedValue);
  }
}

describe('canonical Atlas Next → Research Station journey (Phalaenopsis)', () => {
  it('uses the real governed Atlas handoff and preserves only non-evidentiary subject/project context', () => {
    const href = atlasNextResearchHref({ genus: GENUS, projectId: PROJECT_ID });

    expect(href).not.toBeNull();
    const url = new URL(href!, 'https://orchidcontinuum.org');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'genus',
      'origin',
      'project',
    ]);

    const context = parseResearchRouteContext(url.search);
    expect(context).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: GENUS,
      projectId: PROJECT_ID,
      contextIsEvidence: false,
    });
    expectNoProtectedLeak(href);
    expectNoProtectedLeak(context);
  });

  it('ignores hostile locality/occurrence material appended after the governed handoff', () => {
    const href = atlasNextResearchHref({ genus: GENUS, projectId: PROJECT_ID });
    expect(href).not.toBeNull();

    const url = new URL(href!, 'https://orchidcontinuum.org');
    url.searchParams.set('decimalLatitude', PROTECTED_VALUES[0]);
    url.searchParams.set('decimalLongitude', PROTECTED_VALUES[1]);
    url.searchParams.set('locality', PROTECTED_VALUES[2]);
    url.searchParams.set('occurrenceID', PROTECTED_VALUES[3]);
    url.searchParams.set('catalogNumber', PROTECTED_VALUES[4]);

    const context = parseResearchRouteContext(url.search);
    expect(context).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: GENUS,
      projectId: PROJECT_ID,
      contextIsEvidence: false,
    });
    expectNoProtectedLeak(context);
  });

  it('fails closed if Atlas navigation context attempts to assert evidence', () => {
    const href = atlasNextResearchHref({ genus: GENUS, projectId: PROJECT_ID });
    expect(href).not.toBeNull();

    const url = new URL(href!, 'https://orchidcontinuum.org');
    url.searchParams.set('context_is_evidence', 'true');

    expect(parseResearchRouteContext(url.search)).toBeNull();
  });
});
