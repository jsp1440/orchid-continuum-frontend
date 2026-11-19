/**
 * fieldObservations — client for the governed Field Journal upload path
 * (Release-1 journey 5).
 *
 * Backend contract: orchid-calyx-backend `app/field_observation`
 * (PR #1475), contract version `field-observations/v1`, served at
 * `/api/field-observations` next to the journey-6 hypothesis loop.
 *
 * Rules this client enforces on its side of the wire:
 * - an uploaded observation is an observer's report with provenance, never a
 *   determination: the backend labels every record `scientific_status:
 *   "observer_report"` and `knowledge_graph_publication:
 *   "blocked_pending_human_scientific_review"`, and this client surfaces both;
 * - protected locality never leaves the browser. The upload payload carries only
 *   the draft's governed `locality_visibility` class; coordinates captured for a
 *   future consented path are not read here, and {@link assertNoSensitiveLocality}
 *   fails closed before any request is sent (the backend rejects it too — 422);
 * - upload is idempotent: the local draft id travels as `client_draft_id`, so a
 *   retry after a dropped connection resolves to the same observation.
 *
 * Authentication is the backend's owner-session / API-key boundary. Like the
 * Conservatory client, the member session's access token is attached as a
 * bearer when the caller supplies one; the owner-session cookie, when present,
 * takes precedence server-side. A 401 or 403 surfaces as
 * `authentication_required` and the draft stays on this device.
 */

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import type { FieldDraft, FieldLocalityVisibility, FieldMediaDescriptor } from "@/lib/fieldDrafts";
import { assertNoSensitiveLocality } from "@/lib/fieldHypotheses";

export const FIELD_OBSERVATIONS_CONTRACT_VERSION = "field-observations/v1";
export const FIELD_OBSERVATIONS_PATH = "/api/field-observations";
export const OBSERVER_REPORT_STATUS = "observer_report";
export const KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED = "blocked_pending_human_scientific_review";

// ── Vocabularies (mirror backend app/field_observation/schemas.py) ───────────

export const EPISTEMIC_CERTAINTIES = ["CONFIRMED", "PROBABLE", "POSSIBLE", "UNCERTAIN"] as const;
export type EpistemicCertainty = (typeof EPISTEMIC_CERTAINTIES)[number];

export const CURATION_STATES = ["PENDING", "CURATED", "FLAGGED", "REJECTED"] as const;
export type CurationState = (typeof CURATION_STATES)[number];

export interface FieldObservationCreate {
  observed_at: string;
  note: string;
  taxon_hint?: string;
  epistemic_certainty?: EpistemicCertainty;
  locality_visibility: FieldLocalityVisibility;
  media: FieldMediaDescriptor[];
  client_draft_id: string;
}

export interface FieldObservation {
  contract_version: string;
  id: string;
  observer_subject: string;
  observed_at: string;
  note: string;
  taxon_hint: string | null;
  epistemic_certainty: EpistemicCertainty | string;
  curation_state: CurationState | string;
  curation_reason: string | null;
  curated_by: string | null;
  curated_at: string | null;
  locality_visibility: FieldLocalityVisibility;
  media: FieldMediaDescriptor[];
  photo_count: number;
  client_draft_id: string | null;
  scientific_status: string;
  knowledge_graph_publication: string;
  hypotheses_path: string;
  created_at: string;
  updated_at: string;
}

export interface FieldObservationList {
  contract_version: string;
  observer_subject: string;
  items: FieldObservation[];
  total: number;
  offset: number;
  limit: number;
}

export type FieldObservationUploadResult = {
  observation: FieldObservation;
  /** `true` when the backend created the record; `false` when the draft had already been uploaded. */
  created: boolean;
};

export type FieldObservationApiErrorKind =
  | "authentication_required"
  | "route_unavailable"
  | "validation_failed"
  | "server_error"
  | "network_error";

export class FieldObservationApiError extends Error {
  constructor(public readonly kind: FieldObservationApiErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = "FieldObservationApiError";
  }
}

/** Human-readable, honest copy for each failure kind; the draft is never lost. */
export function describeUploadFailure(error: unknown): string {
  if (error instanceof FieldObservationApiError) {
    switch (error.kind) {
      case "authentication_required":
        return "Calyx did not accept this session for upload. The draft stays on this device; sign in with an authorised Calyx session and try again.";
      case "route_unavailable":
        return "The governed upload path is not deployed on this backend yet. The draft stays on this device.";
      case "validation_failed":
        return `Calyx rejected the draft: ${error.message}`;
      case "network_error":
        return "Calyx could not be reached. The draft stays on this device; try again when online.";
      default:
        return `Calyx upload failed: ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : "The draft could not be uploaded.";
}

/**
 * Map an offline draft to the upload contract. Only governed fields cross:
 * note, optional taxon text, the locality visibility class, media metadata
 * (name, size, type — never bytes or paths) and the local draft id.
 */
export function draftToObservationPayload(draft: FieldDraft): FieldObservationCreate {
  const payload: FieldObservationCreate = {
    observed_at: draft.createdAt,
    note: draft.note,
    locality_visibility: draft.localityVisibility,
    media: draft.media.map(({ name, size, type }) => ({ name, size, type })),
    client_draft_id: draft.id,
  };
  if (draft.taxonLabel) payload.taxon_hint = draft.taxonLabel;
  assertNoSensitiveLocality(payload);
  return payload;
}

function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown; loc?: unknown };
    if (typeof first?.msg === "string") {
      const loc = Array.isArray(first.loc) ? first.loc.filter((part) => part !== "body").join(".") : "";
      return loc ? `${loc}: ${first.msg}` : first.msg;
    }
  }
  return null;
}

export interface FieldObservationRequestOptions {
  /** Member session access token; sent as `Authorization: Bearer …` when present. */
  accessToken?: string | null;
}

async function request<T>(path: string, init?: RequestInit, options: FieldObservationRequestOptions = {}): Promise<{ status: number; body: T }> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new FieldObservationApiError("network_error", error instanceof Error ? error.message : "Field observation request failed");
  }
  if (!response.ok) {
    const message = detailMessage(await response.json().catch(() => null));
    if (response.status === 401 || response.status === 403) {
      throw new FieldObservationApiError("authentication_required", message ?? "Authentication is required.", response.status);
    }
    if (response.status === 404 || response.status === 405) {
      throw new FieldObservationApiError("route_unavailable", message ?? "The field observation API is not deployed.", response.status);
    }
    if (response.status === 400 || response.status === 422) {
      throw new FieldObservationApiError("validation_failed", message ?? "The observation was not valid.", response.status);
    }
    throw new FieldObservationApiError("server_error", message ?? `Field observation request failed (${response.status}).`, response.status);
  }
  return { status: response.status, body: (await response.json()) as T };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function assertObservation(body: unknown): FieldObservation {
  const candidate = body as Partial<FieldObservation> | null;
  if (!candidate || typeof candidate !== "object" || typeof candidate.id !== "string" || !candidate.id) {
    throw new FieldObservationApiError("server_error", "Calyx returned an observation without an id.");
  }
  if (candidate.scientific_status !== OBSERVER_REPORT_STATUS) {
    throw new FieldObservationApiError("server_error", "Calyx returned an observation that is not labelled as an observer report.");
  }
  if (candidate.knowledge_graph_publication !== KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED) {
    throw new FieldObservationApiError("server_error", "Calyx returned an observation whose publication state is not blocked pending human review.");
  }
  return candidate as FieldObservation;
}

/** Upload one offline draft. Idempotent per account and draft id. */
export async function uploadFieldDraft(draft: FieldDraft, options: FieldObservationRequestOptions = {}): Promise<FieldObservationUploadResult> {
  const payload = draftToObservationPayload(draft);
  const { status, body } = await request<FieldObservation>(FIELD_OBSERVATIONS_PATH, json(payload), options);
  return { observation: assertObservation(body), created: status === 201 };
}

export async function getFieldObservation(observationId: string, options: FieldObservationRequestOptions = {}): Promise<FieldObservation> {
  const { body } = await request<FieldObservation>(`${FIELD_OBSERVATIONS_PATH}/${encodeURIComponent(observationId)}`, undefined, options);
  return assertObservation(body);
}

export async function listFieldObservations(
  options: FieldObservationRequestOptions & { limit?: number; offset?: number } = {},
): Promise<FieldObservationList> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  const query = params.toString();
  const { body } = await request<FieldObservationList>(`${FIELD_OBSERVATIONS_PATH}${query ? `?${query}` : ""}`, undefined, options);
  return body;
}
