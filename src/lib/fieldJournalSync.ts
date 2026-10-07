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

async function createServerObservation(observation: FieldObservation): Promise<string> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/field-observations`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(toFieldObservationUploadPayload(observation)),
  });
  const payload = await readJson(response);
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

  const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/field-observations/${serverObservationId}/media`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new FieldJournalSyncError(errorMessage(payload, response.status), response.status, "MEDIA_REJECTED");
  }
  const serverMedia = payload as ServerMedia;
  if (typeof serverMedia.content_hash === "string" && serverMedia.content_hash !== contentHash) {
    throw new FieldJournalSyncError("The backend stored a different media hash than the local original.", response.status, "HASH_MISMATCH");
  }
  return {
    ...media,
    sha256: contentHash,
    storageKey: typeof serverMedia.storage_key === "string" ? serverMedia.storage_key : media.storageKey,
    serverMediaId: typeof serverMedia.id === "string" ? serverMedia.id : media.serverMediaId,
    uploadedAt: nowIso(),
  };
}

export async function syncFieldObservation(observation: FieldObservation): Promise<FieldObservation> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new FieldJournalSyncError("The iPad is offline. The observation remains safely stored on this device.", null, "OFFLINE");
  }

  try {
    const serverId = observation.serverId ?? await createServerObservation(observation);
    const uploadedMedia: FieldMedia[] = [];
    for (const media of observation.media) {
      uploadedMedia.push(await uploadServerMedia(serverId, media));
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
