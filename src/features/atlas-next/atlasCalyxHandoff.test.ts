import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
  MAX_ATLAS_CALYX_QUESTION_CHARACTERS,
  atlasOccurrenceEvidenceCalyxHref,
  parseAtlasCalyxQuestionContext,
} from './calyxHandoff';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/features/atlas-next/OccurrenceCard.tsx'), 'utf8');

describe('Atlas Next → Calyx handoff', () => {
  it('hands the selected occurrence genus and evidence-workflow origin into the bounded Calyx route contract', () => {
    const href = atlasOccurrenceEvidenceCalyxHref(' Laelia ');
    expect(href).toBe('/calyx?genus=Laelia&origin=atlas-next-occurrence-evidence');
    expect(SOURCE).toContain('atlasOccurrenceEvidenceCalyxHref(point.genus, calyxQuestion)');
    expect(SOURCE).toContain('Investigate this evidence in Calyx');

    const route = parseCalyxRouteContext(href!.slice('/calyx'.length));
    expect(route).toEqual({
      origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
      featuredTaxon: { rank: 'genus', name: 'Laelia' },
      // A handoff carrying no question must say so explicitly. toEqual is exact,
      // so this also pins that the field cannot quietly disappear.
      questionContext: null,
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
    expect(url.searchParams.get('question')!.length).toBeLessThanOrEqual(
      MAX_ATLAS_CALYX_QUESTION_CHARACTERS,
    );
    expect(parseAtlasCalyxQuestionContext(url.search)).toEqual({
      question: 'What does this occurrence suggest about the documented elevation range?',
      question_source: 'user',
      question_is_evidence: false,
    });
  });

  it('fails closed when question provenance is missing or malformed', () => {
    expect(parseAtlasCalyxQuestionContext('?question=Why%3F')).toBeNull();
    expect(
      parseAtlasCalyxQuestionContext('?question=Why%3F&question_source=system&question_is_evidence=false'),
    ).toBeNull();
    expect(
      parseAtlasCalyxQuestionContext('?question=Why%3F&question_source=user&question_is_evidence=true'),
    ).toBeNull();
  });

  it('normalizes and bounds parsed route question context', () => {
    const question = `  Why   does this matter? ${'x'.repeat(2000)}  `;
    const search = new URLSearchParams({
      question,
      question_source: 'user',
      question_is_evidence: 'false',
    }).toString();
    const parsed = parseAtlasCalyxQuestionContext(`?${search}`);
    expect(parsed).not.toBeNull();
    expect(parsed!.question).not.toMatch(/\s{2,}/);
    expect(parsed!.question.length).toBe(MAX_ATLAS_CALYX_QUESTION_CHARACTERS);
    expect(parsed!.question_is_evidence).toBe(false);
  });

  it('gives the visitor a real user-authored question field before continuing to Calyx', () => {
    expect(SOURCE).toContain("const [calyxQuestion, setCalyxQuestion] = useState('')");
    expect(SOURCE).toContain('Ask Calyx about this evidence');
    expect(SOURCE).toContain('value={calyxQuestion}');
    expect(SOURCE).toContain('onChange={(event) => setCalyxQuestion(event.target.value)}');
    expect(SOURCE).toContain('maxLength={800}');
    expect(SOURCE).toContain('Ask Calyx this question');
    expect(SOURCE).toContain('explicitly marked as not scientific evidence');
  });

  it('bounds oversized question context without altering the full Atlas record boundary', () => {
    const href = atlasOccurrenceEvidenceCalyxHref('Laelia', `Why? ${'x'.repeat(2000)}`)!;
    const url = new URL(href, 'https://orchidcontinuum.org');
    expect(url.searchParams.get('question')!.length).toBe(MAX_ATLAS_CALYX_QUESTION_CHARACTERS);
    expect(url.searchParams.get('question_is_evidence')).toBe('false');
  });

  it('makes the locality-protection boundary explicit at the Atlas → Calyx decision point', () => {
    expect(SOURCE).toContain('Calyx receives the genus, an occurrence-evidence workflow cue, and your optional bounded question.');
    expect(SOURCE).toContain('Precise locality, coordinates, and record identifiers stay in Atlas.');
    expect(SOURCE).toContain('aria-describedby="atlas-calyx-context-note"');
  });

  it('fails closed for malformed genus values instead of building a Calyx route', () => {
    expect(atlasOccurrenceEvidenceCalyxHref('')).toBeNull();
    expect(atlasOccurrenceEvidenceCalyxHref('<script>')).toBeNull();
    expect(atlasOccurrenceEvidenceCalyxHref('A'.repeat(81))).toBeNull();
    // Only a canonical single-token genus is forwarded. A binomial or any
    // multi-word / lowercase value must not become a /calyx?genus=... link.
    expect(atlasOccurrenceEvidenceCalyxHref('Cattleya labiata')).toBeNull();
    expect(atlasOccurrenceEvidenceCalyxHref('laelia')).toBeNull();
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
