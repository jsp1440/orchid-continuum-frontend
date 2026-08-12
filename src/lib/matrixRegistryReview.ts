import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export type RegistrySummary = {
  registry_id: string;
  version: string;
  title?: string;
  scope?: Record<string, unknown>;
  candidate_count?: number;
  character_count?: number;
  checksum_sha256?: string;
  publication_state?: string;
};

export type RegistryCharacter = {
  character: string;
  label: string;
  description?: string | null;
  value_type?: string;
  weight?: number;
  concept_id?: string | null;
  provenance?: Record<string, unknown> | null;
};

export type RegistryVersion = RegistrySummary & {
  characters: RegistryCharacter[];
  candidates?: Array<Record<string, unknown>>;
  provenance?: Record<string, unknown>;
  created_by?: string;
};

export type ApprovedLexiconConcept = {
  concept_id: string;
  preferred_term: string;
  quick_definition?: string | null;
  expanded_definition?: string | null;
  review_state?: string;
  source_system?: string;
  source_record_id?: string;
  provenance?: Record<string, unknown>;
};

export type ConceptMappingDecision = {
  character: string;
  concept_id: string;
};

export type RegistryDerivationReceipt = {
  created: boolean;
  mapping_count: number;
  source_registry: { registry_id: string; version: string };
  new_registry: {
    registry_id: string;
    version: string;
    checksum_sha256: string;
    publication_state: string;
  };
  automatic_concept_matching: false;
  automatic_publication: false;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as T | { detail?: unknown } | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? JSON.stringify(payload.detail)
      : response.statusText;
    throw new Error(`Matrix registry review API ${response.status}: ${detail}`);
  }
  return payload as T;
}

export async function listReviewableRegistries(): Promise<RegistrySummary[]> {
  const payload = await request<{ versions: RegistrySummary[] }>("/api/matrix-identification/registry");
  return Array.isArray(payload.versions) ? payload.versions : [];
}

export async function getRegistryVersion(registryId: string, version: string): Promise<RegistryVersion> {
  return request<RegistryVersion>(
    `/api/matrix-identification/registry/${encodeURIComponent(registryId)}/${encodeURIComponent(version)}`,
  );
}

export async function searchApprovedLexiconConcepts(query: string): Promise<ApprovedLexiconConcept[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const payload = await request<{ entries?: ApprovedLexiconConcept[] }>(
    `/api/lexicon/search?q=${encodeURIComponent(trimmed)}&limit=25`,
  );
  return Array.isArray(payload.entries) ? payload.entries : [];
}

export async function deriveRegistryConceptMappings(
  registryId: string,
  sourceVersion: string,
  newVersion: string,
  mappings: ConceptMappingDecision[],
  reviewNote?: string,
): Promise<RegistryDerivationReceipt> {
  return request<RegistryDerivationReceipt>(
    `/api/matrix-identification/registry/${encodeURIComponent(registryId)}/${encodeURIComponent(sourceVersion)}/derive-concept-mappings`,
    {
      method: "POST",
      body: JSON.stringify({
        new_version: newVersion,
        mappings,
        review_note: reviewNote || undefined,
      }),
    },
  );
}
