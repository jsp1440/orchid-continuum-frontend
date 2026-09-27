/**
 * evidenceFeedbackReview — the owner's review client for submitted evidence
 * feedback (Release 1 journey 12: a correction submitted from a record is
 * read and decided by the owner).
 *
 * Backend contract: orchid-calyx-backend `app/evidence_feedback/review.py`
 * and `routes.py` (`review_router`, PR #1663):
 *
 *   GET  /api/evidence-feedback/review/cases?status=&object_type=&limit=1..100&cursor=
 *   GET  /api/evidence-feedback/review/cases/{case_id}
 *   POST /api/evidence-feedback/review/cases/{case_id}/decision
 *
 * Owner session only. The request carries the owner session exactly as every
 * other Mission Control call does: `credentials: "include"` for the HttpOnly
 * cookie, and the owner transport in `backendConfig` adds the same-tab owner
 * bearer. These paths are NOT member routes (`memberReadAuth`), so a member's
 * Supabase token is never attached. The backend answers 401 without an owner
 * session, 403 OWNER_SESSION_REQUIRED for the service API key and 403
 * OWNER_ACCESS_REQUIRED for a verified member.
 *
 * Integrity rules this client keeps:
 *  - Decisions never publish to the knowledge graph, change taxonomy or apply
 *    scientific corrections; the backend's `publication_boundary` text is
 *    required on every detail/decision response and shown verbatim.
 *  - Submitter and reviewer identities are opaque references
 *    (`submitter_ref`, `reviewer_ref`, `actor_ref`), shown only as opaque
 *    references and never labelled as an identity. Case and queue records are
 *    projected onto the fields below, so a raw identity field on them (e.g.
 *    `submitter_id` or an email) is never carried into the page.
 *  - Event `details` are open-ended backend records and are shown as
 *    recorded, EXCEPT that known identity keys (`submitter_id`,
 *    `reviewer_id`, `actor_id`, `user_id`, `member_id`, `owner_id`,
 *    `subject`, and any key containing "email") are removed at any depth
 *    before they reach the page (`stripIdentityKeys`).
 *  - The record payload (`object_version.payload`) is the stored record the
 *    submitter saw -- the thing being corrected -- and is shown verbatim,
 *    because an accepted trivial correction starts from exactly that payload.
 *    It is not scrubbed; what goes into it is decided where the record is
 *    registered (e.g. the Matrix payload deliberately omits provenance).
 *  - Malformed responses fail closed (INVALID_RESPONSE) rather than rendering
 *    a partial case.
 */

import { EVIDENCE_FEEDBACK_API_BASE, type EvidenceObjectType, type FeedbackCaseStatus } from "@/lib/evidenceFeedback";

export const EVIDENCE_FEEDBACK_REVIEW_API_BASE = `${EVIDENCE_FEEDBACK_API_BASE}/review`;

/** The queue page size the review page requests (backend accepts 1..100). */
export const REVIEW_PAGE_SIZE = 20;

export const REVIEW_DECISIONS = ["reject", "needs_governed_review", "accept_trivial"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const REVIEW_STATUS_FILTERS: ReadonlyArray<{ value: FeedbackCaseStatus; label: string }> = [
  { value: "pending_review", label: "Pending review" },
  { value: "submitted", label: "Submitted" },
  { value: "governed_review_required", label: "Governed review required" },
  { value: "resolved", label: "Resolved" },
];

export const REVIEW_OBJECT_TYPE_FILTERS: ReadonlyArray<{ value: EvidenceObjectType; label: string }> = [
  { value: "lexicon", label: "Lexicon" },
  { value: "matrix_identification", label: "Matrix identification" },
  { value: "taxonomy", label: "Taxonomy" },
  { value: "image_annotation", label: "Image annotation" },
  { value: "literature_claim", label: "Literature claim" },
  { value: "structured_character", label: "Structured character" },
  { value: "distribution_record", label: "Distribution record" },
  { value: "other", label: "Other" },
];

export interface ReviewQueueItem {
  case_id: string;
  status: string;
  disposition: string;
  review_lane: string;
  object_type: string;
  object_id: string;
  object_version_hash: string;
  feedback_class: string;
  severity: string | null;
  defect_kind: string | null;
  page_context: string;
  statement_preview: string;
  created_at: string;
  updated_at: string;
  duplicate_count: number;
  submitter_ref: string | null;
}

export interface ReviewQueuePage {
  items: ReviewQueueItem[];
  next_cursor: string | null;
  limit: number;
}

export interface ReviewCase {
  case_id: string;
  status: string;
  disposition: string;
  review_lane: string;
  object_type: string;
  object_id: string;
  object_version_hash: string;
  feedback_class: string;
  page_context: string;
  statement: string;
  proposed_replacement: string | null;
  citation: string | null;
  defect_kind: string | null;
  severity: string | null;
  source_partner_id: string | null;
  related_case_ids: string[];
  resolution: string | null;
  resulting_version_hash: string | null;
  created_at: string;
  updated_at: string;
  submitter_ref: string | null;
  reviewer_ref: string | null;
}

export interface ReviewEvent {
  event: string;
  timestamp: string | null;
  actor_ref: string | null;
  details: Record<string, unknown>;
}

export interface ReviewObjectVersion {
  object_id: string;
  object_type: string;
  version_hash: string;
  payload: Record<string, unknown>;
  created_at: string | null;
  previous_version_hash: string | null;
}

export interface ReviewCaseDetail {
  case: ReviewCase;
  duplicate_count: number;
  events: ReviewEvent[];
  object_version: ReviewObjectVersion | null;
  object_version_available: boolean;
  resulting_object_version: ReviewObjectVersion | null;
  allowed_decisions: ReviewDecision[];
  publication_boundary: string;
}

export interface ReviewDecisionResult {
  decision: ReviewDecision;
  idempotent: boolean;
  case: ReviewCase;
  allowed_decisions: ReviewDecision[];
  publication_boundary: string;
}

export type ReviewDecisionInput =
  | { decision: "reject"; reason: string }
  | { decision: "needs_governed_review"; note: string }
  | { decision: "accept_trivial"; corrected_payload: Record<string, unknown> };

export interface ReviewQueueQuery {
  status?: FeedbackCaseStatus | "";
  objectType?: EvidenceObjectType | "";
  cursor?: string | null;
  limit?: number;
}

export class EvidenceFeedbackReviewError extends Error {
  readonly status: number;
  readonly code: string;
  /** Backend `current_status` on 409 INVALID_CASE_TRANSITION. */
  readonly currentStatus: string | null;
  /** First FastAPI validation message on a 422 body-validation error. */
  readonly validationMessage: string | null;

  constructor(status: number, code: string, extra: { currentStatus?: string | null; validationMessage?: string | null } = {}) {
    super(code);
    this.name = "EvidenceFeedbackReviewError";
    this.status = status;
    this.code = code;
    this.currentStatus = extra.currentStatus ?? null;
    this.validationMessage = extra.validationMessage ?? null;
  }
}

export interface EvidenceFeedbackReviewClient {
  listCases(query?: ReviewQueueQuery): Promise<ReviewQueuePage>;
  getCase(caseId: string): Promise<ReviewCaseDetail>;
  decide(caseId: string, input: ReviewDecisionInput): Promise<ReviewDecisionResult>;
}

/* ------------------------------------------------------------------------ */
/* Transport                                                                 */
/* ------------------------------------------------------------------------ */

function errorFromBody(status: number, body: unknown): EvidenceFeedbackReviewError {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      // FastAPI string details (e.g. 401 "Owner session is required") are not
      // codes; keep the status as the code so copy stays status-driven.
      return new EvidenceFeedbackReviewError(status, `HTTP_${status}`);
    }
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined;
      const message = typeof first?.msg === "string" ? first.msg.replace(/^Value error,\s*/, "") : null;
      return new EvidenceFeedbackReviewError(status, "REQUEST_VALIDATION_FAILED", { validationMessage: message });
    }
    if (detail && typeof detail === "object") {
      const { code, current_status: currentStatus } = detail as { code?: unknown; current_status?: unknown };
      if (typeof code === "string" && code.trim()) {
        return new EvidenceFeedbackReviewError(status, code.trim(), {
          currentStatus: typeof currentStatus === "string" ? currentStatus : null,
        });
      }
    }
  }
  return new EvidenceFeedbackReviewError(status, `HTTP_${status}`);
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${EVIDENCE_FEEDBACK_REVIEW_API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new EvidenceFeedbackReviewError(0, "NETWORK_UNAVAILABLE");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new EvidenceFeedbackReviewError(response.status, response.ok ? "INVALID_RESPONSE" : `HTTP_${response.status}`);
  }
  if (!response.ok) throw errorFromBody(response.status, body);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new EvidenceFeedbackReviewError(response.status, "INVALID_RESPONSE");
  }
  return body;
}

/* ------------------------------------------------------------------------ */
/* Fail-closed projections                                                   */
/* ------------------------------------------------------------------------ */

class Malformed extends Error {}

type Rec = Record<string, unknown>;

function record(value: unknown): Rec {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Malformed();
  return value as Rec;
}
function str(source: Rec, key: string): string {
  const value = source[key];
  if (typeof value !== "string") throw new Malformed();
  return value;
}
function nonEmpty(source: Rec, key: string): string {
  const value = str(source, key);
  if (!value.trim()) throw new Malformed();
  return value;
}
function optStr(source: Rec, key: string): string | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Malformed();
  return value;
}
function count(source: Rec, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Malformed();
  return value;
}
function decisions(value: unknown): ReviewDecision[] {
  if (!Array.isArray(value)) throw new Malformed();
  // Unknown decision names are dropped: the page offers only actions it
  // implements, and only those the backend allows.
  return value.filter((item): item is ReviewDecision => (REVIEW_DECISIONS as readonly unknown[]).includes(item));
}

function queueItem(value: unknown): ReviewQueueItem {
  const item = record(value);
  return {
    case_id: nonEmpty(item, "case_id"),
    status: nonEmpty(item, "status"),
    disposition: str(item, "disposition"),
    review_lane: str(item, "review_lane"),
    object_type: nonEmpty(item, "object_type"),
    object_id: str(item, "object_id"),
    object_version_hash: str(item, "object_version_hash"),
    feedback_class: str(item, "feedback_class"),
    severity: optStr(item, "severity"),
    defect_kind: optStr(item, "defect_kind"),
    page_context: str(item, "page_context"),
    statement_preview: str(item, "statement_preview"),
    created_at: str(item, "created_at"),
    updated_at: str(item, "updated_at"),
    duplicate_count: count(item, "duplicate_count"),
    submitter_ref: optStr(item, "submitter_ref"),
  };
}

function reviewCase(value: unknown): ReviewCase {
  const item = record(value);
  const related = item.related_case_ids;
  return {
    case_id: nonEmpty(item, "case_id"),
    status: nonEmpty(item, "status"),
    disposition: str(item, "disposition"),
    review_lane: str(item, "review_lane"),
    object_type: nonEmpty(item, "object_type"),
    object_id: str(item, "object_id"),
    object_version_hash: str(item, "object_version_hash"),
    feedback_class: str(item, "feedback_class"),
    page_context: str(item, "page_context"),
    statement: str(item, "statement"),
    proposed_replacement: optStr(item, "proposed_replacement"),
    citation: optStr(item, "citation"),
    defect_kind: optStr(item, "defect_kind"),
    severity: optStr(item, "severity"),
    source_partner_id: optStr(item, "source_partner_id"),
    related_case_ids: Array.isArray(related) ? related.filter((id): id is string => typeof id === "string") : [],
    resolution: optStr(item, "resolution"),
    resulting_version_hash: optStr(item, "resulting_version_hash"),
    created_at: str(item, "created_at"),
    updated_at: str(item, "updated_at"),
    submitter_ref: optStr(item, "submitter_ref"),
    reviewer_ref: optStr(item, "reviewer_ref"),
  };
}

const IDENTITY_DETAIL_KEYS = new Set(["submitter_id", "reviewer_id", "actor_id", "user_id", "member_id", "owner_id", "subject"]);

function isIdentityKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return IDENTITY_DETAIL_KEYS.has(normalized) || normalized.includes("email");
}

/**
 * A copy of `value` without known identity keys, at any depth. Defensive: the
 * backend replaces actor identities with `actor_ref` and does not put them in
 * event details today, but details are open-ended records.
 */
export function stripIdentityKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIdentityKeys);
  if (value && typeof value === "object") {
    const out: Rec = {};
    for (const [key, item] of Object.entries(value as Rec)) {
      if (!isIdentityKey(key)) out[key] = stripIdentityKeys(item);
    }
    return out;
  }
  return value;
}

function reviewEvent(value: unknown): ReviewEvent {
  const item = record(value);
  const details = item.details;
  return {
    event: nonEmpty(item, "event"),
    timestamp: optStr(item, "timestamp"),
    actor_ref: optStr(item, "actor_ref"),
    details: details && typeof details === "object" && !Array.isArray(details) ? (stripIdentityKeys(details) as Rec) : {},
  };
}

function objectVersion(value: unknown): ReviewObjectVersion | null {
  if (value === null || value === undefined) return null;
  const item = record(value);
  return {
    object_id: str(item, "object_id"),
    object_type: str(item, "object_type"),
    version_hash: nonEmpty(item, "version_hash"),
    payload: record(item.payload),
    created_at: optStr(item, "created_at"),
    previous_version_hash: optStr(item, "previous_version_hash"),
  };
}

function project<T>(status: number, build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (error instanceof Malformed) throw new EvidenceFeedbackReviewError(status, "INVALID_RESPONSE");
    throw error;
  }
}

export function parseReviewQueuePage(body: unknown): ReviewQueuePage {
  return project(200, () => {
    const page = record(body);
    if (!Array.isArray(page.items)) throw new Malformed();
    const next = page.next_cursor;
    if (next !== null && (typeof next !== "string" || !next)) throw new Malformed();
    return { items: page.items.map(queueItem), next_cursor: next as string | null, limit: count(page, "limit") };
  });
}

export function parseReviewCaseDetail(body: unknown, expectedCaseId?: string): ReviewCaseDetail {
  return project(200, () => {
    const detail = record(body);
    const caseRecord = reviewCase(detail.case);
    if (expectedCaseId && caseRecord.case_id !== expectedCaseId) throw new Malformed();
    if (!Array.isArray(detail.events)) throw new Malformed();
    const version = objectVersion(detail.object_version);
    return {
      case: caseRecord,
      duplicate_count: count(detail, "duplicate_count"),
      events: detail.events.map(reviewEvent),
      object_version: version,
      object_version_available: detail.object_version_available === true && version !== null,
      resulting_object_version: objectVersion(detail.resulting_object_version),
      allowed_decisions: decisions(detail.allowed_decisions),
      publication_boundary: nonEmpty(detail, "publication_boundary"),
    };
  });
}

export function parseReviewDecisionResult(body: unknown, expected: ReviewDecision, expectedCaseId: string): ReviewDecisionResult {
  return project(200, () => {
    const result = record(body);
    if (result.decision !== expected) throw new Malformed();
    if (typeof result.idempotent !== "boolean") throw new Malformed();
    const caseRecord = reviewCase(result.case);
    if (caseRecord.case_id !== expectedCaseId) throw new Malformed();
    return {
      decision: expected,
      idempotent: result.idempotent,
      case: caseRecord,
      allowed_decisions: decisions(result.allowed_decisions),
      publication_boundary: nonEmpty(result, "publication_boundary"),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Client                                                                    */
/* ------------------------------------------------------------------------ */

export function reviewQueuePath(query: ReviewQueueQuery = {}): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.objectType) params.set("object_type", query.objectType);
  params.set("limit", String(query.limit ?? REVIEW_PAGE_SIZE));
  if (query.cursor) params.set("cursor", query.cursor);
  return `/cases?${params.toString()}`;
}

function decisionBody(input: ReviewDecisionInput): Record<string, unknown> {
  // Exactly the one field the decision takes; the backend forbids the others.
  if (input.decision === "reject") return { decision: "reject", reason: input.reason.trim() };
  if (input.decision === "needs_governed_review") return { decision: "needs_governed_review", note: input.note.trim() };
  return { decision: "accept_trivial", corrected_payload: input.corrected_payload };
}

export function createEvidenceFeedbackReviewClient(): EvidenceFeedbackReviewClient {
  return {
    async listCases(query = {}) {
      return parseReviewQueuePage(await requestJson(reviewQueuePath(query), { method: "GET" }));
    },
    async getCase(caseId) {
      const body = await requestJson(`/cases/${encodeURIComponent(caseId)}`, { method: "GET" });
      return parseReviewCaseDetail(body, caseId);
    },
    async decide(caseId, input) {
      const body = await requestJson(`/cases/${encodeURIComponent(caseId)}/decision`, {
        method: "POST",
        body: JSON.stringify(decisionBody(input)),
      });
      return parseReviewDecisionResult(body, input.decision, caseId);
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Plain-language states                                                     */
/* ------------------------------------------------------------------------ */

export type ReviewAccessState =
  | "sign_in_required"
  | "owner_session_required"
  | "owner_access_required"
  | "forbidden"
  | "unavailable"
  | "outage";

/** Which whole-page access/outage state an error puts the page in, if any. */
export function reviewAccessState(error: unknown): ReviewAccessState | null {
  if (!(error instanceof EvidenceFeedbackReviewError)) return null;
  if (error.status === 401) return "sign_in_required";
  if (error.status === 403 && error.code === "OWNER_SESSION_REQUIRED") return "owner_session_required";
  if (error.status === 403 && error.code === "OWNER_ACCESS_REQUIRED") return "owner_access_required";
  if (error.status === 403) return "forbidden";
  if ((error.status === 404 && error.code !== "CASE_NOT_FOUND") || error.status === 405) return "unavailable";
  // Any 5xx is "unavailable, retry" -- including a 503 the backend can return
  // for a malformed cursor on PostgreSQL -- never an empty queue.
  if (error.status === 0 || error.status >= 500 || error.code === "INVALID_RESPONSE") return "outage";
  return null;
}

export const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  pending_review: "Pending review",
  governed_review_required: "Governed review required",
  resolved: "Resolved",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  reject: "Reject",
  needs_governed_review: "Route to governed review",
  accept_trivial: "Accept trivial correction",
};

/** Plain-language copy for a refused request or decision. */
export function reviewErrorMessage(error: unknown): string {
  if (!(error instanceof EvidenceFeedbackReviewError)) {
    return "The review service returned something unexpected. Nothing was changed.";
  }
  switch (error.code) {
    case "INVALID_CASE_TRANSITION":
      return `This decision is not allowed any more: the case is now ${statusLabel(error.currentStatus ?? "in another state").toLowerCase()}. Reload the case to see its current decisions. Nothing was changed.`;
    case "GOVERNED_REVIEW_REQUIRED":
      return "This correction cannot be accepted as a trivial fix; it needs governed review. Nothing was changed.";
    case "SCIENTIFIC_OBJECT_CANNOT_AUTO_CORRECT":
      return "Only lexicon wording can take the trivial-correction path; scientific records need governed review. Nothing was changed.";
    case "DEFECT_CLASS_NOT_AUTO_CORRECTABLE":
      return "Only typo or formatting defects can be accepted as trivial corrections. Nothing was changed.";
    case "STALE_OBJECT_VERSION":
      return "The record changed after the submitter saw it, so this correction cannot be applied as-is. Nothing was changed.";
    case "CASE_NOT_FOUND":
      return "This case was not found on the backend.";
    case "OBJECT_VERSION_NOT_FOUND":
      return "The record version the submitter saw is not stored, so a correction cannot be applied. Nothing was changed.";
    case "INVALID_REVIEW_CURSOR":
      return "The queue position is no longer valid. Reload the queue from the start.";
    case "REQUEST_VALIDATION_FAILED":
      return `The decision was incomplete${error.validationMessage ? `: ${error.validationMessage}` : ""}. Nothing was changed.`;
    case "NETWORK_UNAVAILABLE":
      return "The review service could not be reached. Nothing was changed.";
    case "INVALID_RESPONSE":
      return "The review service returned an incomplete response, so nothing is shown from it.";
    default:
      break;
  }
  switch (reviewAccessState(error)) {
    case "sign_in_required":
      return "An owner session is required. Sign in at Mission Control, then reload this page.";
    case "owner_session_required":
      return "This review queue needs the owner session; a service API key is not accepted.";
    case "owner_access_required":
    case "forbidden":
      return "This review queue is limited to the owner.";
    case "unavailable":
      return "The feedback review API is not available on this backend.";
    case "outage":
      return "The feedback review queue is unavailable right now; try again shortly. Nothing was changed.";
    default:
      return `The review service refused the request (${error.code.replaceAll("_", " ").toLowerCase()}). Nothing was changed.`;
  }
}
