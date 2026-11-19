import { describe, expect, it, vi } from "vitest";

import type { BrainMission } from "@/lib/calyxWorkspace";
import {
  CANDIDATE_PROPOSAL_VERSION,
  candidateProposalRequest,
  prepareCandidateProposal,
} from "@/lib/candidateKnowledgeProposal";
import type {
  RunEvidenceManifest,
  VerificationPacket,
} from "@/lib/evidenceDecisionManifest";

const manifest = {
  contract_version: "oc-run-evidence-manifest-v1",
  run_id: "run:phal:1",
  research_question: "Cool-growing or warm-growing?",
  taxon_id: "taxon:phalaenopsis",
  taxonomy_snapshot_id: "world-plants:2.1.2026",
  run_fingerprint: "a".repeat(64),
  created_at_utc: "2026-09-13T00:00:00Z",
  verification_state: "ready_for_review",
  resolved_evidence_count: 1,
  missing_evidence_count: 0,
  knowledge_gap_count: 0,
  contradictions: [],
  review_decision: null,
  epistemic_state: null,
  human_review_required: true,
  automatic_scientific_publication_allowed: false,
  canonical_knowledge_mutation_allowed: false,
  canonical_activation_requires_human_authority: true,
  immutable: true,
} satisfies RunEvidenceManifest;

const packet = {
  contract_version: "oc-verification-handoff-v1",
  verification_state: "ready_for_review",
  resolved_evidence: [
    {
      evidence_id: "claim:warm",
      source_id: "literature",
      statement: "The evidence supports a provisional warm-growing claim.",
      provenance: ["doi:10.1000/example"],
      confidence: 0.78,
    },
  ],
  missing_evidence: [],
  contradictions: [],
  knowledge_gaps: [],
  human_review_required: true,
  automatic_scientific_publication_allowed: false,
  canonical_knowledge_mutation_allowed: false,
} satisfies VerificationPacket;

const mission = {
  mission_id: "mission:phal",
  project_id: "project:phal",
  question: "Cool-growing or warm-growing?",
  state: "COMPLETED",
  current_stage: "SYNTHESIS",
  steps_executed: 4,
  sources: [],
  supporting_evidence: [
    {
      candidate_id: "candidate:phal-warm",
      subject: "taxon:phalaenopsis",
      predicate: "grows_optimally_at",
      value: "temperature:intermediate_warm",
      source_revision_id: 8,
      provenance: {
        confidence: 0.78,
        domain: "cultivation",
        source_object_type: "brain_reasoning_record",
        source_object_id: 103,
        extraction_run_id: 12,
      },
    },
  ],
  contradicting_evidence: [],
  missing_evidence: [],
  confidence: 0.78,
  conclusions: [{ text: "Provisional warm-growing conclusion." }],
  reasoning_ledger: { ledger_id: "ledger:phal", version: 1 },
  validation: { valid: true, blockers: [] },
  review_status: "HUMAN_REVIEW_REQUIRED",
  publication_eligibility: {
    eligible: false,
    automatic_publication: false,
    blockers: ["human review required"],
  },
  blockers: [],
  partial: false,
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
} satisfies BrainMission;

describe("candidate proposal request", () => {
  it("binds one explicit canonical candidate without expanding authority", () => {
    const request = candidateProposalRequest(manifest, packet, mission);

    expect(request).not.toBeNull();
    expect(request?.domain).toBe("cultivation");
    expect(request?.source_object_id).toBe(103);
    expect(
      request?.verification_packet.reasoning?.candidate_knowledge?.candidate_id,
    ).toBe("candidate:phal-warm");
    expect(
      request?.verification_packet.canonical_knowledge_mutation_allowed,
    ).toBe(false);
  });

  it("fails closed when canonical bindings are missing or ambiguous", () => {
    expect(
      candidateProposalRequest(manifest, packet, {
        ...mission,
        supporting_evidence: [
          { ...mission.supporting_evidence[0], provenance: {} },
        ],
      }),
    ).toBeNull();
    expect(
      candidateProposalRequest(manifest, packet, {
        ...mission,
        supporting_evidence: [
          ...mission.supporting_evidence,
          {
            ...mission.supporting_evidence[0],
            candidate_id: "candidate:second",
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects incomplete evidence before making a request", () => {
    expect(
      candidateProposalRequest(
        { ...manifest, verification_state: "evidence_incomplete" },
        packet,
        mission,
      ),
    ).toBeNull();
  });
});

describe("prepare candidate proposal", () => {
  it("accepts only the zero-mutation response contract", async () => {
    const request = candidateProposalRequest(manifest, packet, mission);
    expect(request).not.toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            contract_version: CANDIDATE_PROPOSAL_VERSION,
            proposal_id: "candidate-proposal:abc",
            run_id: manifest.run_id,
            run_fingerprint: manifest.run_fingerprint,
            candidate_handoff_request: {},
            review_required: true,
            owner_submission_required: true,
            candidate_persistence_performed: false,
            automatic_approval: false,
            automatic_scientific_publication: false,
            canonical_knowledge_mutation: false,
            knowledge_graph_mutation: false,
          }),
          { status: 200 },
        ),
      ),
    );

    const proposal = await prepareCandidateProposal(request!);
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/scientific-interpretation\/synthesis\/candidate-proposal$/);
    expect(proposal.knowledge_graph_mutation).toBe(false);
    expect(proposal.candidate_persistence_performed).toBe(false);
  });

  it("rejects an authority-expanding response", async () => {
    const request = candidateProposalRequest(manifest, packet, mission);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            contract_version: CANDIDATE_PROPOSAL_VERSION,
            proposal_id: "candidate-proposal:abc",
            run_fingerprint: manifest.run_fingerprint,
            review_required: true,
            owner_submission_required: true,
            candidate_persistence_performed: false,
            automatic_approval: false,
            automatic_scientific_publication: false,
            canonical_knowledge_mutation: false,
            knowledge_graph_mutation: true,
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(prepareCandidateProposal(request!)).rejects.toThrow(
      "review-only contract",
    );
  });
});
