import { describe, expect, it } from "vitest";

import { famousExportRecordOverrides } from "./famousExportRecordOverrides";
import { famousLexiconSupplement } from "./famousLexiconSupplement";

/**
 * Recovered migration records must not describe themselves as reviewed.
 *
 * Two mechanisms currently hold that line, and only one of them is doing the
 * work:
 *
 *  1. The module-level loop at the foot of famousLexiconSupplement.ts re-pins
 *     review_state, validation_status and confidence — but ONLY for slugs
 *     present in famousExportRecordOverrides. All ten recovered slugs happen to
 *     have an override today, so this is the effective enforcer.
 *  2. The `recovered()` factory pins the same fields after its `...extra`
 *     spread. This is defence in depth: it only decides anything for a record
 *     the loop does not reach.
 *
 * Mechanism 1 silently stops covering an entry the moment someone adds a
 * recovered record without a matching override — and mechanism 2 is invisible
 * until that happens. So the load-bearing assertion here is the coverage one:
 * it fails at the moment the gap opens, rather than after an unreviewed record
 * has already shipped claiming validation.
 */

describe("famous lexicon supplement integrity", () => {
  it("keeps every recovered slug inside the re-pin loop's coverage", () => {
    // The guard that actually catches the regression. An entry outside this set
    // depends entirely on the factory pin, which no runtime assertion covers.
    const uncovered = famousLexiconSupplement
      .map((entry) => entry.slug)
      .filter((slug) => !famousExportRecordOverrides[slug]);

    expect(
      uncovered,
      `recovered slugs with no export override are not re-pinned to draft: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("holds every recovered record at draft review state", () => {
    expect(famousLexiconSupplement.length).toBeGreaterThan(0);
    for (const entry of famousLexiconSupplement) {
      expect(entry.review_state, `${entry.id} is not draft`).toBe("draft");
    }
  });

  it("never claims validation or confidence for a recovered record", () => {
    for (const entry of famousLexiconSupplement) {
      expect(entry.provenance?.validation_status, `${entry.id} claims validation`).toBe("draft");
      expect(entry.provenance?.confidence, `${entry.id} claims confidence`).toBe("not_assessed");
    }
  });

  it("binds every recovered record to its own source record id", () => {
    const recordIds = famousLexiconSupplement.map((entry) => entry.provenance?.source_record_id);
    expect(new Set(recordIds).size).toBe(famousLexiconSupplement.length);
  });

  it("keeps the per-term scientific layers that extra supplies", () => {
    // Pinning after the spread must not have swallowed `extra` wholesale.
    const withRelated = famousLexiconSupplement.filter(
      (entry) => (entry.related_terminology?.length ?? 0) > 0,
    );
    expect(withRelated.length).toBeGreaterThan(0);
  });
});
