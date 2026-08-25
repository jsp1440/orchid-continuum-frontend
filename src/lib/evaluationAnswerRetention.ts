/**
 * Whether a recorded evaluation actually holds what Calyx answered.
 *
 * A row that says only what was asked reads, a season later, as a record of a
 * consultation. It is not. A grower acting on a recommendation they half-recall
 * has nothing behind it, which is the whole reason the evaluation ledger
 * exists — so a record with no answer in it has to say so, rather than letting
 * the question stand in for an answer.
 *
 * This fails closed on purpose. An absent field, an empty one, or a value this
 * build does not recognise all read as "not retained". The alternative — an
 * unknown state rendering as though a reply were on file — would state the one
 * thing that must never be stated without evidence, and would do it silently.
 * Only the exact recorded value for a retained answer counts as one.
 *
 * Nothing in this repository sets that value yet. Retaining a real reply needs
 * a conversation identity from a reachable Calyx, and issue #451 carries the
 * contract for it. Writing a stub that reported answers as retained would be
 * claiming a capability that has never been shown to work.
 */

/** The only stored value that means a reply is actually held. */
export const ANSWER_RETAINED = 'retained';

/** Bounded like every other identifier that reaches the screen. */
const MAX_CONVERSATION_CHARACTERS = 128;
const SAFE_CONVERSATION_ID = /^[A-Za-z0-9._:-]+$/;

export type EvaluationAnswerRetention =
  | { retained: true; conversationId: string | null }
  | { retained: false; note: string };

const NOT_RETAINED: EvaluationAnswerRetention = {
  retained: false,
  note: "Calyx's reply is not kept in this record — this is what was asked, not what was answered.",
};

export function evaluationAnswerRetention(entry: {
  answer_state?: unknown;
  answer_conversation_id?: unknown;
}): EvaluationAnswerRetention {
  if (entry?.answer_state !== ANSWER_RETAINED) return NOT_RETAINED;

  // A retained answer with no usable conversation to point at is still a
  // retained answer; it just cannot offer the way back to it.
  const raw = entry?.answer_conversation_id;
  if (typeof raw !== 'string') return { retained: true, conversationId: null };
  const conversationId = raw.trim();
  if (
    !conversationId ||
    conversationId.length > MAX_CONVERSATION_CHARACTERS ||
    !SAFE_CONVERSATION_ID.test(conversationId)
  ) {
    return { retained: true, conversationId: null };
  }
  return { retained: true, conversationId };
}
