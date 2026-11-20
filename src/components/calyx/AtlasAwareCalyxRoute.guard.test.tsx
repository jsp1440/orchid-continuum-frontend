// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { atlasChecklistCalyxHref } from "@/features/atlas-next/calyxHandoff";
import { buildCalyxTurnContext, parseCalyxRouteContext } from "@/lib/calyxConversation";
import { rejectsCalyxNavigationContext } from "@/lib/calyxRouteTrustBoundary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceArrival = vi.hoisted(() => vi.fn<(context: unknown) => void>());
vi.mock("@/pages/CalyxWorkspace", () => ({
  default: function MockCalyxWorkspace() {
    const { search } = useLocation();
    workspaceArrival({
      route: parseCalyxRouteContext(search),
      turn: buildCalyxTurnContext({ projectId: '', uploadedFiles: [], routeSearch: search }),
    });
    return <div data-testid="calyx-workspace-mounted" />;
  },
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
  workspaceArrival.mockClear();
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


describe('mounted Atlas checklist question-only handoff', () => {
  it('opens the actual producer link and forwards the exact non-evidence question without identity', () => {
    const question = 'Which orchids grow in the synthetic area?';
    const search = new URL(atlasChecklistCalyxHref(question)!, 'https://orchidcontinuum.org').search;
    renderAt(search);
    expect(container.querySelector('[data-testid="calyx-workspace-mounted"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Rejected Calyx navigation context"]')).toBeNull();
    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(workspaceArrival).toHaveBeenLastCalledWith({
      route: {
        origin: 'atlas-checklist-layer', featuredTaxon: null,
        questionContext: { question, question_source: 'user', question_is_evidence: false },
      },
      turn: {
        surface: 'orchid-continuum-frontend', project_id: 'calyx-speak',
        workspace: { attachment_count: 0, attachments: [], selected_attachment: undefined, draft_document_context: undefined },
        route_context: {
          origin: 'atlas-checklist-layer', featured_taxon: undefined,
          question, question_source: 'user', question_is_evidence: false,
        },
      },
    });
  });

  it.each([
    'genus=Phalaenopsis', 'taxon=Synthetic%20example', 'project_id=private-project',
    'evidence=scientific', 'locality=synthetic-private-site', 'latitude=12.3456',
    'origin=atlas-checklist-layer', 'question=second-question',
    'question_source=user', 'question_is_evidence=false',
  ])('rejects hostile appended %s before workspace mount', (extra) => {
    const search = new URL(atlasChecklistCalyxHref('Which orchids grow in the synthetic area?')!, 'https://orchidcontinuum.org').search;
    renderAt(`${search}&${extra}`);
    expect(container.querySelector('[aria-label="Rejected Calyx navigation context"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="calyx-workspace-mounted"]')).toBeNull();
    expect(workspaceArrival).not.toHaveBeenCalled();
  });

  it.each(['question', 'question_source', 'question_is_evidence'])('rejects missing %s before workspace mount', (key) => {
    const params = new URL(atlasChecklistCalyxHref('Which orchids grow in the synthetic area?')!, 'https://orchidcontinuum.org').searchParams;
    params.delete(key);
    renderAt(`?${params}`);
    expect(container.querySelector('[aria-label="Rejected Calyx navigation context"]')).not.toBeNull();
    expect(workspaceArrival).not.toHaveBeenCalled();
  });
});
