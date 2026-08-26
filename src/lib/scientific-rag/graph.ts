/**
 * Provenance-bearing, idempotent knowledge-graph update layer.
 *
 * Every scientific edge is traceable to its supporting claim and source
 * passage. Edges are keyed by a deterministic id derived from
 * (subject taxon, predicate, object, claim) so re-applying the same claim — via
 * duplicate delivery or replay — updates the existing edge in place rather than
 * creating a duplicate.
 *
 * Only eligible evidence is activated. A claim that is quarantined, ambiguous,
 * unresolved-taxon, or protected is recorded as NOT authoritative: the edge
 * exists for audit but is flagged `activated: false`, so it never behaves as
 * unrestricted authoritative knowledge.
 */

import type { ScientificClaim } from "./claims";
import { structuralHash } from "./hashing";
import type { SensitivityClassification } from "./events";

export type GraphEdge = {
  edgeId: string;
  subjectTaxonId: string | null;
  subjectName: string;
  predicate: string;
  object: string;
  claimId: string;
  sourceDocumentId: string;
  supportingPassageHash: string;
  activated: boolean;
  activationBlockedReason: string | null;
  sensitivity: SensitivityClassification;
  updatedAt: string;
};

export type GraphUpdateResult =
  | { outcome: "updated"; edge: GraphEdge; created: boolean }
  | { outcome: "blocked"; edgeId: string; reason: string };

function edgeKey(claim: ScientificClaim): string {
  return structuralHash({
    subject: claim.taxon.taxonId ?? claim.taxon.nameAsPublished,
    predicate: claim.assertion.predicate,
    object: claim.assertion.objectNormalized,
    claim: claim.claimId,
  });
}

/** Reasons a claim must not be activated as unrestricted authoritative knowledge. */
export function activationBlocker(claim: ScientificClaim): string | null {
  if (claim.reviewStatus === "quarantined") return "claim quarantined";
  if (claim.taxon.ambiguous) return "taxon ambiguous";
  if (claim.taxon.synonymRelationship === "unresolved" || claim.taxon.taxonId === null)
    return "taxon unresolved";
  if (claim.sensitivity === "protected_locality") return "protected locality";
  return null;
}

export class KnowledgeGraph {
  private edges = new Map<string, GraphEdge>();
  private updated = 0;
  private failed = 0;

  upsert(claim: ScientificClaim, updatedAt: string): GraphUpdateResult {
    const key = edgeKey(claim);
    const edgeId = `edge-${key.slice(6, 22)}`;
    const blocker = activationBlocker(claim);

    const edge: GraphEdge = {
      edgeId,
      subjectTaxonId: claim.taxon.taxonId,
      subjectName: claim.taxon.acceptedName ?? claim.taxon.nameAsPublished,
      predicate: claim.assertion.predicate,
      object: claim.assertion.objectNormalized,
      claimId: claim.claimId,
      sourceDocumentId: claim.provenance.sourceDocumentId,
      supportingPassageHash: claim.provenance.passageContentHash,
      activated: blocker === null,
      activationBlockedReason: blocker,
      sensitivity: claim.sensitivity,
      updatedAt,
    };

    const existing = this.edges.get(edgeId);
    this.edges.set(edgeId, edge);
    this.updated += 1;
    return { outcome: "updated", edge, created: !existing };
  }

  get(edgeId: string): GraphEdge | undefined {
    return this.edges.get(edgeId);
  }
  all(): GraphEdge[] {
    return [...this.edges.values()];
  }
  activatedEdges(): GraphEdge[] {
    return this.all().filter((e) => e.activated);
  }
  stats(): { updated: number; failed: number; edges: number; activated: number } {
    return {
      updated: this.updated,
      failed: this.failed,
      edges: this.edges.size,
      activated: this.activatedEdges().length,
    };
  }
}
