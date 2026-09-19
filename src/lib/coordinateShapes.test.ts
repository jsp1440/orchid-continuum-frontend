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
import { carriesCoordinate } from "./cognitiveIntegration";

describe("shapes that reached the DOM before", () => {
  it("catches what3words written without the /// prefix", () => {
    // ~3m, finer than any decimal pair the scanner already caught.
    expect(carriesCoordinate("filled.count.soap")).toBe(true);
    expect(carriesCoordinate("///filled.count.soap")).toBe(true);
  });

  it("catches a projected pair joined by an underscore", () => {
    // The panel rewrites `_` to a space before painting, so this passed the
    // scan and the render then synthesised `632540 5712345` in the locality
    // footer -- the page manufacturing the coordinate it certified absent.
    expect(carriesCoordinate("632540_5712345")).toBe(true);
    expect(carriesCoordinate("632540 5712345")).toBe(true);
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
