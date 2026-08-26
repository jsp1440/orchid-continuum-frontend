import { describe, it, expect, beforeEach } from "vitest";
import { ScientificRagPipeline, __resetRunCounter } from "./pipeline";
import { __resetLedgerSequence } from "./ledger";
import { generateGroundedAnswer } from "./answer";
import { verifyAnswer } from "./verification";
import { PHALAENOPSIS_PUBLICATION_V1 } from "./fixtures/phalaenopsisPublication";
import { PHALAENOPSIS_DEMO_QUESTION } from "./index";

function fresh() {
  __resetRunCounter();
  __resetLedgerSequence();
  const p = new ScientificRagPipeline();
  p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
  return p;
}

describe("grounded answer + verification gate", () => {
  beforeEach(() => {
    __resetRunCounter();
    __resetLedgerSequence();
  });

  it("fails closed with an insufficiency answer when no evidence is retrieved", () => {
    __resetRunCounter();
    __resetLedgerSequence();
    const p = new ScientificRagPipeline(); // no publication processed
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    expect(answer.insufficient).toBe(true);
    expect(answer.citations).toHaveLength(0);
    // Insufficiency is a valid verified fail-closed outcome, not a fabricated answer.
    expect(verification.verdict).toBe("verified");
    expect(verification.checks.find((c) => c.id === "insufficiency")?.status).toBe("pass");
  });

  it("hybrid retrieval honours taxon and category filters", () => {
    const p = fresh();
    const res = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION, {
      query: { taxonIds: ["wp:phal-schilleriana"], categories: ["morphology"] },
    });
    expect(res.answer.citations.length).toBeGreaterThan(0);
    for (const s of res.answer.statements) {
      if (s.kind === "insufficient") continue;
      expect(s.taxa.some((t) => t.accepted === "Phalaenopsis schilleriana")).toBe(true);
    }
  });

  it("public access never returns protected-locality evidence", () => {
    const p = fresh();
    const res = p.retrieval.search({
      text: "wild population occurrence",
      access: "public",
      categories: ["occurrence"],
    });
    expect(res).toHaveLength(0);
  });

  it("blocks an answer citing a claim that is not in the store", () => {
    const p = fresh();
    const tampered = generateGroundedAnswer(
      PHALAENOPSIS_DEMO_QUESTION,
      [],
      { answerId: "ans-x", correlationId: "run-x" },
    );
    // Inject a fabricated supported statement with a dangling citation.
    tampered.insufficient = false;
    tampered.statements = [
      {
        text: "Phalaenopsis schilleriana: leaf lamina thickness — 0.9 mm",
        kind: "observation",
        claimIds: ["claim-does-not-exist"],
        taxa: [{ accepted: "Phalaenopsis schilleriana", published: "Phalaenopsis schilleriana" }],
        confidence: 0.9,
      },
    ];
    const v = verifyAnswer(tampered, (id) => p.claims.get(id), { correlationId: "run-x" });
    expect(v.verdict).toBe("blocked");
    expect(v.checks.find((c) => c.id === "citations")?.status).toBe("fail");
  });

  it("blocks an answer that renders an unsupported numeric value", () => {
    const p = fresh();
    const morph = [...p.claims.values()].find((c) => c.category === "morphology")!;
    const answer = generateGroundedAnswer(
      PHALAENOPSIS_DEMO_QUESTION,
      [{ claim: morph, score: 1, matchedBy: ["semantic"] }],
      { answerId: "ans-y", correlationId: "run-y" },
    );
    // Fabricate a number the claim does not support.
    answer.statements[0].text += " and 9999 flowers per plant";
    const v = verifyAnswer(answer, (id) => p.claims.get(id), { correlationId: "run-y" });
    expect(v.verdict).toBe("blocked");
    expect(v.checks.find((c) => c.id === "numeric")?.status).toBe("fail");
  });

  it("blocks an answer that leaks protected locality text", () => {
    const p = fresh();
    const morph = [...p.claims.values()].find((c) => c.category === "morphology")!;
    const answer = generateGroundedAnswer(
      PHALAENOPSIS_DEMO_QUESTION,
      [{ claim: morph, score: 1, matchedBy: ["semantic"] }],
      { answerId: "ans-z", correlationId: "run-z" },
    );
    answer.citations[0].passage = "collected at 15.4021, 120.9312 on the eastern slope";
    const v = verifyAnswer(answer, (id) => p.claims.get(id), { correlationId: "run-z" });
    expect(v.verdict).toBe("blocked");
    expect(v.checks.find((c) => c.id === "locality")?.status).toBe("fail");
  });

  it("blocks an answer whose metadata does not match the retrieval run", () => {
    const p = fresh();
    const morph = [...p.claims.values()].find((c) => c.category === "morphology")!;
    const answer = generateGroundedAnswer(
      PHALAENOPSIS_DEMO_QUESTION,
      [{ claim: morph, score: 1, matchedBy: ["semantic"] }],
      { answerId: "ans-m", correlationId: "run-actual" },
    );
    const v = verifyAnswer(answer, (id) => p.claims.get(id), { correlationId: "run-different" });
    expect(v.verdict).toBe("blocked");
    expect(v.checks.find((c) => c.id === "metadata")?.status).toBe("fail");
  });

  it("surfaces contradictory evidence without silently dropping it", () => {
    const p = fresh();
    const morph = [...p.claims.values()].find((c) => c.category === "morphology")!;
    // Two conflicting objects for the same taxon+predicate.
    const conflicting = {
      ...morph,
      claimId: "claim-conflict",
      assertion: { ...morph.assertion, objectNormalized: "0.1 mm" },
    };
    p.claims.set(conflicting.claimId, conflicting);
    const answer = generateGroundedAnswer(
      PHALAENOPSIS_DEMO_QUESTION,
      [
        { claim: morph, score: 1, matchedBy: ["semantic"] },
        { claim: conflicting, score: 0.9, matchedBy: ["semantic"] },
      ],
      { answerId: "ans-c", correlationId: "run-c" },
    );
    const v = verifyAnswer(answer, (id) => p.claims.get(id), { correlationId: "run-c" });
    expect(v.contradictions.length).toBeGreaterThan(0);
  });
});
