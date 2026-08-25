/**
 * synthesis — turn an evidence ledger (claims + relations) plus a decision frame
 * into a comparison table, an uncertainty assessment, and a provisional synthesis.
 *
 * Two rules govern everything here:
 *   1. Support and counterevidence are never netted. A conflict is surfaced as a
 *      conflict; a gap is surfaced as a gap. Neither is smoothed into a headline
 *      number.
 *   2. The overall support judgement is a labelled, decomposed verdict
 *      ("contested", "insufficient", …) — never a bare confidence score. An
 *      empty comparison cell renders as a visible gap, not an implied zero.
 */

import {
  isActiveClaim,
  partitionRelations,
} from "./claims";
import type {
  ComparisonCell,
  ComparisonCriterion,
  ComparisonTable,
  DecisionAlternative,
  EvidenceClaim,
  EvidenceConflict,
  EvidenceGap,
  EvidenceRelation,
  ProvisionalSynthesis,
  UncertaintyAssessment,
} from "./contracts";
import { initialReview } from "./contracts";

let counter = 0;
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

/** A mapping from a comparison cell to the claim ids that populate it. */
export type CellAssignment = {
  alternativeId: string;
  criterionId: string;
  claimIds: string[];
  summary: string;
};

/**
 * Build a comparison table. Every alternative×criterion pair produces a cell,
 * even when no claims populate it — an unpopulated cell is explicitly `isGap`,
 * making the absence of evidence visible instead of reading as a zero.
 */
export function buildComparisonTable(
  alternatives: DecisionAlternative[],
  criteria: ComparisonCriterion[],
  assignments: CellAssignment[],
): ComparisonTable {
  const byKey = new Map<string, CellAssignment>();
  for (const a of assignments) byKey.set(`${a.alternativeId}::${a.criterionId}`, a);

  const cells: ComparisonCell[] = [];
  for (const alt of alternatives) {
    for (const crit of criteria) {
      const assignment = byKey.get(`${alt.alternativeId}::${crit.criterionId}`);
      const claimIds = assignment?.claimIds ?? [];
      cells.push({
        alternativeId: alt.alternativeId,
        criterionId: crit.criterionId,
        claimIds,
        summary: assignment?.summary ?? "",
        isGap: claimIds.length === 0,
      });
    }
  }
  return { alternatives, criteria, cells };
}

/**
 * Derive conflicts directly from CONTRADICTS/QUALIFIES relations among *active*
 * claims. Retracted/superseded claims do not generate live conflicts, but the
 * relations themselves are preserved elsewhere.
 */
export function deriveConflicts(claims: EvidenceClaim[], relations: EvidenceRelation[]): EvidenceConflict[] {
  const activeIds = new Set(claims.filter(isActiveClaim).map((c) => c.claimId));
  const conflicts: EvidenceConflict[] = [];
  for (const rel of relations) {
    if (rel.relation !== "CONTRADICTS" && rel.relation !== "QUALIFIES") continue;
    if (!activeIds.has(rel.fromClaimId)) continue;
    if (!activeIds.has(rel.toRef)) continue; // only claim-to-claim conflicts here
    conflicts.push({
      conflictId: localId("conflict"),
      claimId: rel.toRef,
      counterClaimId: rel.fromClaimId,
      relation: rel.relation,
      description: rel.note ?? `${rel.fromClaimId} ${rel.relation} ${rel.toRef}`,
    });
  }
  return conflicts;
}

/**
 * Every active `missing` claim becomes an evidence gap. Gaps are the honest
 * record of what the run does not know; several are candidates to become bounded
 * Continuum missions.
 */
export function deriveGaps(claims: EvidenceClaim[], couldBecomeMission = true): EvidenceGap[] {
  return claims
    .filter((c) => c.kind === "missing" && isActiveClaim(c))
    .map((c) => ({
      gapId: localId("gap"),
      description: c.statement,
      claimId: c.claimId,
      couldBecomeMission,
    }));
}

/**
 * Assess overall support without collapsing into a number. The verdict is a
 * function of: how much independent support exists, whether conflicts are open,
 * and how much is still missing. `insufficient` and `contested` are first-class
 * outcomes, not failure states to be avoided.
 */
export function assessUncertainty(
  claims: EvidenceClaim[],
  relations: EvidenceRelation[],
  options?: { summary?: string; gapsCouldBecomeMission?: boolean },
): UncertaintyAssessment {
  const conflicts = deriveConflicts(claims, relations);
  const gaps = deriveGaps(claims, options?.gapsCouldBecomeMission ?? true);

  const active = claims.filter(isActiveClaim);
  const supportingClaims = active.filter(
    (c) => c.kind === "direct_observation" || c.kind === "sourced_assertion" || c.kind === "computation",
  );

  // Count claims that carry at least one SUPPORTS relation into the conclusion.
  const supportedCount = supportingClaims.filter((c) => partitionRelations(c.claimId, relations).supports.length > 0).length;

  let overallSupport: UncertaintyAssessment["overallSupport"];
  if (supportingClaims.length === 0) {
    overallSupport = "insufficient";
  } else if (conflicts.length > 0 && conflicts.length >= supportedCount) {
    // As much disagreement as agreement (or more) → contested, never averaged away.
    overallSupport = "contested";
  } else if (supportedCount >= 3 && conflicts.length === 0) {
    overallSupport = "strong";
  } else if (supportedCount >= 1) {
    overallSupport = conflicts.length > 0 ? "moderate" : "moderate";
  } else {
    overallSupport = "weak";
  }

  const summary =
    options?.summary ??
    `${supportedCount} supported claim(s), ${conflicts.length} open conflict(s), ${gaps.length} evidence gap(s).`;

  return { summary, gaps, conflicts, overallSupport };
}

/**
 * Compose a provisional synthesis. It is *provisional* by contract: the
 * conclusion is stated as provisional, limitations are surfaced up front (never
 * buried), and the whole thing carries its own review record starting at `draft`.
 * Nothing here promotes a conclusion to established truth.
 */
export function buildProvisionalSynthesis(input: {
  conclusion: string;
  limitations: string[];
  uncertainty: UncertaintyAssessment;
}): ProvisionalSynthesis {
  const limitations = [...input.limitations];
  // Any contested/insufficient verdict forces an explicit limitation line, so a
  // weak evidence base can never be presented behind a confident conclusion.
  if (input.uncertainty.overallSupport === "contested") {
    limitations.unshift("Evidence is contested: open conflicts were preserved, not resolved.");
  } else if (input.uncertainty.overallSupport === "insufficient") {
    limitations.unshift("Evidence is insufficient for a firm classification; treat the conclusion as a hypothesis.");
  }
  if (input.uncertainty.gaps.length > 0) {
    limitations.push(`${input.uncertainty.gaps.length} evidence gap(s) remain open.`);
  }
  return {
    conclusion: input.conclusion,
    limitations,
    uncertainty: input.uncertainty,
    review: initialReview(),
  };
}
