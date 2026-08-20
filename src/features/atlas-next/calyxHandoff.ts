export const ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN = 'atlas-next-occurrence-evidence';

const MAX_GENUS_CHARACTERS = 80;
const MAX_QUESTION_CHARACTERS = 800;
const SAFE_GENUS = /^[A-Za-z][A-Za-z -]*$/;

function boundedQuestion(question: string | null | undefined): string | null {
  const normalized = question?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return null;
  return normalized.slice(0, MAX_QUESTION_CHARACTERS);
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
