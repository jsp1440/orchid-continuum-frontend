// @vitest-environment jsdom
// jsdom: a member session (and so a member token) only exists in a browser;
// memberReadAuth returns no token when there is no window.
import { afterEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: identity.token ? { access_token: identity.token } : null }, error: null }),
    },
  },
}));

import member from "@/lib/__fixtures__/matrixIdentification.memberBackend.json";
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
  identity.token = null;
});

describe("Matrix Lexicon guide in a member session (R1 J4)", () => {
  it("reads the registry version with the member token (a member Matrix route) and resolves the captured member view", async () => {
    identity.token = "synthetic-member-token";
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, member.registry_detail.body));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveMatrixCharacterLexicon("r1-synthetic-member-matrix", "1", "spur_length_mm");
    expect(result.status).toBe("unmapped");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/matrix-identification/registry/r1-synthetic-member-matrix/1");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-member-token");
    expect(init.credentials).toBe("include");
  });

  it("never sends the member token to the Lexicon concept read", async () => {
    identity.token = "synthetic-member-token";
    const conceptId = "70a363f7-8ad0-4d13-9545-28a13cab94b6";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, { characters: [{ character: "spur_length_mm", label: "Spur length", concept_id: conceptId }] }))
      .mockResolvedValueOnce(response(404, { detail: "not found" }));
    vi.stubGlobal("fetch", fetchMock);

    await resolveMatrixCharacterLexicon("r1-synthetic-member-matrix", "1", "spur_length_mm");
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });
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
