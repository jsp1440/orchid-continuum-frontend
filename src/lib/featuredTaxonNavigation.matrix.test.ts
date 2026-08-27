import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_MATRIX_ORIGIN,
  featuredTaxonMatrixHref,
  relationshipMatrixCalyxHref,
} from "@/lib/featuredTaxonNavigation";

describe("Relationship Matrix governed genus handoffs", () => {
  it("carries only canonical genus read scope from the homepage into Matrix", () => {
    expect(featuredTaxonMatrixHref("Phalaenopsis")).toBe(
      "/relationship-matrix-next?genus=Phalaenopsis",
    );
    expect(featuredTaxonMatrixHref("Paphiopedilum")).toBe(
      "/relationship-matrix-next?genus=Paphiopedilum",
    );
  });

  it("carries only canonical genus context with a matrix-specific non-evidence origin into Calyx", () => {
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
    expect(() => featuredTaxonMatrixHref(value)).toThrow();
    expect(() => relationshipMatrixCalyxHref(value)).toThrow();
  });

  it("does not create a URL channel for homepage evidence or locality state", () => {
    const href = featuredTaxonMatrixHref("Phalaenopsis");
    expect(href).not.toContain("latitude");
    expect(href).not.toContain("longitude");
    expect(href).not.toContain("locality");
    expect(href).not.toContain("confidence");
    expect(href).not.toContain("evidence");
    expect(href).not.toContain("conclusion");
  });
});
