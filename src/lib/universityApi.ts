import type { UniversityReleaseReadiness } from './universityRelease';

export type UniversityCapability = {
  enabled: boolean;
  session_writes_enabled: boolean;
  persistence: 'process_local_memory';
  publication_enabled: false;
  candidate_knowledge_writes_enabled: false;
  calyx_model_calls_enabled: false;
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
  inquiry_sequence: string[];
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

const apiBase = (import.meta.env.VITE_CALYX_API_URL ?? '').replace(/\/$/, '');

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) {
    const error = new Error(`University API request failed (${response.status})`);
    Object.assign(error, { status: response.status, path });
    throw error;
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
};
