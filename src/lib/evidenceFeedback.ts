import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { withMemberAuth } from '@/lib/memberReadAuth';

/*
 * Owner decision (Release 1 ledger): "Members submit, owner reviews".
 *
 * A signed-in member's Supabase bearer is attached (by `withMemberAuth`, the
 * single default-deny decision) to exactly three calls: POST /objects,
 * POST /cases and GET /cases/{their case id}. The backend admits members there
 * only while its kill switch OC_MEMBER_FEEDBACK_ENABLED is on, and answers
 * members with a RECEIPT, never a case record: `{created, case_id, status}`,
 * where `case_id` is null when an identical report by someone else already
 * exists. This client keeps only those three fields, so nothing about another
 * person's report can reach the page. Owner-session and API-key callers keep
 * the full case response, unchanged.
 */

export const EVIDENCE_FEEDBACK_API_BASE = `${CALYX_BACKEND_BASE_URL}/api/evidence-feedback`;

export type EvidenceObjectType =
  | 'lexicon'
  | 'matrix_identification'
  | 'taxonomy'
  | 'image_annotation'
  | 'literature_claim'
  | 'structured_character'
  | 'distribution_record'
  | 'other';

export type FeedbackClass =
  | 'report_problem'
  | 'suggest_correction'
  | 'challenge'
  | 'add_evidence'
  | 'confirm'
  | 'source_problem'
  | 'image_identification_problem';

/**
 * The defect kinds the backend's deterministic trivial-correction path
 * recognises. Backend contract (orchid-calyx-backend
 * `app/evidence_feedback/service.py`): `_triage` marks a case
 * auto-correctable only for a `lexicon` object, `suggest_correction`
 * feedback, proposed wording, and `defect_kind` in {"typo", "format"};
 * `trivial_correction_blocker` refuses every other kind. Any other value is
 * stored as a label but never changes triage, so the UI offers exactly these
 * two, plus "other / not sure" which sends no defect kind. Values are short
 * printable labels, as the backend's `validate_label` requires.
 */
export const TRIVIAL_DEFECT_KINDS = ['typo', 'format'] as const;
export type TrivialDefectKind = (typeof TRIVIAL_DEFECT_KINDS)[number];

/**
 * Whether a defect kind can matter for this submission. Only lexicon
 * corrections can take the trivial path; scientific objects (Matrix
 * identifications, taxonomy, images, literature, characters, distribution)
 * always go to governed review whatever defect kind is sent.
 */
export function defectKindApplies(objectType: EvidenceObjectType, feedbackClass: FeedbackClass): boolean {
  return objectType === 'lexicon' && feedbackClass === 'suggest_correction';
}

/**
 * Case status (backend `CaseStatus`). `governed_review_required` (backend
 * #1663) means the owner routed the case to governed scientific/taxonomic
 * review: it is not resolved and nothing displayed has changed.
 */
export type FeedbackCaseStatus = 'submitted' | 'pending_review' | 'governed_review_required' | 'resolved';

const CASE_STATUSES: readonly FeedbackCaseStatus[] = ['submitted', 'pending_review', 'governed_review_required', 'resolved'];

/**
 * The status a member receives when their text duplicates a report someone
 * else already made: that report is with the reviewer; nothing about it is
 * disclosed, and there is no case for this member to follow.
 */
export const MEMBER_ALREADY_REPORTED = 'already_reported';

/** What a member sees for `already_reported`: no case, nothing about the other report. */
export const ALREADY_REPORTED_MESSAGE =
  'The same report is already waiting for review, so nothing more is needed. Thank you. The displayed scientific content has not been changed.';

/** What a member sees for 403 MEMBER_FEEDBACK_DISABLED (the backend kill switch is off). */
export const FEEDBACK_DISABLED_MESSAGE =
  'Feedback from member accounts is not open yet. Nothing was sent for review; please try again later.';

/**
 * A registered snapshot. Owner/API-key callers receive the full stored
 * record; a member receives only `object_id`, `object_type` and
 * `version_hash` (who first registered it, and when, may describe someone
 * else).
 */
export interface EvidenceObjectVersion {
  object_id: string;
  object_type: EvidenceObjectType;
  version_hash: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  previous_version_hash?: string | null;
}

export interface EvidenceFeedbackCase {
  case_id: string;
  object_id: string;
  object_version_hash: string;
  object_type: EvidenceObjectType;
  page_context: string;
  feedback_class: FeedbackClass;
  statement: string;
  disposition: string;
  status: FeedbackCaseStatus;
  review_lane: string;
  created_at: string;
  updated_at: string;
  proposed_replacement: string | null;
  citation: string | null;
  resolution: string | null;
  resulting_version_hash: string | null;
}

/** Owner-session / API-key response: the full case record (unchanged). */
export interface FeedbackSubmission {
  kind: 'case';
  created: boolean;
  duplicate_of: string | null;
  case: EvidenceFeedbackCase;
}

/** Member response: a receipt about the member's own submission only. */
export interface MemberFeedbackReceipt {
  kind: 'receipt';
  created: boolean;
  /** The member's own case, or null when someone else's identical report exists. */
  case_id: string | null;
  status: FeedbackCaseStatus | typeof MEMBER_ALREADY_REPORTED;
}

export type FeedbackSubmissionResult = FeedbackSubmission | MemberFeedbackReceipt;

export interface FeedbackCaseStatusResponse {
  case_id: string;
  status: FeedbackCaseStatus;
  disposition: string;
  resolution: string | null;
  resulting_version_hash: string | null;
}

export interface SubmitEvidenceFeedbackInput {
  objectId: string;
  objectType: EvidenceObjectType;
  objectPayload: Record<string, unknown>;
  pageContext: string;
  feedbackClass: FeedbackClass;
  statement: string;
  proposedReplacement?: string;
  citation?: string;
  sourcePartnerId?: string;
  defectKind?: string;
  severity?: string;
}

/** Backend refusal codes the feedback UI distinguishes. */
export const EVIDENCE_FEEDBACK_CODES = {
  memberFeedbackDisabled: 'MEMBER_FEEDBACK_DISABLED',
  memberRateLimited: 'MEMBER_RATE_LIMITED',
  ownerAccessRequired: 'OWNER_ACCESS_REQUIRED',
} as const;

export class EvidenceFeedbackApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds from a 429's `Retry-After`, when the backend sent one. */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, code: string, retryAfterSeconds: number | null = null) {
    super(code);
    this.name = 'EvidenceFeedbackApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfterOf(response: Response): number | null {
  const raw = response.headers?.get?.('Retry-After');
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const seconds = Number(raw.trim());
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function errorCode(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (detail && typeof detail === 'object') {
      const code = (detail as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim()) return code.trim();
    }
  }
  return `HTTP_${status}`;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${EVIDENCE_FEEDBACK_API_BASE}${path}`;
  let response: Response;
  try {
    // The member bearer is attached only on the three member feedback calls
    // (memberReadAuth MEMBER_ROUTES) and never displaces an owner session.
    const request = await withMemberAuth(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    response = await fetch(url, request);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new EvidenceFeedbackApiError(0, 'NETWORK_UNAVAILABLE');
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new EvidenceFeedbackApiError(response.status, 'NON_JSON_RESPONSE');
  }
  if (!response.ok) {
    throw new EvidenceFeedbackApiError(
      response.status,
      errorCode(body, response.status),
      response.status === 429 ? retryAfterOf(response) : null,
    );
  }
  if (!body || typeof body !== 'object') {
    throw new EvidenceFeedbackApiError(response.status, 'INVALID_RESPONSE');
  }
  return body as T;
}

const VERSION_HASH = /^[0-9a-f]{64}$/;

export async function registerEvidenceObject(
  objectId: string,
  objectType: EvidenceObjectType,
  payload: Record<string, unknown>,
): Promise<EvidenceObjectVersion> {
  const version = await requestJson<EvidenceObjectVersion>('/objects', {
    method: 'POST',
    body: JSON.stringify({ object_id: objectId, object_type: objectType, payload }),
  });
  // The case must bind to a real content hash; anything else fails closed.
  if (typeof version.version_hash !== 'string' || !VERSION_HASH.test(version.version_hash)) {
    throw new EvidenceFeedbackApiError(201, 'INVALID_RESPONSE');
  }
  return version;
}

/**
 * Read a POST /cases response as either the owner's full case or a member
 * receipt. A member receipt is rebuilt from exactly its three fields, so any
 * other field a response might carry never reaches the page. Anything that is
 * neither shape fails closed.
 */
export function parseFeedbackSubmission(body: unknown, status = 201): FeedbackSubmissionResult {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!record || typeof record.created !== 'boolean') throw new EvidenceFeedbackApiError(status, 'INVALID_RESPONSE');
  const feedbackCase = record.case;
  if (feedbackCase && typeof feedbackCase === 'object') {
    const caseRecord = feedbackCase as Record<string, unknown>;
    if (typeof caseRecord.case_id !== 'string' || !CASE_STATUSES.includes(caseRecord.status as FeedbackCaseStatus)) {
      throw new EvidenceFeedbackApiError(status, 'INVALID_RESPONSE');
    }
    return {
      kind: 'case',
      created: record.created,
      duplicate_of: typeof record.duplicate_of === 'string' ? record.duplicate_of : null,
      case: feedbackCase as EvidenceFeedbackCase,
    };
  }
  const caseId = record.case_id;
  const caseStatus = record.status;
  if (caseId === null && caseStatus === MEMBER_ALREADY_REPORTED && record.created === false) {
    return { kind: 'receipt', created: false, case_id: null, status: MEMBER_ALREADY_REPORTED };
  }
  if (typeof caseId === 'string' && caseId && CASE_STATUSES.includes(caseStatus as FeedbackCaseStatus)) {
    return { kind: 'receipt', created: record.created, case_id: caseId, status: caseStatus as FeedbackCaseStatus };
  }
  throw new EvidenceFeedbackApiError(status, 'INVALID_RESPONSE');
}

export async function submitEvidenceFeedback(
  input: SubmitEvidenceFeedbackInput,
): Promise<FeedbackSubmissionResult> {
  const version = await registerEvidenceObject(input.objectId, input.objectType, input.objectPayload);
  const body = await requestJson<unknown>('/cases', {
    method: 'POST',
    body: JSON.stringify({
      object_id: input.objectId,
      object_version_hash: version.version_hash,
      object_type: input.objectType,
      page_context: input.pageContext,
      feedback_class: input.feedbackClass,
      statement: input.statement,
      proposed_replacement: input.proposedReplacement?.trim() || null,
      citation: input.citation?.trim() || null,
      source_partner_id: input.sourcePartnerId?.trim() || null,
      defect_kind: input.defectKind?.trim() || null,
      severity: input.severity?.trim() || 'normal',
    }),
  });
  return parseFeedbackSubmission(body);
}

export async function fetchEvidenceFeedbackStatus(caseId: string): Promise<FeedbackCaseStatusResponse> {
  return requestJson<FeedbackCaseStatusResponse>(`/cases/${encodeURIComponent(caseId)}`, { method: 'GET' });
}
