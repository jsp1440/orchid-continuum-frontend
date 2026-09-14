// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/pages/CalyxWorkspace", () => ({
  default: () => <div data-testid="calyx-workspace-mounted" />,
}));

const { default: AtlasAwareCalyxRoute } = await import("@/components/calyx/AtlasAwareCalyxRoute");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * That a violating genus arrival never becomes a Calyx turn.
 *
 * `calyxGenericGenusNonEvidence.test.ts` asserts the predicate and then says,
 * in a comment, that "the live AtlasAwareCalyxRoute rejects these URLs before
 * CalyxWorkspace mounts". That sentence is the only thing holding the boundary
 * together: the predicate being correct does not stop the workspace mounting,
 * and the workspace mounting is what sends. Deleting the guard from the route
 * would leave every existing test green while an unqualified genus started
 * reaching the backend.
 *
 * So the comment is asserted here instead of being trusted.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderAt(search: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/calyx${search}`]}>
        <AtlasAwareCalyxRoute />
      </MemoryRouter>,
    );
  });
}

const VIOLATING = [
  ["the declaration is missing", "?genus=Phalaenopsis&origin=homepage-featured-taxon"],
  ["the declaration is contradicted", "?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=true"],
  ["the declaration is malformed", "?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=FALSE"],
  ["the genus is not canonical", "?genus=phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false"],
] as const;

describe("a violating genus arrival never reaches the turn sender", () => {
  for (const [reason, search] of VIOLATING) {
    it(`refuses to mount the workspace when ${reason}`, () => {
      renderAt(search);
      expect(container.querySelector('[data-testid="calyx-workspace-mounted"]')).toBeNull();
      expect(container.querySelector('[aria-label="Rejected Calyx navigation context"]')).not.toBeNull();
      expect(container.textContent).toContain("Calyx did not accept this carried genus");
    });
  }

  it("mounts the workspace for a governed arrival that kept its boundary", () => {
    // The negative cases above would also pass if the route refused everything,
    // so the accepting case has to be here too.
    renderAt("?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false");
    expect(container.querySelector('[data-testid="calyx-workspace-mounted"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Rejected Calyx navigation context"]')).toBeNull();
    expect(container.textContent).toContain("Continuing from Genus of the Day");
  });

  it("mounts the workspace when no context was carried at all", () => {
    renderAt("");
    expect(container.querySelector('[data-testid="calyx-workspace-mounted"]')).not.toBeNull();
  });
});
