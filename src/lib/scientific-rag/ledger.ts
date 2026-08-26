/**
 * Durable scientific event ledger (transactional outbox + consumer runtime).
 *
 * This is the smallest production-shaped mechanism that gives the vertical
 * slice the guarantees the directive requires, without adopting Kafka/Flink or
 * any paid platform:
 *
 *   - transactional append: an event is written together with the state change
 *     that produced it (callers wrap both in `transaction`);
 *   - at-least-once delivery with idempotent consumers keyed by idempotency key;
 *   - bounded retries with attempt accounting and error classification;
 *   - explicit dead-letter / quarantine terminal states;
 *   - safe replay that never re-applies a side effect an idempotent consumer
 *     has already performed;
 *   - an observable, append-only processing history.
 *
 * The reference store is in-memory (deterministic, ideal for CI and for a
 * frontend/worker that hydrates from an API). The `LedgerStore` interface is
 * the seam a Neon/Postgres-backed outbox table would implement unchanged.
 */

import {
  CURRENT_EVENT_SCHEMA_VERSION,
  DomainEventEnvelope,
  DomainEventType,
  ErrorClassification,
  EventProcessingStatus,
  NewDomainEvent,
  validateEnvelope,
} from "./events";

let sequence = 0;
/** Deterministic id generator so replay/tests produce stable ids. */
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString(36).padStart(6, "0")}`;
}

/** Reset the id sequence — test-only, keeps fixtures reproducible. */
export function __resetLedgerSequence(): void {
  sequence = 0;
}

export type ConsumerResult =
  | { outcome: "processed"; producedEvents?: NewDomainEvent[] }
  | { outcome: "skipped_duplicate" }
  | { outcome: "retry"; error: string; errorClass?: ErrorClassification }
  | { outcome: "dead_letter"; error: string; errorClass?: ErrorClassification }
  | { outcome: "quarantine"; error: string; errorClass?: ErrorClassification };

export type Consumer = {
  name: string;
  handles: DomainEventType[];
  handle: (event: DomainEventEnvelope, ctx: ConsumerContext) => ConsumerResult;
};

export type ConsumerContext = {
  /** True when this delivery is a replay of an already-processed event. */
  isReplay: boolean;
  /** Look up whether an idempotency key has already been committed. */
  alreadyApplied: (idempotencyKey: string) => boolean;
  /** Record that a side effect for this key has been applied. */
  markApplied: (idempotencyKey: string) => void;
};

export interface LedgerStore {
  append(event: DomainEventEnvelope): void;
  all(): DomainEventEnvelope[];
  byId(id: string): DomainEventEnvelope | undefined;
  update(event: DomainEventEnvelope): void;
  hasIdempotencyKey(key: string): boolean;
}

class InMemoryLedgerStore implements LedgerStore {
  private events: DomainEventEnvelope[] = [];
  private byIdMap = new Map<string, DomainEventEnvelope>();
  private idempotencyKeys = new Set<string>();

  append(event: DomainEventEnvelope): void {
    this.events.push(event);
    this.byIdMap.set(event.id, event);
    this.idempotencyKeys.add(event.idempotencyKey);
  }
  all(): DomainEventEnvelope[] {
    return [...this.events];
  }
  byId(id: string): DomainEventEnvelope | undefined {
    return this.byIdMap.get(id);
  }
  update(event: DomainEventEnvelope): void {
    this.byIdMap.set(event.id, event);
    const idx = this.events.findIndex((e) => e.id === event.id);
    if (idx >= 0) this.events[idx] = event;
  }
  hasIdempotencyKey(key: string): boolean {
    return this.idempotencyKeys.has(key);
  }
}

export type LedgerClock = () => string;

export class EventLedger {
  private store: LedgerStore;
  private clock: LedgerClock;
  private consumers: Consumer[] = [];
  /** Side effects already applied, keyed by consumer + idempotency key. */
  private applied = new Set<string>();

  constructor(opts?: { store?: LedgerStore; clock?: LedgerClock }) {
    this.store = opts?.store ?? new InMemoryLedgerStore();
    // Deterministic monotonic clock by default so tests and replay are stable.
    let tick = 0;
    this.clock =
      opts?.clock ??
      (() => new Date(Date.UTC(2025, 0, 1, 0, 0, 0) + tick++ * 1000).toISOString());
  }

  register(consumer: Consumer): void {
    this.consumers.push(consumer);
  }

  /**
   * Transactional append. If the idempotency key already exists in the store,
   * the append is a no-op and the existing event is returned — this is what
   * makes production idempotent (a producer that retries emits the same event
   * once). Envelope + payload are validated before anything is committed; a
   * malformed event is rejected rather than stored.
   */
  append(input: NewDomainEvent): DomainEventEnvelope {
    if (this.store.hasIdempotencyKey(input.idempotencyKey)) {
      const existing = this.store
        .all()
        .find((e) => e.idempotencyKey === input.idempotencyKey);
      if (existing) return existing;
    }
    const envelope: DomainEventEnvelope = {
      id: nextId("evt"),
      type: input.type,
      schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      contentHash: input.contentHash ?? null,
      createdAt: this.clock(),
      producer: input.producer,
      status: "pending",
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 5,
      retryable: input.retryable ?? true,
      lastError: null,
      lastErrorClass: "none",
      versions: input.versions ?? {},
      sensitivity: input.sensitivity ?? "public",
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
    };
    const validated = validateEnvelope(envelope);
    if (!validated.ok) {
      throw new Error(`refused to append invalid event ${input.type}: ${validated.error}`);
    }
    this.store.append(envelope);
    return envelope;
  }

  /**
   * A single transactional unit: the caller mutates domain state and appends
   * events; on a thrown error nothing is committed. The in-memory store commits
   * eagerly, so we snapshot and roll back to preserve the semantics the
   * Postgres implementation gets for free.
   */
  transaction<T>(work: (tx: { append: (e: NewDomainEvent) => DomainEventEnvelope }) => T): T {
    const snapshot = this.store.all();
    const staged: NewDomainEvent[] = [];
    try {
      const result = work({
        append: (e) => {
          staged.push(e);
          return this.append(e);
        },
      });
      return result;
    } catch (err) {
      // Roll back any events appended during the failed transaction.
      const rollbackStore = new InMemoryLedgerStore();
      snapshot.forEach((e) => rollbackStore.append(e));
      this.store = rollbackStore;
      throw err;
    }
  }

  /**
   * Drain all pending/retrying events until quiescent. Each event is delivered
   * to every consumer that handles its type. Consumers signal idempotency via
   * `alreadyApplied`/`markApplied`, so duplicate delivery and replay do not
   * double-apply side effects.
   */
  drain(opts?: { isReplay?: boolean }): void {
    const isReplay = opts?.isReplay ?? false;
    // Bounded outer loop guards against a pathological producer cycle.
    for (let guard = 0; guard < 10_000; guard += 1) {
      const next = this.store
        .all()
        .find((e) => e.status === "pending" || e.status === "retrying");
      if (!next) return;
      this.deliver(next, isReplay);
    }
    throw new Error("ledger drain exceeded bound — possible producer cycle");
  }

  private appliedKey(consumer: string, idempotencyKey: string): string {
    return `${consumer}␟${idempotencyKey}`;
  }

  private deliver(event: DomainEventEnvelope, isReplay: boolean): void {
    const handlers = this.consumers.filter((c) => c.handles.includes(event.type));
    if (handlers.length === 0) {
      this.store.update({ ...event, status: "processed" });
      return;
    }
    const working: DomainEventEnvelope = { ...event, status: "processing", attempt: event.attempt + 1 };
    this.store.update(working);

    for (const consumer of handlers) {
      const ctx: ConsumerContext = {
        isReplay,
        alreadyApplied: (key) => this.applied.has(this.appliedKey(consumer.name, key)),
        markApplied: (key) => this.applied.add(this.appliedKey(consumer.name, key)),
      };
      const result = consumer.handle(working, ctx);
      switch (result.outcome) {
        case "processed":
        case "skipped_duplicate": {
          if (result.outcome === "processed" && result.producedEvents) {
            for (const e of result.producedEvents) this.append(e);
          }
          break;
        }
        case "retry": {
          if (working.attempt >= working.maxAttempts || !working.retryable) {
            this.store.update({
              ...working,
              status: "dead_letter",
              lastError: result.error,
              lastErrorClass: result.errorClass ?? "transient",
            });
          } else {
            this.store.update({
              ...working,
              status: "retrying",
              lastError: result.error,
              lastErrorClass: result.errorClass ?? "transient",
            });
          }
          return;
        }
        case "dead_letter": {
          this.store.update({
            ...working,
            status: "dead_letter",
            lastError: result.error,
            lastErrorClass: result.errorClass ?? "permanent",
          });
          return;
        }
        case "quarantine": {
          this.store.update({
            ...working,
            status: "quarantined",
            lastError: result.error,
            lastErrorClass: result.errorClass ?? "contract_violation",
          });
          return;
        }
      }
    }
    this.store.update({ ...working, status: "processed" });
  }

  /**
   * Replay every committed event through the consumers again. Because
   * consumers guard on idempotency keys, a correct replay produces no new
   * scientific state — the property the directive requires. Returns the count
   * of events replayed.
   */
  replay(): number {
    const events = this.store.all().filter((e) => e.status === "processed");
    for (const event of events) {
      this.deliver({ ...event, status: "pending" }, true);
    }
    return events.length;
  }

  events(): DomainEventEnvelope[] {
    return this.store.all();
  }
  eventsByStatus(status: EventProcessingStatus): DomainEventEnvelope[] {
    return this.store.all().filter((e) => e.status === status);
  }
  eventsByType(type: DomainEventType): DomainEventEnvelope[] {
    return this.store.all().filter((e) => e.type === type);
  }
  eventsForRun(correlationId: string): DomainEventEnvelope[] {
    return this.store.all().filter((e) => e.correlationId === correlationId);
  }
}
