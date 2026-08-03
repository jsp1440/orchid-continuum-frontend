export const PARALLEL_CONTRACT_VERSION = "oc-parallel-v1" as const;

export type Availability = "available" | "degraded" | "unavailable";

export interface HomepageSection {
  id: string;
  availability: Availability;
  data: unknown;
  evidence: string[];
  message?: string;
}

export interface HomepageDocument {
  contract_version: typeof PARALLEL_CONTRACT_VERSION;
  title: string;
  mission: string;
  sections: HomepageSection[];
  governance: {
    real_approved_imagery_only: boolean;
    provenance_required: boolean;
    uncertainty_required: boolean;
    client_scoring_allowed: false;
  };
}

export interface MatrixDimension {
  name: string;
  availability: Availability;
  score: number | null;
  weight: number;
  confidence: number | null;
  evidence: string[];
}

export interface MatrixResult {
  contract_version: typeof PARALLEL_CONTRACT_VERSION;
  subject_taxon_id: string;
  object_taxon_id: string;
  score: number | null;
  coverage: number;
  dimensions: MatrixDimension[];
  interpretation: "candidate_relationship" | "insufficient_evidence";
  publication_authority: false;
}

export interface IdentificationCandidate {
  taxon_id: string;
  scientific_name: string;
  score: number;
  support: string[];
  conflicts: string[];
  missing: string[];
  evidence: string[];
  state: "candidate_suggestion";
}

export interface IdentificationResult {
  contract_version: typeof PARALLEL_CONTRACT_VERSION;
  observation_id: string;
  state: "observation_incomplete" | "ambiguous" | "requires_expert_review";
  candidates: IdentificationCandidate[];
  next_best_observation: string | null;
  verified_identity: null;
  publication_authority: false;
}

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "https://orchid-calyx-backend.onrender.com").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Parallel platform request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export const getHomepageDocument = () => request<HomepageDocument>("/api/platform/homepage");
export const getPlatformCapabilities = () => request<Record<string, unknown>>("/api/platform/capabilities");
export const compareTaxa = (payload: unknown) => request<MatrixResult>("/api/platform/matrix/pairwise", { method: "POST", body: JSON.stringify(payload) });
export const rankIdentification = (payload: unknown) => request<IdentificationResult>("/api/platform/identification/rank", { method: "POST", body: JSON.stringify(payload) });
