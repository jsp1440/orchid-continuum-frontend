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

  it("preserves locality and epistemic boundaries", () => {
    expect(source).toContain("Geography is country-level only");
    expect(source).toContain("elevation is a recorded occurrence value, not an inferred range");
    expect(source).toContain("Precise locality and coordinates are not requested or rendered here");
    expect(source).toContain("A missing relationship is not evidence that the relationship is biologically absent");
    expect(source).not.toContain("decimalLatitude");
    expect(source).not.toContain("decimalLongitude");
  });
});
