/**
 * Tests for evidenceDecisionManifest — Brain #103 vertical slice frontend connector.
 *
 * All tests are deterministic: no model inference, no paid provider calls.
 * fetch is mocked so the backend is not reached.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { CalyxApiError } from "@/lib/calyxWorkspace";
import {
  MANIFEST_VERSION,
  buildRunManifest,
  hasContradictions,
  isEvidenceIncomplete,
  isReadyForHumanReview,
  verificationStateLabel,
} from "@/lib/evidenceDecisionManifest";
import type { RunEvidenceManifest, RunManifestRequest } from "@/lib/evidenceDecisionManifest";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PHALAENOPSIS_PACKET = {
  contract_version: "oc-verification-handoff-v1" as const,
  verification_state: "ready_for_review" as const,
  resolved_evidence: [
    {
      evidence_id: "evidence:phal-warm-temp-optimum",
      source_id: "source:rittershausen-2011",
      statement: "Phalaenopsis grow optimally at intermediate-warm temperatures.",
      provenance: ["doi:10.1234/rittershausen2011"],
      confidence: 0.82,
    },
  ],
  missing_evidence: [],
  contradictions: ["candidate:phal-cool-highland"],
  knowledge_gaps: [],
  human_review_required: true as const,
  automatic_scientific_publication_allowed: false as const,
  canonical_knowledge_mutation_allowed: false as const,
};

const BASE_REQUEST: RunManifestRequest = {
  run_id: "run:phal-2026-09",
  research_question: "What is the optimal temperature range for Phalaenopsis cultivation?",
  taxon_id: "taxon:phalaenopsis",
  taxonomy_snapshot_id: "hassler:2026-09",
  verification_packets: [PHALAENOPSIS_PACKET],
};

const MANIFEST_FIXTURE: RunEvidenceManifest = {
  contract_version: MANIFEST_VERSION,
  run_id: "run:phal-2026-09",
  research_question: "What is the optimal temperature range for Phalaenopsis cultivation?",
  taxon_id: "taxon:phalaenopsis",
  taxonomy_snapshot_id: "hassler:2026-09",
  run_fingerprint: "a".repeat(64),
  created_at_utc: "2026-09-12T00:00:00+00:00",
  verification_state: "ready_for_review",
  resolved_evidence_count: 1,
  missing_evidence_count: 0,
  knowledge_gap_count: 0,
  contradictions: ["candidate:phal-cool-highland"],
  review_decision: null,
  epistemic_state: null,
  human_review_required: true,
  automatic_scientific_publication_allowed: false,
  canonical_knowledge_mutation_allowed: false,
  canonical_activation_requires_human_authority: true,
  immutable: true,
};

function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function mockFetchError(status: number, detail?: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: detail ? { code: detail } : "error" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function mockFetchNetworkError(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network failure")));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── buildRunManifest ──────────────────────────────────────────────────────────

describe("buildRunManifest", () => {
  it("returns manifest on 200", async () => {
    mockFetchOk(MANIFEST_FIXTURE);
    const result = await buildRunManifest(BASE_REQUEST);
    expect(result.contract_version).toBe(MANIFEST_VERSION);
    expect(result.run_id).toBe("run:phal-2026-09");
  });

  it("returns run_fingerprint", async () => {
    mockFetchOk(MANIFEST_FIXTURE);
    const result = await buildRunManifest(BASE_REQUEST);
    expect(result.run_fingerprint).toHaveLength(64);
  });

  it("returns governance flags", async () => {
    mockFetchOk(MANIFEST_FIXTURE);
    const result = await buildRunManifest(BASE_REQUEST);
    expect(result.human_review_required).toBe(true);
    expect(result.automatic_scientific_publication_allowed).toBe(false);
    expect(result.canonical_knowledge_mutation_allowed).toBe(false);
    expect(result.canonical_activation_requires_human_authority).toBe(true);
    expect(result.immutable).toBe(true);
  });

  it("returns contradiction list", async () => {
    mockFetchOk(MANIFEST_FIXTURE);
    const result = await buildRunManifest(BASE_REQUEST);
    expect(result.contradictions).toContain("candidate:phal-cool-highland");
  });

  it("throws CalyxApiError(network_error) on fetch failure", async () => {
    mockFetchNetworkError();
    let caught: unknown;
    try {
      await buildRunManifest(BASE_REQUEST);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalyxApiError);
    expect((caught as CalyxApiError).kind).toBe("network_error");
  });

  it("throws CalyxApiError(authentication_required) on 401", async () => {
    mockFetchError(401);
    await expect(buildRunManifest(BASE_REQUEST)).rejects.toMatchObject({
      kind: "authentication_required",
    });
  });

  it("throws CalyxApiError(route_unavailable) on 404", async () => {
    mockFetchError(404);
    await expect(buildRunManifest(BASE_REQUEST)).rejects.toMatchObject({
      kind: "route_unavailable",
    });
  });

  it("throws CalyxApiError(validation_failed) on 422 with code in detail", async () => {
    mockFetchError(422, "UNSUPPORTED_VERIFICATION_PACKET");
    await expect(buildRunManifest(BASE_REQUEST)).rejects.toMatchObject({
      kind: "validation_failed",
      message: "UNSUPPORTED_VERIFICATION_PACKET",
    });
  });

  it("throws CalyxApiError(server_error) on 500", async () => {
    mockFetchError(500);
    await expect(buildRunManifest(BASE_REQUEST)).rejects.toMatchObject({
      kind: "server_error",
    });
  });

  it("throws CalyxApiError(server_error) on unexpected contract_version", async () => {
    mockFetchOk({ ...MANIFEST_FIXTURE, contract_version: "wrong-v1" });
    await expect(buildRunManifest(BASE_REQUEST)).rejects.toMatchObject({
      kind: "server_error",
    });
  });
});

// ── Governance helpers ────────────────────────────────────────────────────────

describe("isEvidenceIncomplete", () => {
  it("returns true when verification_state is evidence_incomplete", () => {
    expect(
      isEvidenceIncomplete({ ...MANIFEST_FIXTURE, verification_state: "evidence_incomplete" }),
    ).toBe(true);
  });

  it("returns false when verification_state is ready_for_review", () => {
    expect(isEvidenceIncomplete(MANIFEST_FIXTURE)).toBe(false);
  });
});

describe("hasContradictions", () => {
  it("returns true when contradictions list is non-empty", () => {
    expect(hasContradictions(MANIFEST_FIXTURE)).toBe(true);
  });

  it("returns false when contradictions list is empty", () => {
    expect(hasContradictions({ ...MANIFEST_FIXTURE, contradictions: [] })).toBe(false);
  });
});

describe("verificationStateLabel", () => {
  it("labels ready_for_review", () => {
    expect(verificationStateLabel(MANIFEST_FIXTURE)).toBe("Ready for human review");
  });

  it("labels validation_required", () => {
    expect(
      verificationStateLabel({ ...MANIFEST_FIXTURE, verification_state: "validation_required" }),
    ).toBe("Validation required");
  });

  it("labels evidence_incomplete", () => {
    expect(
      verificationStateLabel({ ...MANIFEST_FIXTURE, verification_state: "evidence_incomplete" }),
    ).toBe("Evidence incomplete — review blocked");
  });
});

describe("isReadyForHumanReview", () => {
  it("returns true when state is ready_for_review and governance flags are set", () => {
    expect(isReadyForHumanReview(MANIFEST_FIXTURE)).toBe(true);
  });

  it("returns false when state is evidence_incomplete", () => {
    expect(
      isReadyForHumanReview({ ...MANIFEST_FIXTURE, verification_state: "evidence_incomplete" }),
    ).toBe(false);
  });
});
