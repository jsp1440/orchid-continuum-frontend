import { describe, it, expect } from "vitest";
import { reconcileTaxon, affectedByTaxonomyChange, TAXONOMY_VERSION } from "./taxonomy";

describe("taxonomic reconciliation", () => {
  it("resolves an exact accepted name", () => {
    const r = reconcileTaxon("Phalaenopsis schilleriana");
    expect(r.synonymRelationship).toBe("accepted");
    expect(r.taxonId).toBe("wp:phal-schilleriana");
    expect(r.acceptedName).toBe("Phalaenopsis schilleriana");
    expect(r.ambiguous).toBe(false);
    expect(r.confidence).toBe(1);
  });

  it("resolves a synonym while preserving the published name", () => {
    const r = reconcileTaxon("Phalaenopsis grandiflora");
    expect(r.synonymRelationship).toBe("synonym");
    expect(r.acceptedName).toBe("Phalaenopsis amabilis");
    expect(r.nameAsPublished).toBe("Phalaenopsis grandiflora");
    expect(r.resolutionMethod).toBe("synonym_map");
  });

  it("never silently chooses between materially ambiguous taxa", () => {
    const r = reconcileTaxon("P. rosea");
    expect(r.ambiguous).toBe(true);
    expect(r.reviewRequired).toBe(true);
    expect(r.acceptedName).toBeNull();
    expect(r.taxonId).toBeNull();
    expect(r.candidates && r.candidates.length).toBeGreaterThan(1);
  });

  it("expands a unique abbreviated genus but flags an ambiguous one", () => {
    const unique = reconcileTaxon("P. schilleriana");
    expect(unique.taxonId).toBe("wp:phal-schilleriana");
    expect(unique.resolutionMethod).toBe("fuzzy");
  });

  it("returns unresolved (retained, review-required) for unknown names", () => {
    const r = reconcileTaxon("Phalaenopsis nonexistentia");
    expect(r.synonymRelationship).toBe("unresolved");
    expect(r.reviewRequired).toBe(true);
    expect(r.taxonId).toBeNull();
  });

  it("carries the taxonomy source release/version", () => {
    expect(reconcileTaxon("Phalaenopsis lowii").taxonomyVersion).toBe(TAXONOMY_VERSION);
  });

  it("reprocesses only records affected by a taxonomy version change", () => {
    const reconciled = [
      { taxonId: "wp:phal-schilleriana", taxonomyVersion: "2025-03" },
      { taxonId: "wp:phal-amabilis", taxonomyVersion: "2025-03" },
      { taxonId: null, taxonomyVersion: "2025-03" },
    ];
    expect(affectedByTaxonomyChange(reconciled, "2025-03")).toEqual([]);
    const affected = affectedByTaxonomyChange(reconciled, "2025-09");
    expect(affected).toEqual(["wp:phal-schilleriana", "wp:phal-amabilis"]);
  });
});
