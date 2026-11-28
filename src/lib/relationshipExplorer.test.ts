import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Relationship Explorer client fails closed. Every body below is
 * synthetic and written for this test; none of it is real evidence. The
 * species names are the page's own TEST_SPECIES chips.
 */

const genusImages = vi.hoisted(() => ({
  fetchGenusImagesWithSource: vi.fn(),
}));

vi.mock("@/lib/genusData", () => ({
  binomialOf: (name: string) => name.toLowerCase().trim().split(/\s+/).slice(0, 2).join(" "),
  fetchGenusImagesWithSource: genusImages.fetchGenusImagesWithSource,
}));

import { fetchRelationshipExplorerPayload, TEST_SPECIES } from "@/lib/relationshipExplorer";

// Text and numbers that only ever existed in the removed hard-coded payloads.
const CANNED_MARKERS = [
  "fungal partner candidate",
  "Safe MVP payload",
  "safe payload",
  "atlas_seed",
  "atlas_partial",
  "needs_occurrence_data",
  "display-ready interaction signal",
  "reasoning_density",
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    void input;
    return impl();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function expectNoEvidence(payload: Awaited<ReturnType<typeof fetchRelationshipExplorerPayload>>) {
  expect(payload.species_profile).toBeNull();
  expect(payload.atlas_summary).toBeNull();
  expect(payload.mycorrhiza_claims).toBeNull();
  expect(payload.fungal_dependency).toBeNull();
  expect(payload.reasoning).toBeNull();
  expect(payload.interaction_summary).toBeNull();
  expect(Object.values(payload.cards).every((flag) => flag === false)).toBe(true);
  expect(payload.source).toBe("none");
  const serialized = JSON.stringify(payload);
  for (const marker of CANNED_MARKERS) expect(serialized).not.toContain(marker);
  expect(serialized).not.toContain("occurrence_count");
}

beforeEach(() => {
  genusImages.fetchGenusImagesWithSource.mockReset();
  genusImages.fetchGenusImagesWithSource.mockResolvedValue({ images: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchRelationshipExplorerPayload: live response is never merged with canned content", () => {
  it("keeps omitted and null fields null for a former demo species, with their card flags false", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({
        scientific_name: "Angraecum sesquipedale",
        cards: { species_profile: true, atlas_summary: true, mycorrhiza_claims: true, reasoning: true },
        species_profile: {
          scientific_name: "Angraecum sesquipedale",
          genus: "Angraecum",
          species_epithet: "sesquipedale",
          author: null,
          common_name: null,
          description: "synthetic test description",
        },
        atlas_summary: null,
        mycorrhiza_claims: null,
        // fungal_dependency, reasoning, interaction_summary, image_gallery omitted
      }),
    );

    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/relationship-explorer/species/Angraecum%20sesquipedale",
    );
    expect(payload.status).toBe("ok");
    expect(payload.source).toBe("api");
    expect(payload.species_profile?.description).toBe("synthetic test description");
    expect(payload.atlas_summary).toBeNull();
    expect(payload.mycorrhiza_claims).toBeNull();
    expect(payload.fungal_dependency).toBeNull();
    expect(payload.reasoning).toBeNull();
    expect(payload.interaction_summary).toBeNull();
    expect(payload.cards).toEqual({
      species_profile: true,
      atlas_summary: false,
      image_gallery: false,
      interaction_summary: false,
      interaction_panel: false,
      reasoning: false,
      mycorrhiza_claims: false,
      fungal_dependency: false,
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("fungal partner candidate");
    expect(serialized).not.toContain("Safe MVP payload");
    expect(serialized).not.toContain("0.024");
  });

  it("returns an empty ok payload for a bare {} body on every demo species", async () => {
    for (const name of TEST_SPECIES) {
      stubFetch(async () => jsonResponse({}));
      const payload = await fetchRelationshipExplorerPayload(name);
      expect(payload.status).toBe("ok");
      expect(payload.scientific_name).toBe(name);
      expect(payload.species_profile).toBeNull();
      expect(payload.atlas_summary).toBeNull();
      expect(payload.mycorrhiza_claims).toBeNull();
      expect(payload.interaction_summary).toBeNull();
      expect(Object.values(payload.cards).every((flag) => flag === false)).toBe(true);
    }
  });

  it("passes through what the API does return and honours an explicit false card flag", async () => {
    stubFetch(async () =>
      jsonResponse({
        scientific_name: "Cattleya maxima",
        mvp_card_status: { atlas_summary: false },
        atlas_summary: {
          occurrence_count: 3,
          atlas_readiness: "synthetic_readiness",
          atlas_confidence_score: null,
          countries: null,
          elevation_range: null,
        },
        mycorrhiza_claims: [
          { fungal_taxon: "Synthetic test taxon", relationship_type: null, evidence: null, source: "synthetic-test" },
        ],
        reasoning: "not-an-array",
        fungal_dependency: ["not-an-object"],
      }),
    );

    const payload = await fetchRelationshipExplorerPayload("Cattleya maxima");

    expect(payload.status).toBe("ok");
    expect(payload.atlas_summary?.occurrence_count).toBe(3);
    expect(payload.cards.atlas_summary).toBe(false);
    expect(payload.mycorrhiza_claims).toHaveLength(1);
    expect(payload.mycorrhiza_claims?.[0].fungal_taxon).toBe("Synthetic test taxon");
    expect(payload.cards.mycorrhiza_claims).toBe(true);
    expect(payload.reasoning).toBeNull();
    expect(payload.fungal_dependency).toBeNull();
  });
});

describe("fetchRelationshipExplorerPayload: failure states stay distinct and carry no content", () => {
  it("404 -> not_found", async () => {
    stubFetch(async () => jsonResponse({ detail: "Not Found" }, 404));
    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
    expect(payload.status).toBe("not_found");
    expectNoEvidence(payload);
  });

  it("503 -> unavailable", async () => {
    stubFetch(async () => jsonResponse({ detail: "down" }, 503));
    const payload = await fetchRelationshipExplorerPayload("Dendrobium anosmum");
    expect(payload.status).toBe("unavailable");
    expectNoEvidence(payload);
  });

  it("rejected fetch -> unavailable", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const payload = await fetchRelationshipExplorerPayload("Cattleya maxima");
    expect(payload.status).toBe("unavailable");
    expectNoEvidence(payload);
  });

  it("200 text/html (SPA shell) -> invalid", async () => {
    stubFetch(
      async () =>
        new Response("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const payload = await fetchRelationshipExplorerPayload("Dracula vampira");
    expect(payload.status).toBe("invalid");
    expectNoEvidence(payload);
  });

  it("200 JSON array, null, or scalar -> invalid", async () => {
    for (const body of [[], [{ atlas_summary: { occurrence_count: 9 } }], null, "text", 7]) {
      stubFetch(async () => jsonResponse(body));
      const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
      expect(payload.status).toBe("invalid");
      expectNoEvidence(payload);
    }
  });

  it("200 application/json with an unparseable body -> invalid", async () => {
    stubFetch(
      async () =>
        new Response("<html>", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
    expect(payload.status).toBe("invalid");
    expectNoEvidence(payload);
  });

  it("200 with a non-JSON or missing content type -> invalid, even when the body parses as JSON", async () => {
    // Synthetic body. It would normalize to an ok payload if the content-type
    // check were skipped, so this pins the check itself, not JSON.parse.
    const body = JSON.stringify({
      scientific_name: "Dracula vampira",
      mycorrhiza_claims: [
        { fungal_taxon: "Synthetic test taxon", relationship_type: null, evidence: null, source: "synthetic-test" },
      ],
    });
    const cases: Array<Record<string, string>> = [
      { "content-type": "text/html; charset=utf-8" },
      { "content-type": "text/plain" },
      {},
    ];
    for (const headers of cases) {
      stubFetch(async () => {
        const response = new Response(body, { status: 200, headers });
        // Response adds text/plain for a string body; drop it for the bare case.
        if (!("content-type" in headers)) response.headers.delete("content-type");
        return response;
      });
      const payload = await fetchRelationshipExplorerPayload("Dracula vampira");
      expect(payload.status).toBe("invalid");
      expectNoEvidence(payload);
    }
  });

  it("an array field with an element the page cannot render -> invalid, never ok", async () => {
    // The page reads properties of every element of these three arrays.
    const claim = { fungal_taxon: "Synthetic test taxon", relationship_type: null, evidence: null, source: "synthetic-test" };
    const bodies: Array<Record<string, unknown>> = [
      { mycorrhiza_claims: [null, "x", 3] },
      { mycorrhiza_claims: [claim, null] },
      { mycorrhiza_claims: [[claim]] },
      { interaction_summary: [{ partner: "Synthetic partner", interaction_type: null, source: null }, "x"] },
      { reasoning: [{ statement: "Synthetic statement", confidence: null, basis: null }, 7] },
      // statement is rendered as-is; an object there cannot be shown.
      { reasoning: [{ statement: { text: "Synthetic statement" }, confidence: null, basis: null }] },
      { reasoning: [{ statement: ["Synthetic statement"], confidence: null, basis: null }] },
    ];
    for (const body of bodies) {
      stubFetch(async () => jsonResponse({ scientific_name: "Cattleya maxima", ...body }));
      const payload = await fetchRelationshipExplorerPayload("Cattleya maxima");
      expect(payload.status).toBe("invalid");
      expectNoEvidence(payload);
    }
  });

  it("well-formed array elements and empty arrays stay ok", async () => {
    stubFetch(async () =>
      jsonResponse({
        scientific_name: "Cattleya maxima",
        mycorrhiza_claims: [],
        interaction_summary: [{ partner: "Synthetic partner", interaction_type: null, source: null }],
        reasoning: [{ statement: "Synthetic statement", confidence: null, basis: null }, { confidence: null }],
      }),
    );
    const payload = await fetchRelationshipExplorerPayload("Cattleya maxima");
    expect(payload.status).toBe("ok");
    expect(payload.mycorrhiza_claims).toEqual([]);
    expect(payload.cards.mycorrhiza_claims).toBe(false);
    expect(payload.interaction_summary).toHaveLength(1);
    expect(payload.reasoning).toHaveLength(2);
    expect(payload.cards.reasoning).toBe(true);
  });

  it("a blank name is invalid and issues no request", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));
    const payload = await fetchRelationshipExplorerPayload("   ");
    expect(payload.status).toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoEvidence(payload);
  });

  it("a relative VITE_API_BASE_URL is unavailable and issues no request", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api");
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const fresh = await import("@/lib/relationshipExplorer");
      const fetchMock = stubFetch(async () => jsonResponse({}));
      const payload = await fresh.fetchRelationshipExplorerPayload("Angraecum sesquipedale");
      expect(payload.status).toBe("unavailable");
      expect(fetchMock).not.toHaveBeenCalled();
      expectNoEvidence(payload);
    } finally {
      warn.mockRestore();
      vi.resetModules();
    }
  });
});

describe("fetchRelationshipExplorerPayload: image gallery path is unchanged", () => {
  const libraryImages = {
    images: [
      {
        scientific_name: "Angraecum eburneum",
        image_url: "https://images.example.test/related.jpg",
        image_source: "synthetic-library",
        image_license: "CC0",
      },
      {
        scientific_name: "Angraecum sesquipedale",
        image_url: "https://images.example.test/exact.jpg",
        image_source: "synthetic-library",
        image_license: "CC0",
      },
      {
        scientific_name: "Angraecum sesquipedale",
        image_url: "https://images.example.test/herbarium-sheet.jpg",
        image_source: "synthetic-library",
        image_license: "CC0",
      },
    ],
  };

  it("cleans API gallery images (drops placeholder/document URLs and duplicates) without calling the library", async () => {
    stubFetch(async () =>
      jsonResponse({
        image_gallery: [
          { url: "https://images.example.test/a.jpg", caption: "synthetic", credit: null },
          { url: "https://images.example.test/a.jpg", caption: "duplicate", credit: null },
          { url: "https://placehold.co/600x400", caption: null, credit: null },
          { url: "https://images.example.test/b.jpg", caption: "herbarium specimen", credit: null },
        ],
      }),
    );
    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
    expect(payload.image_gallery).toEqual([
      { url: "https://images.example.test/a.jpg", caption: "synthetic", credit: null },
    ]);
    expect(payload.cards.image_gallery).toBe(true);
    expect(genusImages.fetchGenusImagesWithSource).not.toHaveBeenCalled();
  });

  it("falls back to the genus image library, exact species first, when the API has no usable gallery", async () => {
    genusImages.fetchGenusImagesWithSource.mockResolvedValue(libraryImages);
    stubFetch(async () => jsonResponse({}));
    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
    expect(genusImages.fetchGenusImagesWithSource).toHaveBeenCalledWith("Angraecum", undefined, 60);
    expect(payload.image_gallery?.map((img) => img.url)).toEqual([
      "https://images.example.test/exact.jpg",
      "https://images.example.test/related.jpg",
    ]);
    expect(payload.cards.image_gallery).toBe(true);
  });

  it("still looks up library images when the relationship service is unavailable, without implying evidence", async () => {
    genusImages.fetchGenusImagesWithSource.mockResolvedValue(libraryImages);
    stubFetch(async () => jsonResponse({}, 503));
    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
    expect(payload.status).toBe("unavailable");
    expect(payload.image_gallery).toHaveLength(2);
    expect(payload.cards).toMatchObject({ image_gallery: true, atlas_summary: false, mycorrhiza_claims: false });
    expect(payload.atlas_summary).toBeNull();
    expect(payload.mycorrhiza_claims).toBeNull();
  });

  it("a failing image library leaves the gallery null", async () => {
    genusImages.fetchGenusImagesWithSource.mockRejectedValue(new Error("library down"));
    stubFetch(async () => jsonResponse({}));
    const payload = await fetchRelationshipExplorerPayload("Angraecum sesquipedale");
    expect(payload.image_gallery).toBeNull();
    expect(payload.cards.image_gallery).toBe(false);
  });
});
