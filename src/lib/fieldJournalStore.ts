import {
  FIELD_JOURNAL_SCHEMA_VERSION,
  type FieldObservation,
} from "./fieldJournal";

const DB_NAME = "orchid-continuum-field-journal";
const DB_VERSION = 1;
const STORE_NAME = "observations";

function requireIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new Error("This browser does not provide durable offline storage (IndexedDB).");
  }
  return indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = requireIndexedDb().open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Offline field storage could not be opened."));
    request.onblocked = () => reject(new Error("Offline field storage is blocked by another tab."));
    request.onsuccess = () => resolve(request.result);
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline field storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline field storage transaction aborted."));
    request.onerror = () => reject(request.error ?? new Error("Offline field storage request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function isFieldObservation(value: unknown): value is FieldObservation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldObservation>;
  return (
    candidate.schemaVersion === FIELD_JOURNAL_SCHEMA_VERSION &&
    typeof candidate.id === "string" &&
    typeof candidate.accountId === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.media) &&
    typeof candidate.syncStatus === "string"
  );
}

export async function listFieldObservations(accountId: string): Promise<FieldObservation[]> {
  const db = await openDatabase();
  try {
    const rows = await run(db, "readonly", (store) => store.getAll());
    return rows
      .filter(isFieldObservation)
      .filter((row) => row.accountId === accountId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}

export async function getFieldObservation(id: string): Promise<FieldObservation | null> {
  const db = await openDatabase();
  try {
    const row = await run(db, "readonly", (store) => store.get(id));
    return isFieldObservation(row) ? row : null;
  } finally {
    db.close();
  }
}

export async function saveFieldObservation(observation: FieldObservation): Promise<FieldObservation> {
  if (!isFieldObservation(observation)) {
    throw new Error("The field observation is not valid for durable offline storage.");
  }
  const db = await openDatabase();
  try {
    await run(db, "readwrite", (store) => store.put(observation));
    return observation;
  } finally {
    db.close();
  }
}

export async function deleteFieldObservation(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await run(db, "readwrite", (store) => store.delete(id));
  } finally {
    db.close();
  }
}
