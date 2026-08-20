import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/components/calyx/AtlasAwareCalyxRoute.tsx"),
  "utf8",
);

describe("Atlas-aware Calyx return path", () => {
  it("returns to Atlas through the canonical featured-genus navigation contract", () => {
    expect(SOURCE).toContain('featuredTaxonAtlasHref');
    expect(SOURCE).toContain('const atlasHref = genus ? featuredTaxonAtlasHref(genus) : "/atlas"');
    expect(SOURCE).toContain('to={atlasHref}');
    expect(SOURCE).toContain('Return to Atlas');
  });

  it("does not rebuild the Atlas genera query inline", () => {
    expect(SOURCE).not.toContain('/atlas?genera=');
  });
});
