import { describe, expect, it } from "vitest";

import { buildCalyxTurnContext } from "@/lib/calyxConversation";
import { researchStationCalyxHref } from "@/lib/researchStationNavigation";

describe("Research Station exact taxon → Calyx turn context", () => {
  it("carries an exact species subject alongside the derived genus as non-evidentiary context", () => {
    const href = researchStationCalyxHref({
      taxon: "Phalaenopsis amabilis",
      projectId: "continuum-demo",
      conversationId: "conversation-1",
    });
    const url = new URL(href, "https://orchidcontinuum.org");

    const turnContext = buildCalyxTurnContext({
      projectId: "continuum-demo",
      uploadedFiles: [],
      routeSearch: url.search,
    });

    expect(turnContext.route_context).toEqual({
      origin: "research-station",
      featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
      taxon: "Phalaenopsis amabilis",
      taxon_source: "research-station",
      taxon_is_evidence: false,
    });
  });

  it("does not accept a taxon parameter from a non-Research route", () => {
    const turnContext = buildCalyxTurnContext({
      projectId: "continuum-demo",
      uploadedFiles: [],
      routeSearch: "?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=homepage-featured-taxon",
    });

    expect(turnContext.route_context).toEqual({
      origin: "homepage-featured-taxon",
      featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
    });
  });

  it("fails closed for malformed exact taxon values", () => {
    const turnContext = buildCalyxTurnContext({
      projectId: "continuum-demo",
      uploadedFiles: [],
      routeSearch: "?genus=Phalaenopsis&taxon=%3Cscript%3E&origin=research-station",
    });

    expect(turnContext.route_context).toEqual({
      origin: "research-station",
      featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
    });
  });
});