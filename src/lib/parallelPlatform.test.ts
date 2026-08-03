import { describe, expect, it } from "vitest";
import { homepageFixture, identificationFixture, matrixFixture } from "@/data/parallelPlatformFixtures";


describe("parallel platform contract", () => {
  it("never treats unavailable Matrix evidence as zero", () => {
    const unavailable = matrixFixture.dimensions.find((item) => item.name === "pollinator");
    expect(unavailable?.availability).toBe("unavailable");
    expect(unavailable?.score).toBeNull();
  });

  it("keeps identification suggestions separate from verified identity", () => {
    expect(identificationFixture.verified_identity).toBeNull();
    expect(identificationFixture.publication_authority).toBe(false);
    expect(identificationFixture.candidates.every((item) => item.state === "candidate_suggestion")).toBe(true);
  });

  it("forbids client scientific scoring on the homepage", () => {
    expect(homepageFixture.governance.client_scoring_allowed).toBe(false);
    expect(homepageFixture.governance.provenance_required).toBe(true);
  });
});
