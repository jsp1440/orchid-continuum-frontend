/**
 * evidenceDecisionManifest — TypeScript surface for oc-run-evidence-manifest-v1.
 *
 * The manifest is the immutable, sha256-fingerprinted record produced by one
 * research run via POST /synthesis/run-manifest.  It carries the full
 * evidence-to-decision chain with all governance flags enforced — no automatic
 * publication, no canonical knowledge mutation, human review required before
 * any canonical activation.
 *
 * This module is NO-API: it contains no generative model calls and no paid
 * provider invocations.  It calls the deterministic backend endpoint that
 * wraps build_run_evidence_manifest() (Brain #103 vertical slice).
 */

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { CalyxApiError } from "@/lib/calyxWorkspace";

export const MANIFEST_VERSION = "oc-run-evidence-manifest-v1" as const;

/** One oc-verification-handoff-v1 packet from Brain reasoning_contracts. */
export type VerificationPacket = {
  contract_version: "oc-verification-handoff-v1";
  verification_state: "ready_for_review" | "validation_required" | "evidence_incomplete";
  resolved_evidence: Array<{
    evidence_id: string;
    source_id: string;
    statement: string;
    provenance: string[];
    confidence: number;
  }>;
  missing_evidence: string[];
  contradictions: string[];
  knowledge_gaps: string[];
  human_review_required: true;
  automatic_scientific_publication_allowed: false;
  canonical_knowledge_mutation_allowed: false;
  /** Present when the packet has a reasoning block (from build_verification_packet). */
  reasoning?: {
    contract_version: string;
    candidate_knowledge?: {
      candidate_id: string;
      subject_id: string;
      predicate: string;
      object_id: string;
      evidence_ids: string[];
      confidence: number;
    };
    contradictions?: string[];
    human_review_required: boolean;
    automatic_scientific_publication_allowed: boolean;
  };
};

/**
 * Immutable, sha256-fingerprinted run evidence manifest.
 * Returned by POST /synthesis/run-manifest as oc-run-evidence-manifest-v1.
 */
export type RunEvidenceManifest = {
  contract_version: typeof MANIFEST_VERSION;
  run_id: string;
  research_question: string;
  taxon_id: string;
  taxonomy_snapshot_id: string;
  /** SHA-256 hex fingerprint of the deterministic manifest content. */
  run_fingerprint: string;
  created_at_utc: string;
  verification_state: "ready_for_review" | "validation_required" | "evidence_incomplete";
  resolved_evidence_count: number;
  missing_evidence_count: number;
  knowledge_gap_count: number;
  contradictions: string[];
  review_decision: string | null;
  epistemic_state: string | null;
  /** Governance invariants — all hardcoded by the backend. */
  human_review_required: true;
  automatic_scientific_publication_allowed: false;
  canonical_knowledge_mutation_allowed: false;
  canonical_activation_requires_human_authority: true;
  immutable: true;
};

export type RunManifestRequest = {
  run_id: string;
  research_question: string;
  taxon_id: string;
  taxonomy_snapshot_id: string;
  verification_packets: VerificationPacket[];
  review_records?: Record<string, unknown>[];
  epistemic_memory_entries?: Record<string, unknown>[];
};

/**
 * POST /synthesis/run-manifest — build an immutable run evidence manifest.
 *
 * Wraps the deterministic backend endpoint. Throws CalyxApiError on
 * network / HTTP failures so callers can distinguish states cleanly.
 */
export async function buildRunManifest(
  request: RunManifestRequest,
): Promise<RunEvidenceManifest> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}/synthesis/run-manifest`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new CalyxApiError(
      "network_error",
      error instanceof Error ? error.message : "Run manifest request failed",
    );
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: { code?: string } | string };
      detail =
        typeof body.detail === "string"
          ? body.detail
          : body.detail?.code;
    } catch {
      // ignore parse failure
    }
    if (response.status === 401 || response.status === 403)
      throw new CalyxApiError(
        "authentication_required",
        detail ?? "Authentication required.",
        response.status,
      );
    if (response.status === 404)
      throw new CalyxApiError(
        "route_unavailable",
        detail ?? "Run manifest endpoint not deployed.",
        response.status,
      );
    if (response.status === 422)
      throw new CalyxApiError(
        "validation_failed",
        detail ?? "Run manifest request invalid.",
        response.status,
      );
    throw new CalyxApiError(
      "server_error",
      detail ?? `Run manifest failed (${response.status}).`,
      response.status,
    );
  }

  const manifest = (await response.json()) as RunEvidenceManifest;
  assertManifestVersion(manifest);
  return manifest;
}

function assertManifestVersion(manifest: RunEvidenceManifest): void {
  if (manifest.contract_version !== MANIFEST_VERSION) {
    throw new CalyxApiError(
      "server_error",
      `Unexpected manifest version: ${manifest.contract_version}`,
    );
  }
}

// ── Governance helpers ────────────────────────────────────────────────────────

/**
 * True when the manifest state indicates the run has incomplete evidence.
 * Callers must never treat incomplete evidence as a finding.
 */
export function isEvidenceIncomplete(manifest: RunEvidenceManifest): boolean {
  return manifest.verification_state === "evidence_incomplete";
}

/**
 * True when the manifest has contradictions that need to be weighed.
 * Contradictions are preserved, not averaged away.
 */
export function hasContradictions(manifest: RunEvidenceManifest): boolean {
  return manifest.contradictions.length > 0;
}

/**
 * Human-readable verification state label for UI display.
 */
export function verificationStateLabel(manifest: RunEvidenceManifest): string {
  switch (manifest.verification_state) {
    case "evidence_incomplete":
      return "Evidence incomplete — review blocked";
    case "validation_required":
      return "Validation required";
    case "ready_for_review":
      return "Ready for human review";
  }
}

/**
 * True when the manifest indicates all governance gates are satisfied for
 * display.  Does NOT mean the knowledge is canonical — human review is always
 * required before canonical activation.
 */
export function isReadyForHumanReview(manifest: RunEvidenceManifest): boolean {
  return (
    manifest.verification_state === "ready_for_review" &&
    manifest.human_review_required === true &&
    manifest.automatic_scientific_publication_allowed === false
  );
}
