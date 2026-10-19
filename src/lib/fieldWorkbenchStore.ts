/**
 * Durable local persistence for the capture-first workbench (#918).
 *
 * Original media bytes are written before the workbench record that refers to
 * them, so an interruption between the two can leave an unreferenced original
 * (recoverable, listed by ``orphanedBlobIds``) but never a record whose original
 * is missing. Nothing here deletes an original.
 *
 * The IndexedDB database is separate from the existing observations database
 * ("orchid-continuum-field-journal"), so this adds no schema migration to it.
 */

import {
  FIELD_WORKBENCH_SCHEMA_VERSION,
  type ImportFile,
  type WorkbenchDeps,
  type WorkbenchState,
  createWorkbench,
  defaultDeps,
  importMedia,
} from "./fieldWorkbench";

export interface WorkbenchStorage {
  loadState(accountId: string): Promise<unknown | null>;
  saveState(state: WorkbenchState): Promise<void>;
  putBlob(mediaId: string, blob: Blob): Promise<void>;
  getBlob(mediaId: string): Promise<Blob | null>;
  blobIds(): Promise<string[]>;
}

export class WorkbenchStoreError extends Error {}

/** Validate a stored record before trusting it; a corrupt record is never half-loaded. */
export function restoreWorkbench(raw: unknown, accountId: string): WorkbenchState | null {
  if (raw == null) return null;
  if (typeof raw !== "object") throw new WorkbenchStoreError("Stored workbench is not an object.");
  const s = raw as Partial<WorkbenchState>;
  if (s.schemaVersion !== FIELD_WORKBENCH_SCHEMA_VERSION) {
    throw new WorkbenchStoreError(`Stored workbench schema ${String(s.schemaVersion)} is not supported.`);
  }
  if (s.accountId !== accountId) throw new WorkbenchStoreError("Stored workbench belongs to another account.");
  for (const key of ["media", "plants", "relationships", "sessionProfiles", "siteTemplates"] as const) {
    if (!s[key] || typeof s[key] !== "object" || Array.isArray(s[key])) {
      throw new WorkbenchStoreError(`Stored workbench is missing ${key}.`);
    }
  }
  if (!Array.isArray(s.audit) || typeof s.nextPlantNumber !== "number") {
    throw new WorkbenchStoreError("Stored workbench is missing its audit trail or plant counter.");
  }
  const media = s.media as WorkbenchState["media"];
  for (const plant of Object.values(s.plants as WorkbenchState["plants"])) {
    for (const id of plant.mediaIds) {
      if (!media[id]) throw new WorkbenchStoreError(`Plant ${plant.label} refers to missing media ${id}.`);
    }
  }
  return s as WorkbenchState;
}

export async function openWorkbench(storage: WorkbenchStorage, accountId: string): Promise<WorkbenchState> {
  return restoreWorkbench(await storage.loadState(accountId), accountId) ?? createWorkbench(accountId);
}

/**
 * Import and persist in one step: every original is stored first, then the
 * record. Returns the saved state, or throws with nothing referenced that is
 * not stored.
 */
export async function importAndPersist(
  storage: WorkbenchStorage,
  state: WorkbenchState,
  files: { file: ImportFile; blob: Blob }[],
  deps: WorkbenchDeps = defaultDeps,
): Promise<{ state: WorkbenchState; importedIds: string[]; rejected: ImportFile[] }> {
  const result = importMedia(state, files.map((f) => f.file), deps);
  const blobFor = new Map(files.map((f) => [f.file, f.blob]));
  const byOrder = files.map((f) => f.file).filter((f) => !result.rejected.includes(f));
  for (const [i, media] of result.imported.entries()) {
    const blob = blobFor.get(byOrder[i]);
    if (!blob) throw new WorkbenchStoreError(`No original bytes for ${media.name}.`);
    await storage.putBlob(media.id, blob);
  }
  await storage.saveState(result.state);
  return { state: result.state, importedIds: result.imported.map((m) => m.id), rejected: result.rejected };
}

/** Persist a state produced by any workbench operation. */
export async function persist(storage: WorkbenchStorage, state: WorkbenchState): Promise<WorkbenchState> {
  restoreWorkbench(state, state.accountId);
  await storage.saveState(state);
  return state;
}

/** Originals stored without a record (an import interrupted before its record saved). */
export async function orphanedBlobIds(storage: WorkbenchStorage, state: WorkbenchState): Promise<string[]> {
  return (await storage.blobIds()).filter((id) => !state.media[id]).sort();
}

/** In-memory storage: tests and environments without IndexedDB. Round-trips through JSON like the real store. */
export class MemoryWorkbenchStorage implements WorkbenchStorage {
  private states = new Map<string, string>();
  private blobs = new Map<string, Blob>();

  async loadState(accountId: string): Promise<unknown | null> {
    const raw = this.states.get(accountId);
    return raw == null ? null : JSON.parse(raw);
  }

  async saveState(state: WorkbenchState): Promise<void> {
    this.states.set(state.accountId, JSON.stringify(state));
  }

  async putBlob(mediaId: string, blob: Blob): Promise<void> {
    this.blobs.set(mediaId, blob);
  }

  async getBlob(mediaId: string): Promise<Blob | null> {
    return this.blobs.get(mediaId) ?? null;
  }

  async blobIds(): Promise<string[]> {
    return [...this.blobs.keys()];
  }
}

const DB_NAME = "orchid-continuum-field-workbench";
const DB_VERSION = 1;
const STATES = "workbench";
const BLOBS = "originals";

/** IndexedDB storage in its own database; originals are stored as Blobs, never re-encoded. */
export class IndexedDbWorkbenchStorage implements WorkbenchStorage {
  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new WorkbenchStoreError("This browser does not provide durable offline storage (IndexedDB)."));
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STATES)) db.createObjectStore(STATES, { keyPath: "accountId" });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      request.onerror = () => reject(request.error ?? new WorkbenchStoreError("Workbench storage could not be opened."));
      request.onblocked = () => reject(new WorkbenchStoreError("Workbench storage is blocked by another tab."));
      request.onsuccess = () => resolve(request.result);
    });
  }

  private async run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error ?? new WorkbenchStoreError("Workbench storage request failed."));
        tx.onabort = () => reject(tx.error ?? new WorkbenchStoreError("Workbench storage transaction aborted."));
        tx.oncomplete = () => resolve(result);
      });
    } finally {
      db.close();
    }
  }

  async loadState(accountId: string): Promise<unknown | null> {
    return (await this.run(STATES, "readonly", (s) => s.get(accountId))) ?? null;
  }

  async saveState(state: WorkbenchState): Promise<void> {
    await this.run(STATES, "readwrite", (s) => s.put(state));
  }

  async putBlob(mediaId: string, blob: Blob): Promise<void> {
    await this.run(BLOBS, "readwrite", (s) => s.put(blob, mediaId));
  }

  async getBlob(mediaId: string): Promise<Blob | null> {
    const blob = await this.run(BLOBS, "readonly", (s) => s.get(mediaId));
    return blob instanceof Blob ? blob : null;
  }

  async blobIds(): Promise<string[]> {
    return (await this.run(BLOBS, "readonly", (s) => s.getAllKeys())).map(String);
  }
}
