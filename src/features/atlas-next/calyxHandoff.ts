export const ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN = 'atlas-next-occurrence-evidence';

const MAX_GENUS_CHARACTERS = 80;
export const MAX_ATLAS_CALYX_QUESTION_CHARACTERS = 800;
// The handoff forwards genus-level identity only. Enforce a canonical
// single-token genus (capitalised, no internal whitespace) so an occurrence
// binomial or any multi-word value fails closed here instead of producing a
// /calyx?genus=<binomial> link that asserts a species as a genus. Matches the
// shared boundary in researchRouteContext, matrixResearchNavigation, and the
// Calyx route consumer.
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;

export type AtlasCalyxQuestionContext = {
  question: string;
  question_source: 'user';
  question_is_evidence: false;
};

function boundedQuestion(question: string | null | undefined): string | null {
  const normalized = question?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return null;
  return normalized.slice(0, MAX_ATLAS_CALYX_QUESTION_CHARACTERS);
}

/**
 * Parse the optional Atlas-authored question context carried on the Calyx route.
 *
 * The three provenance fields are an all-or-nothing contract. Any malformed or
 * incomplete provenance fails closed so duplicated route context can never be
 * mistaken for scientific evidence.
 */
export function parseAtlasCalyxQuestionContext(search: string): AtlasCalyxQuestionContext | null {
  const params = new URLSearchParams(search);
  const question = boundedQuestion(params.get('question'));
  if (!question) return null;
  if (params.get('question_source') !== 'user') return null;
  if (params.get('question_is_evidence') !== 'false') return null;
  return {
    question,
    question_source: 'user',
    question_is_evidence: false,
  };
}

/**
 * Build the bounded Atlas Next → Calyx handoff URL.
 *
 * Only genus-level identity, a workflow origin, and optional user-authored
 * scientific question are forwarded. The question is interaction context, not
 * scientific evidence. Occurrence identifiers, coordinates, locality text,
 * collector data, and other record fields are deliberately excluded so
 * protected locality cannot escape via the route contract.
 */
export function atlasOccurrenceEvidenceCalyxHref(
  genus: string | null | undefined,
  question?: string | null,
): string | null {
  const normalized = genus?.trim() ?? '';
  if (!normalized || normalized.length > MAX_GENUS_CHARACTERS || !SAFE_GENUS.test(normalized)) {
    return null;
  }

  const params = new URLSearchParams({
    genus: normalized,
    origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
  });
  const activeQuestion = boundedQuestion(question);
  if (activeQuestion) {
    params.set('question', activeQuestion);
    params.set('question_source', 'user');
    params.set('question_is_evidence', 'false');
  }
  return `/calyx?${params.toString()}`;
}
