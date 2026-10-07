import { describe, expect, it } from "vitest";
import {
  applyLocalityProtection,
  createFieldDraft,
  FIELD_DRAFT_LIMIT,
  fieldDraftStorageKey,
  migrateFieldDraftV1,
  readFieldDrafts,
  transitionFieldDraftSync,
  writeFieldDrafts,
  type FieldDraft,
} from "@/lib/fieldDrafts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function makeDraft(overrides: Partial<Parameters<typeof createFieldDraft>[0]> = {}) {
  return createFieldDraft(
    { note: " Flower open near the shaded bench. ", localityVisibility: "private", ...overrides },
    { id: "draft-1", now: "2026-09-09T12:00:00.000Z" },
  );
}

describe("field draft persistence", () => {
  it("preserves governed locality and media metadata without publication state", () => {
    const draft = makeDraft({
      taxonLabel: " Phragmipedium ",
      localityVisibility: "research_restricted",
      media: [{ id: "m-1", name: "flower.jpg", size: 42, type: "image/jpeg", capturedAt: "2026-09-09T11:59:00.000Z" }],
    });

    expect(draft).toMatchObject({
      note: "Flower open near the shaded bench.",
      taxonLabel: "Phragmipedium",
      localityVisibility: "research_restricted",
      syncStatus: "local_saved",
    });
    expect(draft).not.toHaveProperty("published");
  });

  it("allows an unidentified, note-free observation when photos exist", () => {
    const draft = makeDraft({
      note: "",
      media: [{ id: "m-1", name: "IMG_0001.jpg", size: 10, type: "image/jpeg", capturedAt: null }],
    });
    expect(draft.taxonLabel).toBeNull();
    expect(draft.media).toHaveLength(1);
  });

  it("rejects a completely empty observation and invalid locality values", () => {
    expect(() => makeDraft({ note: "  " })).toThrow("field note");
    expect(() => createFieldDraft(
      { note: "Observed", localityVisibility: "hidden" as never },
      { id: "draft-x", now: "2026-09-09T12:00:00.000Z" },
    )).toThrow("governed locality");
  });

  it("round-trips valid drafts and fails closed on malformed storage", () => {
    const storage = new MemoryStorage();
    const draft = makeDraft();
    writeFieldDrafts(storage, [draft], "user-a");
    expect(readFieldDrafts(storage, "user-a")).toEqual([draft]);

    storage.setItem(fieldDraftStorageKey("user-a"), "{not json");
    expect(readFieldDrafts(storage, "user-a")).toEqual([]);
  });

  it("keeps accounts separated and enforces the draft limit", () => {
    const storage = new MemoryStorage();
    const draft = makeDraft();
    writeFieldDrafts(storage, [draft], "user-a");
    expect(readFieldDrafts(storage, "user-b")).toEqual([]);
    expect(() => writeFieldDrafts(storage, Array(FIELD_DRAFT_LIMIT + 1).fill(draft), "user-a")).toThrow("100");
  });
});

describe("locality protection", () => {
  const precise = { latitude: -13.123456, longitude: -72.654321, accuracyMeters: 8, elevationMeters: 2900 };

  it("preserves precise coordinates on private and research-restricted records", () => {
    expect(applyLocalityProtection(precise, "private")).toEqual(precise);
    expect(applyLocalityProtection(precise, "research_restricted")).toEqual(precise);
  });

  it("coarsens coordinates on public records so exact localities cannot leak", () => {
    const coarsened = applyLocalityProtection(precise, "public");
    expect(coarsened).toEqual({ latitude: -13.1, longitude: -72.7, accuracyMeters: null, elevationMeters: 2900 });
  });

  it("applies protection both at creation and when reading storage back", () => {
    const draft = makeDraft({ localityVisibility: "public", coordinates: precise });
    expect(draft.coordinates?.latitude).toBe(-13.1);

    // Simulate a hand-edited storage payload carrying precise coordinates on a
    // public record: the read path must coarsen again, never trust storage.
    const storage = new MemoryStorage();
    writeFieldDrafts(storage, [makeDraft({ coordinates: precise })], "user-a");
    const raw = JSON.parse(storage.getItem(fieldDraftStorageKey("user-a"))!);
    raw[0].localityVisibility = "public";
    storage.setItem(fieldDraftStorageKey("user-a"), JSON.stringify(raw));
    expect(readFieldDrafts(storage, "user-a")[0].coordinates?.latitude).toBe(-13.1);
  });

  it("drops out-of-range coordinate fixes entirely", () => {
    const draft = makeDraft({ coordinates: { latitude: 95, longitude: 0, accuracyMeters: null, elevationMeters: null } });
    expect(draft.coordinates).toBeNull();
  });
});

describe("sync status machine", () => {
  it("walks local_saved → sync_pending → synced and records errors without data loss", () => {
    const draft = makeDraft();
    const pending = transitionFieldDraftSync(draft, "sync_pending", "2026-09-09T13:00:00.000Z");
    expect(pending.syncStatus).toBe("sync_pending");

    const failed = transitionFieldDraftSync(pending, "sync_error", "2026-09-09T13:05:00.000Z", "network down");
    expect(failed.syncStatus).toBe("sync_error");
    expect(failed.syncError).toBe("network down");
    expect(failed.note).toBe(draft.note);
    expect(failed.media).toEqual(draft.media);

    const retried = transitionFieldDraftSync(failed, "sync_pending", "2026-09-09T13:10:00.000Z");
    const synced = transitionFieldDraftSync(retried, "synced", "2026-09-09T13:15:00.000Z");
    expect(synced.syncStatus).toBe("synced");
    expect(synced.syncError).toBeNull();
  });

  it("rejects impossible transitions", () => {
    const draft = makeDraft();
    expect(() => transitionFieldDraftSync(draft, "synced", "2026-09-09T13:00:00.000Z")).toThrow("Invalid sync transition");
  });
});

describe("v1 migration", () => {
  it("migrates a legacy local_only draft to v2 without losing data", () => {
    const legacy = {
      schemaVersion: 1 as const,
      id: "legacy-1",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      note: "Old draft note",
      taxonLabel: null,
      localityVisibility: "private" as const,
      media: [{ name: "old.jpg", size: 12, type: "image/jpeg" }],
      status: "local_only" as const,
    };
    const migrated = migrateFieldDraftV1(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.note).toBe("Old draft note");
    expect(migrated.syncStatus).toBe("local_saved");
    expect(migrated.media[0]).toMatchObject({ id: "legacy-legacy-1-0", name: "old.jpg" });
    expect(migrated.coordinates).toBeNull();
  });

  it("reads mixed v1/v2 storage and drops malformed entries", () => {
    const storage = new MemoryStorage();
    const v2: FieldDraft = makeDraft();
    const payload = [
      v2,
      {
        schemaVersion: 1, id: "legacy-2", createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z", note: "Legacy", taxonLabel: "Cattleya",
        localityVisibility: "public", media: [], status: "local_only",
      },
      { schemaVersion: 99, id: "garbage" },
    ];
    storage.setItem(fieldDraftStorageKey("user-a"), JSON.stringify(payload));
    const drafts = readFieldDrafts(storage, "user-a");
    expect(drafts).toHaveLength(2);
    expect(drafts[1].taxonLabel).toBe("Cattleya");
  });
});
