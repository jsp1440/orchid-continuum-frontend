import { describe, expect, it } from 'vitest';

import {
  ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
  parseAtlasCalyxQuestionContext,
} from '@/features/atlas-next/calyxHandoff';

const QUESTION =
  'question=What+evidence+supports+this%3F&question_source=user&question_is_evidence=false';

describe('Calyx routed question parser origin boundary', () => {
  it('accepts the Atlas occurrence-evidence producer', () => {
    expect(
      parseAtlasCalyxQuestionContext(
        `?origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&${QUESTION}`,
      ),
    ).toEqual({
      question: 'What evidence supports this?',
      question_source: 'user',
      question_is_evidence: false,
    });
  });

  it('accepts the Classroom investigation producer', () => {
    expect(
      parseAtlasCalyxQuestionContext(`?origin=classroom-investigation&${QUESTION}`),
    ).toEqual({
      question: 'What evidence supports this?',
      question_source: 'user',
      question_is_evidence: false,
    });
  });

  it.each(['research-station', 'unknown-workspace', 'featured-taxon', '']) (
    'rejects question context from unapproved origin %s',
    (origin) => {
      const originQuery = origin ? `origin=${origin}&` : '';
      expect(parseAtlasCalyxQuestionContext(`?${originQuery}${QUESTION}`)).toBeNull();
    },
  );

  it('still rejects incomplete or promoted provenance from an approved origin', () => {
    expect(
      parseAtlasCalyxQuestionContext(
        `?origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=Why%3F&question_source=user`,
      ),
    ).toBeNull();
    expect(
      parseAtlasCalyxQuestionContext(
        `?origin=${ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN}&question=Why%3F&question_source=user&question_is_evidence=true`,
      ),
    ).toBeNull();
  });
});
