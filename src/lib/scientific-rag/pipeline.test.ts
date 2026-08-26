import { describe, it, expect, beforeEach } from "vitest";
import { ScientificRagPipeline, __resetRunCounter } from "./pipeline";
import { __resetLedgerSequence } from "./ledger";
import { computeMetrics } from "./missionControl";
import {
  PHALAENOPSIS_PUBLICATION_V1,
  PHALAENOPSIS_PUBLICATION_V1_REINGEST,
  PHALAENOPSIS_PUBLICATION_V2,
} from "./fixtures/phalaenopsisPublication";
import { PHALAENOPSIS_DEMO_QUESTION } from "./index";
import { finalizeCandidate } from "./extraction";

function fresh() {
  __resetRunCounter();
  __resetLedgerSequence();
  return new ScientificRagPipeline();
}

describe("end-to-end publication → verified answer", () => {
  beforeEach(() => {
    __resetRunCounter();
    __resetLedgerSequence();
  });

  it("processes the Phalaenopsis publication into governed evidence", () => {
    const p = fresh();
    const r = p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    expect(r.decision).toBe("new");
    expect(r.claimsExtracted).toBeGreaterThan(3);
    // Cool (schilleriana) and warm (amabilis) claims are both present.
    const subjects = new Set([...p.claims.values()].map((c) => c.taxon.acceptedName));
    expect(subjects.has("Phalaenopsis schilleriana")).toBe(true);
    expect(subjects.has("Phalaenopsis amabilis")).toBe(true);
    // Ambiguous taxon claim exists but is flagged ambiguous.
    expect(r.taxaAmbiguous).toBeGreaterThanOrEqual(1);
  });

  it("preserves passage-level provenance and original+accepted names", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    for (const claim of p.claims.values()) {
      expect(claim.provenance.supportingPassage.length).toBeGreaterThan(0);
      expect(claim.provenance.passageContentHash).toMatch(/^sha1a-/);
      expect(claim.provenance.locator.page).toBeTruthy();
      expect(claim.taxon.nameAsPublished.length).toBeGreaterThan(0);
    }
  });

  it("answers the demo question with a verified, grounded, cited answer", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    expect(answer.insufficient).toBe(false);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(verification.verdict).toBe("verified");
    // Every statement carries at least one claim id.
    for (const s of answer.statements) {
      if (s.kind !== "insufficient") expect(s.claimIds.length).toBeGreaterThan(0);
    }
    // Observation and inference are distinguished.
    const kinds = new Set(answer.statements.map((s) => s.kind));
    expect(kinds.has("observation")).toBe(true);
    expect([...kinds].some((k) => k === "inference")).toBe(true);
    // Correlation id ties the answer to its run.
    expect(verification.correlationId).toBe(answer.correlationId);
  });

  it("unchanged republication is a provable no-op", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const eventsAfterFirst = p.ledger.events().length;
    const claimsAfterFirst = p.claims.size;
    const r2 = p.processPublication(PHALAENOPSIS_PUBLICATION_V1_REINGEST);
    expect(r2.decision).toBe("unchanged");
    expect(p.ledger.events().length).toBe(eventsAfterFirst);
    expect(p.claims.size).toBe(claimsAfterFirst);
  });

  it("changed publication reprocesses and adds the new claim", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const before = p.claims.size;
    const r2 = p.processPublication(PHALAENOPSIS_PUBLICATION_V2);
    expect(r2.decision).toBe("changed");
    expect(p.claims.size).toBeGreaterThan(before);
    // The physiology stomatal claim is now present.
    const hasStomatal = [...p.claims.values()].some(
      (c) => c.assertion.predicate === "stomatal_conductance_response",
    );
    expect(hasStomatal).toBe(true);
  });

  it("forced re-run does not duplicate scientific state (idempotent replay)", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const claims1 = p.claims.size;
    const edges1 = p.graph.all().length;
    const embeddings1 = p.embeddings.all().length;
    const claimEvents1 = p.ledger.eventsByType("claim.extracted").length;
    const graphEvents1 = p.ledger.eventsByType("graph.updated").length;

    // Force a full re-run over identical content.
    const r2 = p.processPublication(PHALAENOPSIS_PUBLICATION_V1, { force: true });

    // No duplicate scientific state.
    expect(p.claims.size).toBe(claims1);
    expect(p.graph.all().length).toBe(edges1);
    expect(p.embeddings.all().length).toBe(embeddings1);
    // Content-derived idempotency keys dedupe the state-bearing events.
    expect(p.ledger.eventsByType("claim.extracted").length).toBe(claimEvents1);
    expect(p.ledger.eventsByType("graph.updated").length).toBe(graphEvents1);
    // Embeddings were reused, not recreated (the reuse itself is recorded).
    expect(r2.embeddingsReused).toBeGreaterThan(0);
    expect(r2.embeddingsCreated).toBe(0);
  });

  it("replaying the ledger produces no new events", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const before = p.ledger.events().length;
    const replayed = p.ledger.replay();
    expect(replayed).toBeGreaterThan(0);
    expect(p.ledger.events().length).toBe(before);
  });

  it("excludes protected locality from the public answer and evidence", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    const rendered = [
      ...answer.statements.map((s) => s.text),
      ...answer.citations.map((c) => c.passage),
    ].join("\n");
    expect(rendered).not.toMatch(/15\.4021/);
    expect(rendered).not.toMatch(/120\.9312/);
    expect(verification.checks.find((c) => c.id === "locality")?.status).toBe("pass");
    // Even the stored claim's provenance passage is screened.
    const occurrence = [...p.claims.values()].find((c) => c.category === "occurrence");
    expect(occurrence?.provenance.supportingPassage).not.toMatch(/15\.4021/);
  });

  it("does not activate ambiguous or protected claims in the knowledge graph", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const blockedEdges = p.graph.all().filter((e) => !e.activated);
    expect(blockedEdges.length).toBeGreaterThan(0);
    expect(blockedEdges.some((e) => e.activationBlockedReason === "taxon ambiguous")).toBe(true);
    expect(blockedEdges.some((e) => e.activationBlockedReason === "protected locality")).toBe(true);
  });

  it("quarantines malformed extractions rather than storing them", () => {
    const malformed = {
      claimId: "bad",
      category: "morphology" as const,
      evidenceType: "observation" as const,
      assertion: {
        subjectNormalized: "x",
        predicate: "p",
        objectNormalized: "",
        originalText: "t",
        units: null,
        numericValue: null,
        numericRange: null,
        qualifiers: [],
        lifeStage: null,
        organ: null,
        geography: null,
        elevationRangeM: null,
        habitat: null,
        temporalContext: null,
        uncertainty: null,
      },
      taxon: {
        nameAsPublished: "x",
        acceptedName: null,
        taxonId: null,
        authorship: null,
        synonymRelationship: "unresolved" as const,
        taxonomySource: "s",
        taxonomyVersion: "v",
        resolutionMethod: "unresolved" as const,
        confidence: 0,
        ambiguous: false,
        reviewRequired: true,
      },
      provenance: {
        sourceDocumentId: "d",
        sourceRecordId: "s",
        citation: { title: "t", authors: [], year: null, doi: null },
        locator: { page: 1, section: null, paragraph: null, figure: null, table: null },
        supportingPassage: "",
        passageContentHash: "sha1a-x",
      },
      methodology: null,
      sampleSize: null,
      hypothesis: null,
      result: null,
      conclusion: null,
      pollinator: null,
      mycorrhizalAssociate: null,
      extractionConfidence: 0.5,
      reviewStatus: "unreviewed" as const,
      sensitivity: "public" as const,
      extractor: "x",
      extractorVersion: "1",
    };
    const r = finalizeCandidate(malformed, new Date().toISOString());
    expect(r.ok).toBe(false);
  });

  it("Mission Control metrics are derived from real ledger events", () => {
    const p = fresh();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    const m = computeMetrics(p.ledger, new Date(Date.UTC(2025, 0, 2)).toISOString());
    expect(m.documentsParsed).toBe(1);
    expect(m.claimsExtracted).toBeGreaterThan(0);
    expect(m.taxaAmbiguous).toBeGreaterThanOrEqual(1);
    expect(m.embeddingsCreated).toBeGreaterThan(0);
    expect(m.graphUpdatesCompleted).toBeGreaterThan(0);
    expect(m.answersVerified + m.answersBlocked).toBe(1);
    expect(m.deadLetterEvents).toBe(0);
    // Each run has a correlation id and stage durations.
    expect(m.runs.length).toBeGreaterThanOrEqual(2);
    expect(m.runs[0].correlationId).toMatch(/^run-/);
  });
});
