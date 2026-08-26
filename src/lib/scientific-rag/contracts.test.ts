import { describe, it, expect } from "vitest";
import { contentHash, structuralHash, idempotencyKey, normalizeForHash } from "./hashing";
import { validateEnvelope, validateEventPayload, CURRENT_EVENT_SCHEMA_VERSION } from "./events";
import { validateClaim } from "./claims";

describe("deterministic content hashing", () => {
  it("is stable and ignores cosmetic whitespace", () => {
    const a = contentHash("Phalaenopsis schilleriana");
    const b = contentHash("Phalaenopsis   schilleriana");
    const c = contentHash("  Phalaenopsis schilleriana\n");
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toMatch(/^sha1a-[0-9a-f]{32}$/);
  });

  it("distinguishes materially different content", () => {
    expect(contentHash("cool-growing")).not.toBe(contentHash("warm-growing"));
  });

  it("structural hash is order-independent for object keys", () => {
    expect(structuralHash({ a: 1, b: 2 })).toBe(structuralHash({ b: 2, a: 1 }));
    expect(structuralHash({ a: 1 })).not.toBe(structuralHash({ a: 2 }));
  });

  it("idempotency keys are content-derived and reproducible", () => {
    expect(idempotencyKey("extracted", "claim-1", "hashX")).toBe(
      idempotencyKey("extracted", "claim-1", "hashX"),
    );
    expect(idempotencyKey("a", "b")).not.toBe(idempotencyKey("a", "c"));
  });

  it("normalizeForHash collapses interior and edge whitespace", () => {
    expect(normalizeForHash("a\r\n b  c ")).toBe("a\nb c");
  });
});

describe("event envelope + payload contracts", () => {
  const validEnvelope = {
    id: "evt-1",
    type: "source.discovered" as const,
    schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
    aggregateId: "src:x",
    correlationId: "run-1",
    causationId: null,
    sourceRecordId: "src:x",
    contentHash: "sha1a-abc",
    createdAt: new Date().toISOString(),
    producer: "ingestion",
    status: "pending" as const,
    attempt: 0,
    maxAttempts: 5,
    retryable: true,
    lastError: null,
    lastErrorClass: "none" as const,
    versions: {},
    sensitivity: "public" as const,
    idempotencyKey: "idk-1",
    payload: {
      sourceRecordId: "src:x",
      title: "T",
      contentHash: "sha1a-abc",
      version: 1,
      license: "CC-BY",
      accessConstraint: "open",
    },
  };

  it("accepts a well-formed envelope with a matching payload", () => {
    const r = validateEnvelope(validEnvelope);
    expect(r.ok).toBe(true);
  });

  it("rejects an envelope whose payload violates the type schema", () => {
    const bad = { ...validEnvelope, payload: { sourceRecordId: "src:x" } };
    const r = validateEnvelope(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown event fields (strict envelope)", () => {
    const r = validateEnvelope({ ...validEnvelope, extra: "nope" });
    expect(r.ok).toBe(false);
  });

  it("validates per-type payloads independently", () => {
    expect(validateEventPayload("answer.blocked", {
      answerId: "a1",
      question: "q",
      citationCount: 0,
      verdict: "blocked",
      blockReasons: ["x"],
    }).ok).toBe(true);
    expect(validateEventPayload("answer.blocked", { answerId: "a1" }).ok).toBe(false);
  });
});

describe("scientific claim contract", () => {
  it("rejects a claim without a supporting passage", () => {
    const r = validateClaim({ claimId: "c1", category: "morphology" });
    expect(r.ok).toBe(false);
  });
});
