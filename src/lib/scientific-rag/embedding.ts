/**
 * Deterministic embedding + retrieval index.
 *
 * Embeddings here are computed deterministically from claim text (a hashed
 * bag-of-terms projected into a fixed-dimensional vector). This is not a
 * semantic model — it is a stand-in that gives the slice a real, reusable,
 * versioned vector index with the guarantees that matter for the pipeline:
 *   - an embedding record carries claim identity, content hash, model id,
 *     dimensions/version, source version, taxonomy version, sensitivity, and
 *     creation time;
 *   - unchanged content (same hash + same model version) is never re-embedded;
 *   - the same interface accepts a real provider's vectors unchanged.
 */

import { contentHash } from "./hashing";
import type { ScientificClaim } from "./claims";
import type { SensitivityClassification } from "./events";

export const EMBEDDING_MODEL = "oc-det-embed";
export const EMBEDDING_MODEL_VERSION = "1.0.0";
export const EMBEDDING_DIMENSIONS = 64;

export type EmbeddingRecord = {
  embeddingId: string;
  claimId: string;
  contentHash: string;
  embeddingModel: string;
  embeddingModelVersion: string;
  dimensions: number;
  sourceVersion: number;
  taxonomyVersion: string;
  sensitivity: SensitivityClassification;
  vector: number[];
  createdAt: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9°.\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Deterministic hashed embedding: term -> bucket, L2-normalised. */
export function embedText(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const h = contentHash(token);
    // Two buckets per token from different hex slices to reduce collisions.
    const b1 = parseInt(h.slice(6, 12), 16) % EMBEDDING_DIMENSIONS;
    const b2 = parseInt(h.slice(12, 18), 16) % EMBEDDING_DIMENSIONS;
    vec[b1] += 1;
    vec[b2] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot; // both are unit vectors
}

function embeddingText(claim: ScientificClaim): string {
  return [
    claim.taxon.acceptedName ?? claim.taxon.nameAsPublished,
    claim.category,
    claim.assertion.predicate,
    claim.assertion.objectNormalized,
    claim.assertion.originalText,
  ].join(" ");
}

export class EmbeddingIndex {
  private byClaim = new Map<string, EmbeddingRecord>();
  private reuseCount = 0;
  private createCount = 0;

  /**
   * Upsert an embedding for a claim. Returns whether it was newly created or
   * reused. Reuse triggers when a record already exists with the same content
   * hash and the same model version — the core "don't regenerate unchanged
   * embeddings" guarantee.
   */
  upsert(
    claim: ScientificClaim,
    sourceVersion: number,
    createdAt: string,
  ): { record: EmbeddingRecord; reused: boolean } {
    const existing = this.byClaim.get(claim.claimId);
    if (
      existing &&
      existing.contentHash === claim.contentHash &&
      existing.embeddingModelVersion === EMBEDDING_MODEL_VERSION
    ) {
      this.reuseCount += 1;
      return { record: existing, reused: true };
    }
    const record: EmbeddingRecord = {
      embeddingId: `emb-${claim.claimId}`,
      claimId: claim.claimId,
      contentHash: claim.contentHash,
      embeddingModel: EMBEDDING_MODEL,
      embeddingModelVersion: EMBEDDING_MODEL_VERSION,
      dimensions: EMBEDDING_DIMENSIONS,
      sourceVersion,
      taxonomyVersion: claim.taxon.taxonomyVersion,
      sensitivity: claim.sensitivity,
      vector: embedText(embeddingText(claim)),
      createdAt,
    };
    this.byClaim.set(claim.claimId, record);
    this.createCount += 1;
    return { record, reused: false };
  }

  get(claimId: string): EmbeddingRecord | undefined {
    return this.byClaim.get(claimId);
  }
  all(): EmbeddingRecord[] {
    return [...this.byClaim.values()];
  }
  stats(): { created: number; reused: number; total: number } {
    return { created: this.createCount, reused: this.reuseCount, total: this.byClaim.size };
  }
}
