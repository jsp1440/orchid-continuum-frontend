import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/RelationshipMatrixNext.tsx"), "utf8");

describe("Relationship Matrix canonical-source mode", () => {
  it("uses the governed canonical-source endpoint as the primary mode", () => {
    expect(source).toContain('useState<SourceMode>("canonical")');
    expect(source).toContain("/api/matrix-relationship/build-from-canonical-source");
    expect(source).toContain('source_mode === "canonical_governed_source"');
  });

  it("accepts a bounded canonical genus handoff and sends it only as backend scope", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain('searchParams.get("genus")');
    expect(source).toContain("SAFE_CANONICAL_GENUS");
    expect(source).toContain("parseCanonicalGenus");
    expect(source).toContain("genus: parseCanonicalGenus(genusText)");
    expect(source).toContain("Canonical genus scope (optional)");
    expect(source).toContain("only scopes the evidence read; it is not itself evidence");
    expect(source).toContain("genus_scope?: string | null");
  });

  it("keeps manual assertions as an explicit secondary review/test mode", () => {
    expect(source).toContain('type SourceMode = "canonical" | "manual"');
    expect(source).toContain("/api/matrix-relationship/build");
    expect(source).toContain("Manual assertions");
  });

  it("limits the UI to governed dimensions exposed by the backend source adapter", () => {
    for (const dimension of [
      "pollinator",
      "mycorrhizal_partner",
      "literature",
      "trait",
      "conservation_status",
      "geography",
      "elevation",
    ]) {
      expect(source).toContain(`"${dimension}"`);
    }
  });

  it("renders canonical cell provenance through an explicit bounded allowlist", () => {
    expect(source).toContain("SAFE_PROVENANCE_KEYS");
    expect(source).toContain("safeProvenanceEntries");
    expect(source).toContain("Evidence provenance");
    for (const key of [
      "source_domain",
      "source_query_id",
      "source_pk",
      "evidence_citation",
      "citation",
      "doi",
      "support_count",
      "confidence_label",
      "iucn_category",
      "cites_appendix",
      "country",
      "elevation",
    ]) {
      expect(source).toContain(`"${key}"`);
    }
    expect(source).toContain('result.source_mode === "canonical_governed_source"');
    expect(source).toContain("arbitrary provenance keys are never displayed");
  });

  it("continues canonical genus subjects through governed Atlas and matrix-specific Calyx helpers only", () => {
    expect(source).toContain("featuredTaxonAtlasHref");
    expect(source).toContain("relationshipMatrixCalyxHref");
    expect(source).not.toContain("featuredTaxonCalyxHref");
    expect(source).toContain("governedGenusContinuation");
    expect(source).toContain("Genus continuation carries canonical genus context only; Matrix cells remain the evidence surface.");
    expect(source).not.toContain('to={`/atlas/');
    expect(source).not.toContain('to={`/speak-with-calyx');
    expect(source).not.toContain('href={`/atlas/');
    expect(source).not.toContain('href={`/speak-with-calyx');
  });

  it("preserves locality and epistemic boundaries", () => {
    expect(source).toContain("Geography is country-level only");
    expect(source).toContain("elevation is a recorded occurrence value, not an inferred range");
    expect(source).toContain("Precise locality and coordinates are not requested or rendered here");
    expect(source).toContain("A missing relationship is not evidence that the relationship is biologically absent");
    expect(source).not.toContain('"decimalLatitude"');
    expect(source).not.toContain('"decimalLongitude"');
    expect(source).not.toContain('"latitude"');
    expect(source).not.toContain('"longitude"');
    expect(source).not.toContain('"locality"');
  });
});
