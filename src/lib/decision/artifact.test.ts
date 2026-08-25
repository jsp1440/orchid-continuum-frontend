import { describe, expect, it } from "vitest";

import { contentFingerprint, canonicalStringify } from "./fingerprint";
import {
  buildRunManifest,
  reproducesSameInputs,
  citationsFromClaims,
  buildDecisionArtifact,
  buildKnowledgeGraphProposal,
  ProposalNotProposable,
} from "./artifact";
import { buildComparisonTable, assessUncertainty, buildProvisionalSynthesis } from "./synthesis";
import { makeClaim } from "./claims";
import type { DecisionFrame, ResearchPlan, SourceAnchor, StageTelemetry } from "./contracts";

function anchor(id: string): SourceAnchor {
  return {
    anchorId: id,
    sourceKind: "literature",
    title: `title-${id}`,
    revisionId: id,
    sourceAnchorIds: [id],
    contentHash: `h-${id}`,
    locator: null,
    retrievedAt: null,
    license: null,
    attribution: `attrib-${id}`,
    displayPolicy: null,
    excerptAbsence: null,
  };
}

const FRAME: DecisionFrame = {
  question: "q",
  intendedOutput: "o",
  audience: ["a"],
  scope: "s",
  assumptions: [],
  constraints: [],
  inclusionCriteria: [],
  exclusionCriteria: [],
  stoppingRule: "stop",
};

const PLAN: ResearchPlan = {
  planId: "p",
  taxonomyRelease: "rel-1",
  editableByUser: true,
  steps: [{ stepId: "s1", stage: "FRAME", description: "d", dataClasses: [] }],
};

const STAGES: StageTelemetry[] = [];

describe("fingerprint is deterministic and order-independent", () => {
  it("sorts object keys so equal content fingerprints equally", () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
    expect(contentFingerprint({ b: 1, a: 2 })).toBe(contentFingerprint({ a: 2, b: 1 }));
  });

  it("treats explicit undefined and missing keys identically, but preserves null", () => {
    expect(contentFingerprint({ a: 1, b: undefined })).toBe(contentFingerprint({ a: 1 }));
    expect(contentFingerprint({ a: 1, b: null })).not.toBe(contentFingerprint({ a: 1 }));
  });

  it("changes when content materially changes", () => {
    expect(contentFingerprint({ a: 1 })).not.toBe(contentFingerprint({ a: 2 }));
  });

  it("labels its algorithm and never claims to be a crypto digest", () => {
    expect(contentFingerprint("x").startsWith("fp1:")).toBe(true);
  });
});

describe("run manifest reproducibility", () => {
  const claims = [
    makeClaim({ claimId: "c1", kind: "sourced_assertion", statement: "one", anchors: [anchor("a1")] }),
    makeClaim({ claimId: "c2", kind: "sourced_assertion", statement: "two", anchors: [anchor("a2")] }),
  ];
  const anchors = [anchor("a1"), anchor("a2")];

  function build(runId: string, createdAt: string) {
    return buildRunManifest({
      runId,
      projectId: "proj",
      taxonomyRelease: "rel-1",
      createdAt,
      frame: FRAME,
      plan: PLAN,
      claims,
      anchors,
      stages: STAGES,
      outputs: { result: 1 },
      partial: false,
    });
  }

  it("reproduces the same input fingerprint for identical governed inputs, regardless of runId/time", () => {
    const m1 = build("run-1", "2026-01-01T00:00:00Z");
    const m2 = build("run-2", "2026-09-09T09:09:09Z");
    expect(m1.inputFingerprint).toBe(m2.inputFingerprint);
    expect(reproducesSameInputs(m1, m2)).toBe(true);
  });

  it("changes the input fingerprint when a claim identity changes", () => {
    const m1 = build("run-1", "t");
    const changed = buildRunManifest({
      runId: "run-3",
      projectId: "proj",
      taxonomyRelease: "rel-1",
      createdAt: "t",
      frame: FRAME,
      plan: PLAN,
      claims: [...claims, makeClaim({ claimId: "c3", kind: "hypothesis", statement: "new" })],
      anchors,
      stages: STAGES,
      outputs: { result: 1 },
      partial: false,
    });
    expect(changed.inputFingerprint).not.toBe(m1.inputFingerprint);
  });

  it("a partial run has a null output fingerprint — nothing implies a complete output", () => {
    const partial = buildRunManifest({
      runId: "run-4",
      projectId: "proj",
      taxonomyRelease: "rel-1",
      createdAt: "t",
      frame: FRAME,
      plan: PLAN,
      claims,
      anchors,
      stages: STAGES,
      outputs: { result: 1 },
      partial: true,
      resumeFrom: "RETRIEVE",
    });
    expect(partial.outputFingerprint).toBeNull();
    expect(partial.partial).toBe(true);
    expect(partial.resumeFrom).toBe("RETRIEVE");
  });
});

describe("citations bind to actual anchors", () => {
  it("collects one citation per referenced anchor, deduplicated and sorted", () => {
    const claims = [
      makeClaim({ claimId: "c1", kind: "sourced_assertion", statement: "one", anchors: [anchor("a2"), anchor("a1")] }),
      makeClaim({ claimId: "c2", kind: "sourced_assertion", statement: "two", anchors: [anchor("a1")] }),
    ];
    const cites = citationsFromClaims(claims);
    expect(cites.map((c) => c.anchorId)).toEqual(["a1", "a2"]);
  });
});

describe("decision artifact is draft, cited, and bound to a run", () => {
  it("carries a review gate and an explicit non-published status", () => {
    const claims = [makeClaim({ claimId: "c1", kind: "sourced_assertion", statement: "one", anchors: [anchor("a1")] })];
    const table = buildComparisonTable([], [], []);
    const u = assessUncertainty(claims, []);
    const synthesis = buildProvisionalSynthesis({ conclusion: "provisional", limitations: [], uncertainty: u });
    const artifact = buildDecisionArtifact({
      artifactId: "art1",
      projectId: "proj",
      runId: "run1",
      frame: FRAME,
      synthesis,
      comparison: table,
      claims,
    });
    expect(artifact.publicationStatus).toBe("draft_decision_ready");
    expect(artifact.review.state).toBe("draft");
    expect(artifact.citations).toHaveLength(1);
    expect(artifact.runId).toBe("run1");
  });
});

describe("knowledge-graph write-back is proposal-only", () => {
  it("builds a proposed (never accepted) node for a hypothesis/interpretation", () => {
    const hyp = makeClaim({ claimId: "h1", kind: "hypothesis", statement: "a testable hypothesis" });
    const proposal = buildKnowledgeGraphProposal({
      proposalId: "kgp1",
      projectId: "proj",
      runId: "run1",
      claim: hyp,
      claims: [hyp],
      relations: [],
    });
    expect(proposal.status).toBe("proposed");
    expect(proposal.review.state).toBe("draft");
    expect((proposal as Record<string, unknown>).accepted).toBeUndefined();
  });

  it("fails closed when asked to propose an observation/sourced claim", () => {
    const obs = makeClaim({ claimId: "o1", kind: "sourced_assertion", statement: "measured", anchors: [anchor("a1")] });
    expect(() =>
      buildKnowledgeGraphProposal({ proposalId: "kgp2", projectId: "proj", runId: "run1", claim: obs, claims: [obs], relations: [] }),
    ).toThrow(ProposalNotProposable);
  });
});
