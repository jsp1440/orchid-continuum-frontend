// @vitest-environment jsdom

/**
 * Calyx must show reasoning, not a verdict.
 *
 * The fixture these tests run against is **the backend's live output**, captured
 * from `app/cognitive_integration/executor.py`, not a hand-written sample. So a
 * change on either side that breaks the shared contract fails here.
 *
 * The property under test throughout is that five things stay apart on screen:
 * evidence, hypothesis, contradiction, uncertainty and unknown. Collapsing any
 * two is what would turn a genuinely contested question into a confident answer.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import liveBackendMap from "@/lib/__fixtures__/cognitiveIntegrationReasoningMap.json";
import type { ReasoningMap, ReasoningMapResult } from "@/lib/cognitiveIntegration";

const map = liveBackendMap as unknown as ReasoningMap;

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );
  return { ...actual, useAuth: vi.fn(() => ({ session: null })) };
});

const { default: ReasoningMapPanel, ReasoningMapView } = await import(
  "@/components/calyx/ReasoningMapPanel"
);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode) {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the reasoning map as Calyx renders it", () => {
  it("says the sources disagree rather than giving an answer", () => {
    render(<ReasoningMapView map={map} />);
    expect(container.querySelector('[data-testid="reasoning-unsettled"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reasoning-answer"]')).toBeNull();
    expect(container.textContent).toMatch(/sources disagree/i);
    expect(container.textContent).toMatch(/neither is presented as the answer/i);
  });

  it("gives an answer only when nothing is left contested", () => {
    const settled: ReasoningMap = {
      ...map,
      contradictions: [{ ...map.contradictions[0], resolution: "resolved_by_scope" }],
    };
    render(<ReasoningMapView map={settled} />);
    expect(container.querySelector('[data-testid="reasoning-answer"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reasoning-unsettled"]')).toBeNull();
  });

  it("shows both sides of the disagreement with the place each came from", () => {
    render(<ReasoningMapView map={map} />);
    const block = container.querySelector('[data-testid="reasoning-contradictions"]');
    expect(block).not.toBeNull();
    const text = block?.textContent ?? "";
    // Both scopes come from the fixture. They are deliberately asymmetric —
    // autogamy is predominant throughout the range while insect pollination is
    // a sporadic local exception — so a hardcoded "Mediterranean versus
    // north-west" here would pin a tidier split than the record supports.
    for (const scope of map.contradictions[0].scopes) {
      expect(scope).toBeTruthy();
      expect(text).toContain(scope as string);
    }
    expect(text).toMatch(/Left standing/i);
  });

  it("labels every claim with what kind of evidence it is", () => {
    render(<ReasoningMapView map={map} />);
    const states = Array.from(container.querySelectorAll('[data-testid="evidence-state"]'));
    expect(states.length).toBe(map.relationships.length);
    expect(states.length).toBeGreaterThan(0);
    const labels = states.map((node) => node.textContent);
    expect(labels).toContain("Supported by a source");
    expect(labels).toContain("Sources disagree");
    expect(labels).toContain("Reported, not corroborated");
  });

  it("shows a citation for every claim it displays", () => {
    render(<ReasoningMapView map={map} />);
    const evidence = container.querySelector('[data-testid="reasoning-evidence"]')?.textContent ?? "";
    for (const relationship of map.relationships) {
      expect(evidence).toContain(relationship.provenance[0].citation);
    }
  });

  it("presents mechanisms as proposals, including the one where nothing is going on", () => {
    render(<ReasoningMapView map={map} />);
    const text = container.querySelector('[data-testid="reasoning-mechanisms"]')?.textContent ?? "";
    expect(text).toMatch(/Proposed/);
    expect(text).toMatch(/Competing/);
    expect(text).toMatch(/If no relationship exists/);
  });

  it("states what is missing instead of leaving it out", () => {
    render(<ReasoningMapView map={map} />);
    const text = container.querySelector('[data-testid="reasoning-unknowns"]')?.textContent ?? "";
    expect(map.evidence_gaps.length).toBeGreaterThan(0);
    for (const gap of map.evidence_gaps) expect(text).toContain(gap);
    for (const unknown of map.known_unknowns) expect(text).toContain(unknown);
  });

  it("gives confidence in words with its reason, and never as a number", () => {
    render(<ReasoningMapView map={map} />);
    const block = container.querySelector('[data-testid="reasoning-confidence"]');
    const text = block?.textContent ?? "";
    // Read the level from the fixture rather than hardcoding it: the backend
    // derives it from the contradictions and gaps it actually found, so pinning
    // a literal here would fail whenever the evidence changes rather than when
    // the rendering does.
    expect(text.toLowerCase()).toContain(map.confidence.qualitative);
    expect(text).toContain(map.confidence.basis);
    expect(text).not.toMatch(/\d+\s*%/);
    expect(map.confidence.numeric_precision_claimed).toBe(false);
  });

  it("says what would settle the question", () => {
    render(<ReasoningMapView map={map} />);
    const text = container.querySelector('[data-testid="reasoning-next"]')?.textContent ?? "";
    for (const item of map.recommended_next_evidence) expect(text).toContain(item);
  });

  it("never renders a coordinate", () => {
    render(<ReasoningMapView map={map} />);
    expect(container.textContent).not.toMatch(/[-+]?\d{1,3}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,}/);
    expect(container.innerHTML).not.toMatch(/lat(itude)?\s*[=:]\s*-?\d/i);
    expect(container.querySelector('[data-testid="reasoning-locality"]')?.textContent).toMatch(
      /withheld/i,
    );
  });

  it("says plainly that the reasoning was not AI-generated", () => {
    render(<ReasoningMapView map={map} />);
    expect(container.querySelector('[data-testid="reasoning-assembly"]')?.textContent).toMatch(
      /no AI generation/i,
    );
  });

  it("distinguishes generated prose from generated reasoning when a provider was used", () => {
    const withProse: ReasoningMap = {
      ...map,
      execution: { ...map.execution!, explanation: "In short…", explanation_available: true, provider_calls: 1 },
    };
    render(<ReasoningMapView map={withProse} />);
    const text = container.querySelector('[data-testid="reasoning-assembly"]')?.textContent ?? "";
    expect(text).toMatch(/summary was AI-generated/i);
    expect(text).toMatch(/evidence and reasoning below it were not/i);
  });

  it("offers the Research Station handoff with evidence states intact", () => {
    render(<ReasoningMapView map={map} />);
    expect(container.querySelector('[data-testid="reasoning-handoff"]')?.textContent).toMatch(
      /evidence states intact/i,
    );
  });
});

describe("when the map cannot be retrieved", () => {
  it("shows nothing rather than a guess", async () => {
    const loader = async (): Promise<ReasoningMapResult> => ({
      ok: false,
      kind: "unavailable",
      message: "The reasoning map is unavailable (HTTP 503).",
    });
    await act(async () => {
      root.render(<ReasoningMapPanel loader={loader} />);
    });
    const block = container.querySelector('[data-testid="reasoning-unavailable"]');
    expect(block).not.toBeNull();
    expect(block?.textContent).toMatch(/Nothing is shown rather than a guess/i);
    expect(container.querySelector('[data-testid="reasoning-map"]')).toBeNull();
  });

  it("explains what an unsupported question would need, instead of answering it anyway", async () => {
    const loader = async (): Promise<ReasoningMapResult> => ({
      ok: false,
      kind: "question_not_supported",
      message: "This question is not one the stored decomposition covers.",
      requiredCapability: "free-text-intent-parsing",
      supportedQuestions: ["What pollinates the bee orchid, and is the answer the same everywhere it grows?"],
    });
    await act(async () => {
      root.render(<ReasoningMapPanel loader={loader} />);
    });
    expect(container.textContent).toMatch(/outside what the system can answer/i);
    // "What it would need" is the capability the backend names in the refusal.
    // Asserting only the example list leaves that field dead on this surface.
    expect(
      container.querySelector('[data-testid="reasoning-required-capability"]')?.textContent,
    ).toContain("free-text-intent-parsing");
    expect(
      container.querySelector('[data-testid="reasoning-supported-questions"]')?.textContent,
    ).toMatch(/bee orchid/i);
  });

  it("renders the map once it loads", async () => {
    const loader = async (): Promise<ReasoningMapResult> => ({ ok: true, map });
    await act(async () => {
      root.render(<ReasoningMapPanel loader={loader} />);
    });
    expect(container.querySelector('[data-testid="reasoning-map"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reasoning-question"]')?.textContent).toBe(
      map.question,
    );
  });
});

describe("the fixture is the backend's real output", () => {
  it("carries the shape the backend executor produces", () => {
    expect(map.schema_version).toBe("1.0.0");
    expect(map.execution?.traversal?.engine).toBe("app.brain.reasoning_map.ReasoningMapEngine");
    expect(map.execution?.provider_calls).toBe(0);
    expect(map.taxonomic_identity.accepted_name).toBe("Ophrys apifera");
    expect(map.governance.automatic_knowledge_promotion).toBe(false);
  });
});

/**
 * Each of these reproduces a defect an independent checker got through the
 * rendered surface on PR #705. They are written as the checker demonstrated
 * them — construct the input, render, read the DOM — so that a regression
 * reappears here rather than in a review.
 */
describe("what an independent checker got through this surface", () => {
  function variant(edit: (draft: ReasoningMap) => void): ReasoningMap {
    const draft = structuredClone(map);
    edit(draft);
    return draft;
  }

  // The refused-question capability is covered above, in the test whose name
  // promised it: "explains what an unsupported question would need".

  it("withholds coordinates in every field, whatever the map claims about itself", () => {
    // The seven shapes that reached the DOM, in the fields they reached it through.
    const poisoned = variant((draft) => {
      draft.relationships[0].provenance[0].citation = "Field notes, 51.752300, -1.257800";
      draft.relationships[0].geographic_scope = "51.75213, -1.25782";
      draft.relationships[1].provenance[0].citation = "Survey at 50°45'12\"N";
      draft.mechanisms[0].statement = "Observed at 45.464200, 9.190000.";
      draft.evidence_gaps = ["No survey near 48.856600, 2.352200."];
      draft.confidence.basis = "Based on records at 40.416800, -3.703800.";
      draft.recommended_next_evidence = ["Resurvey 52.520000, 13.405000."];
      draft.geographic_context.environmental_notes = ["Transect at lat 51.7520 lon -1.2577."];
    });
    render(<ReasoningMapView map={poisoned} />);

    const rendered = `${container.textContent ?? ""} ${container.innerHTML}`;
    for (const leak of [
      "51.752300",
      "-1.257800",
      "51.75213",
      "50°45'12\"N",
      "45.464200",
      "48.856600",
      "40.416800",
      "52.520000",
      "lat 51.7520",
    ]) {
      expect(rendered).not.toContain(leak);
    }

    // And it says what it did, rather than asserting a guarantee it did not keep.
    const footer = container.querySelector('[data-testid="reasoning-locality"]');
    expect(footer?.textContent).toContain("withheld a coordinate");
    expect(footer?.textContent).not.toContain("none carried a coordinate");
    expect(
      container.querySelector('[data-testid="reasoning-locality-breach"]'),
    ).not.toBeNull();
  });

  it("states plainly that it found nothing when the map is clean", () => {
    render(<ReasoningMapView map={map} />);
    const footer = container.querySelector('[data-testid="reasoning-locality"]');
    expect(footer?.textContent).toContain("none carried a coordinate");
    expect(
      container.querySelector('[data-testid="reasoning-locality-breach"]'),
    ).toBeNull();
  });

  it("does not call a question answered while a relationship is still contested", () => {
    // A CONTESTED relationship with nothing written up about it is a
    // disagreement the map has not accounted for, not a settled answer.
    const undescribed = variant((draft) => {
      draft.contradictions = [];
    });
    expect(
      undescribed.relationships.some((r) => r.evidence_state === "CONTESTED"),
    ).toBe(true);
    render(<ReasoningMapView map={undescribed} />);
    expect(container.querySelector('[data-testid="reasoning-answer"]')).toBeNull();
    expect(container.querySelector('[data-testid="reasoning-unsettled"]')).not.toBeNull();
  });

  it("does not describe an evidence-resolved contradiction as left standing", () => {
    const resolved = variant((draft) => {
      draft.contradictions[0].resolution = "resolved_by_evidence";
    });
    render(<ReasoningMapView map={resolved} />);
    const note = container.querySelector('[data-testid="contradiction-resolution"]');
    expect(note?.textContent).toContain("Settled by the retrieved evidence");
    expect(note?.textContent).not.toContain("Left standing");
  });

  it("does not reduce a scope-resolved disagreement to one account", () => {
    const byScope = variant((draft) => {
      draft.contradictions[0].resolution = "resolved_by_scope";
    });
    render(<ReasoningMapView map={byScope} />);
    const headline = container.querySelector("[data-settlement]");
    expect(headline?.getAttribute("data-settlement")).toBe("settled_by_scope");
    // Both survive, partitioned. Saying "one account" discards the other half.
    expect(headline?.textContent).not.toContain("one account");
    expect(headline?.textContent).toContain("Neither replaces the other");
  });

  it("distinguishes an empty gap list from a complete body of evidence", () => {
    const noGaps = variant((draft) => {
      draft.evidence_gaps = [];
      draft.known_unknowns = [];
    });
    render(<ReasoningMapView map={noGaps} />);
    const gaps = container.querySelector('[data-testid="reasoning-gaps"]');
    expect(gaps?.querySelectorAll("li")).toHaveLength(0);
    expect(gaps?.textContent).toContain("not a finding that the evidence is complete");
  });

  it("writes the contradiction in the same English as the rest of the page", () => {
    render(<ReasoningMapView map={map} />);
    const block = container.querySelector('[data-testid="reasoning-contradictions"]');
    expect(block?.textContent).not.toMatch(/[a-z]_[a-z]/);
    expect(block?.textContent).toContain("reported pollinated by");
  });

  it("counts a refuted claim as contradicted, not as merely uncorroborated", () => {
    const refuted = variant((draft) => {
      draft.relationships[draft.relationships.length - 1].evidence_state = "REFUTED";
    });
    render(<ReasoningMapView map={refuted} />);
    const tally = container.querySelector('[data-testid="evidence-tally"]');
    expect(tally?.textContent).toContain("1 contradicted");
  });

  it("renders the geographic context the reasoning path requires", () => {
    render(<ReasoningMapView map={map} />);
    const geography = container.querySelector('[data-testid="reasoning-geography"]');
    expect(geography).not.toBeNull();
    expect(geography?.textContent).toContain(map.geographic_context.scope);
  });
});
