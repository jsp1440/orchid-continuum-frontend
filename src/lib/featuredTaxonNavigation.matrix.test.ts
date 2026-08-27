import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_MATRIX_ORIGIN,
  relationshipMatrixCalyxHref,
} from "@/lib/featuredTaxonNavigation";

describe("Relationship Matrix Calyx handoff", () => {
  it("carries only canonical genus context with a matrix-specific non-evidence origin", () => {
    expect(RELATIONSHIP_MATRIX_ORIGIN).toBe("relationship-matrix");
    expect(relationshipMatrixCalyxHref("Phalaenopsis")).toBe(
      "/calyx?genus=Phalaenopsis&origin=relationship-matrix&context_is_evidence=false",
    );
  });

  it.each([
    "Phalaenopsis aphrodite",
    "phalaenopsis",
    "/atlas?genera=Phalaenopsis",
    "Los Osos",
    "",
  ])("fails closed for non-canonical genus context: %s", (value) => {
    expect(() => relationshipMatrixCalyxHref(value)).toThrow();
  });
});
