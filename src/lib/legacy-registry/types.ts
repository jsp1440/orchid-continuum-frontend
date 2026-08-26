/**
 * Legacy asset registry — types (OC-ARCHAEOLOGY-002 / issue #310).
 *
 * A machine-readable preservation manifest for pre-Continuum work discovered
 * in owner repositories (starting with jsp1440/Orchid_Continuum_Online) so
 * that #296's completion census can stop treating unaudited legacy work as
 * silently MISSING and #281's Observatory can expose a real, evidence-backed
 * RECOVERABLE_LEGACY count instead of guessing.
 *
 * Read-only archaeology rule: nothing here mutates, deletes, or activates a
 * legacy repository, credential, taxonomy record, or scientific claim.
 */

export type LegacyImplementationStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'PROTOTYPE'
  | 'DOCUMENTATION_ONLY'
  | 'BROKEN'
  | 'UNKNOWN';

export type LegacyDisposition =
  | 'REUSE_AS_IS'
  | 'PORT'
  | 'EXTRACT_LOGIC'
  | 'EXTRACT_CONTENT'
  | 'SUPERSEDED'
  | 'ARCHIVE_ONLY'
  | 'NEEDS_OWNER_REVIEW';

/** Dispositions that make an asset a real recovery candidate, per #310's "RECOVERABLE_LEGACY" completion state. */
export const RECOVERABLE_LEGACY_DISPOSITIONS: LegacyDisposition[] = [
  'REUSE_AS_IS',
  'PORT',
  'EXTRACT_LOGIC',
  'EXTRACT_CONTENT',
];

export type ReuseValueBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type MigrationEffortBand = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN';

export type LegacyEvidenceKind = 'issue' | 'pr' | 'external_repo_path' | 'doc' | 'file';

export type LegacyEvidence = {
  kind: LegacyEvidenceKind;
  ref: string;
  note?: string;
  /**
   * True only when this run (or a prior recorded run) directly opened/read
   * the source at `ref`. False means the claim is asserted by another
   * GitHub-authoritative record (usually an issue body) but not
   * independently re-confirmed — see AssetAccessState.
   */
  independentlyVerified: boolean;
};

/** Whether this run could actually reach the asset's source repository. */
export type AssetAccessState = 'VERIFIED_THIS_RUN' | 'BLOCKED_NO_REPO_ACCESS' | 'NOT_ATTEMPTED';

export type CanonicalEquivalent = {
  exists: boolean;
  description: string;
  refs?: string[];
};

export type LegacyConcern = {
  category: 'scientific' | 'security' | 'privacy' | 'provenance';
  note: string;
};

export type PublicNewsletterSuitability = {
  suitable: boolean | 'UNKNOWN';
  rationale: string;
};

export type LegacyAsset = {
  /** Stable legacy asset id (kebab-case, never reused). */
  id: string;
  name: string;
  sourceRepository: string;
  accessState: AssetAccessState;
  /** Exact commit SHA; null when not independently verifiable this run — never fabricated. */
  sourceCommit: string | null;
  /** Exact source paths; empty when no specific path could be enumerated without repo access. */
  sourcePaths: string[];
  formerServiceName?: string;
  owningCapability: string;
  implementationStatus: LegacyImplementationStatus;
  currentCanonicalEquivalent: CanonicalEquivalent;
  disposition: LegacyDisposition;
  publicNewsletterSuitability: PublicNewsletterSuitability;
  concerns: LegacyConcern[];
  migrationEffort: MigrationEffortBand;
  reuseValue: ReuseValueBand;
  completionGraphLeafIds: {
    satisfied: string[];
    partiallySatisfied: string[];
  };
  nextAction: string;
  evidence: LegacyEvidence[];
  lastUpdated: string;
};

export type LegacyRegistryLimitation = {
  description: string;
  affectedAssetIds: string[];
};
