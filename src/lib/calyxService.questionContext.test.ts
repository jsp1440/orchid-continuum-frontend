import { describe, expect, it } from 'vitest';

import {
  boundedCalyxQuestionContext,
  calyxQuestionContextFields,
  CALYX_QUESTION_CONTEXT_MAX_CHARS,
} from '@/lib/calyxService';

describe('boundedCalyxQuestionContext', () => {
  it('normalizes whitespace for non-evidentiary conversational context', () => {
    expect(boundedCalyxQuestionContext('  How   does\nLaelia\trespond?  ')).toBe(
      'How does Laelia respond?',
    );
  });

  it('bounds preserved question context without changing the user turn itself', () => {
    const longQuestion = `What evidence supports this? ${'x'.repeat(CALYX_QUESTION_CONTEXT_MAX_CHARS + 500)}`;
    const bounded = boundedCalyxQuestionContext(longQuestion);

    expect(bounded).toHaveLength(CALYX_QUESTION_CONTEXT_MAX_CHARS);
    expect(bounded.startsWith('What evidence supports this?')).toBe(true);
  });

  it('allows an empty bounded context instead of inventing a question', () => {
    expect(boundedCalyxQuestionContext('   \n\t  ')).toBe('');
  });

  it('marks duplicated question context as user-authored and non-evidentiary', () => {
    expect(calyxQuestionContextFields(' What evidence supports this? ')).toEqual({
      current_question: 'What evidence supports this?',
      current_question_source: 'user',
      current_question_is_evidence: false,
    });
  });
});
