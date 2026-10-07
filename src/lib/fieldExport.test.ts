import { describe, expect, it } from "vitest";
import { createFieldDraft } from "@/lib/fieldDrafts";
import {
  base64ToBlob,
  blobToBase64,
  buildDraftsManifest,
  buildObservationBundle,
  observationExportFilename,
  serializeObservationBundle,
} from "@/lib/fieldExport";
import { toMediaDescriptor, type StoredFieldMedia } from "@/lib/fieldMediaStore";

const NOW = "2026-10-07T08:00:00.000Z";

function draftWithMedia() {
  const descriptor = toMediaDescriptor(
    { name: "IMG_0001.jpg", size: 11, type: "image/jpeg" },
    "m-1",
    NOW,
  );
  const draft = createFieldDraft(
    {
      note: "Single flower, yellow pouch.",
      taxonLabel: "",
      localityVisibility: "private",
      coordinates: { latitude: -13.123456, longitude: -72.654321, accuracyMeters: 5, elevationMeters: 2890 },
      ecology: { growthHabit: "Terrestrial", habitat: "cloud forest" },
      relationships: { pollinatorInteraction: "bee entered flower" },
      observerName: "Lance Peck",
      provenance: "personal observation",
      media: [descriptor],
    },
    { id: "obs-1", now: NOW },
  );
  const blob = new Blob(["hello world"], { type: "image/jpeg" });
  const record: StoredFieldMedia = {
    id: "m-1",
    draftId: "obs-1",
    name: "IMG_0001.jpg",
    type: "image/jpeg",
    size: blob.size,
    capturedAt: NOW,
    blob,
  };
  return { draft, record };
}

describe("field observation export", () => {
  it("embeds original media bytes unmodified", async () => {
    const { draft, record } = draftWithMedia();
    const bundle = await buildObservationBundle(draft, [record], NOW);
    expect(bundle.media).toHaveLength(1);

    const restored = base64ToBlob(bundle.media[0].dataBase64, bundle.media[0].type);
    expect(await restored.text()).toBe("hello world");
    expect(bundle.media[0].name).toBe("IMG_0001.jpg");
  });

  it("round-trips base64 through the same bytes", async () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = await blobToBase64(new Blob([original]));
    const decoded = new Uint8Array(await base64ToBlob(encoded, "application/octet-stream").arrayBuffer());
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("marks tentative labels as tentative and null labels as unidentified", async () => {
    const { draft, record } = draftWithMedia();
    const bundle = await buildObservationBundle(draft, [record], NOW);
    expect(bundle.observation.identificationStatus).toBe("unidentified");
    expect(bundle.observation.tentativeTaxon).toBeNull();

    const labelled = createFieldDraft(
      { taxonLabel: "Phragmipedium cf. kovachii", localityVisibility: "private" },
      { id: "obs-2", now: NOW },
    );
    const labelledBundle = await buildObservationBundle(labelled, [], NOW);
    expect(labelledBundle.observation.identificationStatus).toBe("tentative");
    expect(labelledBundle.observation).not.toHaveProperty("acceptedIdentification");
  });

  it("exports coordinates exactly as stored (protection already applied at creation)", async () => {
    const { draft, record } = draftWithMedia();
    const bundle = await buildObservationBundle(draft, [record], NOW);
    expect(bundle.observation.coordinates?.latitude).toBe(-13.123456);

    const publicDraft = createFieldDraft(
      {
        note: "public record",
        localityVisibility: "public",
        coordinates: { latitude: -13.123456, longitude: -72.654321, accuracyMeters: 5, elevationMeters: null },
      },
      { id: "obs-3", now: NOW },
    );
    const publicBundle = await buildObservationBundle(publicDraft, [], NOW);
    expect(publicBundle.observation.coordinates?.latitude).toBe(-13.1);
  });

  it("refuses to export when a media file is missing rather than dropping it silently", async () => {
    const { draft } = draftWithMedia();
    await expect(buildObservationBundle(draft, [], NOW)).rejects.toThrow("missing");
  });

  it("serializes to parseable JSON with a stable format marker and filename", async () => {
    const { draft, record } = draftWithMedia();
    const bundle = await buildObservationBundle(draft, [record], NOW);
    const parsed = JSON.parse(serializeObservationBundle(bundle));
    expect(parsed.format).toBe("orchid-continuum.field-observation");
    expect(observationExportFilename(draft)).toBe("field-observation-2026-10-07-obs-1.json");
  });

  it("builds a media-free index manifest across drafts", () => {
    const { draft } = draftWithMedia();
    const manifest = buildDraftsManifest([draft], NOW);
    expect(manifest.count).toBe(1);
    expect(manifest.observations[0]).toMatchObject({
      id: "obs-1",
      hasCoordinates: true,
      mediaCount: 1,
      syncStatus: "local_saved",
      identificationStatus: "unidentified",
    });
    expect(JSON.stringify(manifest)).not.toContain("dataBase64");
  });
});
