import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFieldObservationEdit, canEditFieldObservation, createFieldObservation, type FieldMedia, type FieldObservation } from "./fieldJournal";
import { failureForSync, FIELD_SYNC_REQUEST_TIMEOUT_MS, syncFieldObservation } from "./fieldJournalSync";

const NOW = "2026-10-03T14:00:00.000Z";
const HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
function draft(): FieldObservation {
  const media: FieldMedia[] = ["flower.jpg", "clip.mp4"].map((name, index) => ({
    id: `media-${index}`, name, size: 3, type: index ? "video/mp4" : "image/jpeg",
    kind: index ? "video" : "photo", blob: new Blob(["abc"]), capturedAt: NOW,
    sha256: null, storageKey: null, serverMediaId: null, uploadedAt: null,
  }));
  return createFieldObservation({ accountId: "observer", note: "Flower open", localityVisibility: "private", media }, { id: "draft", now: NOW });
}
function json(payload: unknown, status = 201) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}
function receipt(id: string) {
  return { id, storage_key: `opaque-${id}`, content_hash: HASH };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Field Journal durable sync receipts", () => {
  it("persists each accepted stage and resumes without resending the first original", async () => {
    const observation = draft();
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ id: "fo-1" }))
      .mockResolvedValueOnce(json(receipt("photo-1")))
      .mockRejectedValueOnce(new TypeError("network disconnected"));
    vi.stubGlobal("fetch", fetch);
    let durable = observation;
    const checkpoint = vi.fn(async (progress: FieldObservation) => { durable = progress; });
    await expect(syncFieldObservation(observation, checkpoint)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(durable.serverId).toBe("fo-1");
    expect(durable.media[0].serverMediaId).toBe("photo-1");
    expect(durable.media[1].serverMediaId).toBeNull();
    expect(durable.media[0].blob).toBe(observation.media[0].blob);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValueOnce(json(receipt("video-1")));
    const result = await syncFieldObservation(failureForSync(durable, new Error("offline")), checkpoint);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/fo-1/media");
    expect((fetch.mock.calls[0][1].body as FormData).get("client_media_id")).toBe("media-1");
    expect(result.syncStatus).toBe("synchronized");
    expect(result.media.map((item) => item.serverMediaId)).toEqual(["photo-1", "video-1"]);
    expect(result.media[1].blob).toBe(observation.media[1].blob);
  });

  it.each([
    [{ id: "photo", storage_key: "opaque" }, "HASH_MISMATCH"],
    [{ ...receipt("photo"), content_hash: "incorrect" }, "HASH_MISMATCH"],
    [{ storage_key: "opaque", content_hash: HASH }, "NO_MEDIA_RECEIPT"],
    [{ id: "photo", content_hash: HASH }, "NO_MEDIA_RECEIPT"],
    [{ id: "", storage_key: "", content_hash: HASH }, "NO_MEDIA_RECEIPT"],
  ])("rejects incomplete or mismatching media acceptance %#", async (payload, code) => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ id: "fo-1" })).mockResolvedValueOnce(json(payload));
    vi.stubGlobal("fetch", fetch);
    const observation = draft();
    await expect(syncFieldObservation(observation)).rejects.toMatchObject({ code });
    expect(observation.media[0].uploadedAt).toBeNull();
    expect(observation.syncStatus).toBe("local_only");
  });

  it("stops before uploading originals when the acceptance checkpoint cannot be stored", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ id: "fo-1" }));
    vi.stubGlobal("fetch", fetch);
    await expect(syncFieldObservation(draft(), async () => { throw new Error("quota exceeded"); })).rejects.toMatchObject({ code: "CHECKPOINT_FAILED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("prevents edits to partially accepted observations until server updates exist", () => {
    const observation = { ...draft(), serverId: "fo-1", syncStatus: "failed" as const };
    expect(canEditFieldObservation(observation)).toBe(false);
    expect(() => applyFieldObservationEdit(observation, { note: "changed", localityVisibility: "private" }, NOW)).toThrow("accepted by the server");
  });
});


describe("bounded Field Journal network requests", () => {
  it("aborts an unresponsive upload and retains local originals for an idempotent retry", async () => {
    vi.useFakeTimers();
    const observation = draft();
    const fetch = vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetch);
    const attempt = expect(syncFieldObservation(observation)).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(FIELD_SYNC_REQUEST_TIMEOUT_MS);
    await attempt;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(observation.media[0].blob.size).toBe(3);
    expect(observation.serverId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
