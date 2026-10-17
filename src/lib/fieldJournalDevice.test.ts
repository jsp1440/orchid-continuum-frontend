import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBytes, handOffBackupFile, readFieldStorageStatus, requestPersistentFieldStorage, resetPersistentFieldStorageRequestForTests } from "./fieldJournalDevice";

beforeEach(() => resetPersistentFieldStorageRequestForTests());
afterEach(() => vi.unstubAllGlobals());

describe("Field Journal device storage", () => {
  it("requests persistent storage once and reuses the answer", async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persist, persisted: async () => false } });
    await expect(requestPersistentFieldStorage()).resolves.toBe(true);
    await expect(requestPersistentFieldStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not prompt again when storage is already persistent", async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persist, persisted: async () => true } });
    await expect(requestPersistentFieldStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("reports unsupported storage truthfully and reads usage estimates", async () => {
    vi.stubGlobal("navigator", {});
    await expect(requestPersistentFieldStorage()).resolves.toBeNull();
    await expect(readFieldStorageStatus()).resolves.toEqual({ supported: false, persisted: null, usageBytes: null, quotaBytes: null });
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 1024 ** 3 }) } });
    await expect(readFieldStorageStatus()).resolves.toEqual({ supported: true, persisted: false, usageBytes: 5 * 1024 * 1024, quotaBytes: 1024 ** 3 });
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(null)).toBe("unknown");
  });
});

describe("Field Journal backup hand-off", () => {
  it("uses the share sheet with the ZIP file when file sharing is supported", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share });
    await expect(handOffBackupFile(new Blob(["zip"]), "backup.zip", "Backup")).resolves.toBe("shared");
    const shared = share.mock.calls[0][0] as { files: File[] };
    expect(shared.files[0].name).toBe("backup.zip");
    expect(shared.files[0].type).toBe("application/zip");
  });

  it("reports a cancelled share without downloading", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: async () => { throw new DOMException("cancel", "AbortError"); } });
    await expect(handOffBackupFile(new Blob(["zip"]), "backup.zip", "Backup")).resolves.toBe("cancelled");
  });

  it("falls back to a download link when files cannot be shared", async () => {
    const click = vi.fn();
    const link = { click, remove: vi.fn(), href: "", download: "" };
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    vi.stubGlobal("window", { setTimeout: vi.fn() });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
    await expect(handOffBackupFile(new Blob(["zip"]), "backup.zip", "Backup")).resolves.toBe("downloaded");
    expect(link.download).toBe("backup.zip");
    expect(click).toHaveBeenCalled();
    createObjectURL.mockRestore();
  });
});
