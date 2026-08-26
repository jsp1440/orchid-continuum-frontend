export const CLASSROOM_INVESTIGATION_ORIGIN = 'classroom-investigation';

const MAX_TAXON_CONTEXT_TEXT = 160;
const MAX_QUESTION_CHARACTERS = 800;
const UNSAFE_CONTEXT_PUNCTUATION = /[<>{}\\]/;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_BINOMIAL = /^[A-Z][A-Za-z-]+\s+[a-z][A-Za-z-]+$/;

/**
 * Classroom investigation → the rest of the Continuum.
 *
 * The Scientific Method Lab keeps a browser-local learner draft: an
 * observation, a question, a hypothesis, a design, an analysis and a
 * conclusion. That draft is teaching material. It is not evidence, it has not
 * been reviewed, and nothing here may promote it.
 *
 * So exactly two fields cross, and the rest cannot:
 *
 *   • the taxon, as the subject the learner is studying;
 *   • the question, through Calyx's existing governed question channel, which
 *     already declares a user-authored question non-evidentiary.
 *
 * The learner's hypothesis, observation, design, analysis and conclusion have
 * no parameter to travel through. That is deliberate and structural rather
 * than a matter of remembering to omit them: a hypothesis arriving at Calyx
 * labelled as context is one careless read away from being treated as a
 * finding, and a conclusion a learner wrote is the single most dangerous thing
 * this workspace holds.
 *
 * Both producers fail closed on a subject they cannot bound. A learner who
 * typed "my windowsill orchid" gets no onward action rather than a
 * conversation about nothing.
 */

export type ClassroomInvestigationContext = {
  origin: typeof CLASSROOM_INVESTIGATION_ORIGIN;
  genus: string;
  taxon: string | null;
  contextIsEvidence: false;
  /** A learner draft is not a reviewed record, and says so on arrival. */
  contextIsLearnerDraft: true;
};

export type ClassroomCalyxTurnRouteContext = {
  origin: typeof CLASSROOM_INVESTIGATION_ORIGIN;
  featured_taxon: { rank: 'genus'; accepted_name: string };
  context_is_evidence: false;
  context_is_learner_draft: true;
  taxon?: string;
  taxon_source?: typeof CLASSROOM_INVESTIGATION_ORIGIN;
  taxon_is_evidence?: false;
};

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function bounded(value: string | null | undefined, pattern: RegExp): string | null {
  const text = value?.trim();
  if (
    !text ||
    text.length > MAX_TAXON_CONTEXT_TEXT ||
    hasControlCharacter(text) ||
    UNSAFE_CONTEXT_PUNCTUATION.test(text) ||
    !pattern.test(text)
  ) {
    return null;
  }
  return text;
}

/**
 * Resolve a learner's free-text taxon into a genus, and a binomial when they
 * gave one. Anything else resolves to nothing.
 */
export function classroomSubject(value: string | null | undefined): {
  genus: string;
  taxon: string | null;
} | null {
  const text = value?.trim() ?? '';
  const binomial = bounded(text, SAFE_BINOMIAL);
  if (binomial) return { genus: binomial.split(/\s+/)[0], taxon: binomial };
  const genus = bounded(text, SAFE_GENUS);
  return genus ? { genus, taxon: null } : null;
}

function boundedQuestion(value: string | null | undefined): string | null {
  const question = value?.replace(/\s+/g, ' ').trim();
  if (!question || hasControlCharacter(question)) return null;
  return question.slice(0, MAX_QUESTION_CHARACTERS);
}

/** Into the Atlas, on the learner's subject. Genus drives the Atlas filter. */
export function classroomAtlasHref(taxonText: string | null | undefined): string | null {
  const subject = classroomSubject(taxonText);
  if (!subject) return null;
  const params = new URLSearchParams();
  if (subject.taxon) params.set('species', subject.taxon);
  else params.set('genera', subject.genus);
  params.set('origin', CLASSROOM_INVESTIGATION_ORIGIN);
  return `/atlas?${params.toString()}`;
}

/**
 * Into Calyx, on the learner's subject and — when they wrote one — their
 * question, through the governed question channel that already marks a
 * user-authored question non-evidentiary.
 */
export function classroomCalyxHref(
  taxonText: string | null | undefined,
  question?: string | null,
): string | null {
  const subject = classroomSubject(taxonText);
  if (!subject) return null;

  const params = new URLSearchParams();
  params.set('genus', subject.genus);
  if (subject.taxon) params.set('taxon', subject.taxon);
  params.set('origin', CLASSROOM_INVESTIGATION_ORIGIN);
  params.set('context_is_evidence', 'false');
  params.set('context_is_learner_draft', 'true');

  const activeQuestion = boundedQuestion(question);
  if (activeQuestion) {
    params.set('question', activeQuestion);
    params.set('question_source', 'user');
    params.set('question_is_evidence', 'false');
  }
  return `/calyx?${params.toString()}`;
}

/** Parse a classroom arrival. Fails closed on anything unexpected. */
export function parseClassroomInvestigationContext(
  search: string | URLSearchParams,
): ClassroomInvestigationContext | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('origin') !== CLASSROOM_INVESTIGATION_ORIGIN) return null;
  if (params.get('context_is_evidence') !== 'false') return null;
  // A classroom arrival that does not declare itself a learner draft is not a
  // classroom arrival. The declaration is the whole protection.
  if (params.get('context_is_learner_draft') !== 'true') return null;

  const genus = bounded(params.get('genus'), SAFE_GENUS);
  if (!genus) return null;

  const taxon = bounded(params.get('taxon'), SAFE_BINOMIAL);
  if (taxon && !taxon.startsWith(`${genus} `)) return null;

  return {
    origin: CLASSROOM_INVESTIGATION_ORIGIN,
    genus,
    taxon,
    contextIsEvidence: false,
    contextIsLearnerDraft: true,
  };
}

/**
 * Adapt a validated classroom arrival to the route_context shape sent to Calyx.
 * The exact species survives only when the learner supplied a bounded binomial,
 * and it remains explicitly learner-draft navigation context, never evidence.
 */
export function classroomCalyxTurnRouteContext(
  search: string | URLSearchParams,
): ClassroomCalyxTurnRouteContext | null {
  const context = parseClassroomInvestigationContext(search);
  if (!context) return null;

  return {
    origin: CLASSROOM_INVESTIGATION_ORIGIN,
    featured_taxon: { rank: 'genus', accepted_name: context.genus },
    context_is_evidence: false,
    context_is_learner_draft: true,
    ...(context.taxon
      ? {
          taxon: context.taxon,
          taxon_source: CLASSROOM_INVESTIGATION_ORIGIN,
          taxon_is_evidence: false,
        }
      : {}),
  };
}
