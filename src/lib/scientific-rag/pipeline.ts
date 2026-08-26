/**
 * End-to-end pipeline orchestrator for the event-driven scientific RAG slice.
 *
 * Ties the stages together through the durable event ledger, stamping a single
 * correlation id per run and threading causation ids so the full path
 * (source → answer) is auditable. Domain writes go to idempotent, deterministic
 * stores keyed by content hash / claim id / edge id, and every event's
 * idempotency key is content-derived — so a replay or a forced re-run produces
 * no new scientific state and no duplicate events.
 *
 * `processPublication` runs ingestion → parse → extraction → reconciliation →
 * provenance → embedding → graph → evidence gate. `askCalyx` runs the query
 * side: retrieval → grounded answer → post-generation verification.
 */

import { EventLedger } from "./ledger";
import { contentHash, idempotencyKey } from "./hashing";
import {
  SourceRegistry,
  ingestPublication,
  IngestionOutcome,
  SourceRecord,
} from "./ingestion";
import type { PublicationFixture } from "./fixtures/phalaenopsisPublication";
import { extractClaims, EXTRACTOR_VERSION } from "./extraction";
import type { ScientificClaim } from "./claims";
import { EmbeddingIndex, EMBEDDING_MODEL_VERSION } from "./embedding";
import { KnowledgeGraph, activationBlocker } from "./graph";
import { GovernedRetrievalIndex, RetrievalQuery, AccessLevel } from "./retrieval";
import { generateGroundedAnswer } from "./answer";
import { verifyAnswer, VERIFIER_VERSION } from "./verification";
import { TAXONOMY_VERSION } from "./taxonomy";

export type ProcessResult = {
  correlationId: string;
  decision: IngestionOutcome["decision"];
  record?: SourceRecord;
  claimsExtracted: number;
  claimsQuarantined: number;
  taxaResolved: number;
  taxaAmbiguous: number;
  embeddingsCreated: number;
  embeddingsReused: number;
  edgesUpserted: number;
  edgesActivated: number;
  evidenceVerified: number;
  evidenceRejected: number;
};

export type AskResult = {
  correlationId: string;
  answer: ReturnType<typeof generateGroundedAnswer>;
  verification: ReturnType<typeof verifyAnswer>;
};

let runCounter = 0;
function nextCorrelationId(): string {
  runCounter += 1;
  return `run-${runCounter.toString(36).padStart(4, "0")}`;
}
export function __resetRunCounter(): void {
  runCounter = 0;
}

export class ScientificRagPipeline {
  readonly ledger: EventLedger;
  readonly sources = new SourceRegistry();
  readonly embeddings = new EmbeddingIndex();
  readonly graph = new KnowledgeGraph();
  readonly claims = new Map<string, ScientificClaim>();
  readonly retrieval: GovernedRetrievalIndex;
  private clockTick = 0;

  constructor(opts?: { ledger?: EventLedger }) {
    this.ledger = opts?.ledger ?? new EventLedger();
    this.retrieval = new GovernedRetrievalIndex(this.embeddings);
  }

  private now(): string {
    return new Date(Date.UTC(2025, 0, 1) + this.clockTick++ * 1000).toISOString();
  }

  private versions() {
    return {
      extractor: EXTRACTOR_VERSION,
      embeddingModel: EMBEDDING_MODEL_VERSION,
      taxonomy: TAXONOMY_VERSION,
      verifier: VERIFIER_VERSION,
    };
  }

  /**
   * Process a publication through the full ingestion→evidence path.
   * `force` re-runs extraction/embedding/graph even when the content is
   * unchanged — used to prove idempotency (a forced re-run adds no state).
   */
  processPublication(pub: PublicationFixture, opts?: { force?: boolean }): ProcessResult {
    const correlationId = nextCorrelationId();
    const result: ProcessResult = {
      correlationId,
      decision: "new",
      claimsExtracted: 0,
      claimsQuarantined: 0,
      taxaResolved: 0,
      taxaAmbiguous: 0,
      embeddingsCreated: 0,
      embeddingsReused: 0,
      edgesUpserted: 0,
      edgesActivated: 0,
      evidenceVerified: 0,
      evidenceRejected: 0,
    };

    const outcome = ingestPublication(pub, this.sources, this.now());
    result.decision = outcome.decision;

    if (outcome.decision === "parse_failed") {
      this.ledger.append({
        type: "document.parse_failed",
        aggregateId: outcome.sourceRecordId,
        correlationId,
        producer: "ingestion",
        idempotencyKey: idempotencyKey("parse_failed", outcome.sourceRecordId, outcome.reason),
        payload: { sourceRecordId: outcome.sourceRecordId, reason: outcome.reason, errorClass: "permanent" },
        versions: this.versions(),
      });
      this.ledger.drain();
      return result;
    }

    if (outcome.decision === "unchanged" && !opts?.force) {
      // Provable no-op: no downstream events, no state changes.
      return { ...result, record: outcome.record };
    }

    // For a forced re-run on unchanged content, re-parse deterministically.
    const record = "record" in outcome ? outcome.record : this.sources.get(pub.sourceRecordId)!;
    result.record = record;
    const document =
      "document" in outcome
        ? outcome.document
        : parseUnchangedForForce(pub, record);

    const sourceEvent = outcome.decision === "changed" ? "source.downloaded" : "source.discovered";
    this.ledger.append({
      type: sourceEvent,
      aggregateId: record.sourceRecordId,
      correlationId,
      sourceRecordId: record.sourceRecordId,
      contentHash: record.contentHash,
      producer: "ingestion",
      idempotencyKey: idempotencyKey(sourceEvent, record.sourceRecordId, record.contentHash, record.version),
      sensitivity: "public",
      versions: this.versions(),
      payload: {
        sourceRecordId: record.sourceRecordId,
        title: record.title,
        doi: record.doi,
        contentHash: record.contentHash,
        version: record.version,
        license: record.license,
        accessConstraint: record.accessConstraint,
        changed: outcome.decision === "changed",
      },
    });

    const parsedEvent = this.ledger.append({
      type: "document.parsed",
      aggregateId: document.documentId,
      correlationId,
      sourceRecordId: record.sourceRecordId,
      contentHash: document.contentHash,
      producer: "parser",
      idempotencyKey: idempotencyKey("parsed", document.documentId, document.contentHash),
      versions: this.versions(),
      payload: {
        sourceRecordId: record.sourceRecordId,
        documentId: document.documentId,
        contentHash: document.contentHash,
        sectionCount: new Set(document.passages.map((p) => p.section)).size,
        passageCount: document.passages.length,
        parser: "oc-passage-parser",
      },
    });

    const { claims, quarantined } = extractClaims(document, record, this.now());
    result.claimsExtracted = claims.length;
    result.claimsQuarantined = quarantined.length;

    for (const q of quarantined) {
      this.ledger.append({
        type: "claim.quarantined",
        aggregateId: `${document.documentId}#${q.passageId}`,
        correlationId,
        causationId: parsedEvent.id,
        sourceRecordId: record.sourceRecordId,
        producer: "extractor",
        idempotencyKey: idempotencyKey("quarantined", document.documentId, q.passageId, q.reason),
        versions: this.versions(),
        payload: { claimId: `${document.documentId}#${q.passageId}`, documentId: document.documentId, category: q.category, reason: q.reason },
      });
    }

    for (const claim of claims) {
      this.claims.set(claim.claimId, claim);

      const claimEvent = this.ledger.append({
        type: "claim.extracted",
        aggregateId: claim.claimId,
        correlationId,
        causationId: parsedEvent.id,
        sourceRecordId: record.sourceRecordId,
        contentHash: claim.contentHash,
        producer: "extractor",
        sensitivity: claim.sensitivity,
        idempotencyKey: idempotencyKey("extracted", claim.claimId, claim.contentHash),
        versions: this.versions(),
        payload: { claimId: claim.claimId, documentId: document.documentId, category: claim.category },
      });

      // Taxon reconciliation event.
      const taxonType = claim.taxon.ambiguous ? "taxon.ambiguous" : "taxon.resolved";
      if (claim.taxon.ambiguous) result.taxaAmbiguous += 1;
      else if (claim.taxon.taxonId) result.taxaResolved += 1;
      this.ledger.append({
        type: taxonType,
        aggregateId: claim.claimId,
        correlationId,
        causationId: claimEvent.id,
        producer: "taxonomy",
        sensitivity: claim.sensitivity,
        idempotencyKey: idempotencyKey(taxonType, claim.claimId, claim.taxon.taxonomyVersion, claim.taxon.acceptedName ?? "none"),
        versions: this.versions(),
        payload: {
          claimId: claim.claimId,
          nameAsPublished: claim.taxon.nameAsPublished,
          acceptedName: claim.taxon.acceptedName,
          taxonId: claim.taxon.taxonId,
          candidates: claim.taxon.candidates,
          taxonomyVersion: claim.taxon.taxonomyVersion,
        },
      });

      // Provenance validation (passage-anchored).
      this.ledger.append({
        type: "provenance.validated",
        aggregateId: claim.claimId,
        correlationId,
        causationId: claimEvent.id,
        producer: "provenance",
        contentHash: claim.provenance.passageContentHash,
        sensitivity: claim.sensitivity,
        idempotencyKey: idempotencyKey("provenance", claim.claimId, claim.provenance.passageContentHash),
        versions: this.versions(),
        payload: { claimId: claim.claimId, passageAnchored: true, contentHash: claim.provenance.passageContentHash },
      });

      // Embedding (reuse-aware).
      this.ledger.append({
        type: "embedding.requested",
        aggregateId: claim.claimId,
        correlationId,
        causationId: claimEvent.id,
        producer: "embedder",
        idempotencyKey: idempotencyKey("embed_req", claim.claimId, claim.contentHash),
        versions: this.versions(),
        payload: { claimId: claim.claimId, embeddingId: `emb-${claim.claimId}`, contentHash: claim.contentHash, embeddingModel: "oc-det-embed", dimensions: 64 },
      });
      const emb = this.embeddings.upsert(claim, record.version, this.now());
      if (emb.reused) result.embeddingsReused += 1;
      else result.embeddingsCreated += 1;
      this.ledger.append({
        type: emb.reused ? "embedding.reused" : "embedding.created",
        aggregateId: claim.claimId,
        correlationId,
        causationId: claimEvent.id,
        producer: "embedder",
        contentHash: claim.contentHash,
        idempotencyKey: idempotencyKey(emb.reused ? "embed_reuse" : "embed_new", claim.claimId, claim.contentHash, EMBEDDING_MODEL_VERSION),
        versions: this.versions(),
        payload: { claimId: claim.claimId, embeddingId: emb.record.embeddingId, contentHash: claim.contentHash, embeddingModel: emb.record.embeddingModel, dimensions: emb.record.dimensions, reused: emb.reused },
      });

      // Retrieval index (idempotent by claimId).
      this.retrieval.put(claim);

      // Knowledge graph (idempotent, provenance-bearing, activation-gated).
      this.ledger.append({
        type: "graph.update_requested",
        aggregateId: claim.claimId,
        correlationId,
        causationId: claimEvent.id,
        producer: "graph",
        idempotencyKey: idempotencyKey("graph_req", claim.claimId, claim.contentHash),
        versions: this.versions(),
        payload: { claimId: claim.claimId, edgeId: `edge-${claim.claimId}`, subjectTaxonId: claim.taxon.taxonId, predicate: claim.assertion.predicate },
      });
      const upsert = this.graph.upsert(claim, this.now());
      result.edgesUpserted += 1;
      if (upsert.outcome === "updated" && upsert.edge.activated) result.edgesActivated += 1;
      this.ledger.append({
        type: "graph.updated",
        aggregateId: claim.claimId,
        correlationId,
        causationId: claimEvent.id,
        producer: "graph",
        sensitivity: claim.sensitivity,
        idempotencyKey: idempotencyKey("graph_upd", claim.claimId, claim.contentHash, TAXONOMY_VERSION),
        versions: this.versions(),
        payload: { claimId: claim.claimId, edgeId: upsert.outcome === "updated" ? upsert.edge.edgeId : `edge-${claim.claimId}`, subjectTaxonId: claim.taxon.taxonId, predicate: claim.assertion.predicate, reason: activationBlocker(claim) ?? undefined },
      });

      // Evidence gate at the claim level: eligible → verified, else rejected
      // (retained, but not activated as authoritative).
      const blocker = activationBlocker(claim);
      if (blocker === null) {
        result.evidenceVerified += 1;
        this.ledger.append({
          type: "evidence.verified",
          aggregateId: claim.claimId,
          correlationId,
          causationId: claimEvent.id,
          producer: "evidence-gate",
          idempotencyKey: idempotencyKey("ev_ok", claim.claimId, claim.contentHash),
          versions: this.versions(),
          payload: { claimId: claim.claimId, verdict: "verified" },
        });
      } else {
        result.evidenceRejected += 1;
        this.ledger.append({
          type: "evidence.rejected",
          aggregateId: claim.claimId,
          correlationId,
          causationId: claimEvent.id,
          producer: "evidence-gate",
          sensitivity: claim.sensitivity,
          idempotencyKey: idempotencyKey("ev_no", claim.claimId, claim.contentHash, blocker),
          versions: this.versions(),
          payload: { claimId: claim.claimId, verdict: "rejected", reason: blocker },
        });
      }
    }

    // The orchestrator is the consumer that completed this work synchronously;
    // settle the appended events to `processed` so the run is replayable.
    this.ledger.drain();
    return result;
  }

  /** Query side: retrieval → grounded answer → verification. */
  askCalyx(question: string, opts?: { access?: AccessLevel; query?: Partial<RetrievalQuery> }): AskResult {
    const correlationId = nextCorrelationId();
    const access = opts?.access ?? "public";
    const query: RetrievalQuery = {
      text: question,
      access,
      minExtractionConfidence: 0,
      excludeReviewStatuses: ["quarantined", "ambiguous"],
      limit: 12,
      ...opts?.query,
    };
    const evidence = this.retrieval.search(query);
    const answer = generateGroundedAnswer(question, evidence, {
      answerId: `ans-${correlationId}`,
      correlationId,
    });

    this.ledger.append({
      type: "answer.generated",
      aggregateId: answer.answerId,
      correlationId,
      producer: "calyx",
      idempotencyKey: idempotencyKey("ans_gen", answer.answerId, question),
      versions: this.versions(),
      payload: { answerId: answer.answerId, question, citationCount: answer.citations.length, verdict: "generated" },
    });

    const verification = verifyAnswer(answer, (id) => this.claims.get(id), { correlationId });

    this.ledger.append({
      type: verification.verdict === "verified" ? "answer.verified" : "answer.blocked",
      aggregateId: answer.answerId,
      correlationId,
      producer: "evidence-gate",
      idempotencyKey: idempotencyKey("ans_verdict", answer.answerId, verification.verdict, question),
      versions: this.versions(),
      payload: {
        answerId: answer.answerId,
        question,
        citationCount: answer.citations.length,
        verdict: verification.verdict === "verified" ? "verified" : "blocked",
        blockReasons: verification.blockReasons,
      },
    });

    this.ledger.drain();
    return { correlationId, answer, verification };
  }
}

// Re-parse helper for forced re-runs on unchanged content, so idempotency can
// be demonstrated without mutating ingestion's change-detection semantics.
function parseUnchangedForForce(pub: PublicationFixture, record: SourceRecord) {
  const documentId = `${pub.sourceRecordId}#v${record.version}`;
  return {
    documentId,
    sourceRecordId: pub.sourceRecordId,
    contentHash: record.contentHash,
    passages: pub.passages.map((p) => ({
      ...p,
      documentId,
      passageContentHash: contentHash(p.text),
      sensitivity: (p.sensitive ? "protected_locality" : "public") as "protected_locality" | "public",
    })),
  };
}
