/**
 * Lance Field Kit v0.1 — offline media store.
 *
 * Original photographs and videos are preserved byte-for-byte in IndexedDB,
 * keyed by the media descriptor id on the owning observation draft. Nothing
 * in this module re-encodes, crops, or otherwise alters an original file —
 * the blob stored is the blob the browser handed us from the picker or
 * camera, and the blob returned for export is that same object.
 */

import type { FieldMediaDescriptor } from "@/lib/fieldDrafts";

const DB_NAME = "orchid-continuum.field-media";
const DB_VERSION = 1;
const STORE_NAME = "media";

export type StoredFieldMedia = {
  id: string;
  draftId: string;
  name: string;
  type: string;
  size: number;
  capturedAt: string;
  blob: Blob;
};

export function toMediaDescriptor(
  file: { name: string; size: number; type: string },
  id: string,
  capturedAt: string,
): FieldMediaDescriptor {
  return {
    id,
    name: file.name || "unnamed media",
    size: file.size,
    type: file.type || "application/octet-stream",
    capturedAt,
  };
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("draftId", "draftId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the field media store."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Field media store request failed."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
  factory?: IDBFactory,
): Promise<T> {
  const idbFactory = factory ?? globalThis.indexedDB;
  if (!idbFactory) throw new Error("This browser does not support offline media storage (IndexedDB).");
  const db = await openDatabase(idbFactory);
  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    return await run(store);
  } finally {
    db.close();
  }
}

/** Persist original files for a draft. Returns descriptors to embed in the
 *  draft record. Existing ids are overwritten, never duplicated. */
export async function saveFieldMedia(
  draftId: string,
  files: readonly File[],
  capturedAt: string,
  factory?: IDBFactory,
): Promise<FieldMediaDescriptor[]> {
  const descriptors: FieldMediaDescriptor[] = [];
  await withStore(
    "readwrite",
    async (store) => {
      for (const [index, file] of files.entries()) {
        const id = globalThis.crypto?.randomUUID?.() ?? `${draftId}-media-${Date.now()}-${index}`;
        const record: StoredFieldMedia = {
          id,
          draftId,
          name: file.name || "unnamed media",
          type: file.type || "application/octet-stream",
          size: file.size,
          capturedAt,
          blob: file,
        };
        await requestToPromise(store.put(record));
        descriptors.push(toMediaDescriptor(file, id, capturedAt));
      }
      return descriptors;
    },
    factory,
  );
  return descriptors;
}

export async function listFieldMedia(draftId: string, factory?: IDBFactory): Promise<StoredFieldMedia[]> {
  return withStore(
    "readonly",
    async (store) => {
      const index = store.index("draftId");
      const results = await requestToPromise(index.getAll(draftId));
      return (results as StoredFieldMedia[]).filter((item) => item && item.blob instanceof Blob);
    },
    factory,
  );
}

export async function getFieldMediaBlob(id: string, factory?: IDBFactory): Promise<Blob | null> {
  return withStore(
    "readonly",
    async (store) => {
      const record = (await requestToPromise(store.get(id))) as StoredFieldMedia | undefined;
      return record?.blob instanceof Blob ? record.blob : null;
    },
    factory,
  );
}

export async function deleteFieldMediaForDraft(draftId: string, factory?: IDBFactory): Promise<void> {
  await withStore(
    "readwrite",
    async (store) => {
      const index = store.index("draftId");
      const items = (await requestToPromise(index.getAll(draftId))) as StoredFieldMedia[];
      for (const item of items) {
        if (item && typeof item.id === "string") {
          await requestToPromise(store.delete(item.id));
        }
      }
    },
    factory,
  );
}
