import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export type MatrixPersistenceStatus = {
  mode: string;
  durable: boolean;
  ready: boolean;
  durable_requested?: boolean;
  warning?: string;
  error?: string | null;
  schema?: string;
  activation_boundary?: string;
};

export type MatrixPersistencePreflight = {
  schema_version?: string;
  database_url_configured: boolean;
  durable_requested: boolean;
  activated: boolean;
  connectivity: boolean;
  table_exists: boolean;
  migration_612_schema_ready: boolean;
  activation_ready: boolean;
  blockers?: string[];
  missing_columns?: string[];
  type_mismatches?: Array<{ column: string; expected: string; actual?: string | null }>;
  primary_key_ok?: boolean;
  missing_indexes?: string[];
  migration_applied_by_preflight: false;
  environment_changed_by_preflight: false;
  governance_boundary?: string;
};

export type MatrixReportSummary = {
  report_id: string;
  content_digest_sha256: string;
  finalized_at: string;
  session_revision: number;
  registry?: {
    registry_id?: string;
    version?: string;
    checksum_sha256?: string;
  };
  leading_candidate?: string | null;
};

export type MatrixReportRecord = {
  report_id: string;
  content_digest_sha256: string;
  finalized_at: string;
  core: {
    schema_version: string;
    evaluator_version: string;
    session_id: string;
    session_revision: number;
    registry: Record<string, unknown>;
    observations: Array<Record<string, unknown>>;
    ranking: {
      candidates: Array<{
        taxon_id: string;
        scientific_name: string;
        score: number;
        coverage: number;
      }>;
      disclaimer?: string;
    };
    governance: {
      artifact_type: string;
      verified_taxonomic_identification: false;
      automatic_publication: false;
      canonical_taxonomy_mutation: false;
    };
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await response.json().catch(() => null) as T | { detail?: unknown } | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? JSON.stringify(payload.detail)
      : response.statusText;
    throw new Error(`Matrix report API ${response.status}: ${detail}`);
  }
  return payload as T;
}

export async function getMatrixPersistenceStatus(): Promise<MatrixPersistenceStatus> {
  return request<MatrixPersistenceStatus>("/api/matrix-identification/sessions/persistence-status");
}

export async function getMatrixPersistencePreflight(): Promise<MatrixPersistencePreflight> {
  return request<MatrixPersistencePreflight>("/api/matrix-identification/sessions/persistence-preflight");
}

export async function finalizeMatrixReport(sessionId: string): Promise<{ created: boolean; report: MatrixReportRecord }> {
  return request<{ created: boolean; report: MatrixReportRecord }>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/reports`,
    { method: "POST", body: JSON.stringify({ limit: 20 }) },
  );
}

export async function listMatrixReports(sessionId: string): Promise<MatrixReportSummary[]> {
  const result = await request<{ session_id: string; reports: MatrixReportSummary[] }>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/reports`,
  );
  return Array.isArray(result.reports) ? result.reports : [];
}
