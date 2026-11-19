/**
 * intakeReview — the owner's human-review client for public intake
 * (Release-1 journeys 10 and 13).
 *
 * Backend contracts: orchid-calyx-backend `app/community_observation`
 * (`/api/community/*`; the full record and the moderate action are owner-only)
 * and `app/constituent_platform` owner router (`/api/constituent/contact/messages`,
 * `/api/constituent/subscriptions/summary`).
 *
 * Epistemic rules this client keeps visible: a community observation is a
 * user report with a self-asserted certainty label; approving it releases it
 * to the public feed as a community report, never as a scientific fact; the
 * verbatim locality a submitter typed is protected and exists only in this
 * moderation view. Contact messages are untrusted plain text read by a person.
 */

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export const MODERATION_TARGETS = ["SCREENED", "QUARANTINED", "APPROVED", "REJECTED"] as const;
export type ModerationTarget = (typeof MODERATION_TARGETS)[number];
export type ModerationState = "SUBMITTED" | ModerationTarget | string;

export const PENDING_STATES = ["SUBMITTED", "SCREENED", "QUARANTINED"] as const;
export type PendingState = (typeof PENDING_STATES)[number];

export interface PendingObservation {
  id: string;
  submitter_auth_subject: string;
  taxon_name_verbatim: string;
  /** Protected. Shown only inside the moderation view, never listed publicly. */
  location_verbatim: string;
  observation_date: string;
  epistemic_label: string;
  moderation_state: ModerationState;
  notes: string | null;
  evidence_media_ids: string[];
  created_at: string;
  moderated_at?: string | null;
  moderation_reason?: string | null;
}

export interface ContactMessage {
  reference_id: string;
  category: string;
  name: string | null;
  normalized_email: string;
  subject: string | null;
  body: string;
  source: string | null;
  received_at: string;
  state: string;
  review: string;
  agent_exposure: string;
  content_trust: string;
}

export interface SubscriptionSummary {
  total: number;
  by_state: Record<string, number>;
  welcome_communications_awaiting_approval: number;
}

export interface IntakeReviewClient {
  listPending(states?: readonly PendingState[]): Promise<PendingObservation[]>;
  moderate(observationId: string, state: ModerationTarget, reason?: string): Promise<{ id: string; moderation_state: ModerationState }>;
  listContactMessages(): Promise<{ items: ContactMessage[]; total: number }>;
  subscriptionSummary(): Promise<SubscriptionSummary>;
}

export type IntakeReviewErrorKind =
  | "authentication_required"
  | "route_unavailable"
  | "validation_failed"
  | "server_error"
  | "network_error";

export class IntakeReviewApiError extends Error {
  constructor(public readonly kind: IntakeReviewErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = "IntakeReviewApiError";
  }
}

export interface IntakeReviewClientOptions {
  /** Member session access token, attached as a bearer when present; the owner cookie wins server-side. */
  accessToken?: string | null;
}

function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === "string") return first.msg;
  }
  return null;
}

async function request<T>(path: string, init: RequestInit, options: IntakeReviewClientOptions): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new IntakeReviewApiError("network_error", error instanceof Error ? error.message : "Intake review request failed");
  }
  if (!response.ok) {
    const message = detailMessage(await response.json().catch(() => null));
    if (response.status === 401 || response.status === 403) {
      throw new IntakeReviewApiError("authentication_required", message ?? "An owner session is required.", response.status);
    }
    if (response.status === 404 || response.status === 405) {
      throw new IntakeReviewApiError("route_unavailable", message ?? "The intake review API is not deployed.", response.status);
    }
    if (response.status === 400 || response.status === 422) {
      throw new IntakeReviewApiError("validation_failed", message ?? "The moderation decision was not valid.", response.status);
    }
    throw new IntakeReviewApiError("server_error", message ?? `Intake review request failed (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}

export function createIntakeReviewClient(options: IntakeReviewClientOptions = {}): IntakeReviewClient {
  return {
    async listPending(states: readonly PendingState[] = PENDING_STATES) {
      // The public list carries ids and states only; each full record is the
      // owner-only moderation view and is fetched separately. Query every
      // non-terminal state so screening or quarantining a report never makes
      // it disappear from the only human-review surface.
      const listings = await Promise.all(
        states.map((state) =>
          request<{ items: Array<{ id: string; moderation_state: string; created_at: string }> }>(
            `/api/community/observations?moderation_state=${encodeURIComponent(state)}&limit=50`,
            { method: "GET" },
            options,
          ),
        ),
      );
      const itemsById = new Map(listings.flatMap((listing) => listing.items).map((item) => [item.id, item]));
      const records = await Promise.all(
        Array.from(itemsById.values()).map((item) =>
          request<PendingObservation>(`/api/community/observations/${encodeURIComponent(item.id)}`, { method: "GET" }, options),
        ),
      );
      return records.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    async moderate(observationId, state, reason) {
      return request<{ id: string; moderation_state: ModerationState }>(
        `/api/community/observations/${encodeURIComponent(observationId)}/moderate`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ observation_id: observationId, new_state: state, reason: reason?.trim() || null }),
        },
        options,
      );
    },
    async listContactMessages() {
      return request<{ items: ContactMessage[]; total: number }>(`/api/constituent/contact/messages?limit=50`, { method: "GET" }, options);
    },
    async subscriptionSummary() {
      return request<SubscriptionSummary>(`/api/constituent/subscriptions/summary`, { method: "GET" }, options);
    },
  };
}

export function moderationTargetLabel(state: ModerationTarget): string {
  switch (state) {
    case "APPROVED":
      return "Approve for community feed";
    case "QUARANTINED":
      return "Quarantine";
    case "SCREENED":
      return "Mark screened";
    case "REJECTED":
      return "Reject";
  }
}
