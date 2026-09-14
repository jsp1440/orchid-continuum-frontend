import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The global heading rule must not hard-set a colour.
 *
 * It used to say `color: #1c1a17`, which paints ink on every h1–h6 on the site
 * whatever is behind it. On the dark panels — Mission Control's sign-in, the
 * About and Ecosystems heroes, the knowledge layer, the Orchids on screen
 * essay — that renders near-black on near-black at a contrast of about 1.05:1.
 * Measured across the mounted routes it made 18 headings on 13 routes
 * unreadable. They did not look faint; they looked absent, and the pages read
 * as though their titles had failed to load.
 *
 * Asserting the stylesheet is deliberate. Deciding what is behind a heading
 * from a rendered page cannot be done soundly — the dark sections here are
 * painted by positioned layers that are not the heading's ancestors — so a
 * browser check for this reports correct pages as broken. The rule itself is
 * unambiguous, and it is the thing that regressed.
 */

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function globalHeadingRule(): string {
  const match = /\bh1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{([\s\S]*?)\}/.exec(css);
  if (!match) throw new Error("The global h1–h6 rule is no longer in src/index.css.");
  return match[1];
}

describe("global heading colour", () => {
  it("is inherited rather than pinned to one ink value", () => {
    const rule = globalHeadingRule();
    expect(rule).toMatch(/color:\s*inherit\s*;/);
  });

  it("names no literal colour, which would be ink on a dark section", () => {
    // Comments carry the old value as an explanation, so they are stripped
    // before looking — otherwise the rule's own history would fail this.
    const declarations = globalHeadingRule().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/color:\s*(#|rgb|hsl)/i);
  });

  it("still sets the display face and weight it is there for", () => {
    const rule = globalHeadingRule();
    expect(rule).toMatch(/font-family:\s*'Playfair Display'/);
    expect(rule).toMatch(/font-weight:\s*500/);
  });
});
