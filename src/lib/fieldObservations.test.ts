import { afterEach, describe, expect, it, vi } from "vitest";
import { createFieldDraft, type FieldDraft } from "./fieldDrafts";
import { SensitiveLocalityError } from "./fieldHypotheses";
import {
  FIELD_OBSERVATIONS_CONTRACT_VERSION,
  FieldObservationApiError,
  KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
  OBSERVER_REPORT_STATUS,
  describeUploadFailure,
  draftToObservationPayload,
  getFieldObservation,
  listFieldObservations,
  uploadFieldDraft,
  type FieldObservation,
} from "./fieldObservations";

const BASE = "https://orchid-calyx-backend.onrender.com";

const draft: FieldDraft = createFieldDraft(
  {
    note: "Two plants in flower on a granite outcrop; one visited by a small bee.",
    taxonLabel: "Laelia purpurata",
    localityVisibility: "research_restricted",
    media: [{ name: "IMG_0001.jpg", size: 2048, type: "image/jpeg" }],
  },
  { id: "draft-42", now: "2026-06-15T10:30:00.000Z" },
);

function observation(overrides: Partial<FieldObservation> = {}): FieldObservation {
  return {
    contract_version: FIELD_OBSERVATIONS_CONTRACT_VERSION,
    id: "fo-abc123",
    observer_subject: "owner",
    observed_at: draft.createdAt,
    note: draft.note,
    taxon_hint: draft.taxonLabel,
    epistemic_certainty: "POSSIBLE",
    curation_state: "PENDING",
    curation_reason: null,
    curated_by: null,
    curated_at: null,
    locality_visibility: "research_restricted",
    media: draft.media,
    photo_count: 0,
    client_draft_id: draft.id,
    scientific_status: OBSERVER_REPORT_STATUS,
    knowledge_graph_publication: KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
    hypotheses_path: "/api/field-observations/fo-abc123/hypotheses",
    created_at: "2026-06-15T10:31:00Z",
    updated_at: "2026-06-15T10:31:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("draftToObservationPayload", () => {
  it("carries only governed fields: note, taxon text, locality class, media metadata and the draft id", () => {
    const payload = draftToObservationPayload(draft);
    expect(payload).toEqual({
      observed_at: draft.createdAt,
      note: draft.note,
      taxon_hint: "Laelia purpurata",
      locality_visibility: "research_restricted",
      media: [{ name: "IMG_0001.jpg", size: 2048, type: "image/jpeg" }],
      client_draft_id: "draft-42",
    });
    for (const key of ["latitude", "longitude", "location", "locality", "coordinates", "gps"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it("omits taxon_hint for unidentified drafts", () => {
    const unidentified = createFieldDraft({ note: "Unknown epiphyte", localityVisibility: "private" }, { id: "d", now: "2026-06-15T10:30:00.000Z" });
    expect(draftToObservationPayload(unidentified)).not.toHaveProperty("taxon_hint");
  });

  it("sends only name, size and type for media, dropping any other key a stored draft might carry", () => {
    const withExtraKeys = { ...draft, media: [{ name: "x.jpg", size: 1, type: "image/jpeg", path: "/sdcard/x.jpg", gps: "-22,-43" }] } as unknown as FieldDraft;
    const payload = draftToObservationPayload(withExtraKeys);
    expect(payload.media).toEqual([{ name: "x.jpg", size: 1, type: "image/jpeg" }]);
    expect(JSON.stringify(payload)).not.toMatch(/gps|sdcard/);
  });
});

describe("uploadFieldDraft", () => {
  it("posts the governed payload to the field-observations route with Calyx credentials and reports created", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(observation(), 201));
    vi.stubGlobal("fetch", fetchMock);
    const result = await uploadFieldDraft(draft);
    expect(result.created).toBe(true);
    expect(result.observation.id).toBe("fo-abc123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/field-observations`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body as string)).toMatchObject({ client_draft_id: "draft-42", locality_visibility: "research_restricted" });
    expect(init.body as string).not.toMatch(/latitude|longitude|coordinates/);
  });

  it("attaches the member session bearer only when one is supplied", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(observation(), 201)));
    vi.stubGlobal("fetch", fetchMock);
    await uploadFieldDraft(draft, { accessToken: "member-jwt" });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer member-jwt");
    await uploadFieldDraft(draft);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).has("Authorization")).toBe(false);
  });

  it("reports created=false when the backend already held the draft (idempotent 200)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(observation(), 200)));
    await expect(uploadFieldDraft(draft)).resolves.toMatchObject({ created: false });
  });

  it("refuses an observation the backend did not label as an unpublished observer report", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(observation({ scientific_status: "verified_fact" }), 201)));
    await expect(uploadFieldDraft(draft)).rejects.toMatchObject({ kind: "server_error" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(observation({ knowledge_graph_publication: "published" }), 201)));
    await expect(uploadFieldDraft(draft)).rejects.toMatchObject({ kind: "server_error" });
  });

  it("maps 401/403 to authentication_required and keeps the copy honest that the draft stays local", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Owner session or API key is required" }, 401)));
    const error = await uploadFieldDraft(draft).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FieldObservationApiError);
    expect((error as FieldObservationApiError).kind).toBe("authentication_required");
    expect(describeUploadFailure(error)).toMatch(/stays on this device/);
  });

  it("maps 404/405 to route_unavailable so the page can say the upload path is not deployed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Not Found" }, 404)));
    await expect(uploadFieldDraft(draft)).rejects.toMatchObject({ kind: "route_unavailable", status: 404 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Method Not Allowed" }, 405)));
    const error = await uploadFieldDraft(draft).catch((e: unknown) => e);
    expect(describeUploadFailure(error)).toMatch(/not deployed/);
  });

  it("surfaces the backend's validation detail for a 422", async () => {
    const detail = [{ type: "value_error", loc: ["body", "note"], msg: "String should have at least 1 character" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail }, 422)));
    const error = await uploadFieldDraft(draft).catch((e: unknown) => e);
    expect((error as FieldObservationApiError).kind).toBe("validation_failed");
    expect((error as FieldObservationApiError).message).toBe("note: String should have at least 1 character");
  });

  it("maps a thrown fetch to network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(uploadFieldDraft(draft)).rejects.toMatchObject({ kind: "network_error" });
  });

  it("does not read any coordinate the draft model might carry in the future", () => {
    const withCoordinates = { ...draft, latitude: -22.4, longitude: -43.0 } as unknown as FieldDraft;
    const payload = draftToObservationPayload(withCoordinates);
    expect(payload).not.toHaveProperty("latitude");
    expect(payload).not.toHaveProperty("longitude");
    expect(() => new SensitiveLocalityError("latitude")).not.toThrow();
  });
});

describe("reads", () => {
  it("fetches one observation and a listing from their routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(observation()))
      .mockResolvedValueOnce(jsonResponse({ contract_version: FIELD_OBSERVATIONS_CONTRACT_VERSION, observer_subject: "owner", items: [observation()], total: 1, offset: 0, limit: 5 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getFieldObservation("fo/abc")).resolves.toMatchObject({ id: "fo-abc123" });
    await expect(listFieldObservations({ limit: 5 })).resolves.toMatchObject({ total: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/field-observations/fo%2Fabc`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/field-observations?limit=5`);
  });
});
