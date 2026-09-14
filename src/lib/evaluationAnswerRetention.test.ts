import { describe, expect, it } from 'vitest';

import { ANSWER_RETAINED, evaluationAnswerRetention } from './evaluationAnswerRetention';

describe('an evaluation says whether it holds an answer', () => {
  it('reports a record with no answer state as not holding one', () => {
    // The state every record is in today. It must not read as a consultation.
    expect(evaluationAnswerRetention({})).toEqual({
      retained: false,
      note: expect.stringMatching(/what was asked, not what was answered/i),
    });
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a value from a newer build', 'partially_retained'],
    ['a number', 1],
    ['a truthy object', {}],
    ['the word retained in the wrong case', 'RETAINED'],
  ])('fails closed on %s', (_label, answer_state) => {
    // Reading an unknown state as "answered" would state the one thing that
    // must never be stated without evidence, and would do it silently.
    expect(evaluationAnswerRetention({ answer_state }).retained).toBe(false);
  });

  it('reports a retained answer, with the conversation to return to', () => {
    expect(
      evaluationAnswerRetention({
        answer_state: ANSWER_RETAINED,
        answer_conversation_id: 'conv_01H8XYZ',
      }),
    ).toEqual({ retained: true, conversationId: 'conv_01H8XYZ' });
  });

  it('keeps a retained answer even when the conversation cannot be pointed at', () => {
    // Losing the way back to a reply does not unmake the reply.
    expect(evaluationAnswerRetention({ answer_state: ANSWER_RETAINED })).toEqual({
      retained: true,
      conversationId: null,
    });
  });

  it.each([
    ['markup', '<script>alert(1)</script>'],
    ['a query fragment', 'conv?next=/admin'],
    ['a path traversal', '../../etc/passwd'],
    ['whitespace only', '   '],
    ['an over-long identifier', 'c'.repeat(129)],
  ])('refuses to point at a conversation id that is %s', (_label, answer_conversation_id) => {
    const answer = evaluationAnswerRetention({
      answer_state: ANSWER_RETAINED,
      answer_conversation_id,
    });
    expect(answer).toEqual({ retained: true, conversationId: null });
  });

  it('never invents a conversation for a record that has no answer', () => {
    // The dangerous combination: a stale id left on a row whose answer was
    // never retained. The id must not resurrect it into a consultation.
    const answer = evaluationAnswerRetention({
      answer_state: 'not_retained',
      answer_conversation_id: 'conv_01H8XYZ',
    });
    expect(answer.retained).toBe(false);
  });
});
