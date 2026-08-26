/**
 * researchStation — canonical client for the Research Workspace contract.
 *
 * Consumes the backend's existing `/api/research/projects` surface
 * (`app/research_workspace`): projects carrying a research question and
 * hypothesis, plus linked taxa, documents, evidence and notes. Nothing here
 * derives scientific truth; it reads what the workspace actually holds and
 * fails closed when the service cannot answer.
 *
 * Reuses the Calyx request/error contract (`CalyxApiError`) so authentication,
 * undeployed routes and validation failures surface identically across the
 * workspace and the station.
 */

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { CalyxApiError } from "@/lib/calyxWorkspace";

export type ResearchProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

export type ResearchProject = {
  project_id: string;
  owner_subject?: string;
  title: string;
  description?: string;
  research_question?: string | null;
  hypothesis?: string | null;
  status: ResearchProjectStatus;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
  version?: number;
  permissions?: { can_read?: boolean; can_update?: boolean; can_archive?: boolean };
  link_counts?: Record<string, number>;
};

/** SUBJECT is the taxon under investigation; the rest frame or bound it. */
export type ResearchTaxonRelationship = "SUBJECT" | "COMPARISON" | "CONTEXT" | "EXCLUDED";
export type ResearchTaxonLink = {
  project_id: string;
  taxon_id: string;
  relationship: ResearchTaxonRelationship;
  created_at?: string;
};

/** CONTRADICTS is how the workspace records evidence that disagrees. */
export type ResearchDocumentRelationship = "SOURCE" | "BACKGROUND" | "METHOD" | "CONTRADICTS";
export type ResearchDocumentLink = {
  project_id: string;
  document_id: string;
  revision_id?: string | null;
  relationship: ResearchDocumentRelationship;
  created_at?: string;
};

export type ResearchEvidenceLink = {
  project_id: string;
  evidence_kind: "CANDIDATE" | "AGGREGATE";
  evidence_id: string;
  relationship?: string;
  created_at?: string;
};

export type ResearchNote = {
  note_id: string;
  project_id: string;
  title?: string | null;
  body: string;
  note_type: "GENERAL" | "QUESTION" | "METHOD" | "OBSERVATION";
  updated_at?: string;
  /** The backend marks notes as user annotation — never as evidence. */
  data_status?: string;
};

async function researchRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new CalyxApiError(
      "network_error",
      error instanceof Error ? error.message : "Research Station request failed",
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === "string" ? body.detail : null;
    if (response.status === 401 || response.status === 403) {
      throw new CalyxApiError(
        "authentication_required",
        detail ?? "Sign in to open your research projects.",
        response.status,
      );
    }
    if (response.status === 404) {
      throw new CalyxApiError(
        "route_unavailable",
        detail ?? "The Research Workspace API is not deployed.",
        response.status,
      );
    }
    if (response.status === 400 || response.status === 422) {
      throw new CalyxApiError("validation_failed", detail ?? "The request was not valid.", response.status);
    }
    throw new CalyxApiError(
      "server_error",
      detail ?? `Research Station request failed (${response.status}).`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

const projectPath = (projectId: string) =>
  `/api/research/projects/${encodeURIComponent(projectId)}`;

export const listResearchProjects = (limit = 25) =>
  researchRequest<{ items: ResearchProject[] }>(
    `/api/research/projects?limit=${encodeURIComponent(String(limit))}`,
  );

export const getResearchProject = (projectId: string) =>
  researchRequest<ResearchProject>(projectPath(projectId));

export const listResearchTaxa = (projectId: string) =>
  researchRequest<{ items: ResearchTaxonLink[] }>(`${projectPath(projectId)}/taxa`);

export const listResearchDocuments = (projectId: string) =>
  researchRequest<{ items: ResearchDocumentLink[] }>(`${projectPath(projectId)}/documents`);

export const listResearchEvidence = (projectId: string) =>
  researchRequest<{ items: ResearchEvidenceLink[] }>(`${projectPath(projectId)}/evidence`);

export const listResearchNotes = (projectId: string) =>
  researchRequest<{ items: ResearchNote[] }>(`${projectPath(projectId)}/notes`);

/* ------------------------------------------------------------------ */
/* Derived station view                                                */
/* ------------------------------------------------------------------ */

/**
 * What the station can say about one investigation.
 *
 * Each field is either present because the workspace holds it, or explicitly
 * absent. An empty list means "the workspace holds none of these", which is a
 * gap in the record — never a scientific finding.
 */
export type ResearchStationDossier = {
  project: ResearchProject;
  /** The taxon under investigation, if one is linked as SUBJECT. */
  subject: ResearchTaxonLink | null;
  comparisons: ResearchTaxonLink[];
  context: ResearchTaxonLink[];
  /** Evidence the workspace has actually linked. */
  supporting: ResearchDocumentLink[];
  /** Documents linked as CONTRADICTS — disagreement, recorded as disagreement. */
  conflicts: ResearchDocumentLink[];
  methods: ResearchDocumentLink[];
  evidence: ResearchEvidenceLink[];
  openQuestions: ResearchNote[];
  /** True when the workspace holds no linked evidence of any kind yet. */
  evidenceEmpty: boolean;
};

export function buildResearchDossier(input: {
  project: ResearchProject;
  taxa: ResearchTaxonLink[];
  documents: ResearchDocumentLink[];
  evidence: ResearchEvidenceLink[];
  notes: ResearchNote[];
}): ResearchStationDossier {
  const taxa = input.taxa ?? [];
  const documents = input.documents ?? [];
  const evidence = input.evidence ?? [];
  const notes = input.notes ?? [];

  const supporting = documents.filter(
    (item) => item.relationship === "SOURCE" || item.relationship === "BACKGROUND",
  );
  const conflicts = documents.filter((item) => item.relationship === "CONTRADICTS");
  const methods = documents.filter((item) => item.relationship === "METHOD");

  return {
    project: input.project,
    subject: taxa.find((item) => item.relationship === "SUBJECT") ?? null,
    comparisons: taxa.filter((item) => item.relationship === "COMPARISON"),
    context: taxa.filter((item) => item.relationship === "CONTEXT"),
    supporting,
    conflicts,
    methods,
    evidence,
    openQuestions: notes.filter((item) => item.note_type === "QUESTION"),
    evidenceEmpty: supporting.length === 0 && conflicts.length === 0 && evidence.length === 0,
  };
}

/**
 * The question to carry into Calyx for this investigation.
 *
 * It combines the project's own research question with its subject taxon so the
 * conversation starts on the same investigation the station is showing, rather
 * than making the user restate it. Returns null when the project has no
 * research question — the station must not invent one.
 */
export function researchStationCalyxQuestion(dossier: ResearchStationDossier): string | null {
  const question = (dossier.project.research_question ?? "").trim();
  if (!question) return null;
  const subject = dossier.subject?.taxon_id?.trim();
  return subject ? `Regarding ${subject}: ${question}` : question;
}
