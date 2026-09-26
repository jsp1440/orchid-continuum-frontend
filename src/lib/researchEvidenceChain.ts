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

import { CalyxApiError } from "@/lib/calyxWorkspace";
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

/** A 200 whose body is not the documented shape is unreadable, never empty. */
export class MalformedEvidenceResponse extends Error {
  constructor(what: string) {
    super(`The ${what} response was not in the expected shape.`);
    this.name = "MalformedEvidenceResponse";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertCandidateRecord(value: unknown): CandidateKnowledgeRecord {
  if (
    !isRecord(value) ||
    typeof value.candidate_id !== "number" ||
    typeof value.kind !== "string" ||
    typeof value.review_state !== "string" ||
    typeof value.published !== "boolean" ||
    typeof value.active !== "boolean" ||
    (value.evidence !== undefined && value.evidence !== null && !(
      Array.isArray(value.evidence) && value.evidence.every(isEvidenceLink)
    ))
  ) {
    throw new MalformedEvidenceResponse("candidate record");
  }
  return value as CandidateKnowledgeRecord;
}

function isEvidenceLink(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.source_object_type === "string" &&
    (typeof value.source_object_id === "number" || typeof value.source_object_id === "string") &&
    (value.anchor === undefined || value.anchor === null || isRecord(value.anchor))
  );
}

function isConflict(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof value.conflict_id === "number" || typeof value.conflict_id === "string") &&
    Array.isArray(value.candidate_ids) &&
    value.candidate_ids.every((id) => typeof id === "number" || typeof id === "string") &&
    typeof value.state === "string"
  );
}

function isLedgerRevision(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.entries === undefined || (
      Array.isArray(value.entries) &&
      value.entries.every((entry) => isRecord(entry) && (entry.provenance === undefined || entry.provenance === null || isRecord(entry.provenance)))
    ))
  );
}

/** Every item must have the documented shape; one malformed item makes the response unreadable. */
export function assertItems<T>(value: unknown, what: string, isItem: (item: unknown) => boolean): T[] {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(isItem)) {
    throw new MalformedEvidenceResponse(what);
  }
  return value.items as T[];
}

export const fetchCandidateKnowledge = (candidateId: string) =>
  researchRequest<unknown>(
    `/api/candidate-knowledge/candidates/${encodeURIComponent(candidateId)}`,
  ).then(assertCandidateRecord);

/** The backend serves conflicts in pages of at most 200 (`routes.py` `conflicts`). */
const CONFLICT_PAGE_SIZE = 200;
const MAX_CONFLICT_PAGES = 10;

export type CandidateConflictList = {
  items: CandidateConflict[];
  /** False when the backend reports more conflicts than were read. */
  complete: boolean;
  total: number | null;
};

/**
 * Every conflict, page by page. A list that could not be read to its reported
 * `total` is marked incomplete, so a candidate missing from it is "unknown",
 * never "uncontested".
 */
export async function listCandidateConflicts(): Promise<CandidateConflictList> {
  const byId = new Map<string, CandidateConflict>();
  let total: number | null = null;
  for (let page = 0; page < MAX_CONFLICT_PAGES; page += 1) {
    const value = await researchRequest<unknown>(
      `/api/candidate-knowledge/conflicts?limit=${CONFLICT_PAGE_SIZE}&offset=${page * CONFLICT_PAGE_SIZE}`,
    );
    const pageItems = assertItems<CandidateConflict>(value, "candidate conflicts", isConflict);
    const reported = isRecord(value) ? value.total : undefined;
    if (reported !== undefined && !(typeof reported === "number" && Number.isInteger(reported) && reported >= 0)) {
      throw new MalformedEvidenceResponse("candidate conflicts");
    }
    total = typeof reported === "number" ? reported : null;
    for (const item of pageItems) {
      const id = (item as { conflict_id: number | string }).conflict_id;
      const key = `${typeof id}:${id}`;
      const seen = byId.get(key);
      // The same conflict repeated on a later page is one conflict; the same id
      // carrying different content is a malformed list, never an overwrite.
      if (seen && JSON.stringify(seen) !== JSON.stringify(item)) {
        throw new MalformedEvidenceResponse("candidate conflicts");
      }
      byId.set(key, item);
    }
    if (total !== null && byId.size > total) throw new MalformedEvidenceResponse("candidate conflicts");
    // Complete only when the distinct conflicts read equal the reported total.
    if (total !== null && byId.size === total) return { items: [...byId.values()], complete: true, total };
    if (total === null || pageItems.length < CONFLICT_PAGE_SIZE) break;
  }
  return { items: [...byId.values()], complete: false, total };
}

/** Name → numeric score pairs only; anything else is not rendered as a breakdown. */
export function confidenceBreakdown(value: unknown): Array<[string, number]> {
  if (!isRecord(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
}

export const listProjectReasoningLedgers = (projectId: string) =>
  researchRequest<unknown>(
    `/api/research/projects/${encodeURIComponent(projectId)}/reasoning-ledgers`,
  ).then((value) => assertItems<LedgerRevision>(value, "reasoning ledgers", isLedgerRevision));

/** Evidence the project linked as contradicting — disagreement, not support. */
export function contradictingEvidence(links: ResearchEvidenceLink[]): ResearchEvidenceLink[] {
  return links.filter((item) => item.relationship === "CONTRADICTS");
}

/**
 * Display text for one backend field: a string as-is, a finite number as its
 * decimal, anything else (object, array, boolean, null) as the fallback. Every
 * value the evidence chain renders passes through here, so an off-contract
 * type reads as "not recorded" instead of crashing the page or printing
 * "[object Object]".
 */
export function displayText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

/** `SNAKE_CASE` backend vocabulary as readable lowercase words. */
export function displayWords(value: unknown, fallback: string): string {
  return displayText(value, fallback).replaceAll("_", " ").toLowerCase();
}

/** Only the string items of a list field. */
export function displayList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * The candidate's standing, stated as the backend states it. A candidate is a
 * reviewable hypothesis; nothing here can call it accepted or published.
 */
export function candidateStanding(candidate: CandidateKnowledgeRecord): string[] {
  const review = candidate.review_state === "REQUIRED"
    ? "Human review required"
    : `Review state: ${displayWords(candidate.review_state, "not recorded")}`;
  return [
    review,
    candidate.published === false ? "Not published" : "Publication state not confirmed",
    candidate.active ? "Current version" : "Superseded — no longer the active candidate",
  ];
}

export function candidateStatement(candidate: CandidateKnowledgeRecord): string {
  const unit = displayText(candidate.unit, "");
  const value = candidate.object_value !== undefined && candidate.object_value !== null
    ? displayText(candidate.object_value, "value not in a displayable form")
    : typeof candidate.numeric_value === "number" && Number.isFinite(candidate.numeric_value)
      ? `${candidate.numeric_value}${unit ? ` ${unit}` : ""}`
      : "value not recorded";
  const subject = displayText(candidate.normalized_subject, "subject not recorded");
  const predicate = displayText(candidate.predicate, "predicate not recorded").replaceAll("_", " ");
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
      label: `${displayWords(link.source_object_type, "source")} #${displayText(link.source_object_id, "not recorded")}` +
        (link.revision_id != null ? ` · revision ${displayText(link.revision_id, "not recorded")}` : "") +
        (typeof page === "number" ? ` · page ${page}` : " · page not recorded"),
      quote: link.display_policy === "FULL_TEXT_ALLOWED" && typeof link.authorized_quote === "string" && link.authorized_quote
        ? link.authorized_quote
        : null,
      policy: displayWords(link.display_policy, "UNKNOWN_REQUIRES_REVIEW"),
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
      const provenance = entry.provenance;
      const sourceId = provenance ? displayText(provenance.source_id, "") : "";
      if (provenance?.source_kind === "candidate_knowledge" && sourceId === candidateId) {
        citations.push({
          ledgerId: displayText(ledger.ledger_id, ""),
          ledgerTitle: displayText(ledger.title, "Untitled ledger"),
          ledgerVersion: typeof ledger.version === "number" ? ledger.version : null,
          ledgerStatus: displayText(ledger.status, "status not recorded"),
          entry,
        });
      }
    }
  }
  return citations;
}

/**
 * `GET /api/evidence-aggregation/aggregates/{id}` — the active version of one
 * aggregate assertion (`app/evidence_aggregation/service.py` `_process`). Only
 * the fields the station renders are typed. Geographic contexts and anchor
 * locators are deliberately not typed or rendered here.
 */
export type EvidenceAggregateRecord = {
  aggregate_id: number;
  aggregate_version_id?: number;
  version?: number;
  aggregate_type: string;
  aggregate_status?: string;
  normalized_subject?: string;
  normalized_predicate?: string;
  normalized_object?: string;
  contributing_candidate_ids: number[];
  contributing_candidate_version_ids?: string[];
  source_count?: number;
  document_count?: number;
  supporting_evidence_count?: number;
  contradictory_evidence_count?: number;
  duplicate_evidence_count?: number;
  unresolved_evidence_count?: number;
  uncertainty_dimensions?: Record<string, unknown>;
  confidence_dimensions?: Record<string, unknown>;
  aggregation_ruleset_version?: string;
  reconciliation_model_version?: string;
  copyright_safe_display_state?: string;
  review_state: string;
  verification_state?: string;
  published: boolean;
  active: boolean;
  supersession_state?: string;
};

export function assertAggregateRecord(value: unknown): EvidenceAggregateRecord {
  if (
    !isRecord(value) ||
    typeof value.aggregate_id !== "number" ||
    typeof value.aggregate_type !== "string" ||
    typeof value.review_state !== "string" ||
    typeof value.published !== "boolean" ||
    typeof value.active !== "boolean" ||
    !Array.isArray(value.contributing_candidate_ids) ||
    !value.contributing_candidate_ids.every((id) => typeof id === "number") ||
    (value.uncertainty_dimensions !== undefined && !isRecord(value.uncertainty_dimensions)) ||
    (value.confidence_dimensions !== undefined && !isRecord(value.confidence_dimensions))
  ) {
    throw new MalformedEvidenceResponse("evidence aggregate");
  }
  return value as EvidenceAggregateRecord;
}

/**
 * The backend answers 404 `AGGREGATE_NOT_FOUND` both for an id it never held
 * and for one whose every version was superseded or withdrawn, so a 404 says
 * exactly that — never "no evidence".
 */
export const fetchEvidenceAggregate = (aggregateId: string) =>
  researchRequest<unknown>(
    `/api/evidence-aggregation/aggregates/${encodeURIComponent(aggregateId)}`,
  ).then(assertAggregateRecord, (error: unknown) => {
    if (error instanceof CalyxApiError && error.status === 404) {
      throw new CalyxApiError(
        "route_unavailable",
        "No active version of this aggregate is readable (never created, superseded or withdrawn), or the aggregation service is not deployed.",
        404,
      );
    }
    throw error;
  });

export function aggregateStatement(aggregate: EvidenceAggregateRecord): string {
  const subject = displayText(aggregate.normalized_subject, "subject not recorded");
  const predicate = displayText(aggregate.normalized_predicate, "predicate not recorded").replaceAll("_", " ");
  const value = aggregate.normalized_object === "MULTIPLE_VALUES"
    ? "multiple values reported"
    : displayText(aggregate.normalized_object, "value not recorded");
  return `${subject} · ${predicate} · ${value}`;
}

/** The aggregate's standing as the backend states it; it is never a finding. */
export function aggregateStanding(aggregate: EvidenceAggregateRecord): string[] {
  const review = aggregate.review_state === "REQUIRED"
    ? "Human review required"
    : `Review state: ${displayWords(aggregate.review_state, "not recorded")}`;
  return [
    `Consensus status: ${displayWords(aggregate.aggregate_status, "not recorded")}`,
    review,
    `Verification: ${displayWords(aggregate.verification_state, "not recorded")}`,
    aggregate.published === false ? "Not published" : "Publication state not confirmed",
    aggregate.active && aggregate.supersession_state === "CURRENT"
      ? "Current version"
      : "Not confirmed as the current version",
  ];
}

const AGGREGATE_COUNTS: Array<[keyof EvidenceAggregateRecord, string]> = [
  ["source_count", "independent sources"],
  ["document_count", "documents"],
  ["supporting_evidence_count", "supporting"],
  ["contradictory_evidence_count", "contradicting"],
  ["unresolved_evidence_count", "unresolved"],
  ["duplicate_evidence_count", "duplicate"],
];

/** Evidence counts as recorded; a missing count reads "not recorded", never 0. */
export function aggregateCounts(aggregate: EvidenceAggregateRecord): string[] {
  return AGGREGATE_COUNTS.map(([key, label]) => `${label} ${displayText(aggregate[key], "not recorded")}`);
}

/** Uncertainty dimensions (conflicts, independence, taxon ambiguity), numeric only. */
export function aggregateUncertainty(aggregate: EvidenceAggregateRecord): Array<[string, number]> {
  return confidenceBreakdown(aggregate.uncertainty_dimensions).map(([key, value]) => [key.replaceAll("_", " "), value]);
}

/**
 * The prioritization score, only with the backend's own statement that it is
 * not a probability of truth. Without that statement it is not shown.
 */
export function aggregatePriority(aggregate: EvidenceAggregateRecord): string | null {
  const dims = aggregate.confidence_dimensions;
  if (!dims || dims.score_is_truth_probability !== false) return null;
  const score = dims.prioritization_score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return `review-prioritization score ${score} (${displayText(dims.prioritization_score_formula, "formula not recorded")}; not a probability that the claim is true)`;
}
