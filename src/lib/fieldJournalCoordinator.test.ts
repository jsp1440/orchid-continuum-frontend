import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFieldObservation, type FieldObservation } from "./fieldJournal";
import { discardSavedFieldObservation, editSavedFieldObservation, recoverSavedFieldObservation, syncSavedFieldObservation } from "./fieldJournalCoordinator";
import { deleteFieldObservation, getFieldObservation, saveFieldObservation } from "./fieldJournalStore";
import { syncFieldObservation } from "./fieldJournalSync";

vi.mock("./fieldJournalStore", () => ({ deleteFieldObservation: vi.fn(), getFieldObservation: vi.fn(), saveFieldObservation: vi.fn() }));
vi.mock("./fieldJournalSync", async (original) => ({ ...await original<typeof import("./fieldJournalSync")>(), syncFieldObservation: vi.fn() }));
const NOW = "2026-10-08T05:00:00.000Z";
let durable: FieldObservation;
let held: Set<string>;
beforeEach(() => {
  vi.clearAllMocks();
  durable = createFieldObservation({ accountId: "observer", note: "private field note", localityVisibility: "private", media: [{
    id: "photo", name: "original.jpg", type: "image/jpeg", size: 3, kind: "photo", blob: new Blob(["abc"]),
    capturedAt: NOW, sha256: "stored-hash", storageKey: "private-key", serverMediaId: "media-receipt", uploadedAt: NOW,
  }] }, { id: "draft", now: NOW });
  held = new Set();
  vi.stubGlobal("navigator", { locks: { request: async (name: string, _options: unknown, action: (lock: object | null) => Promise<unknown>) => {
    if (held.has(name)) return action(null);
    held.add(name);
    try { return await action({ name }); } finally { held.delete(name); }
  } } });
  vi.mocked(getFieldObservation).mockImplementation(async () => durable);
  vi.mocked(saveFieldObservation).mockImplementation(async (next) => { durable = next; return next; });
});
afterEach(() => vi.unstubAllGlobals());

describe("Field Journal browser-owned sync", () => {
  it("recovers a just-interrupted upload immediately with all private originals and receipts", async () => {
    durable = { ...durable, syncStatus: "syncing", lastSyncAttemptAt: new Date().toISOString(), serverId: "accepted" };
    const original = durable;
    const recovered = await recoverSavedFieldObservation(original);
    expect(recovered.syncStatus).toBe("failed");
    expect(recovered.serverId).toBe("accepted");
    expect(recovered.media).toBe(original.media);
    expect(recovered.media[0].blob).toBe(original.media[0].blob);
    expect(recovered.media[0].serverMediaId).toBe("media-receipt");
    expect(syncFieldObservation).not.toHaveBeenCalled();
  });
  it("never reclaims an active upload regardless of its age", async () => {
    durable = { ...durable, syncStatus: "syncing", lastSyncAttemptAt: NOW };
    held.add("orchid-field-sync:draft");
    expect(await recoverSavedFieldObservation(durable)).toBe(durable);
    expect(saveFieldObservation).not.toHaveBeenCalled();
  });
  it("suppresses simultaneous submissions and recovery until completion is persisted", async () => {
    const stale = durable;
    let finish!: (result: FieldObservation) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    vi.mocked(syncFieldObservation).mockImplementation(async () => {
      entered();
      return new Promise((resolve) => { finish = resolve; });
    });
    const first = syncSavedFieldObservation(stale);
    await started;
    expect(await syncSavedFieldObservation(stale)).toBeNull();
    expect((await recoverSavedFieldObservation(durable)).syncStatus).toBe("syncing");
    finish({ ...durable, serverId: "accepted", syncStatus: "synchronized" });
    await first;
    await syncSavedFieldObservation(stale);
    expect(syncFieldObservation).toHaveBeenCalledTimes(1);
    expect(durable.syncStatus).toBe("synchronized");
    expect(held.size).toBe(0);
  });
  it("rereads durable receipts instead of uploading stale card contents", async () => {
    const stale = durable;
    durable = { ...durable, serverId: "accepted", syncStatus: "failed" };
    vi.mocked(syncFieldObservation).mockImplementation(async (value) => ({ ...value, syncStatus: "synchronized" }));
    await syncSavedFieldObservation(stale);
    expect(vi.mocked(syncFieldObservation).mock.calls[0][0].serverId).toBe("accepted");
  });
  it("persists failure and releases ownership so another attempt can resume", async () => {
    vi.mocked(syncFieldObservation).mockImplementationOnce(async (value, checkpoint) => {
      await checkpoint?.({ ...value, serverId: "accepted" });
      throw new Error("offline");
    });
    await expect(syncSavedFieldObservation(durable)).rejects.toThrow("offline");
    expect(durable.syncStatus).toBe("failed");
    expect(durable.serverId).toBe("accepted");
    expect(held.size).toBe(0);
    vi.mocked(syncFieldObservation).mockImplementation(async (value) => ({ ...value, syncStatus: "synchronized" }));
    await syncSavedFieldObservation(durable);
    expect(durable.syncStatus).toBe("synchronized");
  });
  it("fails closed for unsupported locks while offline reading remains available", async () => {
    vi.stubGlobal("navigator", {});
    expect(await recoverSavedFieldObservation(durable)).toBe(durable);
    await expect(syncSavedFieldObservation(durable)).rejects.toMatchObject({ code: "LOCKS_UNAVAILABLE" });
    expect(syncFieldObservation).not.toHaveBeenCalled();
    expect(saveFieldObservation).not.toHaveBeenCalled();
  });
  it("rejects a removed or different-account draft without requests or writes", async () => {
    const original = durable;
    durable = { ...durable, accountId: "different" };
    await expect(syncSavedFieldObservation(original)).rejects.toMatchObject({ code: "DRAFT_UNAVAILABLE" });
    vi.mocked(getFieldObservation).mockResolvedValue(null);
    await expect(syncSavedFieldObservation(original)).rejects.toMatchObject({ code: "DRAFT_UNAVAILABLE" });
    expect(syncFieldObservation).not.toHaveBeenCalled();
    expect(saveFieldObservation).not.toHaveBeenCalled();
  });
});


describe("cross-tab edits preserve accepted receipts", () => {
  it.each(["accepted", "active", "newer"])("rejects stale edit and discard when another tab is %s", async (state) => {
    const stale = durable;
    if (state === "accepted") durable = { ...durable, serverId: "accepted", syncStatus: "failed" };
    if (state === "active") held.add("orchid-field-sync:draft");
    if (state === "newer") durable = { ...durable, updatedAt: "2026-10-09T05:00:00.000Z" };
    await expect(editSavedFieldObservation(stale, { ...stale, note: "edit" })).rejects.toThrow();
    await expect(discardSavedFieldObservation(stale)).rejects.toThrow();
    expect(saveFieldObservation).not.toHaveBeenCalled();
    expect(deleteFieldObservation).not.toHaveBeenCalled();
  });
  it("allows unchanged unsent drafts to be edited and discarded under ownership", async () => {
    const edited = await editSavedFieldObservation(durable, { ...durable, note: "new" });
    expect(edited.note).toBe("new");
    await discardSavedFieldObservation(edited);
    expect(deleteFieldObservation).toHaveBeenCalledWith("draft");
    expect(held.size).toBe(0);
  });
});
