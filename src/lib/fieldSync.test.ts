import { describe, expect, it } from "vitest";
import { createFieldDraft, type FieldDraft } from "@/lib/fieldDrafts";
import {
  buildSyncNote,
  buildSyncPayload,
  lookupCanonicalTaxon,
  syncDraftWithTaxonomy,
  syncFieldDraft,
  type SyncFetch,
} from "@/lib/fieldSync";

const NOW = "2026-10-07T08:00:00.000Z";
const now = () => NOW;

function makeDraft(overrides: Partial<Parameters<typeof createFieldDraft>[0]> = {}): FieldDraft {
  return createFieldDraft(
    { note: "Single yellow pouch flower.", localityVisibility: "private", ...overrides },
    { id: "draft-abc", now: NOW },
  );
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("sync payload construction", () => {
  it("maps to the backend contract with the durable local id as client_draft_id", () => {
    const draft = makeDraft({
      taxonLabel: "Phragmipedium cf. kovachii",
      media: [{ id: "m-1", name: "IMG_1.jpg", size: 10, type: "image/jpeg", capturedAt: NOW }],
    });
    const payload = buildSyncPayload(draft);
    expect(payload).toEqual({
      observed_at: NOW,
      note: "Single yellow pouch flower.",
      taxon_hint: "Phragmipedium cf. kovachii",
      epistemic_certainty: "POSSIBLE",
      locality_visibility: "private",
      media: [{ name: "IMG_1.jpg", size: 10, type: "image/jpeg" }],
      client_draft_id: "draft-abc",
    });
  });

  it("never carries coordinates, media ids, or any location key — the backend rejects them", () => {
    const draft = makeDraft({
      coordinates: { latitude: -13.123456, longitude: -72.654321, accuracyMeters: 5, elevationMeters: 2890 },
      media: [{ id: "m-secret", name: "IMG_1.jpg", size: 10, type: "image/jpeg", capturedAt: NOW }],
    });
    const serialized = JSON.stringify(buildSyncPayload(draft));
    expect(serialized).not.toContain("-13.123456");
    expect(serialized).not.toContain("-72.654321");
    expect(serialized).not.toContain("m-secret");
    expect(serialized).not.toMatch(/latitude|longitude|coordinate|gps|elevation/i);
    expect(serialized).toContain("locality_visibility");
  });

  it("gives photo-only observations an honest placeholder note", () => {
    const draft = makeDraft({
      note: "",
      media: [{ id: "m-1", name: "IMG_1.jpg", size: 10, type: "image/jpeg", capturedAt: null }],
    });
    expect(buildSyncNote(draft)).toContain("Photo-only observation");
  });

  it("appends structured ecology fields so the narrower backend contract drops nothing", () => {
    const draft = makeDraft({
      ecology: { growthHabit: "Terrestrial", habitat: "cloud forest", substrate: "leaf litter" },
      relationships: { pollinatorInteraction: "bee entered flower" },
      observerName: "Lance Peck",
      provenance: "Peru expedition 2026",
      coordinates: { latitude: -13.1, longitude: -72.7, accuracyMeters: 8, elevationMeters: null },
    });
    const note = buildSyncNote(draft);
    expect(note).toContain("Growth habit: Terrestrial");
    expect(note).toContain("Pollinator interaction: bee entered flower");
    expect(note).toContain("Observer: Lance Peck");
    expect(note).toContain("locality protection");
    expect(note.length).toBeLessThanOrEqual(4900);
  });
});

describe("idempotent synchronization", () => {
  it("posts once and records the backend observation id", async () => {
    const calls: string[] = [];
    const fetchFn: SyncFetch = async (input) => {
      calls.push(input);
      return jsonResponse(201, { id: "fo-abc123" });
    };
    const outcome = await syncFieldDraft(makeDraft(), { fetchFn, now });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/field-observations");
    expect(outcome.confirmed).toBe(true);
    expect(outcome.draft.syncStatus).toBe("synced");
    expect(outcome.draft.backendObservationId).toBe("fo-abc123");
  });

  it("never re-posts a draft that already carries a backend id (replay-safe)", async () => {
    const calls: string[] = [];
    const fetchFn: SyncFetch = async (input) => {
      calls.push(input);
      return jsonResponse(201, { id: "fo-abc123" });
    };
    const first = await syncFieldDraft(makeDraft(), { fetchFn, now });
    const second = await syncFieldDraft(first.draft, { fetchFn, now });
    expect(calls).toHaveLength(1);
    expect(second.backendObservationId).toBe("fo-abc123");
  });

  it("treats a backend 200 replay as success without duplicating", async () => {
    const fetchFn: SyncFetch = async () => jsonResponse(200, { id: "fo-existing" });
    const outcome = await syncFieldDraft(makeDraft(), { fetchFn, now });
    expect(outcome.confirmed).toBe(true);
    expect(outcome.draft.backendObservationId).toBe("fo-existing");
  });

  it("network failure lands in sync_error with every byte of data intact", async () => {
    const draft = makeDraft({
      media: [{ id: "m-1", name: "IMG_1.jpg", size: 10, type: "image/jpeg", capturedAt: NOW }],
      coordinates: { latitude: -13.123456, longitude: -72.654321, accuracyMeters: 5, elevationMeters: 2890 },
      ecology: { habitat: "cloud forest" },
    });
    const fetchFn: SyncFetch = async () => {
      throw new Error("network down");
    };
    const outcome = await syncFieldDraft(draft, { fetchFn, now });
    expect(outcome.confirmed).toBe(false);
    expect(outcome.draft.syncStatus).toBe("sync_error");
    expect(outcome.draft.syncError).toBe("network down");
    // Nothing was discarded:
    expect(outcome.draft.note).toBe(draft.note);
    expect(outcome.draft.media).toEqual(draft.media);
    expect(outcome.draft.coordinates).toEqual(draft.coordinates);
    expect(outcome.draft.ecology).toEqual(draft.ecology);
  });

  it("a 401 marks the error as a sign-in problem, not lost data", async () => {
    const fetchFn: SyncFetch = async () => jsonResponse(401, {});
    const outcome = await syncFieldDraft(makeDraft(), { fetchFn, now });
    expect(outcome.draft.syncStatus).toBe("sync_error");
    expect(outcome.draft.syncError).toContain("Sign-in required");
  });

  it("retries after an error succeed and clear the error", async () => {
    let calls = 0;
    const fetchFn: SyncFetch = async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(503, {}) : jsonResponse(201, { id: "fo-retry" });
    };
    const first = await syncFieldDraft(makeDraft(), { fetchFn, now });
    expect(first.draft.syncStatus).toBe("sync_error");
    const second = await syncFieldDraft(first.draft, { fetchFn, now });
    expect(second.draft.syncStatus).toBe("synced");
    expect(second.draft.syncError).toBeNull();
    expect(second.backendObservationId).toBe("fo-retry");
  });
});

describe("canonical taxonomy lookup", () => {
  const fetchFn: SyncFetch = async () =>
    jsonResponse(200, [
      { canonical_name: "Phragmipedium kovachii", taxonomy_id: "tax-123" },
      { canonical_name: "Phragmipedium besseae", taxonomy_id: "tax-456" },
    ]);

  it("matches the canonical name case-insensitively and keeps the label tentative", async () => {
    const match = await lookupCanonicalTaxon("phragmipedium kovachii", { fetchFn, now });
    expect(match).toEqual({ taxonomyId: "tax-123", canonicalName: "Phragmipedium kovachii", matchedAt: NOW });
  });

  it("returns null when nothing matches — never a best guess", async () => {
    expect(await lookupCanonicalTaxon("Phragmipedium hybrid unknown", { fetchFn, now })).toBeNull();
  });

  it("syncDraftWithTaxonomy attaches the match and syncs; lookup failure never blocks sync", async () => {
    const speciesFetch: SyncFetch = async (input) =>
      input.includes("/api/species/search")
        ? jsonResponse(200, [{ canonical_name: "Phragmipedium kovachii", taxonomy_id: "tax-123" }])
        : jsonResponse(201, { id: "fo-t1" });
    const draft = makeDraft({ taxonLabel: "Phragmipedium kovachii" });
    const outcome = await syncDraftWithTaxonomy(draft, { fetchFn: speciesFetch, now });
    expect(outcome.draft.taxonomyMatch?.canonicalName).toBe("Phragmipedium kovachii");
    expect(outcome.draft.taxonLabel).toBe("Phragmipedium kovachii");
    expect(outcome.confirmed).toBe(true);

    const failingLookup: SyncFetch = async (input) =>
      input.includes("/api/species/search") ? Promise.reject(new Error("offline")) : jsonResponse(201, { id: "fo-t2" });
    const second = await syncDraftWithTaxonomy(makeDraft({ taxonLabel: "Cattleya" }), { fetchFn: failingLookup, now });
    expect(second.draft.taxonomyMatch).toBeNull();
    expect(second.confirmed).toBe(true);
  });

  it("unidentified observations sync without any taxonomy call", async () => {
    const calls: string[] = [];
    const fetchFn: SyncFetch = async (input) => {
      calls.push(input);
      return jsonResponse(201, { id: "fo-u1" });
    };
    const outcome = await syncDraftWithTaxonomy(makeDraft(), { fetchFn, now });
    expect(outcome.confirmed).toBe(true);
    expect(calls.every((url) => !url.includes("/api/species/"))).toBe(true);
  });
});
