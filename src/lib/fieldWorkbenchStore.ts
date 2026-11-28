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
  RELATIONSHIP_TYPES,
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

const PLANT_LABEL = /^Plant (\d+)$/;
const IDENTITY_CERTAINTIES = new Set(["same_individual", "possibly_same_individual", "same_patch_or_colony"]);
const CONFIDENCES = new Set(["certain", "probable", "possible"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** An own key only: ``constructor`` or ``__proto__`` never count as a stored id. */
function has(map: Record<string, unknown>, id: unknown): boolean {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(map, id);
}

/**
 * Validate a stored record before trusting it; a corrupt record is never
 * half-loaded. Every reference must resolve: plants to media, relationships to
 * plants and media, plants to site templates; a media item is in at most one
 * plant; keys match ids; and the plant counter is past every issued sequence
 * label (an observer's rename is free text and is not counted).
 */
export function restoreWorkbench(raw: unknown, accountId: string): WorkbenchState | null {
  if (raw == null) return null;
  const fail = (message: string): never => {
    throw new WorkbenchStoreError(message);
  };
  if (!isRecord(raw)) fail("Stored workbench is not an object.");
  const s = raw as Partial<WorkbenchState>;
  if (s.schemaVersion !== FIELD_WORKBENCH_SCHEMA_VERSION) {
    fail(`Stored workbench schema ${String(s.schemaVersion)} is not supported.`);
  }
  if (s.accountId !== accountId) fail("Stored workbench belongs to another account.");
  for (const key of ["media", "plants", "relationships", "sessionProfiles", "siteTemplates"] as const) {
    if (!isRecord(s[key])) fail(`Stored workbench is missing ${key}.`);
  }
  if (!Array.isArray(s.audit) || typeof s.nextPlantNumber !== "number" || !Number.isInteger(s.nextPlantNumber)) {
    fail("Stored workbench is missing its audit trail or plant counter.");
  }
  const media = s.media as Record<string, unknown>;
  const plants = s.plants as Record<string, unknown>;
  const siteTemplates = s.siteTemplates as Record<string, unknown>;
  for (const [key, item] of Object.entries(media)) {
    if (!isRecord(item) || item.id !== key || typeof item.name !== "string") fail(`Stored media ${key} is malformed.`);
  }
  for (const [kind, map] of [["site template", siteTemplates], ["session profile", s.sessionProfiles]] as const) {
    for (const [key, item] of Object.entries(map as Record<string, unknown>)) {
      if (!isRecord(item) || item.id !== key || typeof item.name !== "string" || !isRecord(item.values)) {
        fail(`Stored ${kind} ${key} is malformed.`);
      }
    }
  }
  const owner = new Map<string, string>();
  let highest = 0;
  for (const [key, plant] of Object.entries(plants)) {
    if (
      !isRecord(plant) ||
      plant.id !== key ||
      !Array.isArray(plant.mediaIds) ||
      typeof plant.label !== "string" ||
      typeof plant.sequenceLabel !== "string" ||
      !PLANT_LABEL.test(plant.sequenceLabel) ||
      !(plant.taxonHint === null || typeof plant.taxonHint === "string") ||
      !IDENTITY_CERTAINTIES.has(plant.identityCertainty as string) ||
      !isRecord(plant.fields)
    ) {
      fail(`Stored plant ${key} is malformed.`);
    }
    const p = plant as Record<string, unknown> & { mediaIds: unknown[]; label: string; sequenceLabel: string };
    for (const id of p.mediaIds) {
      if (!has(media, id)) fail(`Plant ${p.label} refers to missing media ${String(id)}.`);
      const other = owner.get(id as string);
      if (other) fail(`Media ${String(id)} is in two plants (${other}, ${p.label}).`);
      owner.set(id as string, p.label);
    }
    if (p.siteTemplateId != null && !has(siteTemplates, p.siteTemplateId)) {
      fail(`Plant ${p.label} refers to missing site template ${String(p.siteTemplateId)}.`);
    }
    highest = Math.max(highest, Number(p.sequenceLabel.match(PLANT_LABEL)![1]));
  }
  if ((s.nextPlantNumber as number) <= highest) fail("Stored plant counter is behind an issued plant label.");
  for (const [key, rel] of Object.entries(s.relationships as Record<string, unknown>)) {
    if (
      !isRecord(rel) ||
      rel.id !== key ||
      !isRecord(rel.subject) ||
      !Array.isArray(rel.evidenceMediaIds) ||
      !(RELATIONSHIP_TYPES as readonly string[]).includes(rel.type as string) ||
      !CONFIDENCES.has(rel.confidence as string)
    ) {
      fail(`Stored relationship ${key} is malformed.`);
    }
    const r = rel as Record<string, unknown> & { subject: Record<string, unknown>; evidenceMediaIds: unknown[] };
    if (!has(plants, r.plantId)) fail(`Relationship ${key} refers to missing plant ${String(r.plantId)}.`);
    const subjectExists =
      r.subject.kind === "media" ? has(media, r.subject.id) : r.subject.kind === "plant" ? has(plants, r.subject.id) : false;
    if (!subjectExists) fail(`Relationship ${key} refers to a missing ${String(r.subject.kind)}.`);
    if (r.subject.kind === "plant" && r.subject.id === r.plantId) fail(`Relationship ${key} links a plant to itself.`);
    for (const id of r.evidenceMediaIds) {
      if (!has(media, id)) fail(`Relationship ${key} cites missing media ${String(id)}.`);
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
  // Pair by position, never by object identity: the same File may be passed twice.
  for (const [i, media] of result.imported.entries()) {
    const blob = files[result.sourceIndices[i]]?.blob;
    if (!blob) throw new WorkbenchStoreError(`No original bytes for ${media.name}.`);
    await storage.putBlob(media.id, blob);
  }
  restoreWorkbench(result.state, result.state.accountId); // never save a record that could not be reopened
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
