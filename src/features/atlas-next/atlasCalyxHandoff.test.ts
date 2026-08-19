import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
  atlasOccurrenceEvidenceCalyxHref,
} from './calyxHandoff';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/features/atlas-next/OccurrenceCard.tsx'), 'utf8');

describe('Atlas Next → Calyx handoff', () => {
  it('hands the selected occurrence genus and evidence-workflow origin into the bounded Calyx route contract', () => {
    const href = atlasOccurrenceEvidenceCalyxHref(' Laelia ');
    expect(href).toBe('/calyx?genus=Laelia&origin=atlas-next-occurrence-evidence');
    expect(SOURCE).toContain('atlasOccurrenceEvidenceCalyxHref(point.genus)');
    expect(SOURCE).toContain('Investigate this evidence in Calyx');

    const route = parseCalyxRouteContext(href!.slice('/calyx'.length));
    expect(route).toEqual({
      origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
      featuredTaxon: { rank: 'genus', name: 'Laelia' },
    });
  });

  it('fails closed for malformed genus values instead of building a Calyx route', () => {
    expect(atlasOccurrenceEvidenceCalyxHref('')).toBeNull();
    expect(atlasOccurrenceEvidenceCalyxHref('<script>')).toBeNull();
    expect(atlasOccurrenceEvidenceCalyxHref('A'.repeat(81))).toBeNull();
  });

  it('does not pass occurrence coordinates, identifiers, or locality text through the Calyx URL', () => {
    const href = atlasOccurrenceEvidenceCalyxHref('Laelia') ?? '';
    expect(href).not.toContain('lat');
    expect(href).not.toContain('lng');
    expect(href).not.toContain('locality');
    expect(href).not.toContain('occurrenceId');
    expect(href).not.toContain('id=');
  });
});
