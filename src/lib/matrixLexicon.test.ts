import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMatrixCharacterLexicon } from "./matrixLexicon";

function response(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Matrix canonical Lexicon resolution", () => {
  it("does not guess a concept when the registry character is unmapped", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, {
      characters: [{ character: "spur_length_mm", label: "Spur length", concept_id: null }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveMatrixCharacterLexicon("angraecum", "1", "spur_length_mm");
    expect(result.status).toBe("unmapped");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows the exact registry concept id to the approved canonical Lexicon endpoint", async () => {
    const conceptId = "70a363f7-8ad0-4d13-9545-28a13cab94b6";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        characters: [{ character: "spur_length_mm", label: "Spur length", concept_id: conceptId }],
      }))
      .mockResolvedValueOnce(response(200, {
        entry: {
          id: conceptId,
          concept_id: conceptId,
          slug: "spur",
          preferred_term: "spur",
          quick_definition: "A tubular or sac-like extension of a floral organ.",
          review_state: "expert_reviewed",
          maturity: ["core_definition", "expert_reviewed"],
          provenance: { source: "Orchid Continuum Core Concept Registry" },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveMatrixCharacterLexicon("angraecum", "1", "spur_length_mm");
    expect(result.status).toBe("mapped");
    if (result.status === "mapped") {
      expect(result.concept.concept_id).toBe(conceptId);
      expect(result.concept.preferred_term).toBe("spur");
    }
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/api/lexicon/concepts/${conceptId}`);
  });

  it("preserves a mapped-but-unavailable state instead of falling back", async () => {
    const conceptId = "70a363f7-8ad0-4d13-9545-28a13cab94b6";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        characters: [{ character: "spur_length_mm", label: "Spur length", concept_id: conceptId }],
      }))
      .mockResolvedValueOnce(response(404, {
        detail: { code: "LEXICON_APPROVED_CONCEPT_NOT_FOUND" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveMatrixCharacterLexicon("angraecum", "1", "spur_length_mm");
    expect(result).toMatchObject({ status: "approved_concept_unavailable", concept_id: conceptId });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
