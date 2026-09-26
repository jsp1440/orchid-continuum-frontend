import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

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

export type FeedbackCaseStatus = 'submitted' | 'pending_review' | 'resolved';

export interface EvidenceObjectVersion {
  object_id: string;
  object_type: EvidenceObjectType;
  version_hash: string;
  payload: Record<string, unknown>;
  created_at: string;
  previous_version_hash: string | null;
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

export interface FeedbackSubmission {
  created: boolean;
  duplicate_of: string | null;
  case: EvidenceFeedbackCase;
}

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

export class EvidenceFeedbackApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'EvidenceFeedbackApiError';
    this.status = status;
    this.code = code;
  }
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
  let response: Response;
  try {
    response = await fetch(`${EVIDENCE_FEEDBACK_API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
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
  if (!response.ok) throw new EvidenceFeedbackApiError(response.status, errorCode(body, response.status));
  if (!body || typeof body !== 'object') {
    throw new EvidenceFeedbackApiError(response.status, 'INVALID_RESPONSE');
  }
  return body as T;
}

export async function registerEvidenceObject(
  objectId: string,
  objectType: EvidenceObjectType,
  payload: Record<string, unknown>,
): Promise<EvidenceObjectVersion> {
  return requestJson<EvidenceObjectVersion>('/objects', {
    method: 'POST',
    body: JSON.stringify({ object_id: objectId, object_type: objectType, payload }),
  });
}

export async function submitEvidenceFeedback(
  input: SubmitEvidenceFeedbackInput,
): Promise<FeedbackSubmission> {
  const version = await registerEvidenceObject(input.objectId, input.objectType, input.objectPayload);
  return requestJson<FeedbackSubmission>('/cases', {
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
}

export async function fetchEvidenceFeedbackStatus(caseId: string): Promise<FeedbackCaseStatusResponse> {
  return requestJson<FeedbackCaseStatusResponse>(`/cases/${encodeURIComponent(caseId)}`, { method: 'GET' });
}
