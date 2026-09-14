import { describe, expect, it } from "vitest";
import {
  createFieldDraft,
  FIELD_DRAFT_LIMIT,
  fieldDraftStorageKey,
  readFieldDrafts,
  writeFieldDrafts,
} from "@/lib/fieldDrafts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("field draft persistence", () => {
  it("preserves governed locality and media metadata without coordinates or publication state", () => {
    const draft = createFieldDraft(
      {
        note: " Flower open near the shaded bench. ",
        taxonLabel: " Phragmipedium ",
        localityVisibility: "research_restricted",
        media: [{ name: "flower.jpg", size: 42, type: "image/jpeg" }],
      },
      { id: "draft-1", now: "2026-09-09T12:00:00.000Z" },
    );

    expect(draft).toMatchObject({
      note: "Flower open near the shaded bench.",
      taxonLabel: "Phragmipedium",
      localityVisibility: "research_restricted",
      status: "local_only",
    });
    expect(draft).not.toHaveProperty("coordinates");
    expect(draft).not.toHaveProperty("published");
  });

  it("round-trips valid drafts and fails closed on malformed storage", () => {
    const storage = new MemoryStorage();
    const draft = createFieldDraft(
      { note: "New root tip", localityVisibility: "private" },
      { id: "draft-2", now: "2026-09-09T12:01:00.000Z" },
    );
    writeFieldDrafts(storage, [draft], "user-a");
    expect(readFieldDrafts(storage, "user-a")).toEqual([draft]);

    storage.setItem(fieldDraftStorageKey("user-a"), "{not json");
    expect(readFieldDrafts(storage, "user-a")).toEqual([]);
  });

  it("rejects empty notes and invalid locality values", () => {
    expect(() => createFieldDraft(
      { note: "  ", localityVisibility: "private" },
      { id: "draft-3", now: "2026-09-09T12:02:00.000Z" },
    )).toThrow("field note");

    expect(() => createFieldDraft(
      { note: "Observed", localityVisibility: "hidden" as never },
      { id: "draft-4", now: "2026-09-09T12:03:00.000Z" },
    )).toThrow("governed locality");
  });

  it("drops invalid records rather than treating them as drafts", () => {
    const storage = new MemoryStorage();
    storage.setItem(fieldDraftStorageKey("user-a"), JSON.stringify([
      { schemaVersion: 1, id: "unsafe", note: "missing governance", status: "local_only" },
    ]));
    expect(readFieldDrafts(storage, "user-a")).toEqual([]);
  });

  it("isolates drafts by authenticated account", () => {
    const storage = new MemoryStorage();
    const draft = createFieldDraft(
      { note: "Private bench note", localityVisibility: "private" },
      { id: "draft-private", now: "2026-09-09T12:04:00.000Z" },
    );

    writeFieldDrafts(storage, [draft], "user-a");

    expect(readFieldDrafts(storage, "user-a")).toEqual([draft]);
    expect(readFieldDrafts(storage, "user-b")).toEqual([]);
    expect(fieldDraftStorageKey("user-a")).not.toBe(fieldDraftStorageKey("user-b"));
  });

  it("fails closed when browser storage cannot be read", () => {
    const storage = {
      getItem() {
        throw new DOMException("Storage disabled", "SecurityError");
      },
    };

    expect(readFieldDrafts(storage, "user-a")).toEqual([]);
  });

  it("rejects capacity overflow instead of silently losing a draft", () => {
    const storage = new MemoryStorage();
    const draft = createFieldDraft(
      { note: "Capacity test", localityVisibility: "private" },
      { id: "draft-capacity", now: "2026-09-09T12:05:00.000Z" },
    );

    expect(() =>
      writeFieldDrafts(
        storage,
        Array.from({ length: FIELD_DRAFT_LIMIT + 1 }, (_, index) => ({
          ...draft,
          id: `draft-${index}`,
        })),
        "user-a",
      ),
    ).toThrow("Discard or upload a draft");
  });
});
