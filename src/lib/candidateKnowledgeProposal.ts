import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import {
  CalyxApiError,
  type BrainMission,
  type MissionEvidence,
} from "@/lib/calyxWorkspace";
import type {
  RunEvidenceManifest,
  VerificationPacket,
} from "@/lib/evidenceDecisionManifest";

export const CANDIDATE_PROPOSAL_VERSION =
  "oc-candidate-knowledge-proposal-v1" as const;

const DOMAINS = [
  "taxonomy",
  "trait",
  "morphology",
  "ecology",
  "geography",
  "phenology",
  "conservation",
  "measurement",
  "molecular",
  "cultivation",
] as const;

export type CandidateProposalDomain = (typeof DOMAINS)[number];

export type CandidateProposalRequest = {
  manifest: RunEvidenceManifest;
  verification_packet: VerificationPacket;
  domain: CandidateProposalDomain;
  source_object_type: string;
  source_object_id: number;
  revision_id: number;
  extraction_run_id: number;
};

export type CandidateKnowledgeProposal = {
  contract_version: typeof CANDIDATE_PROPOSAL_VERSION;
  proposal_id: string;
  run_id: string;
  run_fingerprint: string;
  candidate_handoff_request: Record<string, unknown>;
  review_required: true;
  owner_submission_required: true;
  candidate_persistence_performed: false;
  automatic_approval: false;
  automatic_scientific_publication: false;
  canonical_knowledge_mutation: false;
  knowledge_graph_mutation: false;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function domainOf(value: unknown): CandidateProposalDomain | null {
  return typeof value === "string" &&
    (DOMAINS as readonly string[]).includes(value)
    ? (value as CandidateProposalDomain)
    : null;
}

type CandidateBinding = {
  candidateId: string;
  subject: string;
  predicate: string;
  objectId: string;
  confidence: number;
  domain: CandidateProposalDomain;
  sourceObjectType: string;
  sourceObjectId: number;
  revisionId: number;
  extractionRunId: number;
};

function bindingOf(evidence: MissionEvidence): CandidateBinding | null {
  const provenance = evidence.provenance;
  if (!provenance || typeof provenance !== "object") return null;

  const candidateId = nonEmpty(evidence.candidate_id)
    ? evidence.candidate_id.trim()
    : null;
  const subject = nonEmpty(evidence.subject) ? evidence.subject.trim() : null;
  const predicate = nonEmpty(evidence.predicate)
    ? evidence.predicate.trim()
    : null;
  const objectId = nonEmpty(evidence.value) ? evidence.value.trim() : null;
  const confidence = provenance.confidence;
  const domain = domainOf(provenance.domain);
  const sourceObjectType = nonEmpty(provenance.source_object_type)
    ? provenance.source_object_type.trim()
    : null;
  const sourceObjectId = positiveInteger(provenance.source_object_id);
  const revisionId = positiveInteger(evidence.source_revision_id);
  const extractionRunId = positiveInteger(provenance.extraction_run_id);

  if (
    !candidateId ||
    !subject ||
    !predicate ||
    !objectId ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    !domain ||
    !sourceObjectType ||
    !sourceObjectId ||
    !revisionId ||
    !extractionRunId
  ) {
    return null;
  }

  return {
    candidateId,
    subject,
    predicate,
    objectId,
    confidence,
    domain,
    sourceObjectType,
    sourceObjectId,
    revisionId,
    extractionRunId,
  };
}

/**
 * Builds a proposal request only when the Brain returned one unambiguous,
 * fully bound canonical candidate. Missing IDs remain unavailable.
 */
export function candidateProposalRequest(
  manifest: RunEvidenceManifest,
  packet: VerificationPacket,
  mission: BrainMission | null,
): CandidateProposalRequest | null {
  if (
    manifest.verification_state !== "ready_for_review" ||
    packet.verification_state !== "ready_for_review" ||
    !mission ||
    mission.partial ||
    mission.review_status !== "HUMAN_REVIEW_REQUIRED"
  ) {
    return null;
  }

  const candidates = mission.supporting_evidence
    .map(bindingOf)
    .filter((value): value is CandidateBinding => value !== null)
    .filter((value) => value.subject === manifest.taxon_id);

  if (candidates.length !== 1 || packet.resolved_evidence.length === 0) {
    return null;
  }

  const candidate = candidates[0];
  return {
    manifest,
    verification_packet: {
      ...packet,
      reasoning: {
        contract_version: "oc-parallel-v1",
        candidate_knowledge: {
          candidate_id: candidate.candidateId,
          subject_id: candidate.subject,
          predicate: candidate.predicate,
          object_id: candidate.objectId,
          evidence_ids: packet.resolved_evidence.map(
            (evidence) => evidence.evidence_id,
          ),
          confidence: candidate.confidence,
        },
        contradictions: packet.contradictions,
        human_review_required: true,
        automatic_scientific_publication_allowed: false,
      },
    },
    domain: candidate.domain,
    source_object_type: candidate.sourceObjectType,
    source_object_id: candidate.sourceObjectId,
    revision_id: candidate.revisionId,
    extraction_run_id: candidate.extractionRunId,
  };
}

function assertProposal(
  value: CandidateKnowledgeProposal,
  request: CandidateProposalRequest,
): void {
  if (
    value.contract_version !== CANDIDATE_PROPOSAL_VERSION ||
    !nonEmpty(value.proposal_id) ||
    value.run_fingerprint !== request.manifest.run_fingerprint ||
    value.review_required !== true ||
    value.owner_submission_required !== true ||
    value.candidate_persistence_performed !== false ||
    value.automatic_approval !== false ||
    value.automatic_scientific_publication !== false ||
    value.canonical_knowledge_mutation !== false ||
    value.knowledge_graph_mutation !== false
  ) {
    throw new CalyxApiError(
      "server_error",
      "Candidate proposal violated the review-only contract.",
    );
  }
}

export async function prepareCandidateProposal(
  request: CandidateProposalRequest,
): Promise<CandidateKnowledgeProposal> {
  let response: Response;
  try {
    response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/synthesis/candidate-proposal`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(request),
      },
    );
  } catch (error) {
    throw new CalyxApiError(
      "network_error",
      error instanceof Error
        ? error.message
        : "Candidate proposal request failed.",
    );
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as {
        detail?: { code?: string } | string;
      };
      detail =
        typeof body.detail === "string" ? body.detail : body.detail?.code;
    } catch {
      // Preserve the HTTP state when the body is unavailable.
    }
    const kind =
      response.status === 401 || response.status === 403
        ? "authentication_required"
        : response.status === 404
          ? "route_unavailable"
          : response.status === 422
            ? "validation_failed"
            : "server_error";
    throw new CalyxApiError(
      kind,
      detail ?? `Candidate proposal failed (${response.status}).`,
      response.status,
    );
  }

  const proposal = (await response.json()) as CandidateKnowledgeProposal;
  assertProposal(proposal, request);
  return proposal;
}
