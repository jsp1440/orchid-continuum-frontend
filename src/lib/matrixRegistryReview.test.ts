import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveRegistryConceptMappings,
  getRegistryVersion,
  searchApprovedLexiconConcepts,
} from "./matrixRegistryReview";

afterEach(() => vi.unstubAllGlobals());

describe("Matrix registry concept review client", () => {
  it("fetches the exact immutable source registry version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        registry_id: "angraecum",
        version: "1",
        characters: [{ character: "spur_length_mm", label: "Spur length" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const registry = await getRegistryVersion("angraecum", "1");
    expect(registry.version).toBe("1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/matrix-identification/registry/angraecum/1");
  });

  it("searches only the canonical Lexicon API used for ACTIVE + APPROVED entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        entries: [
          {
            concept_id: "11111111-1111-4111-8111-111111111111",
            preferred_term: "spur",
            review_state: "approved",
            source_system: "oc_concepts",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const concepts = await searchApprovedLexiconConcepts("spur");
    expect(concepts[0].preferred_term).toBe("spur");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/lexicon/search?q=spur");
    expect(url).not.toContain("famous");
  });

  it("submits only explicit mapping decisions into a new immutable version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        created: true,
        mapping_count: 1,
        source_registry: { registry_id: "angraecum", version: "1" },
        new_registry: {
          registry_id: "angraecum",
          version: "2-reviewed",
          checksum_sha256: "digest",
          publication_state: "review_required",
        },
        automatic_concept_matching: false,
        automatic_publication: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await deriveRegistryConceptMappings(
      "angraecum",
      "1",
      "2-reviewed",
      [{ character: "spur_length_mm", concept_id: "11111111-1111-4111-8111-111111111111" }],
      "Reviewed against approved Lexicon morphology.",
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.new_version).toBe("2-reviewed");
    expect(body.mappings).toEqual([
      { character: "spur_length_mm", concept_id: "11111111-1111-4111-8111-111111111111" },
    ]);
    expect(body).not.toHaveProperty("actor");
    expect(receipt.automatic_concept_matching).toBe(false);
    expect(receipt.automatic_publication).toBe(false);
  });
});
