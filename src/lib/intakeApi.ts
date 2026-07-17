import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type IntakeQueueItem = {
  id: number;
  title: string;
  source_type: string;
  source_url?: string | null;
  status: string;
  imported_at: string;
  entity_count: number;
  task_count: number;
};

export type IntakeEntity = {
  id: number;
  entity_type: string;
  canonical_name: string;
  confidence: number;
  exact_text: string;
  proposed_node_json?: Record<string, unknown>;
};

export type IntakeRelationship = {
  id: number;
  subject_name: string;
  predicate: string;
  object_name: string;
  confidence: number;
  evidence_text: string;
};

export type IntakeTask = {
  id: number;
  task_type: string;
  title: string;
  priority: string;
  rationale?: string | null;
  status: string;
};

export type IntakeSource = IntakeQueueItem & {
  raw_content: string;
  content_hash: string;
  imported_by?: string | null;
  parser_version: string;
  entities: IntakeEntity[];
  relationships: IntakeRelationship[];
  tasks: IntakeTask[];
};

export type WorkflowActionType =
  | 'TASK'
  | 'CALENDAR'
  | 'GRANT'
  | 'TAXONOMY_REVIEW'
  | 'LITERATURE_EXTRACTION'
  | 'PARTNERSHIP'
  | 'CONNECTOR_REVIEW'
  | 'MEDIA_SEARCH'
  | 'ARCHIVE';

export type WorkflowPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type WorkflowAction = {
  id: number;
  source_id: number;
  action_type: WorkflowActionType;
  destination: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  priority: WorkflowPriority;
  status: string;
  due_at?: string | null;
  reminder_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

type JsonRecord = Record<string, unknown>;

async function intakeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload
      ? String((payload as JsonRecord).detail)
      : response.statusText;
    throw new Error(`Intelligence Center ${response.status}: ${detail}`);
  }
  return payload;
}

export async function submitIntakeText(input: {
  title: string;
  content: string;
  imported_by?: string;
  source_url?: string;
}) {
  return intakeRequest<{ id: number; status: string; duplicate: boolean; entity_count?: number; relationship_count?: number; task_count?: number }>(
    '/api/intake/text',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchIntakeQueue(): Promise<IntakeQueueItem[]> {
  const response = await intakeRequest<{ items: IntakeQueueItem[] }>('/api/intake/review');
  return response.items || [];
}

export async function fetchIntakeSource(id: number): Promise<IntakeSource> {
  return intakeRequest<IntakeSource>(`/api/intake/${id}`);
}

export async function decideIntakeSource(id: number, action: 'approve' | 'reject', notes?: string) {
  return intakeRequest<{ id: number; status: string }>(`/api/intake/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes || null }),
  });
}

export async function publishIntakeSource(id: number) {
  return intakeRequest<{ id: number; status: string; graph_mutated: boolean; message: string }>(`/api/intake/${id}/publish`, {
    method: 'POST',
  });
}

export async function createWorkflowAction(sourceId: number, input: {
  action_type: WorkflowActionType;
  destination: string;
  title: string;
  description?: string;
  owner?: string;
  priority: WorkflowPriority;
  due_at?: string;
  reminder_at?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}) {
  return intakeRequest<WorkflowAction>(`/api/workflow/sources/${sourceId}/actions`, {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      due_at: input.due_at || null,
      reminder_at: input.reminder_at || null,
      description: input.description || null,
      owner: input.owner || null,
      notes: input.notes || null,
      metadata: input.metadata || {},
    }),
  });
}

export async function fetchSourceWorkflow(sourceId: number) {
  return intakeRequest<{ source: IntakeQueueItem; actions: WorkflowAction[]; history: unknown[] }>(`/api/workflow/sources/${sourceId}`);
}
