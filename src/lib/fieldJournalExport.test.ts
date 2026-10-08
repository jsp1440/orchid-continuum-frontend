import { describe, expect, it } from "vitest";
import { createFieldObservation, type FieldMedia } from "./fieldJournal";
import { fieldJournalMetadataExport, type FieldJournalExportMode } from "./fieldJournalExport";

const NOW = "2026-10-03T14:00:00.000Z";
function observation(id = "draft-1") {
  const media: FieldMedia = {
    id: "media-1", name: "flower.jpg", size: 8, type: "image/jpeg", kind: "photo",
    blob: new Blob(["original"]), capturedAt: NOW, sha256: "original-hash", storageKey: "private-storage-key",
    serverMediaId: "photo-1", uploadedAt: NOW,
  };
  return createFieldObservation({
    accountId: "private-account", note: "Observer note", localityVisibility: "private", media: [media],
    privateLocation: { latitude: 30.123456, longitude: -140.123456, accuracyM: 8, elevationM: null, capturedAt: NOW, localityNotes: "Restricted capture note" },
    habitat: "forest", associatedOrganisms: ["bee"],
  }, { id, now: NOW });
}

describe("device-local Field Journal metadata export", () => {
  it("excludes captured GPS, locality notes, account identity and storage credentials by default", () => {
    const result = fieldJournalMetadataExport([observation()], NOW);
    const serialized = JSON.stringify(result);
    for (const forbidden of ["privateLocation", "latitude", "longitude", "accuracyM", "localityNotes", "Restricted capture note", "private-account", "private-storage-key"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(result).toMatchObject({ mode: "metadata", disclosure: "private_working_copy", includesPrivateCaptureLocation: false });
    expect(result.observations[0]).toMatchObject({ note: "Observer note", habitat: "forest", identificationStatus: "unresolved" });
  });

  it("includes private capture metadata only under the explicit private backup mode", () => {
    const source = observation();
    const result = fieldJournalMetadataExport([source], NOW, "private_backup");
    expect(result.includesPrivateCaptureLocation).toBe(true);
    expect(result.observations[0].privateLocation).toEqual(source.privateLocation);
    expect(result.notice).toContain("not a public-safe export");
    expect(result.includesMediaBytes).toBe(false);
  });

  it("exports photo/video metadata and accepted receipts without originals or mutating the device record", () => {
    const source = observation();
    const original = source.media[0].blob;
    const video = { ...source.media[0], id: "video-1", name: "clip.mp4", type: "video/mp4", kind: "video" as const };
    source.media.push(video);
    source.serverId = "fo-1";
    source.syncStatus = "failed";
    const result = fieldJournalMetadataExport([source], NOW);
    expect(result.observations[0]).toMatchObject({ serverId: "fo-1", syncStatus: "failed" });
    expect(result.observations[0].media).toHaveLength(2);
    expect(result.observations[0].media[1]).toMatchObject({ kind: "video", name: "clip.mp4", sha256: "original-hash", serverMediaId: "photo-1" });
    expect(JSON.stringify(result)).not.toContain('"blob"');
    expect(JSON.stringify(result)).not.toContain('"original"');
    expect(source.media[0].blob).toBe(original);
    expect(source.syncStatus).toBe("failed");
  });

  it("supports one-observation and all-observation downloads including offline drafts", () => {
    const sources = [observation(), observation("draft-2")];
    expect(fieldJournalMetadataExport(sources, NOW).observations.map((item) => item.id)).toEqual(["draft-1", "draft-2"]);
    expect(fieldJournalMetadataExport([sources[1]], NOW).observations.map((item) => item.id)).toEqual(["draft-2"]);
    expect(fieldJournalMetadataExport([], NOW).observations).toEqual([]);
  });

  it("rejects unknown export modes and never labels free text as public-safe", () => {
    expect(() => fieldJournalMetadataExport([observation()], NOW, "public" as FieldJournalExportMode)).toThrow("valid Field Journal export mode");
    const source = observation();
    source.note = "Private location may be typed in free text";
    const result = fieldJournalMetadataExport([source], NOW);
    expect(result.notice).toContain("notes and filenames may contain sensitive information");
    expect(result.disclosure).toBe("private_working_copy");
    expect(result.observations[0].note).toBe(source.note);
  });
});
