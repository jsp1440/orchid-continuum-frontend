// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RelationshipExplorerPayload, RelationshipExplorerStatus } from "@/lib/relationshipExplorer";

/**
 * The page must say which thing happened -- service unavailable, species not
 * found, response unreadable -- and must not show "No ... yet" absence copy
 * for evidence it could not check. Payloads here are synthetic.
 */

const lib = vi.hoisted(() => ({ fetchRelationshipExplorerPayload: vi.fn() }));

vi.mock("@/lib/relationshipExplorer", () => ({
  TEST_SPECIES: ["Angraecum sesquipedale", "Dendrobium anosmum", "Cattleya maxima", "Dracula vampira"],
  fetchRelationshipExplorerPayload: lib.fetchRelationshipExplorerPayload,
}));
vi.mock("@/lib/ecologicalNeighborhood", () => ({
  fetchSpeciesEcologicalNeighborhood: async () => [],
}));
vi.mock("@/components/orchid/EcologicalNeighborhood", () => ({ default: () => null }));
vi.mock("@/components/interactions/InteractionDiscoveryPanel", () => ({ default: () => null }));

import RelationshipExplorer from "./RelationshipExplorer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ABSENCE_COPY = [
  "No atlas summary is available yet",
  "No display-ready interaction records yet",
  "No mycorrhizal evidence claims are attached yet",
  "No reasoning profile is available yet",
];

function payloadWith(status: RelationshipExplorerStatus): RelationshipExplorerPayload {
  return {
    scientific_name: "Angraecum sesquipedale",
    cards: {
      species_profile: false,
      atlas_summary: false,
      image_gallery: false,
      interaction_summary: false,
      interaction_panel: false,
      reasoning: false,
      mycorrhiza_claims: false,
      fungal_dependency: false,
    },
    species_profile: null,
    atlas_summary: null,
    image_gallery: null,
    mycorrhiza_claims: null,
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
    source: status === "ok" ? "api" : "none",
    status,
  };
}

let container: HTMLDivElement;
let root: Root;

async function renderWith(status: RelationshipExplorerStatus) {
  lib.fetchRelationshipExplorerPayload.mockResolvedValue(payloadWith(status));
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/relationship-explorer/Angraecum%20sesquipedale"]}>
        <Routes>
          <Route path="/relationship-explorer/:species" element={<RelationshipExplorer />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container.textContent ?? "";
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  lib.fetchRelationshipExplorerPayload.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RelationshipExplorer status states", () => {
  const cases: Array<[Exclude<RelationshipExplorerStatus, "ok">, string]> = [
    ["unavailable", "Relationship service unavailable"],
    ["not_found", "Species not found in the relationship service"],
    ["invalid", "Relationship service response unreadable"],
  ];

  it.each(cases)("%s shows its own alert and no absence copy", async (status, title) => {
    const text = await renderWith(status);

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.getAttribute("data-relationship-status")).toBe(status);
    expect(alert?.textContent).toContain(title);
    for (const [otherStatus, otherTitle] of cases) {
      if (otherStatus !== status) expect(text).not.toContain(otherTitle);
    }
    for (const copy of ABSENCE_COPY) expect(text).not.toContain(copy);
    expect(text).not.toContain("occurrence records");
    // The gallery is checked independently, so its own empty state remains.
    expect(text).toContain("No images are available through this MVP payload yet.");
  });

  it("ok with nothing returned keeps the ordinary empty-state copy and shows no alert", async () => {
    const text = await renderWith("ok");

    expect(container.querySelector('[role="alert"]')).toBeNull();
    for (const copy of ABSENCE_COPY) expect(text).toContain(copy);
  });

  it("keeps the demo species chips", async () => {
    await renderWith("unavailable");
    const chips = Array.from(container.querySelectorAll('button[type="button"]')).map((b) => b.textContent);
    expect(chips).toEqual(["Angraecum sesquipedale", "Dendrobium anosmum", "Cattleya maxima", "Dracula vampira"]);
  });
});
