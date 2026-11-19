/**
 * The sanitiser, tested directly.
 *
 * Some of its guarantees cannot be observed through the rendered panel,
 * because two of them overlap: redaction leaves vocabulary fields alone, *and*
 * the panel reads its semantics from the map as received. Either alone would
 * hide a regression in the other from a DOM-level test. Mutation testing
 * showed exactly that — five defences the panel's own suite could not see.
 */

import { describe, expect, it } from "vitest";

import fixture from "@/lib/__fixtures__/cognitiveIntegrationReasoningMap.json";
import {
  type ReasoningMap,
  carriesCoordinate,
  sanitiseLocality,
  settlement,
} from "@/lib/cognitiveIntegration";

const base = fixture as unknown as ReasoningMap;

function variant(edit: (draft: ReasoningMap) => void): ReasoningMap {
  const draft = structuredClone(base);
  edit(draft);
  return draft;
}

describe("redaction may never rewrite a vocabulary field", () => {
  it("leaves evidence_state intact when the record around it is withheld", () => {
    // The F-1 failure: the split-pair net overwrote every string property of
    // the record, `evidence_state` included, so a CONTESTED relationship left
    // `contestedRelationships()` and the headline read "one account".
    const poisoned = variant((draft) => {
      draft.relationships[0].subject = "Colony 51.7523";
      draft.relationships[0].object = "north by -1.2578 west";
    });
    expect(poisoned.relationships[0].evidence_state).toBe("CONTESTED");

    const { value } = sanitiseLocality(poisoned);
    expect(value.relationships[0].subject).not.toContain("51.7523");
    expect(value.relationships[0].object).not.toContain("-1.2578");
    expect(value.relationships[0].evidence_state).toBe("CONTESTED");
  });

  it("leaves a mechanism kind, a resolution and a confidence level intact", () => {
    const poisoned = variant((draft) => {
      draft.mechanisms[0].statement = "Observed at 51.7523, -1.2578.";
      draft.confidence.basis = "Derived from 51.7523, -1.2578.";
    });
    const { value } = sanitiseLocality(poisoned);
    expect(value.mechanisms[0].kind).toBe(base.mechanisms[0].kind);
    expect(value.contradictions[0].resolution).toBe(base.contradictions[0].resolution);
    expect(value.confidence.qualitative).toBe(base.confidence.qualitative);
    expect(value.schema_version).toBe(base.schema_version);
  });
});

describe("semantics are read from the map as received", () => {
  it("a written-up contradiction still accounts for a withheld relationship", () => {
    // Display and judgement are different jobs. When the record's own text is
    // withheld, the sanitised copy can no longer be matched against the
    // contradiction that describes it — so the judgement has to be made on the
    // map that arrived, or withholding a coordinate silently changes what the
    // page concludes about the science.
    const poisoned = variant((draft) => {
      draft.relationships[0].subject = "Colony 51.7523";
      draft.relationships[0].object = "north by -1.2578 west";
      draft.contradictions = [
        {
          between: [
            "reported_pollinated_by north by -1.2578 west",
            "reported_reproductive_strategy Habitual self-pollination",
          ],
          description: "The two reports disagree.",
          resolution: "resolved_by_evidence",
          scopes: [null, null],
        },
      ];
    });
    const { value } = sanitiseLocality(poisoned);
    expect(settlement(poisoned)).toBe("settled");
    expect(settlement(value)).not.toBe("settled");
  });
});

describe("the pattern reaches shapes a reader would recognise as a position", () => {
  it("folds non-ASCII digits before matching", () => {
    // NFKC folds full-width digits because they are compatibility-equivalent
    // to ASCII. Devanagari and Arabic-Indic are not, and `\d` without `u`
    // cannot see them.
    expect(carriesCoordinate("२१.७५२३, -१.२५७८")).toBe(true);
    expect(carriesCoordinate("٥١.٧٥٢٣, -١.٢٥٧٨")).toBe(true);
  });

  it("treats an underscore as a separator, because the panel renders it as a space", () => {
    // `51.7523_-1.2578` is not a pair until the panel's `_` → ` ` transform
    // makes it one. Matching it here stops the page manufacturing the
    // coordinate it just certified as absent.
    expect(carriesCoordinate("51.7523_-1.2578")).toBe(true);
  });

  it("withholds a coordinate that arrives as a number rather than a string", () => {
    const poisoned = structuredClone(base) as unknown as Record<string, unknown>;
    (poisoned.geographic_context as Record<string, unknown>).latitude = 51.7523;
    const { value, fieldsWithheld } = sanitiseLocality(poisoned);
    const geography = (value as Record<string, unknown>).geographic_context as Record<string, unknown>;
    expect(geography.latitude).not.toBe(51.7523);
    expect(fieldsWithheld).toBeGreaterThan(0);
  });
});

describe("the split-pair net does not eat the provenance this page exists to show", () => {
  it.each([
    ["a morphometric pair", "Labellum 10.5 mm long and 8.25 mm wide"],
    ["a page range", "Darwin 1862, pp. 63.4 and 71.2 of the 1877 printing"],
    ["version numbers", "GBIF snapshot 1.5 processed with pipeline 2.7"],
  ])("keeps %s", (_label, citation) => {
    const poisoned = variant((draft) => {
      draft.relationships[0].provenance[0].citation = citation;
    });
    const { value } = sanitiseLocality(poisoned);
    expect(value.relationships[0].provenance[0].citation).toBe(citation);
  });

  it("does not redact the reader's own question against the schema version", () => {
    // `schema_version` is always "1.0.0", so under a two-decimals-in-80-chars
    // rule it permanently supplied half a pair: any question containing a
    // decimal had itself redacted at the top of the page.
    const poisoned = variant((draft) => {
      draft.question = "Does pollination differ above 2.5 m elevation?";
    });
    const { value } = sanitiseLocality(poisoned);
    expect(value.question).toBe("Does pollination differ above 2.5 m elevation?");
  });
});
