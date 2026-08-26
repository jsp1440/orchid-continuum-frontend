/**
 * Embedding generation and a hybrid retrieval index.
 *
 * Embeddings are computed deterministically from token content (a hashed
 * bag-of-words projected into a fixed-dimension vector) so CI is reproducible
 * and no embedding-provider call is required. Each embedding record carries the
 * identity, content hash, model id, dimensions/version, source version,
 * taxonomy version, sensitivity, and timestamp the directive requires.
 *
 * The index is content-addressable: re-indexing a claim whose content hash and
 * embedding model/version are unchanged reuses the existing vector rather than
 * regenerating it. Retrieval is hybrid — exact taxon/entity filtering, semantic
 * similarity, metadata and sensitivity filters — and protected locality is
 * always excluded, fail-closed.
 */

import { SensitivityClass } from './contracts'

export const EMBEDDING_MODEL = 'oc-hash-embed'
export const EMBEDDING_VERSION = '1.0.0'
export const EMBEDDING_DIM = 64

export type EmbeddingRecord = {
  embeddingId: string
  claimId: string
  sourceId: string
  sourceVersion: number
  contentHash: string
  model: string
  dimensions: number
  embeddingVersion: string
  taxonomyVersion: string
  subjectTaxonId: string | null
  sensitivity: SensitivityClass
  vector: number[]
  /** Evidence quality in [0,1], used by quality-filtered retrieval. */
  evidenceQuality: number
  text: string
  createdAt: string
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length > 1)
}

/** Content-word tokens for the lexical-overlap gate (drops common stopwords). */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'are', 'was', 'were', 'this', 'those', 'these',
  'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where', 'does', 'did', 'their', 'they',
  'its', 'our', 'your', 'not', 'but', 'can', 'could', 'would', 'should', 'has', 'have', 'had',
  'into', 'than', 'then', 'them', 'some', 'any', 'all', 'each', 'more', 'most', 'such', 'about',
])

function contentTokens(text: string): Set<string> {
  return new Set(tokenize(text).filter((token) => !STOPWORDS.has(token)))
}

/** Deterministic hashed bag-of-words embedding, L2-normalised. */
export function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0)
  for (const token of tokenize(text)) {
    let hash = 2166136261
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    const bucket = (hash >>> 0) % EMBEDDING_DIM
    const sign = (hash & 1) === 0 ? 1 : -1
    vector[bucket] += sign
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) return vector
  return vector.map((value) => value / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length && i < b.length; i += 1) dot += a[i] * b[i]
  return dot
}

export type UpsertInput = {
  claimId: string
  sourceId: string
  sourceVersion: number
  contentHash: string
  taxonomyVersion: string
  subjectTaxonId: string | null
  sensitivity: SensitivityClass
  evidenceQuality: number
  text: string
}

export type UpsertOutcome = { record: EmbeddingRecord; reused: boolean }

export type RetrievalFilters = {
  subjectTaxonId?: string | null
  /** Sensitivity classes permitted in the result. protected_locality is never permitted. */
  allowedSensitivity?: SensitivityClass[]
  minEvidenceQuality?: number
  limit?: number
}

export class RetrievalIndex {
  private readonly records = new Map<string, EmbeddingRecord>()
  private seq = 0

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  /**
   * Insert or reuse an embedding. The reuse key is
   * (claimId, contentHash, model, embeddingVersion): identical content under the
   * same model/version reuses the stored vector, so unchanged embeddings are
   * never regenerated. A changed content hash produces a fresh embedding and
   * supersedes the prior one for that claim.
   */
  upsert(input: UpsertInput): UpsertOutcome {
    const existing = this.records.get(input.claimId)
    if (
      existing &&
      existing.contentHash === input.contentHash &&
      existing.model === EMBEDDING_MODEL &&
      existing.embeddingVersion === EMBEDDING_VERSION
    ) {
      return { record: existing, reused: true }
    }

    this.seq += 1
    const record: EmbeddingRecord = {
      embeddingId: `emb_${this.seq.toString(36).padStart(5, '0')}`,
      claimId: input.claimId,
      sourceId: input.sourceId,
      sourceVersion: input.sourceVersion,
      contentHash: input.contentHash,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIM,
      embeddingVersion: EMBEDDING_VERSION,
      taxonomyVersion: input.taxonomyVersion,
      subjectTaxonId: input.subjectTaxonId,
      sensitivity: input.sensitivity,
      vector: embedText(input.text),
      evidenceQuality: input.evidenceQuality,
      text: input.text,
      createdAt: this.now(),
    }
    this.records.set(input.claimId, record)
    return { record, reused: false }
  }

  size(): number {
    return this.records.size
  }

  all(): EmbeddingRecord[] {
    return Array.from(this.records.values())
  }

  /** Hybrid retrieval: exact filters applied first, then semantic ranking. */
  search(query: string, filters: RetrievalFilters = {}): Array<{ record: EmbeddingRecord; score: number }> {
    const allowed = filters.allowedSensitivity ?? ['public']
    // Protected locality is never retrievable, regardless of caller request.
    const permitted = new Set<SensitivityClass>(allowed.filter((sensitivity) => sensitivity !== 'protected_locality'))
    const queryVector = embedText(query)
    const queryTokens = contentTokens(query)

    const scored = this.all()
      .filter((record) => permitted.has(record.sensitivity))
      .filter((record) => (filters.subjectTaxonId ? record.subjectTaxonId === filters.subjectTaxonId : true))
      .filter((record) => (filters.minEvidenceQuality != null ? record.evidenceQuality >= filters.minEvidenceQuality : true))
      // Lexical gate (the exact half of hybrid retrieval): a record must share at
      // least one content word with the query. This keeps the coarse semantic
      // vector from surfacing wholly unrelated records on a nonsense query.
      .filter((record) => {
        const recordTokens = contentTokens(record.text)
        for (const token of queryTokens) if (recordTokens.has(token)) return true
        return false
      })
      .map((record) => ({ record, score: cosineSimilarity(queryVector, record.vector) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.record.claimId.localeCompare(b.record.claimId))

    return typeof filters.limit === 'number' ? scored.slice(0, filters.limit) : scored
  }
}
