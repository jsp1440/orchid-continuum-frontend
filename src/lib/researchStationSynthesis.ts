import {
  createCalyxConversation,
  sendCalyxTurn,
  type CalyxClaimCoverage,
  type CalyxSynthesisStructure,
} from "@/lib/calyxWorkspace";
import { RESEARCH_STATION_ORIGIN, assertNoLocalityLeak } from "@/lib/researchStationNavigation";
import {
  researchStationCalyxQuestion,
  type ResearchStationDossier,
} from "@/lib/researchStation";

/**
 * Runs the Research Station's investigation question through the governed Calyx
 * conversation path and returns what the backend actually reasoned.
 *
 * The station never interprets evidence itself. Everything rendered from this
 * module originates in the backend response: the prose comes from `answer`, and
 * the support/disagreement/gap detail comes from `synthesis_structure`, which
 * `CALYX-CONVERSATIONAL-SYNTHESIS-001` supplies and older backends omit. When it
 * is absent the answer stands alone rather than being padded with a structure
 * derived in the browser.
 *
 * The conversation id is returned so the investigation continues in the same
 * server-side thread when the user moves on to Calyx - a follow-up asked there
 * resolves against this turn instead of restarting the subject.
 */

export type ResearchStationSynthesis = {
  conversationId: string;
  /** The integrated answer, exactly as the backend composed it. */
  answer: string;
  /** Null when the backend does not supply the structure - never synthesized here. */
  structure: CalyxSynthesisStructure | null;
  /** True when the backend composed from linked evidence rather than reasoning generatively. */
  degraded: boolean;
};

export class ResearchStationQuestionMissing extends Error {
  constructor() {
    super("This investigation does not record a research question.");
    this.name = "ResearchStationQuestionMissing";
  }
}

/**
 * Bounded interaction context for the turn.
 *
 * Carries canonical taxon identity, project identity and the project's own
 * question - and nothing else. The question is explicitly flagged as interaction
 * context rather than evidence, matching the contract the Calyx workspace already
 * uses, so a question can steer claim resolution without ever being counted as a
 * scientific observation. Locality is refused outright rather than bounded.
 */
export function buildResearchStationTurnContext(
  dossier: ResearchStationDossier,
): Record<string, unknown> {
  const question = researchStationCalyxQuestion(dossier);
  if (!question) throw new ResearchStationQuestionMissing();

  const taxonId = dossier.subject?.taxon_id?.trim() ?? "";
  const projectId = dossier.project.project_id;

  const routeContext: Record<string, unknown> = {
    origin: RESEARCH_STATION_ORIGIN,
    ...(taxonId ? { featured_taxon: { rank: "TAXON", accepted_name: taxonId } } : {}),
    question,
    question_source: "research_project",
    question_is_evidence: false,
  };

  // Fail closed on the context actually being sent, not on a fixed key list.
  // A turn body is a different channel from a query string, but it enforces the
  // same rule, and checking what leaves means a locality field added to this
  // object later throws instead of shipping.
  assertNoLocalityLeak(
    Object.fromEntries(Object.keys(routeContext).map((key) => [key, ""])),
  );

  return {
    surface: "orchid-continuum-frontend",
    project_id: projectId,
    route_context: routeContext,
  };
}

/**
 * Opens a governed conversation for the investigation and takes one turn.
 *
 * `research_mode: "always"` because a research question is never a casual turn -
 * the station asks for the governed mission explicitly rather than letting the
 * heuristic decide.
 */
export async function runResearchStationSynthesis(
  dossier: ResearchStationDossier,
): Promise<ResearchStationSynthesis> {
  const question = researchStationCalyxQuestion(dossier);
  if (!question) throw new ResearchStationQuestionMissing();

  const context = buildResearchStationTurnContext(dossier);
  const projectId = dossier.project.project_id;

  const conversation = await createCalyxConversation({
    title: dossier.project.title ?? "Research Station investigation",
    project_id: projectId,
    context,
  });

  const turn = await sendCalyxTurn(conversation.conversation_id, {
    message: question,
    project_id: projectId,
    context,
    research_mode: "always",
  });

  const structure = turn.synthesis_structure ?? null;

  return {
    conversationId: turn.conversation_id || conversation.conversation_id,
    answer: turn.answer ?? "",
    structure,
    // Absent structure means an older backend, not a generative answer. Claiming
    // "reasoned generatively" on missing data would overstate what happened, so
    // an unknown composer reads as degraded.
    degraded: structure ? structure.generative !== true : true,
  };
}

export type ClaimCoverageGroups = {
  supported: CalyxClaimCoverage[];
  contested: CalyxClaimCoverage[];
  contradicted: CalyxClaimCoverage[];
  unresolved: CalyxClaimCoverage[];
};

/**
 * Groups the backend's per-claim coverage for display.
 *
 * Grouping only - no claim changes state on the way through. Contested and
 * contradicted stay separate from supported and from each other, because
 * collapsing them is exactly how a disagreement silently becomes agreement. Any
 * coverage value the backend introduces later that this does not recognise falls
 * to `unresolved`, which understates certainty rather than inventing it.
 */
export function groupClaimCoverage(
  structure: CalyxSynthesisStructure | null | undefined,
): ClaimCoverageGroups {
  const groups: ClaimCoverageGroups = {
    supported: [],
    contested: [],
    contradicted: [],
    unresolved: [],
  };
  for (const claim of structure?.claim_coverage ?? []) {
    if (claim.coverage === "supported") groups.supported.push(claim);
    else if (claim.coverage === "contested") groups.contested.push(claim);
    else if (claim.coverage === "contradicted") groups.contradicted.push(claim);
    else groups.unresolved.push(claim);
  }
  return groups;
}

/**
 * Evidence the backend named as missing.
 *
 * Returned as gaps for the caller to label as gaps. An empty list means nothing
 * was reported missing - never that nothing is missing.
 */
export function synthesisGaps(
  structure: CalyxSynthesisStructure | null | undefined,
): string[] {
  return (structure?.missing_evidence ?? []).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

/** True when the backend reported evidence that has not been reconciled. */
export function hasUnresolvedConflict(
  structure: CalyxSynthesisStructure | null | undefined,
): boolean {
  if (!structure) return false;
  if (structure.unresolved_conflict === true) return true;
  const groups = groupClaimCoverage(structure);
  return groups.contested.length > 0 || groups.contradicted.length > 0;
}
