import { afterEach, describe, expect, it, vi } from "vitest";

import { getRegistryConceptMappingStatus } from "./matrixRegistryReview";

afterEach(() => vi.unstubAllGlobals());

describe("Matrix registry concept mapping readiness client", () => {
  it("retains distinct approved, stale, invalid and unmapped states", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        registry: { registry_id: "angraecum", version: "2", checksum_sha256: "digest" },
        character_count: 4,
        mapped_approved_count: 1,
        mapped_unavailable_count: 1,
        invalid_mapping_count: 1,
        unmapped_count: 1,
        approved_mapping_coverage: 0.25,
        ready_for_reviewed_lexicon_guidance: false,
        automatic_concept_matching: false,
        characters: [
          { character: "spur_length_mm", mapping_status: "mapped_approved" },
          { character: "flower_color", mapping_status: "mapped_concept_unavailable" },
          { character: "column_shape", mapping_status: "invalid_concept_id" },
          { character: "lip_shape", mapping_status: "unmapped" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getRegistryConceptMappingStatus("angraecum", "2");
    expect(status.approved_mapping_coverage).toBe(0.25);
    expect(status.ready_for_reviewed_lexicon_guidance).toBe(false);
    expect(status.characters.map((item) => item.mapping_status)).toEqual([
      "mapped_approved",
      "mapped_concept_unavailable",
      "invalid_concept_id",
      "unmapped",
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/matrix-identification/registry/angraecum/2/concept-mapping-status",
    );
  });
});
