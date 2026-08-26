/**
 * Hybrid retrieval over the governed claim/embedding index.
 *
 * Combines exact taxonomic/entity filtering, structured metadata filters,
 * evidence-quality filters, sensitivity/access filters, and semantic (vector)
 * similarity. Protected-locality claims are excluded from any public-access
 * query as a hard fail-closed rule — absence of access is enforced here, not
 * left to the answer layer.
 */

import type { ScientificClaim, ClaimCategory } from "./claims";
import { EmbeddingIndex, embedText, cosineSimilarity } from "./embedding";

export type AccessLevel = "public" | "research";

export type RetrievalQuery = {
  text: string;
  access: AccessLevel;
  taxonIds?: string[];
  categories?: ClaimCategory[];
  minExtractionConfidence?: number;
  excludeReviewStatuses?: string[];
  limit?: number;
};

export type RetrievedEvidence = {
  claim: ScientificClaim;
  score: number;
  matchedBy: ("semantic" | "taxon" | "category")[];
};

export class GovernedRetrievalIndex {
  private claims = new Map<string, ScientificClaim>();
  private embeddings: EmbeddingIndex;

  constructor(embeddings: EmbeddingIndex) {
    this.embeddings = embeddings;
  }

  put(claim: ScientificClaim): void {
    this.claims.set(claim.claimId, claim);
  }

  size(): number {
    return this.claims.size;
  }

  /**
   * Hybrid search. Fail-closed access control runs first and is not negotiable:
   * a public query never sees protected-locality claims regardless of score.
   */
  search(query: RetrievalQuery): RetrievedEvidence[] {
    const queryVector = embedText(query.text);
    const limit = query.limit ?? 10;
    const excluded = new Set(query.excludeReviewStatuses ?? ["quarantined"]);
    const results: RetrievedEvidence[] = [];

    for (const claim of this.claims.values()) {
      // Hard sensitivity gate.
      if (query.access === "public" && claim.sensitivity !== "public") continue;
      // Evidence-quality gate.
      if (excluded.has(claim.reviewStatus)) continue;
      if (
        typeof query.minExtractionConfidence === "number" &&
        claim.extractionConfidence < query.minExtractionConfidence
      )
        continue;

      const matchedBy: RetrievedEvidence["matchedBy"] = [];

      // Exact taxon filter.
      if (query.taxonIds && query.taxonIds.length > 0) {
        if (!claim.taxon.taxonId || !query.taxonIds.includes(claim.taxon.taxonId)) continue;
        matchedBy.push("taxon");
      }

      // Category filter.
      if (query.categories && query.categories.length > 0) {
        if (!query.categories.includes(claim.category)) continue;
        matchedBy.push("category");
      }

      // Semantic score.
      const emb = this.embeddings.get(claim.claimId);
      const score = emb ? cosineSimilarity(queryVector, emb.vector) : 0;
      if (score > 0) matchedBy.push("semantic");

      results.push({ claim, score, matchedBy });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
