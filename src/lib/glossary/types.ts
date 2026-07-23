/**
 * Type definitions for the Glossary Preparation Workflow (OC-AUTO-001).
 *
 * This workflow prepares raw glossary entries (CSV or JSON) into a reviewable,
 * deterministic publication package. It never writes to a production database,
 * never publishes to the Knowledge Graph, and never performs network or
 * external-AI calls. See docs/GLOSSARY-PREPARATION-WORKFLOW.md.
 */

/** Semantic version of the workflow. Bump when output structure changes. */
export const GLOSSARY_WORKFLOW_VERSION = '1.0.0';

/** Input file formats the workflow understands. */
export type GlossaryInputFormat = 'csv' | 'json';

/**
 * A raw glossary record as read from an input file, before normalization.
 * Values are intentionally loose: parsing preserves whatever the source
 * provided so validation can report faithful rejection reasons.
 */
export interface RawGlossaryRecord {
  term?: unknown;
  definition?: unknown;
  category?: unknown;
  synonyms?: unknown;
  relatedTerms?: unknown;
  source?: unknown;
  sourceCitation?: unknown;
  notes?: unknown;
  /** 1-based index of the record within the source file (header excluded). */
  sourceRecordNumber: number;
}

/** Normalized glossary metadata for an accepted term. */
export interface NormalizedGlossary {
  term: string;
  definition: string;
  category: string | null;
  synonyms: string[];
  relatedTerms: string[];
  source: string | null;
  sourceCitation: string | null;
  notes: string | null;
}

/** Review lifecycle status for a prepared record. */
export type ReviewStatus = 'pending_review';

/** Provenance metadata captured for every accepted record. */
export interface ProvenanceMetadata {
  workflowVersion: string;
  sourceFile: string;
  sourceFormat: GlossaryInputFormat;
  sourceRecordNumber: number;
  /** Original, un-normalized values exactly as supplied. */
  originalValues: {
    term: string | null;
    definition: string | null;
    category: string | null;
    synonyms: string | null;
    relatedTerms: string | null;
    source: string | null;
    sourceCitation: string | null;
    notes: string | null;
  };
}

/**
 * A proposed Knowledge Graph node. This is a PROPOSAL only — nothing is
 * written to the graph. Fields are shaped to be compatible with the frontend
 * Knowledge Graph model (see src/types/knowledgeObject.ts) where safely
 * possible; see docs for the documented compatibility gap.
 */
export interface ProposedGraphNode {
  /** Deterministic proposed node id, e.g. "glossary:velamen". */
  id: string;
  /** Stable slug derived from the normalized term. */
  slug: string;
  /** Node kind within this workflow's intermediate model. */
  nodeType: 'glossary_term';
  /**
   * Best-effort mapping onto the existing KnowledgeObject.objectType enum.
   * The enum has no dedicated glossary value, so this is always null and the
   * gap is documented; consumers should treat nodeType as authoritative.
   */
  knowledgeObjectType: null;
  label: string;
  summary: string;
  category: string | null;
  /** Candidate KG domains this term is relevant to (from knowledgeGraph.ts). */
  domains: string[];
  publicationStatus: 'proposed';
}

/** A proposed relationship (edge) from a glossary term to another entity. */
export interface ProposedGraphRelationship {
  id: string;
  type:
    | 'has_synonym'
    | 'related_to'
    | 'in_category'
    | 'sourced_from';
  sourceId: string;
  targetId: string;
  targetName: string;
  publicationStatus: 'proposed';
}

/** Structured, deterministic scientific illustration prompt for a term. */
export interface IllustrationPrompt {
  term: string;
  /** The full, ready-to-use prompt text. */
  prompt: string;
  /** Structures the prompt asked to be labeled (inferred, never invented). */
  labeledStructures: string[];
  /** Template version, so downstream systems can detect prompt changes. */
  templateVersion: string;
}

/** A non-fatal warning attached to a record or the run as a whole. */
export interface WorkflowWarning {
  sourceRecordNumber: number | null;
  term: string | null;
  code: string;
  message: string;
}

/** A fully prepared, accepted glossary entry. */
export interface AcceptedGlossaryEntry {
  workflowRecordId: string;
  slug: string;
  reviewStatus: ReviewStatus;
  glossary: NormalizedGlossary;
  provenance: ProvenanceMetadata;
  illustrationPrompt: IllustrationPrompt;
  proposedNode: ProposedGraphNode;
  proposedRelationships: ProposedGraphRelationship[];
  warnings: WorkflowWarning[];
}

/** A rejected record with a specific, machine-readable reason. */
export interface RejectedGlossaryRecord {
  sourceRecordNumber: number;
  suppliedTerm: string | null;
  reasonCode:
    | 'missing_term'
    | 'missing_definition'
    | 'malformed_record'
    | 'invalid_field_type'
    | 'conflicting_duplicate_definition';
  reason: string;
  /** Any fields that were recoverable despite rejection (for manual repair). */
  recoverableFields: Partial<Record<keyof NormalizedGlossary, string | string[]>>;
}

/** Aggregate counts for a workflow run. */
export interface WorkflowStats {
  totalInputRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  conflictingDuplicates: number;
  warningCount: number;
}

/**
 * The complete, DETERMINISTIC result of a workflow run. Contains no timestamps
 * or elapsed-time values — those runtime fields live only in the summary
 * produced by the writer/CLI layer so this object is byte-stable across runs.
 */
export interface GlossaryWorkflowResult {
  workflowVersion: string;
  source: {
    fileName: string;
    format: GlossaryInputFormat;
  };
  stats: WorkflowStats;
  accepted: AcceptedGlossaryEntry[];
  rejected: RejectedGlossaryRecord[];
  warnings: WorkflowWarning[];
}

/** Runtime metadata — deliberately separated so results stay deterministic. */
export interface RuntimeMetadata {
  generatedAt: string;
  elapsedMs: number;
}

/** Summary returned after writing an output package to disk. */
export interface ProcessingSummary {
  workflowVersion: string;
  source: {
    fileName: string;
    format: GlossaryInputFormat;
  };
  stats: WorkflowStats;
  outputPaths: {
    outputDir: string;
    normalizedJson: string;
    rejectionsJson: string;
    processingSummaryJson: string;
    termMarkdown: string[];
  };
  runtime: RuntimeMetadata;
}

/** Thrown for whole-file structural parse failures (malformed CSV/JSON). */
export class GlossaryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlossaryParseError';
  }
}
