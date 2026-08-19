import { CALYX_BACKEND_BASE_URL } from './backendConfig';
import { UniversityApiError, type UniversityInquiryStage, type UniversitySessionStatus } from './universityApi';

export type UniversityReviewerContext = {
  principal_id: string;
  authenticated: boolean;
  roles: string[];
  qualifications: string[];
  specialties: string[];
  effective_capabilities: string[];
  science_review_allowed: boolean;
  expert_review_allowed: boolean;
  durable_sessions_enabled: boolean;
  governance: {
    administrator_role_does_not_imply_scientific_authority: boolean;
    learner_identity_does_not_imply_reviewer_authority: boolean;
    publication_performed: false;
    candidate_knowledge_promoted: false;
  };
};

export type UniversityReviewQueueItem = {
  session_id: string;
  laboratory_id: string;
  chapter_id: string;
  status: UniversitySessionStatus;
  current_stage: UniversityInquiryStage;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type UniversityReviewQueuePage = {
  sessions: UniversityReviewQueueItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export type UniversityReviewerEvent = {
  event_id: string;
  event_type: string;
  stage: UniversityInquiryStage;
  payload: Record<string, unknown>;
  session_revision: number;
  created_at: string;
};

export type UniversityReviewHistoryItem = {
  decision: string;
  notes: string | null;
  reviewed_revision: number;
  reviewer_capability: string;
  created_at: string;
};

export type UniversityReviewerSessionDetail = UniversityReviewQueueItem & {
  events: UniversityReviewerEvent[];
  review_history: UniversityReviewHistoryItem[];
  privacy: {
    learner_actor_exposed: false;
    event_actor_exposed: false;
    reviewer_actor_exposed: false;
  };
};

export type UniversityReviewDecision =
  | 'changes_requested'
  | 'approved_for_learning'
  | 'approved_for_candidate_knowledge_consideration';

type ReviewResponse = {
  review_id: string;
  session_id: string;
  decision: UniversityReviewDecision;
  reviewed_revision: number;
  candidate_knowledge_promoted: false;
  publication_performed: false;
  created_at: string;
};

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    credentials: 'include',
  });
  if (!response.ok) {
    let detail = null;
    try {
      const payload = await response.json() as { detail?: unknown };
      detail = payload.detail && typeof payload.detail === 'object'
        ? payload.detail as { code?: string; message?: string; request_id?: string | null }
        : null;
    } catch {
      detail = null;
    }
    throw new UniversityApiError(response.status, path, detail);
  }
  return response.json() as Promise<T>;
}

export const universityReviewerApi = {
  context: () => requestJson<UniversityReviewerContext>('/api/learning/reviewer/context'),
  queue: (cursor?: string | null, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return requestJson<UniversityReviewQueuePage>(`/api/learning/reviewer/sessions?${params.toString()}`);
  },
  session: (sessionId: string) =>
    requestJson<UniversityReviewerSessionDetail>(
      `/api/learning/reviewer/sessions/${encodeURIComponent(sessionId)}`,
    ),
  decide: (
    sessionId: string,
    input: { reviewed_revision: number; decision: UniversityReviewDecision; notes?: string | null },
  ) =>
    requestJson<ReviewResponse>(
      `/api/learning/sessions/${encodeURIComponent(sessionId)}/reviews`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
};
