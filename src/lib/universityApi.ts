import type { UniversityReleaseReadiness } from './universityRelease';

export type UniversityCapability = {
  enabled: boolean;
  session_writes_enabled: boolean;
  learner_auth_enabled: boolean;
  persistence: 'process_local_memory' | 'postgres_durable';
  durable_sessions_enabled: boolean;
  publication_enabled: boolean;
  candidate_knowledge_writes_enabled: boolean;
  calyx_model_calls_enabled: boolean;
};

export type UniversityCatalog = {
  chapter: { id: string; title: string; summary: string; status: string };
  laboratory: { id: string; title: string; summary: string; status: string };
  capability: UniversityCapability;
};

export type UniversityChapter = {
  chapter_id: string;
  title: string;
  summary: string;
  status: string;
  learning_objectives: string[];
  sections: Array<{
    section_id: string;
    title: string;
    epistemic_status: string;
    body: string;
  }>;
  laboratory_links: Array<{
    laboratory_id: string;
    launch_label: string;
    required_sections: string[];
  }>;
  publication_allowed: false;
};

export type UniversityLaboratory = {
  laboratory_id: string;
  title: string;
  summary: string;
  status: string;
  inquiry_sequence: UniversityInquiryStage[];
  evidence_catalog: Array<{
    evidence_id: string;
    label: string;
    epistemic_status: string;
    summary: string;
  }>;
  tutor_mode: string;
  publication_allowed: false;
  automatic_candidate_knowledge: false;
  human_review_required: true;
};

export type UniversityInquiryStage =
  | 'observe'
  | 'question'
  | 'investigate'
  | 'analyze'
  | 'interpret'
  | 'communicate'
  | 'contribute';

export type UniversitySessionStatus =
  | 'created'
  | 'observing'
  | 'questioning'
  | 'investigating'
  | 'analyzing'
  | 'interpreting'
  | 'communicating'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved_for_learning'
  | 'archived';

export type UniversitySessionEvent = {
  event_id: string;
  event_type: string;
  stage: UniversityInquiryStage;
  payload: Record<string, unknown>;
  actor: string;
  session_revision: number;
  created_at: string;
};

export type UniversityLabSession = {
  session_id: string;
  laboratory_id: string;
  chapter_id: string;
  actor: string;
  status: UniversitySessionStatus;
  current_stage: UniversityInquiryStage;
  created_at: string;
  updated_at: string;
  revision: number;
  events: UniversitySessionEvent[];
  publication_allowed: false;
  automatic_candidate_knowledge: false;
  human_review_required: true;
};

export type InvestigationEventType =
  | 'observation_added'
  | 'question_set'
  | 'hypothesis_added'
  | 'evidence_examined'
  | 'analysis_recorded'
  | 'interpretation_recorded'
  | 'conclusion_drafted'
  | 'uncertainty_recorded'
  | 'stage_advanced';

export type UniversityApiErrorPayload = {
  code?: string;
  message?: string;
  request_id?: string | null;
};

export class UniversityApiError extends Error {
  status: number;
  path: string;
  detail: UniversityApiErrorPayload | null;

  constructor(status: number, path: string, detail: UniversityApiErrorPayload | null) {
    super(detail?.message ?? `University API request failed (${status})`);
    this.name = 'UniversityApiError';
    this.status = status;
    this.path = path;
    this.detail = detail;
  }
}

const apiBase = (import.meta.env.VITE_CALYX_API_URL ?? '').replace(/\/$/, '');

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let detail: UniversityApiErrorPayload | null = null;
    try {
      const payload = (await response.json()) as { detail?: UniversityApiErrorPayload };
      detail = payload.detail ?? null;
    } catch {
      detail = null;
    }
    throw new UniversityApiError(response.status, path, detail);
  }
  return response.json() as Promise<T>;
}

export const universityApi = {
  releaseReadiness: () =>
    requestJson<UniversityReleaseReadiness>('/api/learning/release-readiness'),
  capability: () => requestJson<UniversityCapability>('/api/learning/capabilities'),
  catalog: () => requestJson<UniversityCatalog>('/api/learning/catalog'),
  chapter: (chapterId: string) =>
    requestJson<UniversityChapter>(`/api/learning/chapters/${encodeURIComponent(chapterId)}`),
  laboratory: (laboratoryId: string) =>
    requestJson<UniversityLaboratory>(
      `/api/learning/laboratories/${encodeURIComponent(laboratoryId)}`,
    ),
  createSession: (
    input: { laboratory_id: string; chapter_id: string },
    accessToken: string,
  ) =>
    requestJson<UniversityLabSession>('/api/learning/sessions', {
      method: 'POST',
      body: input,
      accessToken,
    }),
  session: (sessionId: string, accessToken: string) =>
    requestJson<UniversityLabSession>(
      `/api/learning/sessions/${encodeURIComponent(sessionId)}`,
      { accessToken },
    ),
  appendEvent: (
    sessionId: string,
    input: {
      event_type: InvestigationEventType;
      stage: UniversityInquiryStage;
      payload?: Record<string, unknown>;
      expected_revision: number;
    },
    accessToken: string,
  ) =>
    requestJson<UniversityLabSession>(
      `/api/learning/sessions/${encodeURIComponent(sessionId)}/events`,
      { method: 'POST', body: input, accessToken },
    ),
  submitSession: (sessionId: string, expectedRevision: number, accessToken: string) =>
    requestJson<UniversityLabSession>(
      `/api/learning/sessions/${encodeURIComponent(sessionId)}/submit`,
      { method: 'POST', body: { expected_revision: expectedRevision }, accessToken },
    ),
};
