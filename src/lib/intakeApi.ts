import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export function validateBatchUpload(batchName: string, fileCount: number): string | null {
  if (!batchName.trim()) return 'Enter a batch name before uploading.';
  if (fileCount === 0) return 'Choose at least one file.';
  return null;
}

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

export type BatchUploadResult = {
  batch: { id: number; display_name: string; accepted_count: number; duplicate_count: number; failed_count: number; review_required_count: number };
  files: Array<{ filename: string; status: 'PRESERVED' | 'DUPLICATE' | 'FAILED'; error?: string }>;
  partial_success: boolean;
  canonical_graph_mutated: false;
};

export class IntakeUploadError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message);
    this.name = 'IntakeUploadError';
  }
}

function uploadErrorMessage(status: number, detail: unknown): string {
  const safeDetail = typeof detail === 'string'
    ? detail
    : detail && typeof detail === 'object' && 'code' in detail
      ? String((detail as { code: unknown }).code)
      : '';
  if (status === 401 || status === 403) return 'Your owner session has expired or is not authorized. Sign in again, then retry the upload.';
  if (status === 404) return 'The deployed backend does not expose the BUILD-076A upload route.';
  if (status === 413) return 'The upload exceeds the deployed request-size limit. Try fewer or smaller files.';
  if (status >= 500) return `The intake service failed (${status}). ${safeDetail || 'Check migration, storage, and backend logs.'}`;
  return `Upload failed (${status}). ${safeDetail || 'The server rejected the request.'}`;
}

export async function uploadIntakeBatch(input: { displayName: string; sourceLabel?: string; files: File[]; timeoutMs?: number }): Promise<BatchUploadResult> {
  const form = new FormData();
  form.set('display_name', input.displayName);
  if (input.sourceLabel) form.set('source_label', input.sourceLabel);
  input.files.forEach((file) => form.append('files', file, file.name));
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/intake/batches`, {
      method: 'POST', credentials: 'include', headers: { Accept: 'application/json' }, body: form, signal: controller.signal,
    });
    const text = await response.text();
    let payload: (BatchUploadResult & { detail?: unknown }) | { detail?: unknown } = {};
    try { payload = text ? JSON.parse(text) as typeof payload : {}; } catch { payload = { detail: response.statusText }; }
    if (!response.ok) {
      throw new IntakeUploadError(uploadErrorMessage(response.status, payload.detail), response.status, 'HTTP_ERROR');
    }
    return payload as BatchUploadResult;
  } catch (error) {
    if (error instanceof IntakeUploadError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IntakeUploadError('The upload timed out after 60 seconds. Check your connection and retry.', undefined, 'TIMEOUT');
    }
    throw new IntakeUploadError('The upload request could not reach the intake service. Check your connection and retry.', undefined, 'NETWORK_ERROR');
  } finally {
    globalThis.clearTimeout(timeout);
  }
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
