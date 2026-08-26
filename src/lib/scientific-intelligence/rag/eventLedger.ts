/**
 * A minimal, production-shaped durable event ledger / transactional outbox for
 * the scientific RAG slice.
 *
 * This is intentionally the smallest mechanism that gives the semantics the
 * directive requires — not a streaming platform. It models what a Postgres
 * outbox table plus a worker dispatcher would provide, in a form that is
 * deterministic and unit-testable, and whose event contracts can later be
 * transported onto Kafka-compatible infrastructure without change:
 *
 *   • transactional append (an event accompanies the state change that produced it);
 *   • idempotent production (same idempotency key ⇒ one durable event);
 *   • at-least-once, idempotent consumption;
 *   • bounded retries with attempt tracking;
 *   • explicit dead-letter / quarantine state;
 *   • safe replay that never double-applies scientific state;
 *   • an observable, ordered processing history.
 *
 * The store here is in-memory (a `Map`), but every mutation goes through
 * append/claim/ack semantics so a Postgres-backed implementation is a drop-in
 * behind the same interface.
 */

import {
  DomainEvent,
  DomainEventType,
  EVENT_CONTRACT_VERSION,
  EventProcessingStatus,
  LastErrorClass,
  SensitivityClass,
  validateDomainEvent,
} from './contracts'
import { contentHash } from './hash'

let counter = 0

/** Deterministic-per-process monotonic id. Seeded time keeps tests reproducible. */
function newId(prefix: string): string {
  counter += 1
  return `${prefix}_${counter.toString(36).padStart(6, '0')}`
}

export type AppendEventInput<TPayload = Record<string, unknown>> = {
  type: DomainEventType
  aggregateId: string
  correlationId: string
  causationId?: string | null
  sourceId?: string | null
  producer: string
  payload: TPayload
  sensitivity?: SensitivityClass
  versions?: Record<string, string>
  /**
   * Idempotency key. When omitted it is derived deterministically from
   * (type, aggregateId, payload content hash), so re-emitting the same logical
   * fact is a no-op.
   */
  idempotencyKey?: string
  contentHashOverride?: string
}

export type LedgerOptions = {
  maxAttempts?: number
  /** Injectable clock for deterministic tests. */
  now?: () => string
}

export class EventLedger {
  private readonly events: DomainEvent[] = []
  private readonly byIdempotencyKey = new Map<string, string>()
  private readonly byEventId = new Map<string, DomainEvent>()
  private readonly maxAttempts: number
  private readonly now: () => string

  constructor(options: LedgerOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3
    this.now = options.now ?? (() => new Date().toISOString())
  }

  /**
   * Transactionally append an event. Idempotent on the idempotency key: a
   * repeated logical fact returns the already-stored event rather than creating
   * a duplicate. This is what makes replay safe.
   */
  append<TPayload extends Record<string, unknown>>(input: AppendEventInput<TPayload>): DomainEvent<TPayload> {
    const hash = input.contentHashOverride ?? contentHash(input.payload)
    const idempotencyKey = input.idempotencyKey ?? `${input.type}:${input.aggregateId}:${hash}`

    const existingId = this.byIdempotencyKey.get(idempotencyKey)
    if (existingId) {
      return this.byEventId.get(existingId) as DomainEvent<TPayload>
    }

    const event: DomainEvent<TPayload> = {
      eventId: newId('evt'),
      type: input.type,
      schemaVersion: EVENT_CONTRACT_VERSION,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      sourceId: input.sourceId ?? null,
      contentHash: hash,
      createdAt: this.now(),
      producer: input.producer,
      status: 'pending',
      attempt: 0,
      retryEligible: true,
      lastErrorClass: null,
      lastError: null,
      versions: input.versions,
      sensitivity: input.sensitivity ?? 'public',
      idempotencyKey,
      payload: input.payload,
    }

    const validation = validateDomainEvent(event)
    if (!validation.valid) {
      throw new Error(`Refusing to append malformed event: ${validation.errors.join('; ')}`)
    }

    this.events.push(event)
    this.byEventId.set(event.eventId, event)
    this.byIdempotencyKey.set(idempotencyKey, event.eventId)
    return event
  }

  /** All events, in append order — the observable processing history. */
  history(): ReadonlyArray<DomainEvent> {
    return this.events.slice()
  }

  find(eventId: string): DomainEvent | undefined {
    return this.byEventId.get(eventId)
  }

  byType(type: DomainEventType): DomainEvent[] {
    return this.events.filter((event) => event.type === type)
  }

  byCorrelation(correlationId: string): DomainEvent[] {
    return this.events.filter((event) => event.correlationId === correlationId)
  }

  /** Events still awaiting terminal processing. */
  pending(): DomainEvent[] {
    return this.events.filter((event) => event.status === 'pending' || event.status === 'retrying')
  }

  deadLetter(): DomainEvent[] {
    return this.events.filter((event) => event.status === 'dead_letter')
  }

  /**
   * Dispatch pending events of a given type to a consumer with at-least-once,
   * idempotent semantics and bounded retries. The consumer is expected to be
   * idempotent (downstream stores dedupe on content hash / idempotency key), so
   * a redelivery after a transient failure cannot double-apply state.
   *
   * Returns the events that reached `processed` in this pass.
   */
  async dispatch(
    type: DomainEventType,
    consumer: (event: DomainEvent) => Promise<void> | void,
  ): Promise<DomainEvent[]> {
    const processed: DomainEvent[] = []
    for (const event of this.events) {
      if (event.type !== type) continue
      if (event.status !== 'pending' && event.status !== 'retrying') continue

      event.status = 'processing'
      event.attempt += 1
      try {
        await consumer(event)
        event.status = 'processed'
        event.lastError = null
        event.lastErrorClass = null
        processed.push(event)
      } catch (error) {
        this.recordFailure(event, error)
      }
    }
    return processed
  }

  private recordFailure(event: DomainEvent, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    event.lastError = message
    event.lastErrorClass = classifyError(error)

    // Contract / validation / unauthorized failures are not transient: they will
    // never succeed on retry, so they go straight to dead-letter for inspection.
    const permanent = event.lastErrorClass === 'validation' || event.lastErrorClass === 'contract' || event.lastErrorClass === 'unauthorized'
    if (permanent || event.attempt >= this.maxAttempts) {
      event.status = 'dead_letter'
      event.retryEligible = false
    } else {
      event.status = 'retrying'
      event.retryEligible = true
    }
  }

  /**
   * Move a dead-lettered or retrying event back to pending for a controlled
   * replay. Attempt count and history are preserved.
   */
  requeue(eventId: string): boolean {
    const event = this.byEventId.get(eventId)
    if (!event) return false
    if (event.status !== 'dead_letter' && event.status !== 'retrying') return false
    event.status = 'pending'
    event.retryEligible = true
    return true
  }

  /** Age in ms of the oldest still-pending event, or 0 when none pend. */
  oldestPendingAgeMs(reference: number = Date.now()): number {
    const pendings = this.pending()
    if (!pendings.length) return 0
    const oldest = pendings.reduce((min, event) => Math.min(min, new Date(event.createdAt).getTime()), Infinity)
    return Number.isFinite(oldest) ? Math.max(0, reference - oldest) : 0
  }

  counts(): Record<EventProcessingStatus, number> {
    const base: Record<EventProcessingStatus, number> = {
      pending: 0, processing: 0, processed: 0, retrying: 0, dead_letter: 0, quarantined: 0,
    }
    for (const event of this.events) base[event.status] += 1
    return base
  }
}

function classifyError(error: unknown): LastErrorClass {
  if (error instanceof LedgerError) return error.errorClass
  return 'unknown'
}

/** Consumers throw this to signal how a failure should be classified. */
export class LedgerError extends Error {
  constructor(public readonly errorClass: Exclude<LastErrorClass, null>, message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}
