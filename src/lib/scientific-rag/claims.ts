/**
 * Scientific claim contract.
 *
 * A claim is the atomic unit of governed evidence: a single structured
 * assertion extracted from a source document, carrying both its original
 * published wording and a normalised representation, its passage-level
 * provenance, its taxonomic reconciliation, and its review/sensitivity state.
 *
 * The schema is strict and testable. A claim that cannot satisfy it — missing
 * provenance, no supporting passage, malformed value — must never enter the
 * authoritative evidence store; it is routed to quarantine or review instead
 * (see `extraction.ts`).
 */

import { z } from "zod";
import { SensitivityClassification } from "./events";

export const CLAIM_CATEGORIES = [
  "taxonomy",
  "morphology",
  "anatomy",
  "physiology",
  "habitat",
  "elevation",
  "occurrence",
  "phenology",
  "pollinator",
  "mycorrhizal_association",
  "cultivation_environment",
  "methodology",
  "observation",
  "hypothesis",
  "result",
  "conclusion",
  "citation",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

/** Whether the assertion is a direct observation or an experimental result. */
export const EvidenceType = z.enum([
  "observation",
  "experiment",
  "inference",
  "review_synthesis",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const ReviewStatus = z.enum([
  "unreviewed",
  "verified",
  "quarantined",
  "disputed",
  "ambiguous",
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/**
 * Passage-level provenance. Every claim must anchor to an exact snippet in a
 * known document at a known locator, with a content hash so a reader can
 * confirm the text matches the source. This is the field that makes an answer
 * auditable rather than merely plausible.
 */
export const ClaimProvenance = z
  .object({
    sourceDocumentId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    citation: z.object({
      title: z.string().min(1),
      authors: z.array(z.string()),
      year: z.number().int().nullable(),
      doi: z.string().nullable(),
    }),
    locator: z.object({
      page: z.number().int().positive().nullable(),
      section: z.string().nullable(),
      paragraph: z.number().int().positive().nullable(),
      figure: z.string().nullable(),
      table: z.string().nullable(),
    }),
    supportingPassage: z.string().min(1),
    passageContentHash: z.string().min(1),
  })
  .strict();
export type ClaimProvenance = z.infer<typeof ClaimProvenance>;

/** Taxonomic reconciliation, preserving both published and accepted names. */
export const ClaimTaxon = z
  .object({
    nameAsPublished: z.string().min(1),
    acceptedName: z.string().nullable(),
    taxonId: z.string().nullable(),
    authorship: z.string().nullable(),
    synonymRelationship: z.enum(["accepted", "synonym", "unresolved", "ambiguous"]),
    taxonomySource: z.string(),
    taxonomyVersion: z.string(),
    resolutionMethod: z.enum(["exact", "synonym_map", "fuzzy", "unresolved"]),
    confidence: z.number().min(0).max(1),
    ambiguous: z.boolean(),
    reviewRequired: z.boolean(),
    candidates: z.array(z.string()).optional(),
  })
  .strict();
export type ClaimTaxon = z.infer<typeof ClaimTaxon>;

/** Structured, normalised value with the original wording preserved alongside. */
export const ClaimAssertion = z
  .object({
    subjectNormalized: z.string().min(1),
    predicate: z.string().min(1),
    objectNormalized: z.string().min(1),
    originalText: z.string().min(1),
    units: z.string().nullable(),
    numericValue: z.number().nullable(),
    numericRange: z.tuple([z.number(), z.number()]).nullable(),
    qualifiers: z.array(z.string()),
    lifeStage: z.string().nullable(),
    organ: z.string().nullable(),
    geography: z.string().nullable(),
    elevationRangeM: z.tuple([z.number(), z.number()]).nullable(),
    habitat: z.string().nullable(),
    temporalContext: z.string().nullable(),
    uncertainty: z.string().nullable(),
  })
  .strict();
export type ClaimAssertion = z.infer<typeof ClaimAssertion>;

export const ScientificClaim = z
  .object({
    claimId: z.string().min(1),
    category: z.enum(CLAIM_CATEGORIES),
    evidenceType: EvidenceType,
    assertion: ClaimAssertion,
    taxon: ClaimTaxon,
    provenance: ClaimProvenance,
    methodology: z.string().nullable(),
    sampleSize: z.number().int().positive().nullable(),
    hypothesis: z.string().nullable(),
    result: z.string().nullable(),
    conclusion: z.string().nullable(),
    pollinator: z.string().nullable(),
    mycorrhizalAssociate: z.string().nullable(),
    extractionConfidence: z.number().min(0).max(1),
    reviewStatus: ReviewStatus,
    sensitivity: SensitivityClassification,
    extractor: z.string().min(1),
    extractorVersion: z.string().min(1),
    extractedAt: z.string().datetime(),
    contentHash: z.string().min(1),
  })
  .strict();
export type ScientificClaim = z.infer<typeof ScientificClaim>;

export function validateClaim(
  value: unknown,
): { ok: true; claim: ScientificClaim; error?: undefined } | { ok: false; claim?: undefined; error: string } {
  const result = ScientificClaim.safeParse(value);
  if (result.success) return { ok: true, claim: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
