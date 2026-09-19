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
    expect(text).toMatch(/Mediterranean range/);
    expect(text).toMatch(/North-western range/);
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
    expect(text).toMatch(/moderate/i);
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
