import { describe, expect, it } from "vitest";
import {
  applyFieldObservationEdit,
  canEditFieldObservation,
  createFieldObservation,
  FIELD_JOURNAL_DARWIN_CORE_MAPPING,
  markFieldObservationFailed,
  markFieldObservationSyncing,
  mediaKindFromType,
  queueFieldObservation,
  sha256Hex,
  toFieldObservationUploadPayload,
  type FieldMedia,
} from "./fieldJournal";

const NOW = "2026-10-03T14:00:00.000Z";

function media(name = "flower.jpg", type = "image/jpeg"): FieldMedia {
  return {
    id: "media-1",
    name,
    size: 3,
    type,
    kind: mediaKindFromType(type),
    blob: new Blob(["abc"], { type }),
    capturedAt: NOW,
    sha256: null,
    storageKey: null,
    serverMediaId: null,
    uploadedAt: null,
  };
}

describe("field journal offline contract", () => {
  it("saves an unresolved observation with private capture location on the device only", () => {
    const observation = createFieldObservation(
      {
        accountId: "lance-ipad",
        note: "Flower open beside the trail.",
        localityVisibility: "private",
        privateLocation: {
          latitude: -13.123,
          longitude: -72.456,
          accuracyM: 8,
          elevationM: 2890,
          capturedAt: NOW,
          localityNotes: "Do not publish this site.",
        },
        habitat: "cloud forest",
        associatedOrganisms: ["bee", "moss"],
        media: [media()],
      },
      { id: "draft-1", now: NOW },
    );

    expect(observation.identificationStatus).toBe("unresolved");
    expect(observation.syncStatus).toBe("local_only");
    expect(observation.privateLocation?.latitude).toBe(-13.123);
    expect(observation.media).toHaveLength(1);
  });

  it("upload payload carries ecology and idempotency key but never coordinates or locality notes", () => {
    const observation = createFieldObservation(
      {
        accountId: "lance-ipad",
        note: "Flower open beside the trail.",
        taxonLabel: "Phragmipedium",
        localityVisibility: "research_restricted",
        privateLocation: {
          latitude: -13.123,
          longitude: -72.456,
          accuracyM: 8,
          elevationM: null,
          capturedAt: NOW,
          localityNotes: "private site note",
        },
        habitat: "cloud forest",
        substrate: "mossy branch",
        ecologicalNotes: "bee nearby",
        associatedOrganisms: ["bee"],
        pollinatorObservations: "approach only",
        mycorrhizalObservations: "not observed",
        phenology: "flower",
        media: [media(), media("clip.mp4", "video/mp4")],
      },
      { id: "draft-2", now: NOW },
    );

    const payload = toFieldObservationUploadPayload(observation);
    expect(payload).toMatchObject({
      client_draft_id: "draft-2",
      taxon_hint: "Phragmipedium",
      locality_visibility: "research_restricted",
      habitat: "cloud forest",
      associated_organisms: ["bee"],
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("localityNotes");
    expect(serialized).not.toContain("private site note");
    expect(payload.media).toEqual([
      { name: "flower.jpg", size: 3, type: "image/jpeg" },
      { name: "clip.mp4", size: 3, type: "video/mp4" },
    ]);
  });

  it("keeps local_only → queued → syncing → failed/synchronized states explicit", () => {
    const observation = createFieldObservation(
      { accountId: "lance-ipad", note: "Observed", localityVisibility: "private" },
      { id: "draft-3", now: NOW },
    );
    const queued = queueFieldObservation(observation);
    const syncing = markFieldObservationSyncing(queued, "2026-10-03T15:00:00.000Z");
    const failed = markFieldObservationFailed(syncing, "offline", "2026-10-03T15:01:00.000Z");

    expect(observation.syncStatus).toBe("local_only");
    expect(queued.syncStatus).toBe("queued");
    expect(syncing.syncStatus).toBe("syncing");
    expect(syncing.syncAttempts).toBe(1);
    expect(failed.syncStatus).toBe("failed");
    expect(failed.syncError).toBe("offline");
    expect(canEditFieldObservation(observation)).toBe(true);
    expect(canEditFieldObservation(syncing)).toBe(false);
  });

  it("allows editing an unsynchronized draft without changing its durable local id", () => {
    const observation = createFieldObservation(
      { accountId: "lance-ipad", note: "Observed", localityVisibility: "private" },
      { id: "draft-4", now: NOW },
    );
    const edited = applyFieldObservationEdit(
      observation,
      { note: "Edited note", localityVisibility: "private", habitat: "ridge" },
      "2026-10-03T16:00:00.000Z",
    );
    expect(edited.id).toBe("draft-4");
    expect(edited.note).toBe("Edited note");
    expect(edited.habitat).toBe("ridge");
    expect(edited.syncStatus).toBe("local_only");
  });

  it("hashes original media bytes for idempotent attachment", async () => {
    await expect(sha256Hex(new Blob(["abc"]))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("documents the Darwin Core direction without inventing a public coordinate mapping", () => {
    expect(FIELD_JOURNAL_DARWIN_CORE_MAPPING.observedAt).toBe("eventDate");
    expect(FIELD_JOURNAL_DARWIN_CORE_MAPPING.privateLocation).toContain("PRIVATE");
  });
});
