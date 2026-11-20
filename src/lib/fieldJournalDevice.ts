// Device integration for the Orchid Continuum Field Journal: handing a backup
// file to the iPad share sheet ("Save to Files") and browser storage durability.

export type BackupHandoff = "shared" | "downloaded" | "cancelled";

/** Prefer the Web Share API with files (iPad Safari "Save to Files"), else a download link. */
export async function handOffBackupFile(blob: Blob, fileName: string, title: string): Promise<BackupHandoff> {
  const file = new File([blob], fileName, { type: "application/zip" });
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav && typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Some browsers advertise file sharing but refuse it; fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give iPad Safari time to start the download before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return "downloaded";
}

export type FieldStorageStatus = {
  supported: boolean;
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
};

export async function readFieldStorageStatus(): Promise<FieldStorageStatus> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage) return { supported: false, persisted: null, usageBytes: null, quotaBytes: null };
  const persisted = typeof storage.persisted === "function" ? await storage.persisted().catch(() => null) : null;
  const estimate = typeof storage.estimate === "function" ? await storage.estimate().catch(() => null) : null;
  return {
    supported: true,
    persisted,
    usageBytes: typeof estimate?.usage === "number" ? estimate.usage : null,
    quotaBytes: typeof estimate?.quota === "number" ? estimate.quota : null,
  };
}

let persistRequest: Promise<boolean | null> | null = null;

/** Ask once per page session for persistent storage after the first durable save. */
export function requestPersistentFieldStorage(): Promise<boolean | null> {
  if (persistRequest) return persistRequest;
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage || typeof storage.persist !== "function") return Promise.resolve(null);
  persistRequest = (async () => {
    if (typeof storage.persisted === "function" && await storage.persisted().catch(() => false)) return true;
    return storage.persist().catch(() => null);
  })();
  return persistRequest;
}

export function resetPersistentFieldStorageRequestForTests(): void {
  persistRequest = null;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
