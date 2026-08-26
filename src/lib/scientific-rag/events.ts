/**
 * Versioned domain-event contracts for the event-driven scientific RAG slice.
 *
 * These are the durable, replayable transitions of a single publication run,
 * from discovery through a verified (or blocked) grounded answer. The contract
 * is transport-agnostic on purpose: the in-repo ledger (see `ledger.ts`) is the
 * reference implementation, but the same envelope could later ride a
 * Kafka-compatible log without changing any producer or consumer, because
 * nothing here depends on the storage mechanism.
 *
 * Every event carries the audit fields the directive requires: immutable id,
 * type + schema version, aggregate id, correlation id (the run), causation id
 * (parent event), source/content identity, timestamps, producer identity,
 * processing status, retry accounting, error classification, relevant
 * model/parser/taxonomy versions, sensitivity classification, and an
 * idempotency key.
 */

import { z } from "zod";

/**
 * Canonical domain-event vocabulary. Names mirror the directive's required set
 * and read as `<aggregate>.<transition>` so a Kafka topic-per-type mapping is
 * trivial later.
 */
export const DOMAIN_EVENT_TYPES = [
  "source.discovered",
  "source.downloaded",
  "document.parsed",
  "document.parse_failed",
  "claim.extracted",
  "claim.quarantined",
  "taxon.resolved",
  "taxon.ambiguous",
  "provenance.validated",
  "embedding.requested",
  "embedding.created",
  "embedding.reused",
  "embedding.failed",
  "graph.update_requested",
  "graph.updated",
  "graph.update_failed",
  "evidence.verified",
  "evidence.rejected",
  "answer.generated",
  "answer.verified",
  "answer.blocked",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export const CURRENT_EVENT_SCHEMA_VERSION = 1 as const;

/** Sensitivity / access classification carried through the whole pipeline. */
export const SensitivityClassification = z.enum([
  "public",
  "restricted",
  "protected_locality",
]);
export type SensitivityClassification = z.infer<typeof SensitivityClassification>;

/** Where a durable event currently sits in its processing lifecycle. */
export const EventProcessingStatus = z.enum([
  "pending",
  "processing",
  "processed",
  "retrying",
  "dead_letter",
  "quarantined",
]);
export type EventProcessingStatus = z.infer<typeof EventProcessingStatus>;

export const ErrorClassification = z.enum([
  "none",
  "transient",
  "permanent",
  "contract_violation",
  "unauthorized",
  "ambiguous",
]);
export type ErrorClassification = z.infer<typeof ErrorClassification>;

/**
 * Model / configuration / parser / taxonomy versions relevant to an event.
 * Stored so cache reuse and reprocessing can be scoped to exactly the records a
 * version bump affects, rather than rebuilding the whole corpus.
 */
export const ProcessingVersions = z
  .object({
    parser: z.string().optional(),
    extractor: z.string().optional(),
    model: z.string().optional(),
    embeddingModel: z.string().optional(),
    taxonomy: z.string().optional(),
    verifier: z.string().optional(),
  })
  .strict();
export type ProcessingVersions = z.infer<typeof ProcessingVersions>;

/**
 * The durable event envelope. `payload` is intentionally `unknown` at the
 * envelope layer; each event type validates its own payload with a dedicated
 * schema in `eventPayloadSchemas`, keeping the envelope stable while payloads
 * evolve under their own versioning.
 */
export const DomainEventEnvelope = z
  .object({
    id: z.string().min(1),
    type: z.enum(DOMAIN_EVENT_TYPES),
    schemaVersion: z.number().int().positive(),
    aggregateId: z.string().min(1),
    correlationId: z.string().min(1),
    causationId: z.string().min(1).nullable(),
    sourceRecordId: z.string().min(1).nullable(),
    contentHash: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
    producer: z.string().min(1),
    status: EventProcessingStatus,
    attempt: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    retryable: z.boolean(),
    lastError: z.string().nullable(),
    lastErrorClass: ErrorClassification,
    versions: ProcessingVersions,
    sensitivity: SensitivityClassification,
    idempotencyKey: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelope>;

/**
 * Fields a producer supplies. Everything else (id, timestamps, status,
 * attempt accounting) is stamped by the ledger so producers cannot fabricate
 * processing state.
 */
export type NewDomainEvent = {
  type: DomainEventType;
  aggregateId: string;
  correlationId: string;
  causationId?: string | null;
  sourceRecordId?: string | null;
  contentHash?: string | null;
  producer: string;
  maxAttempts?: number;
  retryable?: boolean;
  versions?: ProcessingVersions;
  sensitivity?: SensitivityClassification;
  idempotencyKey: string;
  payload: unknown;
};

/* ------------------------------------------------------------------ *
 * Per-type payload contracts. Kept strict so malformed producer output
 * fails closed at the boundary instead of entering the ledger.
 * ------------------------------------------------------------------ */

const SourcePayload = z
  .object({
    sourceRecordId: z.string(),
    title: z.string(),
    doi: z.string().nullable().optional(),
    contentHash: z.string(),
    version: z.number().int().nonnegative(),
    license: z.string(),
    accessConstraint: z.enum(["open", "restricted", "paywalled"]),
    changed: z.boolean().optional(),
  })
  .strict();

const DocumentParsedPayload = z
  .object({
    sourceRecordId: z.string(),
    documentId: z.string(),
    contentHash: z.string(),
    sectionCount: z.number().int().nonnegative(),
    passageCount: z.number().int().nonnegative(),
    parser: z.string(),
  })
  .strict();

const ParseFailedPayload = z
  .object({
    sourceRecordId: z.string(),
    reason: z.string(),
    errorClass: ErrorClassification,
  })
  .strict();

const ClaimEventPayload = z
  .object({
    claimId: z.string(),
    documentId: z.string(),
    category: z.string(),
    reason: z.string().optional(),
  })
  .strict();

const TaxonEventPayload = z
  .object({
    claimId: z.string(),
    nameAsPublished: z.string(),
    acceptedName: z.string().nullable(),
    taxonId: z.string().nullable(),
    candidates: z.array(z.string()).optional(),
    taxonomyVersion: z.string(),
  })
  .strict();

const EmbeddingEventPayload = z
  .object({
    claimId: z.string(),
    embeddingId: z.string(),
    contentHash: z.string(),
    embeddingModel: z.string(),
    dimensions: z.number().int().positive(),
    reused: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .strict();

const GraphEventPayload = z
  .object({
    claimId: z.string(),
    edgeId: z.string(),
    subjectTaxonId: z.string().nullable(),
    predicate: z.string(),
    reason: z.string().optional(),
  })
  .strict();

const EvidenceEventPayload = z
  .object({
    claimId: z.string(),
    verdict: z.enum(["verified", "rejected"]),
    reason: z.string().optional(),
  })
  .strict();

const AnswerEventPayload = z
  .object({
    answerId: z.string(),
    question: z.string(),
    citationCount: z.number().int().nonnegative(),
    verdict: z.enum(["generated", "verified", "blocked"]),
    blockReasons: z.array(z.string()).optional(),
  })
  .strict();

const ProvenanceValidatedPayload = z
  .object({
    claimId: z.string(),
    passageAnchored: z.boolean(),
    contentHash: z.string(),
  })
  .strict();

export const eventPayloadSchemas: Record<DomainEventType, z.ZodTypeAny> = {
  "source.discovered": SourcePayload,
  "source.downloaded": SourcePayload,
  "document.parsed": DocumentParsedPayload,
  "document.parse_failed": ParseFailedPayload,
  "claim.extracted": ClaimEventPayload,
  "claim.quarantined": ClaimEventPayload,
  "taxon.resolved": TaxonEventPayload,
  "taxon.ambiguous": TaxonEventPayload,
  "provenance.validated": ProvenanceValidatedPayload,
  "embedding.requested": EmbeddingEventPayload,
  "embedding.created": EmbeddingEventPayload,
  "embedding.reused": EmbeddingEventPayload,
  "embedding.failed": EmbeddingEventPayload,
  "graph.update_requested": GraphEventPayload,
  "graph.updated": GraphEventPayload,
  "graph.update_failed": GraphEventPayload,
  "evidence.verified": EvidenceEventPayload,
  "evidence.rejected": EvidenceEventPayload,
  "answer.generated": AnswerEventPayload,
  "answer.verified": AnswerEventPayload,
  "answer.blocked": AnswerEventPayload,
};

/** Validate an event's payload against its type-specific schema. */
export function validateEventPayload(
  type: DomainEventType,
  payload: unknown,
): { ok: true; payload: unknown; error?: undefined } | { ok: false; payload?: undefined; error: string } {
  const schema = eventPayloadSchemas[type];
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, payload: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/** Full envelope validation used on ingest and on replay. */
export function validateEnvelope(
  value: unknown,
): { ok: true; event: DomainEventEnvelope; error?: undefined } | { ok: false; event?: undefined; error: string } {
  const result = DomainEventEnvelope.safeParse(value);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const payload = validateEventPayload(result.data.type, result.data.payload);
  if (!payload.ok) return { ok: false, error: `payload invalid: ${payload.error}` };
  return { ok: true, event: result.data };
}
