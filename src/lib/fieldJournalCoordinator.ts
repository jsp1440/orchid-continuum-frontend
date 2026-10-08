import { canEditFieldObservation, markFieldObservationFailed, markFieldObservationSyncing, nowIso, type FieldObservation } from "./fieldJournal";
import { deleteFieldObservation, getFieldObservation, saveFieldObservation } from "./fieldJournalStore";
import { failureForSync, FieldJournalSyncError, syncFieldObservation } from "./fieldJournalSync";

// Browser-owned locks are released when a tab closes/crashes, never on a timer
// that could overlap a slow or suspended upload in another tab.
async function withObservationLock<T>(id: string, action: () => Promise<T>): Promise<T | null> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new FieldJournalSyncError("Safe synchronization needs browser lock support. Local capture and export remain available; use a supported secure browser to sync.", null, "LOCKS_UNAVAILABLE");
  }
  return navigator.locks.request(`orchid-field-sync:${id}`, { mode: "exclusive", ifAvailable: true },
    (lock) => lock ? action() : Promise.resolve(null));
}

async function latestObservation(observation: FieldObservation): Promise<FieldObservation> {
  const latest = await getFieldObservation(observation.id);
  if (!latest || latest.accountId !== observation.accountId) {
    throw new FieldJournalSyncError("The saved observation is no longer available for this account.", null, "DRAFT_UNAVAILABLE");
  }
  return latest;
}

export async function recoverSavedFieldObservation(observation: FieldObservation): Promise<FieldObservation> {
  // Unsupported browsers must still be able to read and capture offline drafts.
  if (typeof navigator === "undefined" || !navigator.locks) return observation;
  const recovered = await withObservationLock(observation.id, async () => {
    const latest = await latestObservation(observation);
    if (latest.syncStatus !== "syncing") return latest;
    return saveFieldObservation(markFieldObservationFailed(latest,
      "A previous sync was interrupted. Retry to resume saved media uploads.", nowIso()));
  });
  return recovered ?? observation;
}

export async function syncSavedFieldObservation(
  observation: FieldObservation,
  onProgress: (progress: FieldObservation) => void = () => undefined,
): Promise<FieldObservation | null> {
  return withObservationLock(observation.id, async () => {
    // Always reread under the lock: a stale card must not overwrite receipts or
    // retransmit media completed by a different tab.
    const latest = await latestObservation(observation);
    if (latest.syncStatus === "synchronized") { onProgress(latest); return latest; }
    let progress = markFieldObservationSyncing(latest, nowIso());
    const persist = async (next: FieldObservation) => {
      progress = next;
      await saveFieldObservation(next);
      onProgress(next);
    };
    try {
      await persist(progress);
      const synced = await syncFieldObservation(progress, persist);
      await persist(synced);
      return synced;
    } catch (error) {
      // Failure settlement belongs to the same exclusive lock as every receipt.
      await persist(failureForSync(progress, error));
      throw error;
    }
  });
}


export async function editSavedFieldObservation(previous: FieldObservation, next: FieldObservation): Promise<FieldObservation> {
  const saved = await withObservationLock(previous.id, async () => {
    const latest = await latestObservation(previous);
    if (!canEditFieldObservation(latest) || latest.updatedAt !== previous.updatedAt ||
        next.id !== latest.id || next.accountId !== latest.accountId) {
      throw new Error("This observation changed or was accepted in another tab. Reopen the saved draft before editing.");
    }
    return saveFieldObservation(next);
  });
  if (!saved) throw new Error("This observation is syncing in another tab. Wait before editing.");
  return saved;
}

export async function discardSavedFieldObservation(observation: FieldObservation): Promise<void> {
  const removed = await withObservationLock(observation.id, async () => {
    const latest = await latestObservation(observation);
    if (!canEditFieldObservation(latest) || latest.updatedAt !== observation.updatedAt) {
      throw new Error("This observation changed or was accepted in another tab. Its local originals were retained.");
    }
    await deleteFieldObservation(latest.id);
    return true;
  });
  if (!removed) throw new Error("This observation is syncing in another tab. Its local originals were retained.");
}
