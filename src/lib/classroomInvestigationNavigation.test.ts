import { describe, expect, it } from 'vitest';

import {
  classroomAtlasHref,
  classroomCalyxHref,
  classroomSubject,
  parseClassroomInvestigationContext,
} from './classroomInvestigationNavigation';
import { buildCalyxTurnContext } from '@/lib/calyxConversation';

/**
 * A learner's draft leaving the classroom.
 *
 * The Scientific Method Lab holds an observation, a question, a hypothesis, a
 * design, an analysis and a conclusion — all written by a student, none
 * reviewed. The invariant is that a learner draft is not evidence, and the
 * dangerous field is the conclusion: a student's conclusion arriving at Calyx
 * as "context" is one careless read from being treated as a finding.
 *
 * So the protection is structural rather than a matter of remembering to omit
 * things. The producers take a taxon and a question and have no parameter
 * through which the rest could travel.
 */

const GENUS = 'Cattleya';
const SPECIES = 'Cattleya purpurata';
const QUESTION = 'Does night temperature affect flowering time in this taxon?';

const searchOf = (href: string) => href.slice(href.indexOf('?'));

describe('classroom subject resolution', () => {
  it('accepts a genus and a binomial', () => {
    expect(classroomSubject(GENUS)).toEqual({ genus: GENUS, taxon: null });
    expect(classroomSubject(SPECIES)).toEqual({ genus: GENUS, taxon: SPECIES });
    expect(classroomSubject(`  ${SPECIES}  `)).toEqual({ genus: GENUS, taxon: SPECIES });
  });

  it('refuses what a learner may plausibly type instead of a name', () => {
    // No button is better than a conversation about nothing.
    for (const input of ['my windowsill orchid', 'the purple one', '', '   ', 'orchid #3']) {
      expect(classroomSubject(input)).toBeNull();
    }
  });

  it('refuses markup and control characters', () => {
    expect(classroomSubject('<script>alert(1)</script>')).toBeNull();
    // Escaped explicitly: an invisible literal is untrustworthy in a test
    // whose whole point is rejecting characters you cannot see.
    expect(classroomSubject('Cattleya\u0007purpurata')).toBeNull();
    expect(classroomSubject('Cattleya\u007fpurpurata')).toBeNull();
  });
});

describe('classroom investigation handoff', () => {
  it('offers no onward link when the subject cannot be bounded', () => {
    expect(classroomAtlasHref('my windowsill orchid')).toBeNull();
    expect(classroomCalyxHref('my windowsill orchid', QUESTION)).toBeNull();
  });

  it('filters the Atlas by species when the learner named one', () => {
    const params = new URLSearchParams(searchOf(classroomAtlasHref(SPECIES)!));
    expect(params.get('species')).toBe(SPECIES);
    expect(params.get('genera')).toBeNull();
  });

  it('falls back to the genus filter when only a genus was given', () => {
    const params = new URLSearchParams(searchOf(classroomAtlasHref(GENUS)!));
    expect(params.get('genera')).toBe(GENUS);
    expect(params.get('species')).toBeNull();
  });

  it('carries the subject and question, and declares both non-evidentiary', () => {
    const params = new URLSearchParams(searchOf(classroomCalyxHref(SPECIES, QUESTION)!));
    expect(params.get('taxon')).toBe(SPECIES);
    expect(params.get('genus')).toBe(GENUS);
    expect(params.get('question')).toBe(QUESTION);
    expect(params.get('context_is_evidence')).toBe('false');
    expect(params.get('question_is_evidence')).toBe('false');
    expect(params.get('context_is_learner_draft')).toBe('true');
  });

  it('emits exactly the keys the contract allows', () => {
    // Enumerated: adding a parameter has to be considered here, which is what
    // stops a hypothesis field being introduced quietly later.
    expect([...new URLSearchParams(searchOf(classroomCalyxHref(SPECIES, QUESTION)!)).keys()].sort())
      .toEqual([
        'context_is_evidence',
        'context_is_learner_draft',
        'genus',
        'origin',
        'question',
        'question_is_evidence',
        'question_source',
        'taxon',
      ]);
  });

  it('has no route for the hypothesis, observations, analysis or conclusion', () => {
    // The dangerous fields. There is no argument to pass them, and none of
    // their content can appear in an emitted URL.
    const href = classroomCalyxHref(SPECIES, QUESTION)!;
    for (const leaked of [
      'hypothesis',
      'observation',
      'conclusion',
      'analysis',
      'design',
      'communication',
    ]) {
      expect(href).not.toContain(leaked);
    }
  });
});

describe('classroom arrival parsing', () => {
  it('round-trips a produced link', () => {
    const context = parseClassroomInvestigationContext(
      searchOf(classroomCalyxHref(SPECIES, QUESTION)!),
    );
    expect(context).not.toBeNull();
    expect(context!.taxon).toBe(SPECIES);
    expect(context!.genus).toBe(GENUS);
    expect(context!.contextIsEvidence).toBe(false);
    expect(context!.contextIsLearnerDraft).toBe(true);
  });

  it('rejects an arrival that does not declare itself a learner draft', () => {
    // The declaration is the whole protection. Without it, a classroom subject
    // would arrive indistinguishable from a curated one.
    const stripped = searchOf(classroomCalyxHref(SPECIES, QUESTION)!).replace(
      '&context_is_learner_draft=true',
      '',
    );
    expect(parseClassroomInvestigationContext(stripped)).toBeNull();
  });

  it('rejects an arrival claiming its context is evidence', () => {
    const tampered = searchOf(classroomCalyxHref(SPECIES, QUESTION)!).replace(
      'context_is_evidence=false',
      'context_is_evidence=true',
    );
    expect(parseClassroomInvestigationContext(tampered)).toBeNull();
  });

  it('rejects a genus and binomial that disagree', () => {
    expect(
      parseClassroomInvestigationContext(
        '?origin=classroom-investigation&context_is_evidence=false&context_is_learner_draft=true&genus=Cattleya&taxon=Laelia+purpurata',
      ),
    ).toBeNull();
  });

  it('keeps the learner question non-evidentiary in the Calyx turn payload', () => {
    const turn = buildCalyxTurnContext({
      projectId: 'p-1',
      uploadedFiles: [],
      routeSearch: searchOf(classroomCalyxHref(SPECIES, QUESTION)!),
    }) as { route_context?: Record<string, unknown> };

    expect(turn.route_context?.question).toBe(QUESTION);
    expect(turn.route_context?.question_is_evidence).toBe(false);
    // And no learner conclusion reached the model.
    expect(JSON.stringify(turn.route_context)).not.toMatch(/hypothes|conclusion/i);
  });
});
