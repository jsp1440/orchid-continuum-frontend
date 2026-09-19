// @vitest-environment jsdom

/**
 * Every coordinate shape a checker has got onto this page, against every field
 * this page paints.
 *
 * Two rounds of review found sixteen shapes and then 146 (shape x field)
 * leaks, each one under a footer asserting that none had arrived. The lesson
 * of both rounds is that a defence tested against the shapes its author
 * imagined will be broken by the next reader. So this is a matrix rather than
 * a list of cases: adding a shape or a rendered field extends the product
 * automatically, and a new sink cannot be added without being covered.
 *
 * The second assertion matters as much as the first. The footer must never
 * claim the page is clean, because a pattern list finding nothing is not the
 * same as nothing being there.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/lib/__fixtures__/cognitiveIntegrationReasoningMap.json";
import type { ReasoningMap } from "@/lib/cognitiveIntegration";

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>("@/contexts/AuthContext");
  return { ...actual, useAuth: vi.fn(() => ({ session: null })) };
});
const { ReasoningMapView } = await import("@/components/calyx/ReasoningMapPanel");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHAPES: [string, string][] = [
  ["OS grid spaced", "SP 51234 06789"],
  ["OS grid short", "TQ1234"],
  ["geohash", "gcpuvpk44"],
  ["Swiss grid", "CH1903 600000 200000"],
  ["Devanagari", "११.७५२३, -१.२५७८"],
  ["Arabic-Indic", "٥١.٧٥٢٣, -١.٢٥٧٨"],
  ["hemisphere first", "N 51.7523, W 1.2578"],
  ["underscore pair", "51.7523_-1.2578"],
  ["plain pair", "51.7523, -1.2578"],
];

const SINKS: [string, (m: ReasoningMap, v: string) => void][] = [
  ["question", (m, v) => { m.question = v; }],
  ["accepted_name", (m, v) => { m.taxonomic_identity.accepted_name = v; }],
  ["authorship", (m, v) => { m.taxonomic_identity.authorship = v; }],
  ["resolved_against", (m, v) => { m.taxonomic_identity.resolved_against = v; }],
  ["r0.subject", (m, v) => { m.relationships[0].subject = v; }],
  ["r0.predicate", (m, v) => { m.relationships[0].predicate = v; }],
  ["r0.object", (m, v) => { m.relationships[0].object = v; }],
  ["r0.geographic_scope", (m, v) => { m.relationships[0].geographic_scope = v; }],
  ["r0.citation", (m, v) => { m.relationships[0].provenance[0].citation = v; }],
  ["geo.scope", (m, v) => { m.geographic_context.scope = v; }],
  ["geo.notes[0]", (m, v) => { m.geographic_context.environmental_notes[0] = v; }],
  ["mech[0].statement", (m, v) => { m.mechanisms[0].statement = v; }],
  ["evidence_gaps[0]", (m, v) => { m.evidence_gaps[0] = v; }],
  ["known_unknowns[0]", (m, v) => { m.known_unknowns[0] = v; }],
  ["confidence.basis", (m, v) => { m.confidence.basis = v; }],
  ["next[0]", (m, v) => { m.recommended_next_evidence[0] = v; }],
  ["contra.description", (m, v) => { m.contradictions[0].description = v; }],
  ["contra.between[0]", (m, v) => { m.contradictions[0].between[0] = v; }],
  ["contra.scopes[0]", (m, v) => { m.contradictions[0].scopes[0] = v; }],
];

describe("every known coordinate shape, against every rendered field", () => {
  it("none reaches the DOM, and the footer never certifies absence", () => {
    const leaks: string[] = [];
    let falseClean = 0;
    for (const [shapeName, payload] of SHAPES) {
      for (const [sinkName, poison] of SINKS) {
        const container = document.createElement("div");
        document.body.appendChild(container);
        let root!: Root;
        act(() => { root = createRoot(container); });
        const m = structuredClone(fixture) as unknown as ReasoningMap;
        poison(m, payload);
        act(() => { root.render(<ReasoningMapView map={m} />); });
        const dom = `${container.textContent ?? ""} ${container.innerHTML}`;
        if (dom.includes(payload)) leaks.push(`${shapeName} -> ${sinkName}`);
        const footer = container.querySelector('[data-testid="reasoning-locality"]')?.textContent ?? "";
        if (/none carried a coordinate|no coordinates appear/i.test(footer)) falseClean += 1;
        act(() => root.unmount());
        container.remove();
      }
    }
    expect(leaks).toEqual([]);
    expect(falseClean).toBe(0);
  });
});
