import { describe, expect, it } from "vitest";

import { buildCalyxTurnContext } from "@/lib/calyxConversation";

const turn = (routeSearch: string) =>
  buildCalyxTurnContext({
    projectId: "calyx-speak",
    uploadedFiles: [],
    routeSearch,
  });

describe("governed genus arrivals mounted into current Calyx backend turns", () => {
  it("carries Genus of the Day into the backend turn only as explicit non-evidence context", () => {
    const context = turn(
      "?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false",
    );

    expect(context.route_context).toEqual({
      origin: "homepage-featured-taxon",
      featured_taxon: {
        rank: "genus",
        accepted_name: "Phalaenopsis",
      },
      featured_taxon_is_evidence: false,
    });
  });

  it.each([
    "?genus=Phalaenopsis&origin=homepage-featured-taxon",
    "?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=true",
    "?genus=phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false",
    "?genus=Phalaenopsis%20amabilis&origin=homepage-featured-taxon&context_is_evidence=false",
    "?genus=%2Fatlas%2FPhalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false",
  ])("fails the governed backend-turn context closed for %s", (routeSearch) => {
    const context = turn(routeSearch);
    expect(context).not.toHaveProperty("route_context");
  });

  it("does not allow unrelated route material to leak through a valid governed genus arrival", () => {
    const context = turn(
      "?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false" +
        "&latitude=-12.4&longitude=-77.1&locality=protected&occurrence_id=secret-1" +
        "&project=private-project&evidence=claimed&confidence=1&conclusion=hidden",
    );
    const routeContext = context.route_context as Record<string, unknown>;

    expect(Object.keys(routeContext).sort()).toEqual(
      ["featured_taxon", "featured_taxon_is_evidence", "origin"].sort(),
    );
  });

  it("keeps dedicated Conservatory cultivation context ahead of generic genus handling", () => {
    const context = turn("?genus=Phalaenopsis&origin=conservatory-cultivation&context_is_evidence=false");
    expect(context.route_context).not.toEqual({
      origin: "conservatory-cultivation",
      featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
      featured_taxon_is_evidence: false,
    });
  });
});