/**
 * Versioned domain-event and scientific-claim contracts for the event-driven
 * scientific RAG slice.
 *
 * These are deliberately transport-agnostic. The event envelope carries the
 * metadata a Kafka-compatible platform would later need (correlation, causation,
 * idempotency key, schema version, attempt/retry state) so the domain contracts
 * can be lifted onto real streaming infrastructure without changing shape. No
 * Kafka/Confluent dependency is introduced here — only the contract surface.
 *
 * Every validator is deterministic and pure. Invalid model or ingestion output
 * must fail validation and be routed to quarantine; it must never silently
 * enter authoritative evidence.
 */

export const EVENT_CONTRACT_VERSION = '1.0.0'
export const CLAIM_CONTRACT_VERSION = '1.0.0'

/**
 * The full versioned domain-event vocabulary for the vertical slice, mirroring
 * the transitions the directive enumerates: discovery → download → parse →
 * claim → taxon → provenance → embedding → graph → evidence → answer.
 */
export const DOMAIN_EVENT_TYPES = [
  'source.discovered',
  'source.downloaded',
  'document.parsed',
  'document.parse_failed',
  'claim.extracted',
  'claim.quarantined',
  'taxon.resolved',
  'taxon.ambiguous',
  'provenance.validated',
  'embedding.requested',
  'embedding.created',
  'embedding.reused',
  'embedding.failed',
  'graph.update_requested',
  'graph.updated',
  'graph.update_failed',
  'evidence.verified',
  'evidence.rejected',
  'answer.generated',
  'answer.verified',
  'answer.blocked',
] as const

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number]

export type EventProcessingStatus =
  | 'pending'
  | 'processing'
  | 'processed'
  | 'retrying'
  | 'dead_letter'
  | 'quarantined'

export type SensitivityClass = 'public' | 'restricted' | 'protected_locality'

export type LastErrorClass =
  | 'validation'
  | 'transient'
  | 'not_found'
  | 'unauthorized'
  | 'contract'
  | 'unknown'
  | null

/**
 * The durable event envelope. Every field the directive requires for a durable
 * event is represented; producers populate what applies to their transition.
 */
export type DomainEvent<TPayload = Record<string, unknown>> = {
  /** Immutable, globally unique event id. */
  eventId: string
  type: DomainEventType
  schemaVersion: string
  /** The aggregate/entity this event concerns (source id, document id, claim id, answer id). */
  aggregateId: string
  /** Ties every event in one end-to-end run together for audit. */
  correlationId: string
  /** The event that caused this one, where applicable. */
  causationId: string | null
  /** The originating source record or document id, where applicable. */
  sourceId: string | null
  /** Content hash of the payload this event describes. */
  contentHash: string
  createdAt: string
  /** Producing service/stage identity. */
  producer: string
  status: EventProcessingStatus
  attempt: number
  retryEligible: boolean
  lastErrorClass: LastErrorClass
  lastError: string | null
  /** Model / parser / configuration versions relevant to this transition. */
  versions?: Record<string, string>
  sensitivity: SensitivityClass
  /**
   * Idempotency key. Two events with the same key describe the same logical
   * fact; the ledger deduplicates on it so replay cannot double-apply state.
   */
  idempotencyKey: string
  payload: TPayload
}

/**
 * A structured scientific claim with passage-level provenance. Original
 * published wording and normalized representation are both preserved; a claim
 * that lacks adequate source support must be quarantined, never accepted.
 */
export type ScientificClaim = {
  claimId: string
  schemaVersion: string
  /** Original taxon string exactly as published. */
  originalTaxon: string
  /** Normalized subject label (may be refined by reconciliation). */
  normalizedSubject: string
  /** Canonical taxon id once reconciled; null until resolved. */
  subjectTaxonId: string | null
  predicate: string
  /** Normalized object/value. */
  object: string
  value: number | null
  unit: string | null
  qualifiers: string[]
  lifeStage: string | null
  organ: string | null
  geography: string | null
  elevationRange: { min: number; max: number; unit: string } | null
  habitat: string | null
  methodology: string | null
  sampleSize: number | null
  /** observation vs experiment. */
  studyType: 'observation' | 'experiment' | 'review' | 'unknown'
  category: ClaimCategory
  hypothesis: string | null
  result: string | null
  conclusion: string | null
  pollinator: string | null
  mycorrhizalAssociate: string | null
  trait: string | null
  temporalContext: string | null
  uncertainty: string | null
  extractionConfidence: number
  reviewStatus: 'unreviewed' | 'quarantined' | 'accepted' | 'rejected'
  sourceDocumentId: string
  citation: ClaimCitation
  /** Page/section/figure/table/paragraph locator. */
  locator: ClaimLocator
  /** The exact supporting passage/snippet from the source. */
  supportingPassage: string
  /** Character offsets of the passage within the parsed document text. */
  passageSpan: { start: number; end: number }
  extractor: string
  extractorVersion: string
  extractedAt: string
  sensitivity: SensitivityClass
  contentHash: string
}

export type ClaimCategory =
  | 'taxonomy'
  | 'morphology'
  | 'anatomy'
  | 'physiology'
  | 'habitat'
  | 'elevation'
  | 'occurrence'
  | 'phenology'
  | 'pollinators'
  | 'mycorrhiza'
  | 'cultivation'
  | 'methodology'
  | 'observation'
  | 'hypothesis'
  | 'result'
  | 'conclusion'
  | 'citation'

export type ClaimCitation = {
  title: string
  authors: string
  year: number | null
  journal: string | null
  doi: string | null
}

export type ClaimLocator = {
  page: number | null
  section: string | null
  figure: string | null
  table: string | null
  paragraph: number | null
}

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

const NON_EMPTY = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

/** Validate a domain-event envelope against the versioned contract. */
export function validateDomainEvent(event: Partial<DomainEvent>): ValidationResult {
  const errors: string[] = []
  if (!NON_EMPTY(event.eventId)) errors.push('eventId is required')
  if (!event.type || !DOMAIN_EVENT_TYPES.includes(event.type)) errors.push(`type "${String(event.type)}" is not a known domain event`)
  if (!NON_EMPTY(event.schemaVersion)) errors.push('schemaVersion is required')
  if (!NON_EMPTY(event.aggregateId)) errors.push('aggregateId is required')
  if (!NON_EMPTY(event.correlationId)) errors.push('correlationId is required')
  if (!NON_EMPTY(event.contentHash)) errors.push('contentHash is required')
  if (!NON_EMPTY(event.producer)) errors.push('producer is required')
  if (!NON_EMPTY(event.idempotencyKey)) errors.push('idempotencyKey is required')
  if (typeof event.attempt !== 'number' || event.attempt < 0) errors.push('attempt must be a non-negative number')
  if (!NON_EMPTY(event.sensitivity)) errors.push('sensitivity classification is required')
  return { valid: errors.length === 0, errors }
}

/**
 * Validate an extracted scientific claim. A claim is only structurally valid
 * when it preserves the original wording, a normalized representation, a source
 * document, a citation, a locator, and — critically — a non-empty supporting
 * passage with a coherent span. Claims failing this must be quarantined.
 */
export function validateScientificClaim(claim: Partial<ScientificClaim>): ValidationResult {
  const errors: string[] = []
  if (!NON_EMPTY(claim.claimId)) errors.push('claimId is required')
  if (!NON_EMPTY(claim.originalTaxon)) errors.push('originalTaxon (as published) is required')
  if (!NON_EMPTY(claim.normalizedSubject)) errors.push('normalizedSubject is required')
  if (!NON_EMPTY(claim.predicate)) errors.push('predicate is required')
  if (!NON_EMPTY(claim.object)) errors.push('object/value is required')
  if (!NON_EMPTY(claim.sourceDocumentId)) errors.push('sourceDocumentId is required')
  if (!NON_EMPTY(claim.supportingPassage)) errors.push('supportingPassage is required — a claim without source support cannot be accepted')
  if (!claim.citation || !NON_EMPTY(claim.citation.title)) errors.push('citation.title is required')
  if (!claim.passageSpan || claim.passageSpan.start < 0 || claim.passageSpan.end <= claim.passageSpan.start) {
    errors.push('passageSpan must be a coherent [start,end) range')
  }
  if (typeof claim.extractionConfidence !== 'number' || claim.extractionConfidence < 0 || claim.extractionConfidence > 1) {
    errors.push('extractionConfidence must be within [0,1]')
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Shared protected-locality detector. Precise decimal-degree coordinate pairs
 * are the classic protected-locality leak in botanical literature; any text
 * carrying one is treated as protected and must be withheld. Conservative by
 * design — it errs toward withholding.
 */
export function isProtectedLocality(text: string): boolean {
  return /\d{1,3}\.\d{2,}\s*[NSEW]/i.test(text)
}

/**
 * Additional support check independent of shape: the supporting passage must
 * actually appear in the parsed document text at the declared span. This is the
 * deterministic guard that stops a well-formed but unsupported ("hallucinated")
 * claim from entering the evidence store.
 */
export function claimIsSupportedBy(claim: ScientificClaim, documentText: string): boolean {
  const { start, end } = claim.passageSpan
  if (start < 0 || end > documentText.length || end <= start) return false
  const span = documentText.slice(start, end)
  return span.trim() === claim.supportingPassage.trim() && claim.supportingPassage.trim().length > 0
}
