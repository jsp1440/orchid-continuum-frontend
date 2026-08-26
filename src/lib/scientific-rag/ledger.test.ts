import { describe, it, expect, beforeEach } from "vitest";
import { EventLedger, __resetLedgerSequence, Consumer } from "./ledger";
import { idempotencyKey } from "./hashing";
import type { NewDomainEvent } from "./events";

function sourceEvent(overrides: Partial<NewDomainEvent> = {}): NewDomainEvent {
  return {
    type: "source.discovered",
    aggregateId: "src:x",
    correlationId: "run-1",
    producer: "test",
    idempotencyKey: idempotencyKey("src", "src:x", "v1"),
    payload: {
      sourceRecordId: "src:x",
      title: "T",
      contentHash: "sha1a-abc",
      version: 1,
      license: "CC-BY",
      accessConstraint: "open",
    },
    ...overrides,
  };
}

describe("event ledger", () => {
  beforeEach(() => __resetLedgerSequence());

  it("appends a valid event and stamps processing state", () => {
    const ledger = new EventLedger();
    const e = ledger.append(sourceEvent());
    expect(e.status).toBe("pending");
    expect(e.attempt).toBe(0);
    expect(e.schemaVersion).toBe(1);
    expect(ledger.events()).toHaveLength(1);
  });

  it("refuses to append an event with an invalid payload", () => {
    const ledger = new EventLedger();
    expect(() =>
      ledger.append({ ...sourceEvent(), payload: { sourceRecordId: "only" } }),
    ).toThrow(/invalid event/);
  });

  it("idempotent production: same idempotency key does not duplicate", () => {
    const ledger = new EventLedger();
    const a = ledger.append(sourceEvent());
    const b = ledger.append(sourceEvent());
    expect(a.id).toBe(b.id);
    expect(ledger.events()).toHaveLength(1);
  });

  it("transaction rolls back appended events on failure", () => {
    const ledger = new EventLedger();
    expect(() =>
      ledger.transaction((tx) => {
        tx.append(sourceEvent());
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(ledger.events()).toHaveLength(0);
  });

  it("idempotent consumption: duplicate delivery does not re-apply side effects", () => {
    const ledger = new EventLedger();
    const applied: string[] = [];
    const consumer: Consumer = {
      name: "sink",
      handles: ["source.discovered"],
      handle: (event, ctx) => {
        if (ctx.alreadyApplied(event.idempotencyKey)) return { outcome: "skipped_duplicate" };
        ctx.markApplied(event.idempotencyKey);
        applied.push(event.id);
        return { outcome: "processed" };
      },
    };
    ledger.register(consumer);
    ledger.append(sourceEvent());
    ledger.drain();
    ledger.replay();
    ledger.replay();
    expect(applied).toHaveLength(1);
  });

  it("bounded retries move an event to dead_letter", () => {
    const ledger = new EventLedger();
    ledger.register({
      name: "flaky",
      handles: ["source.discovered"],
      handle: () => ({ outcome: "retry", error: "transient" }),
    });
    ledger.append({ ...sourceEvent(), maxAttempts: 3 });
    ledger.drain();
    const dead = ledger.eventsByStatus("dead_letter");
    expect(dead).toHaveLength(1);
    expect(dead[0].attempt).toBe(3);
    expect(dead[0].lastError).toBe("transient");
  });

  it("quarantine is a terminal state distinct from dead_letter", () => {
    const ledger = new EventLedger();
    ledger.register({
      name: "strict",
      handles: ["source.discovered"],
      handle: () => ({ outcome: "quarantine", error: "contract" }),
    });
    ledger.append(sourceEvent());
    ledger.drain();
    expect(ledger.eventsByStatus("quarantined")).toHaveLength(1);
    expect(ledger.eventsByStatus("dead_letter")).toHaveLength(0);
  });

  it("produced events from a consumer are appended and drained", () => {
    const ledger = new EventLedger();
    const seen: string[] = [];
    ledger.register({
      name: "chain",
      handles: ["source.discovered", "document.parsed"],
      handle: (event) => {
        seen.push(event.type);
        if (event.type === "source.discovered") {
          return {
            outcome: "processed",
            producedEvents: [
              {
                type: "document.parsed",
                aggregateId: "doc:x",
                correlationId: "run-1",
                producer: "parser",
                idempotencyKey: idempotencyKey("parsed", "doc:x"),
                payload: {
                  sourceRecordId: "src:x",
                  documentId: "doc:x",
                  contentHash: "sha1a-abc",
                  sectionCount: 1,
                  passageCount: 1,
                  parser: "p",
                },
              },
            ],
          };
        }
        return { outcome: "processed" };
      },
    });
    ledger.append(sourceEvent());
    ledger.drain();
    expect(seen).toEqual(["source.discovered", "document.parsed"]);
  });
});
