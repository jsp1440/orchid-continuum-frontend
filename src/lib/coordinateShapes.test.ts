// @vitest-environment node

/**
 * Shapes an independent checker walked past the scanner, and the science that
 * must keep rendering.
 *
 * The checker built 30 coordinate shapes across 22 sinks and got 86 of 660
 * renders to put a coordinate-shaped string into the DOM. Four families were
 * responsible. These are those four, plus the values that must not be redacted
 * to reach them -- a redactor that mangles the provenance this panel exists to
 * show is defending the page by making it useless.
 */

import { describe, expect, it } from "vitest";
import {
  WITHHELD_COORDINATE,
  carriesCoordinate,
  sanitiseMap,
} from "./cognitiveIntegration";
import type { ReasoningMap } from "./cognitiveIntegration";
import fixture from "./__fixtures__/cognitiveIntegrationReasoningMap.json";

describe("shapes that reached the DOM before", () => {
  it("catches what3words written without the /// prefix", () => {
    // ~3m, finer than any decimal pair the scanner already caught.
    expect(carriesCoordinate("filled.count.soap")).toBe(true);
    expect(carriesCoordinate("///filled.count.soap")).toBe(true);
  });

  it("catches a bare projected pair however it is joined", () => {
    // An underscore hides an easting and northing no better than a space, so
    // this is withheld wherever it appears, not only where the panel repaints.
    // Anchoring to the whole field is what keeps it off the identifiers below.
    expect(carriesCoordinate("632540 5712345")).toBe(true);
    expect(carriesCoordinate("632540_5712345")).toBe(true);
  });

  it("catches degrees and decimal minutes with no symbol", () => {
    // What a GPS receiver emits. ~10m, and it writes no decimal pair.
    expect(carriesCoordinate("5145.20N 0115.47W")).toBe(true);
  });

  it("catches integer degrees with hemispheres", () => {
    // Coarse at ~100km, but the whole-number form of a covered shape.
    expect(carriesCoordinate("51N 1W")).toBe(true);
  });
});

describe("the science this page exists to show", () => {
  const renders = [
    ["a citation", "Kullenberg, B. (1961). Studies in Ophrys pollination. Zoologiska Bidrag fran Uppsala 34: 1-340."],
    ["Darwin 1862", "Darwin, C. (1862). On the Various Contrivances by which British and Foreign Orchids are Fertilised by Insects."],
    ["a page range", "pp. 1-340"],
    ["a thousands separator", "1,763.29 kB"],
    // The traversal engine the panel displays. An unanchored what3words arm ate
    // this, which is why that arm is anchored to the whole field.
    ["the traversal engine", "app.brain.reasoning_map.ReasoningMapEngine"],
    ["a file name", "cognitiveIntegration.test.ts"],
    ["ordinary prose", "The reports carry different scopes, but nothing retrieved establishes that those scopes are separate places."],
  ] as const;

  for (const [what, text] of renders) {
    it(`renders ${what}`, () => expect(carriesCoordinate(text)).toBe(false));
  }
});

describe("what this still does not catch, stated rather than hidden", () => {
  it("redacts a bare hostname standing alone as a whole field", () => {
    // Accepted cost of the anchored what3words arm: three lowercase words is
    // the same shape either way. A hostname inside prose or a URL is unaffected.
    expect(carriesCoordinate("docs.example.com")).toBe(true);
    expect(carriesCoordinate("see docs.example.com for the dataset")).toBe(false);
  });

  it("does not catch what3words buried mid-sentence without the prefix", () => {
    // The unanchored form redacted the engine path above. Closing this needs a
    // discriminator between an address and a dotted identifier, which is a
    // design decision rather than a pattern tweak.
    expect(carriesCoordinate("the colony sits at filled.count.soap today")).toBe(false);
  });
});

describe("what the repaint must not eat", () => {
  // The DDM arm inherited the `i` flag and ate lowercase w and s, so a lamp
  // wattage erased a whole environmental_notes entry. Both halves now required.
  const renders = [
    "A 150.0 W lamp over the bench",
    "600.0 W HPS, 12 h photoperiod",
    "1000.5 W metal halide",
    "exposure 1234.5 s",
    "600.5 s between captures",
    // Assuming the underscore rewrite everywhere ate these. Only three of the
    // panel's fields are repainted, and none of these is one of them.
    "specimen_12345_67890",
    "OC_51234_06789",
    "GBIF_1234567_890123",
    "node_1234567_89012",
  ];
  for (const text of renders) {
    it(`renders ${text}`, () => expect(carriesCoordinate(text)).toBe(false));
  }

  it("still catches the real DDM pair", () => {
    expect(carriesCoordinate("5145.20N 0115.47W")).toBe(true);
  });

  it("catches a what3words address ending a sentence", () => {
    expect(carriesCoordinate("filled.count.soap.")).toBe(true);
    expect(carriesCoordinate("filled.count.soap,")).toBe(true);
  });
});

describe("the repaint, and the footer count that has to match it", () => {
  const poisoned = (disclosure: string) => {
    const map = JSON.parse(JSON.stringify(fixture)) as ReasoningMap;
    (map.locality_policy as { disclosure: string }).disclosure = disclosure;
    return sanitiseMap(map);
  };

  it("withholds a pair the repaint would synthesise, and counts it", () => {
    const { map, scan } = poisoned("632540_5712345");
    expect(map.locality_policy.disclosure).toBe(WITHHELD_COORDINATE);
    // The count is the point. Withholding at the render site fixed the leak
    // but never reached here, so the page printed the marker and said in the
    // same sentence that nothing had matched.
    expect(scan.fieldsWithheld).toBeGreaterThan(0);
  });

  it("repaints an ordinary predicate without withholding it", () => {
    const { map, scan } = poisoned("WITHHELD_PENDING_REVIEW");
    expect(map.relationships[0].predicate).toBe("reported pollinated by");
    expect(map.locality_policy.disclosure).toBe("WITHHELD PENDING REVIEW");
    expect(scan.fieldsWithheld).toBe(0);
  });
});

describe("prose the grid-reference arm used to blank", () => {
  // `[HNOST][A-Z]` in a list built with `i` matched any two-letter word
  // starting h, n, o, s or t -- of, no, to, st, so, he -- and both spaces
  // being optional meant one digit run satisfied the rest. "a survey of 1961
  // records" was an Ordnance Survey grid reference to this scanner, and
  // withholding takes the whole field. The shipped fixture escaped only
  // because its citation reads `Kullenberg, B. (1961)`.
  const renders = [
    "a survey of 1961 records",
    "notes of 1862 refer to it",
    "the population of 1200 plants",
    "no 12345 was recorded",
    "south of 1961",
    "st 12345 marks the site",
    "to 1234 5678 metres",
    "held 1961 records of 3400 plants",
    "voucher 12345 of 67890 collected",
    "exposure 12 s 34 w lamp",
  ];
  for (const text of renders) {
    it(`renders "${text}"`, () => expect(carriesCoordinate(text)).toBe(false));
  }

  const grids = ["SP 51234 06789", "TQ1234", "NY 1234 5678", "ST 12 34", "51N 1W"];
  for (const text of grids) {
    it(`still catches ${text}`, () => expect(carriesCoordinate(text)).toBe(true));
  }
});
