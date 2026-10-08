import { CALYX_BACKEND_BASE_URL } from "./backendConfig";
import {
  markFieldObservationFailed,
  nowIso,
  sha256Hex,
  toFieldObservationUploadPayload,
  type FieldMedia,
  type FieldObservation,
} from "./fieldJournal";

export class FieldJournalSyncError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly code: string = "SYNC_FAILED",
  ) {
    super(message);
    this.name = "FieldJournalSyncError";
  }
}

type ServerObservation = { id?: unknown };
type ServerMedia = { id?: unknown; storage_key?: unknown; content_hash?: unknown };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new FieldJournalSyncError(
      "The backend answered with a non-JSON response, so the observation was not accepted.",
      response.status,
      "NON_JSON_RESPONSE",
    );
  }
  try {
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new FieldJournalSyncError("The backend returned malformed JSON.", response.status, "BAD_JSON");
  }
}

function errorMessage(payload: Record<string, unknown>, status: number): string {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  if (status === 401 || status === 403) {
    return "The field backend rejected the session. Sign in with the owner/Mission Control session, then retry.";
  }
  return `Field Journal sync failed (${status}).`;
}

// Bound stalled network attempts so an open but disconnected tab releases its
// browser lock. Original bytes and server idempotency keys survive every retry.
export const FIELD_SYNC_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
async function requestJson(url: string, options: RequestInit): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIELD_SYNC_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await readJson(response);
    return { response, payload };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FieldJournalSyncError("The sync request timed out. Retry to resume using saved receipts; local originals are retained.", null, "REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function createServerObservation(observation: FieldObservation): Promise<string> {
  const { response, payload } = await requestJson(`${CALYX_BACKEND_BASE_URL}/api/field-observations`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(toFieldObservationUploadPayload(observation)),
  });
  if (!response.ok) {
    throw new FieldJournalSyncError(errorMessage(payload, response.status), response.status, "OBSERVATION_REJECTED");
  }
  const id = (payload as ServerObservation).id;
  if (typeof id !== "string" || !id) {
    throw new FieldJournalSyncError("The backend accepted the observation but returned no occurrence id.", response.status, "NO_SERVER_ID");
  }
  return id;
}

async function uploadServerMedia(serverObservationId: string, media: FieldMedia): Promise<FieldMedia> {
  const contentHash = media.sha256 ?? await sha256Hex(media.blob);
  const form = new FormData();
  form.set("file", media.blob, media.name);
  form.set("captured_at", media.capturedAt);
  form.set("media_kind", media.kind);
  form.set("client_media_id", media.id);

  const { response, payload } = await requestJson(`${CALYX_BACKEND_BASE_URL}/api/field-observations/${serverObservationId}/media`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    body: form,
  });
  if (!response.ok) {
    throw new FieldJournalSyncError(errorMessage(payload, response.status), response.status, "MEDIA_REJECTED");
  }
  const serverMedia = payload as ServerMedia;
  if (serverMedia.content_hash !== contentHash) {
    throw new FieldJournalSyncError("The backend stored a different media hash than the local original.", response.status, "HASH_MISMATCH");
  }
  if (typeof serverMedia.id !== "string" || !serverMedia.id ||
      typeof serverMedia.storage_key !== "string" || !serverMedia.storage_key) {
    throw new FieldJournalSyncError("The backend returned no durable media receipt.", response.status, "NO_MEDIA_RECEIPT");
  }
  return {
    ...media,
    sha256: contentHash,
    storageKey: serverMedia.storage_key,
    serverMediaId: serverMedia.id,
    uploadedAt: nowIso(),
  };
}

export async function syncFieldObservation(
  observation: FieldObservation,
  checkpoint: (progress: FieldObservation) => Promise<unknown> = async () => undefined,
): Promise<FieldObservation> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new FieldJournalSyncError("The iPad is offline. The observation remains safely stored on this device.", null, "OFFLINE");
  }

  const persistCheckpoint = async (progress: FieldObservation) => {
    try {
      await checkpoint(progress);
    } catch {
      throw new FieldJournalSyncError("Upload progress could not be saved on this device. Local originals are retained; free storage and retry.", null, "CHECKPOINT_FAILED");
    }
  };
  try {
    const serverId = observation.serverId ?? await createServerObservation(observation);
    let progress = { ...observation, serverId };
    // Persist acceptance before uploading large files. A retry must not create a
    // second observation or retransmit media whose receipt is already durable.
    await persistCheckpoint(progress);
    const uploadedMedia = [...observation.media];
    for (let index = 0; index < uploadedMedia.length; index += 1) {
      const media = uploadedMedia[index];
      if (media.serverMediaId && media.storageKey && media.sha256 && media.uploadedAt) continue;
      uploadedMedia[index] = await uploadServerMedia(serverId, media);
      progress = { ...progress, media: [...uploadedMedia] };
      await persistCheckpoint(progress);
    }
    return {
      ...observation,
      serverId,
      media: uploadedMedia,
      syncStatus: "synchronized",
      syncedAt: nowIso(),
      syncError: null,
      updatedAt: nowIso(),
    };
  } catch (error) {
    if (error instanceof FieldJournalSyncError) throw error;
    throw new FieldJournalSyncError(
      "The sync request could not reach the Calyx backend. The local original remains on this device.",
      null,
      "NETWORK_ERROR",
    );
  }
}

export function failureForSync(observation: FieldObservation, error: unknown): FieldObservation {
  const message = error instanceof Error ? error.message : "Synchronization failed.";
  return markFieldObservationFailed(observation, message, nowIso());
}
