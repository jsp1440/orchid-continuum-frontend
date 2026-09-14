import { describe, expect, it } from "vitest";
import { canPromoteScientificResult, planSpecialistCouncil, SPECIALIST_COUNCIL } from "./specialistCouncil";

describe("Specialist Council", () => {
  it("keeps the nine durable roles separate from execution providers", () => {
    expect(SPECIALIST_COUNCIL).toHaveLength(9);
    expect(SPECIALIST_COUNCIL.map((role) => role.id)).toContain("calyx-executive");
    expect(SPECIALIST_COUNCIL.map((role) => role.id)).toContain("scientific-reviewer");
  });

  it("routes taxonomy to a minimum sufficient council", () => {
    expect(planSpecialistCouncil({ kind: "taxonomy", scientific: true })).toMatchObject({
      coordinator: "calyx-executive",
      specialists: ["taxonomist-botanist", "data-steward"],
      reviewer: "scientific-reviewer",
      automaticPublication: false,
    });
  });

  it("activates optional expertise without duplicating specialists", () => {
    const plan = planSpecialistCouncil({
      kind: "trait-analysis",
      scientific: true,
      needsLiterature: true,
      needsQuantitativeAnalysis: true,
      needsConservationAssessment: true,
    });
    expect(plan.specialists).toEqual([
      "taxonomist-botanist",
      "evidence-scientist",
      "quantitative-scientist",
      "conservation-specialist",
    ]);
  });

  it("honors the specialist cap and reports deferrals", () => {
    const plan = planSpecialistCouncil({
      kind: "species-profile",
      scientific: true,
      needsQuantitativeAnalysis: true,
      needsConservationAssessment: true,
      maxSpecialists: 2,
    });
    expect(plan.specialists).toHaveLength(2);
    expect(plan.warnings[0]).toContain("capped at 2");
  });

  it("requires independent review and owner approval for scientific promotion", () => {
    const plan = planSpecialistCouncil({ kind: "research", scientific: true, publicationCandidate: true });
    expect(canPromoteScientificResult(plan, false, true)).toBe(false);
    expect(canPromoteScientificResult(plan, true, false)).toBe(false);
    expect(canPromoteScientificResult(plan, true, true)).toBe(true);
  });

  it("never treats a non-scientific design route as automatically publishable", () => {
    const plan = planSpecialistCouncil({ kind: "interface" });
    expect(plan.reviewer).toBeNull();
    expect(plan.automaticPublication).toBe(false);
  });
});
