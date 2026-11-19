// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import realBackend from "@/lib/__fixtures__/matrixIdentification.realBackend.json";

const mocks = vi.hoisted(() => ({
  listMatrixRegistries: vi.fn(),
  createIdentificationSession: vi.fn(),
  evaluateIdentificationSession: vi.fn(),
  explainIdentificationSession: vi.fn(),
}));

vi.mock("@/lib/matrixIdentification", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matrixIdentification")>("@/lib/matrixIdentification");
  return { ...actual, ...mocks };
});
vi.mock("@/components/matrix/MatrixLexiconGuide", () => ({ default: () => null }));
vi.mock("@/components/matrix/MatrixVisionReviewPanel", () => ({ default: () => null }));
vi.mock("@/features/calyx-workspace/sessionContext", () => ({ recordCalyxSurfaceContext: vi.fn() }));

import OrchidIdentificationNext from "./OrchidIdentificationNext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.listMatrixRegistries.mockResolvedValue(realBackend.registry_list.versions);
  mocks.createIdentificationSession.mockResolvedValue(realBackend.evaluate_observed.session);
  mocks.evaluateIdentificationSession.mockResolvedValue(realBackend.evaluate_observed);
  mocks.explainIdentificationSession.mockResolvedValue(realBackend.explain_comparison);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`button ${label} not found`);
  return found as HTMLButtonElement;
}

describe("guided identification renders the captured backend evidence", () => {
  it("shows ranking basis, per-candidate evidence, registry state and Calyx provenance", async () => {
    act(() => root.render(<MemoryRouter><OrchidIdentificationNext /></MemoryRouter>));
    await flush();
    await act(async () => { button("Begin guided identification").click(); });
    await flush();

    expect(container.querySelectorAll('[data-testid="matrix-candidate"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="matrix-ranking-basis"]')?.textContent).toContain(
      "4 observations recorded · 3 used for ranking (observations marked unknown are ignored",
    );
    expect(container.querySelector('[data-testid="matrix-registry-publication-state"]')?.textContent)
      .toBe("Publication state: review required");

    await act(async () => { button("Ask Calyx to compare").click(); });
    await flush();
    const provenance = container.querySelector('[data-testid="calyx-explanation-provenance"]')?.textContent ?? "";
    expect(provenance).toContain("matrix-deterministic-governed (calyx-matrix-explanation-v1)");
    expect(provenance).toContain("explanation not evidence");
    expect(provenance).toContain("conflicts spur_length_mm");
    expect(provenance).toContain("not recorded flower_shape");
  });
});
