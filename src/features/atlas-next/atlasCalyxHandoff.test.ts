import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
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

  it('forwards the bounded Atlas evidence origin into the actual Calyx backend turn context', () => {
    const href = atlasOccurrenceEvidenceCalyxHref('Laelia')!;
    expect(
      buildCalyxTurnContext({
        projectId: 'calyx-speak',
        uploadedFiles: [],
        routeSearch: href.slice('/calyx'.length),
      }),
    ).toMatchObject({
      route_context: {
        origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
        featured_taxon: { rank: 'genus', accepted_name: 'Laelia' },
      },
    });
  });

  it('carries an optional active scientific question as bounded non-evidentiary interaction context', () => {
    const href = atlasOccurrenceEvidenceCalyxHref(
      'Laelia',
      '  What does this occurrence suggest   about the documented elevation range?  ',
    )!;
    const url = new URL(href, 'https://orchidcontinuum.org');

    expect(url.searchParams.get('question')).toBe(
      'What does this occurrence suggest about the documented elevation range?',
    );
    expect(url.searchParams.get('question_source')).toBe('user');
    expect(url.searchParams.get('question_is_evidence')).toBe('false');
    expect(url.searchParams.get('question')!.length).toBeLessThanOrEqual(800);
  });

  it('bounds oversized question context without altering the full Atlas record boundary', () => {
    const href = atlasOccurrenceEvidenceCalyxHref('Laelia', `Why? ${'x'.repeat(2000)}`)!;
    const url = new URL(href, 'https://orchidcontinuum.org');
    expect(url.searchParams.get('question')!.length).toBe(800);
    expect(url.searchParams.get('question_is_evidence')).toBe('false');
  });

  it('makes the locality-protection boundary explicit at the Atlas → Calyx decision point', () => {
    expect(SOURCE).toContain('Calyx receives the genus and an occurrence-evidence workflow cue.');
    expect(SOURCE).toContain('Precise locality, coordinates, and record identifiers stay in Atlas.');
    expect(SOURCE).toContain('aria-describedby="atlas-calyx-context-note"');
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

  it('offers a bounded conservation continuation without forwarding precise occurrence data', () => {
    expect(SOURCE).toContain('Continue to conservation');
    expect(SOURCE).toContain('/conservation?genus=${encodeURIComponent(point.genus)}&origin=atlas-next-occurrence-evidence');
    expect(SOURCE).not.toContain('/conservation?lat=');
    expect(SOURCE).not.toContain('/conservation?lng=');
    expect(SOURCE).not.toContain('/conservation?locality=');
    expect(SOURCE).not.toContain('/conservation?occurrenceId=');
  });
});
