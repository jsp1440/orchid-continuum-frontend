/**
 * The evidence chain behind a Research Station investigation.
 *
 * A project's evidence link is only `{evidence_kind, evidence_id,
 * relationship}`. The backend already serves what that id means —
 * `GET /api/candidate-knowledge/candidates/{id}` (the extracted claim, its
 * review state, and the literature anchor it came from),
 * `GET /api/candidate-knowledge/conflicts`, and
 * `GET /api/research/projects/{id}/reasoning-ledgers` (the ledger entries that
 * cite it) — but the station called none of them, so a researcher saw bare
 * ids. This module reads those payloads; it never promotes a candidate: the
 * backend only emits `published: false`, and review state is shown verbatim.
 */

import type { LedgerEntry, LedgerRevision } from "@/lib/reasoningLedger";
import { researchRequest, type ResearchEvidenceLink } from "@/lib/researchStation";

export type CandidateEvidenceAnchor = {
  anchor_id?: number;
  page_number?: number | null;
  char_start?: number | null;
  char_end?: number | null;
  locator?: Record<string, unknown>;
  [key: string]: unknown;
};

/** One source link on a candidate (`repository.evidence_links`). */
export type CandidateEvidenceLink = {
  evidence_link_id: number;
  candidate_id: number;
  source_object_type: string;
  source_object_id: number;
  revision_id?: number;
  extraction_run_id?: number;
  display_policy?: string;
  /** Present only when the source's display policy authorizes quoting. */
  authorized_quote?: string | null;
  anchor?: CandidateEvidenceAnchor | null;
};

/** `GET /api/candidate-knowledge/candidates/{id}`. */
export type CandidateKnowledgeRecord = {
  candidate_id: number;
  kind: string;
  normalized_subject?: string;
  predicate?: string;
  object_value?: string | null;
  numeric_value?: number | null;
  unit?: string | null;
  qualifiers?: Record<string, unknown>;
  confidence?: number | null;
  confidence_components?: Record<string, number>;
  review_state: string;
  published: boolean;
  active: boolean;
  version?: number;
  extraction_method?: string;
  extractor_version?: string;
  evidence?: CandidateEvidenceLink[];
};

export type CandidateConflict = {
  conflict_id: number;
  candidate_ids: number[];
  state: string;
  created_at?: string;
};

export type LedgerCitation = {
  ledgerId: string;
  ledgerTitle: string;
  ledgerVersion: number | null;
  ledgerStatus: string;
  entry: LedgerEntry;
};

export const fetchCandidateKnowledge = (candidateId: string) =>
  researchRequest<CandidateKnowledgeRecord>(
    `/api/candidate-knowledge/candidates/${encodeURIComponent(candidateId)}`,
  );

export const listCandidateConflicts = () =>
  researchRequest<{ items: CandidateConflict[] }>("/api/candidate-knowledge/conflicts?limit=200");

export const listProjectReasoningLedgers = (projectId: string) =>
  researchRequest<{ items: LedgerRevision[] }>(
    `/api/research/projects/${encodeURIComponent(projectId)}/reasoning-ledgers`,
  );

/** Evidence the project linked as contradicting — disagreement, not support. */
export function contradictingEvidence(links: ResearchEvidenceLink[]): ResearchEvidenceLink[] {
  return links.filter((item) => item.relationship === "CONTRADICTS");
}

/**
 * The candidate's standing, stated as the backend states it. A candidate is a
 * reviewable hypothesis; nothing here can call it accepted or published.
 */
export function candidateStanding(candidate: CandidateKnowledgeRecord): string[] {
  const review = candidate.review_state === "REQUIRED"
    ? "Human review required"
    : `Review state: ${candidate.review_state.replaceAll("_", " ").toLowerCase()}`;
  return [
    review,
    candidate.published === false ? "Not published" : "Publication state not confirmed",
    candidate.active ? "Current version" : "Superseded — no longer the active candidate",
  ];
}

export function candidateStatement(candidate: CandidateKnowledgeRecord): string {
  const value = candidate.object_value ?? (
    typeof candidate.numeric_value === "number"
      ? `${candidate.numeric_value}${candidate.unit ? ` ${candidate.unit}` : ""}`
      : "value not recorded"
  );
  const subject = candidate.normalized_subject ?? "subject not recorded";
  const predicate = (candidate.predicate ?? "predicate not recorded").replaceAll("_", " ");
  return `${subject} · ${predicate} · ${value}`;
}

/** Where the candidate came from; a quote only when the source authorizes one. */
export function candidateSources(candidate: CandidateKnowledgeRecord): Array<{
  label: string;
  quote: string | null;
  policy: string;
}> {
  return (candidate.evidence ?? []).map((link) => {
    const page = link.anchor?.page_number;
    return {
      label: `${link.source_object_type.replaceAll("_", " ").toLowerCase()} #${link.source_object_id}` +
        (link.revision_id != null ? ` · revision ${link.revision_id}` : "") +
        (typeof page === "number" ? ` · page ${page}` : " · page not recorded"),
      quote: link.display_policy === "FULL_TEXT_ALLOWED" && link.authorized_quote ? link.authorized_quote : null,
      policy: (link.display_policy ?? "UNKNOWN_REQUIRES_REVIEW").replaceAll("_", " ").toLowerCase(),
    };
  });
}

export function conflictsForCandidate(conflicts: CandidateConflict[], candidateId: string): CandidateConflict[] {
  return conflicts.filter((item) => item.candidate_ids.map(String).includes(candidateId));
}

/** Ledger entries whose provenance cites this candidate by id. */
export function ledgerCitations(ledgers: LedgerRevision[], candidateId: string): LedgerCitation[] {
  const citations: LedgerCitation[] = [];
  for (const ledger of ledgers) {
    for (const entry of ledger.entries ?? []) {
      if (entry.provenance?.source_kind === "candidate_knowledge" && entry.provenance.source_id === candidateId) {
        citations.push({
          ledgerId: ledger.ledger_id ?? "",
          ledgerTitle: ledger.title ?? "Untitled ledger",
          ledgerVersion: typeof ledger.version === "number" ? ledger.version : null,
          ledgerStatus: ledger.status ?? "status not recorded",
          entry,
        });
      }
    }
  }
  return citations;
}
