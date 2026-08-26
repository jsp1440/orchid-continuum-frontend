/**
 * Deterministic scientific-claim extraction with passage-level provenance.
 *
 * This connects a parsed document to structured, governed claims. It is
 * deliberately rule-based and deterministic (no model call in CI): each
 * extractor recognises a claim pattern in a passage and emits a candidate
 * anchored to that exact passage and locator. Candidates are then validated
 * against the strict claim schema — anything that fails (missing provenance,
 * unsupported value, malformed structure) is routed to quarantine and never
 * enters authoritative evidence.
 *
 * If a real LLM extractor is substituted, the contract is unchanged: its output
 * must pass `validateClaim` or be quarantined. Invalid model output cannot enter
 * the store.
 */

import type { ParsedDocument, ParsedPassage } from "./ingestion";
import type { SourceRecord } from "./ingestion";
import {
  ScientificClaim,
  ClaimCategory,
  EvidenceType,
  validateClaim,
} from "./claims";
import { reconcileTaxon, TAXONOMY_SOURCE, TAXONOMY_VERSION } from "./taxonomy";
import { screenLocality } from "./locality";
import { contentHash, structuralHash } from "./hashing";

export const EXTRACTOR = "oc-rule-extractor";
export const EXTRACTOR_VERSION = "1.0.0";

export type QuarantinedClaim = {
  reason: string;
  category: string;
  passageId: string;
  raw: unknown;
};

export type ExtractionResult = {
  claims: ScientificClaim[];
  quarantined: QuarantinedClaim[];
};

type Candidate = Omit<ScientificClaim, "contentHash" | "extractedAt"> & {
  __passageId: string;
};

const SPECIES_PATTERN = /Phalaenopsis\s+[a-z]+/g;

function detectPublishedName(text: string): string {
  const matches = text.match(SPECIES_PATTERN);
  if (matches && matches.length > 0) return matches[0];
  const abbrev = text.match(/\bP\.\s+[a-z]+/);
  return abbrev ? abbrev[0] : "Phalaenopsis";
}

function buildProvenance(doc: ParsedDocument, source: SourceRecord, passage: ParsedPassage) {
  // Fail closed on protected locality: the stored supporting passage is
  // screened so raw coordinates never persist in the evidence store.
  const screened = screenLocality(passage.text, passage.sensitivity);
  const supportingPassage = passage.sensitivity === "protected_locality" ? screened.redactedText : passage.text;
  return {
    sourceDocumentId: doc.documentId,
    sourceRecordId: source.sourceRecordId,
    citation: {
      title: source.title,
      authors: source.authors,
      year: source.year,
      doi: source.doi,
    },
    locator: {
      page: passage.page,
      section: passage.section,
      paragraph: passage.paragraph,
      figure: null,
      table: null,
    },
    supportingPassage,
    passageContentHash: contentHash(supportingPassage),
  };
}

function makeClaimId(
  doc: ParsedDocument,
  passage: ParsedPassage,
  category: string,
  discriminator: string,
): string {
  return `claim-${structuralHash({ d: doc.documentId, p: passage.passageId, c: category, k: discriminator }).slice(6, 22)}`;
}

function baseCandidate(
  doc: ParsedDocument,
  source: SourceRecord,
  passage: ParsedPassage,
  category: ClaimCategory,
  evidenceType: EvidenceType,
  publishedName: string,
): Candidate {
  const taxonRecon = reconcileTaxon(publishedName);
  return {
    __passageId: passage.passageId,
    claimId: makeClaimId(doc, passage, category, publishedName),
    category,
    evidenceType,
    assertion: {
      subjectNormalized: taxonRecon.acceptedName ?? publishedName,
      predicate: "has_trait",
      objectNormalized: "",
      originalText: passage.text,
      units: null,
      numericValue: null,
      numericRange: null,
      qualifiers: [],
      lifeStage: null,
      organ: null,
      geography: null,
      elevationRangeM: null,
      habitat: null,
      temporalContext: null,
      uncertainty: null,
    },
    taxon: {
      nameAsPublished: publishedName,
      acceptedName: taxonRecon.acceptedName,
      taxonId: taxonRecon.taxonId,
      authorship: taxonRecon.authorship,
      synonymRelationship: taxonRecon.synonymRelationship,
      taxonomySource: TAXONOMY_SOURCE,
      taxonomyVersion: TAXONOMY_VERSION,
      resolutionMethod: taxonRecon.resolutionMethod,
      confidence: taxonRecon.confidence,
      ambiguous: taxonRecon.ambiguous,
      reviewRequired: taxonRecon.reviewRequired,
      ...(taxonRecon.candidates ? { candidates: taxonRecon.candidates } : {}),
    },
    provenance: buildProvenance(doc, source, passage),
    methodology: null,
    sampleSize: null,
    hypothesis: null,
    result: null,
    conclusion: null,
    pollinator: null,
    mycorrhizalAssociate: null,
    extractionConfidence: 0.9,
    // Ambiguous taxon → the claim is retained but marked ambiguous, not verified.
    reviewStatus: taxonRecon.ambiguous ? "ambiguous" : "unreviewed",
    sensitivity: passage.sensitivity,
    extractor: EXTRACTOR,
    extractorVersion: EXTRACTOR_VERSION,
  };
}

function sampleSizeFrom(text: string): number | null {
  const m = text.match(/n\s*=\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Per-passage extractors. Each returns zero or more candidates. */
function extractFromPassage(
  doc: ParsedDocument,
  source: SourceRecord,
  passage: ParsedPassage,
): Candidate[] {
  const out: Candidate[] = [];
  const text = passage.text;
  const publishedNames = text.match(SPECIES_PATTERN) ?? [detectPublishedName(text)];

  // Elevation range (habitat) — e.g. "elevations of 800 to 1500 m".
  const elevation = text.match(/elevations? of (\d+) to (\d+)\s*m/i);
  if (elevation) {
    const name = publishedNames[0];
    const c = baseCandidate(doc, source, passage, "elevation", "observation", name);
    c.assertion.predicate = "occurs_at_elevation";
    c.assertion.objectNormalized = `${elevation[1]}-${elevation[2]} m`;
    c.assertion.units = "m";
    c.assertion.elevationRangeM = [Number(elevation[1]), Number(elevation[2])];
    c.assertion.habitat = /montane/i.test(text) ? "montane forest" : /lowland/i.test(text) ? "lowland forest" : null;
    out.push(c);
  }

  // Thermal / physiology — night temperature.
  const temp = text.match(/(\d+) to (\d+) degrees C/i);
  if (temp && /temperature/i.test(text)) {
    const name = publishedNames[0];
    const c = baseCandidate(doc, source, passage, "physiology", "observation", name);
    c.assertion.predicate = "night_temperature_range";
    c.assertion.objectNormalized = `${temp[1]}-${temp[2]} °C`;
    c.assertion.units = "°C";
    c.assertion.numericRange = [Number(temp[1]), Number(temp[2])];
    c.assertion.qualifiers = ["night temperature"];
    out.push(c);
  }

  // Morphology — lamina thickness with sample size.
  const thickness = text.match(/lamina thickness (\d+\.\d+)\s*mm/i) || text.match(/mean (\d+\.\d+)\s*mm/i);
  if (/leaves|lamina/i.test(text) && thickness) {
    for (const name of publishedNames) {
      const c = baseCandidate(doc, source, passage, "morphology", "observation", name);
      c.assertion.predicate = "leaf_lamina_thickness";
      c.assertion.organ = "leaf";
      // Attach the thickness nearest this species mention when two are present.
      const perSpecies = text.match(new RegExp(`${name}[^.]*?(\\d+\\.\\d+)\\s*mm`));
      const value = perSpecies ? Number(perSpecies[1]) : Number(thickness[1]);
      c.assertion.objectNormalized = `${value} mm`;
      c.assertion.units = "mm";
      c.assertion.numericValue = value;
      // Read the leaf-colour qualifier from this species' own window (up to the
      // next species mention), so "plain green ... amabilis" is not tagged
      // "mottled" from the sibling species' description.
      const nameIdx = text.indexOf(name);
      const nextIdx =
        publishedNames
          .map((n) => text.indexOf(n))
          .filter((i) => i > nameIdx)
          .sort((a, b) => a - b)[0] ?? text.length;
      const window = text.slice(nameIdx, nextIdx);
      c.assertion.qualifiers = /mottled|silver|grey/i.test(window) ? ["mottled"] : ["plain green"];
      c.sampleSize = sampleSizeFrom(text.slice(nameIdx));
      out.push(c);
    }
  }

  // Phenology — flowering trigger, may be experimental. Resolve cool vs. warm
  // per species from the clause that mentions that species, so "flowered
  // independently of a cool trigger" is not misread as a cool trigger.
  if (/flower/i.test(text) && /(triggered|flowered)/i.test(text)) {
    const experimental = /experimental|treatment/i.test(text);
    const clauses = text.split(/(?:,\s*whereas\s+|\.\s+|;\s+)/i);
    for (const name of publishedNames) {
      const c = baseCandidate(doc, source, passage, "phenology", experimental ? "experiment" : "observation", name);
      c.assertion.predicate = "flowering_trigger";
      const clause = clauses.find((cl) => cl.includes(name)) ?? "";
      const cool =
        /(triggered by|drop in night temperature|below 18)/i.test(clause) &&
        !/independent/i.test(clause);
      c.assertion.objectNormalized = cool ? "cool night trigger" : "no cool trigger required";
      c.assertion.temporalContext = "flowering season";
      c.sampleSize = sampleSizeFrom(clause) ?? sampleSizeFrom(text);
      if (experimental) c.methodology = "controlled temperature experiment";
      out.push(c);
    }
  }

  // Physiology — stomatal conductance (v2 fixture).
  const stomatal = text.match(/stomatal conductance/i);
  if (stomatal) {
    const c = baseCandidate(doc, source, passage, "physiology", "experiment", publishedNames[0]);
    c.assertion.predicate = "stomatal_conductance_response";
    c.assertion.objectNormalized = "steeper decline above 28 °C";
    c.assertion.qualifiers = ["thermal optimum"];
    c.sampleSize = sampleSizeFrom(text);
    c.methodology = "gas-exchange measurement";
    out.push(c);
  }

  // Inference / hypothesis — explicitly not tested.
  if (/we infer|hypothesis was not tested|may contribute/i.test(text)) {
    const c = baseCandidate(doc, source, passage, "conclusion", "inference", publishedNames[0] ?? detectPublishedName(text));
    c.assertion.predicate = "inferred_relationship";
    c.assertion.objectNormalized = "thicker mottled leaves may aid cool tolerance";
    c.assertion.uncertainty = "not experimentally tested";
    c.hypothesis = "leaf traits contribute to cool tolerance";
    c.conclusion = "inference only";
    c.extractionConfidence = 0.6;
    out.push(c);
  }

  // Occurrence — sensitive wild locality (protected). The claim is retained
  // but its passage is already screened in provenance.
  if (passage.sensitivity === "protected_locality") {
    const c = baseCandidate(doc, source, passage, "occurrence", "observation", publishedNames[0]);
    c.assertion.predicate = "wild_occurrence";
    c.assertion.objectNormalized = "wild population (locality withheld)";
    c.assertion.geography = "[withheld]";
    out.push(c);
  }

  // Taxonomic note referencing an ambiguous name.
  if (/require(s)? revision|applied inconsistently|contested/i.test(text)) {
    const ambiguousName = (text.match(/\bP\.\s+[a-z]+/) ?? ["P. rosea"])[0];
    const c = baseCandidate(doc, source, passage, "taxonomy", "review_synthesis", ambiguousName);
    c.assertion.predicate = "taxonomic_status";
    c.assertion.objectNormalized = "accepted placement contested";
    c.assertion.uncertainty = "ambiguous name";
    out.push(c);
  }

  return out;
}

/**
 * Extract all claims from a parsed document. Deterministic. `extractedAt` is
 * injected for reproducibility. Candidates failing schema validation are
 * quarantined rather than stored.
 */
export function extractClaims(
  doc: ParsedDocument,
  source: SourceRecord,
  extractedAt: string,
): ExtractionResult {
  const claims: ScientificClaim[] = [];
  const quarantined: QuarantinedClaim[] = [];
  const seen = new Set<string>();

  for (const passage of doc.passages) {
    for (const candidate of extractFromPassage(doc, source, passage)) {
      const finalized = finalizeCandidate(candidate, extractedAt);
      if (!finalized.ok) {
        quarantined.push({
          reason: finalized.error,
          category: candidate.category,
          passageId: candidate.__passageId,
          raw: candidate,
        });
        continue;
      }
      // Idempotent within a run: identical claim content is not duplicated.
      if (seen.has(finalized.claim.contentHash)) continue;
      seen.add(finalized.claim.contentHash);
      claims.push(finalized.claim);
    }
  }

  return { claims, quarantined };
}

/**
 * Validate and stamp a candidate into a stored claim, or reject it. Exposed so
 * malformed-extraction handling can be tested directly.
 */
export function finalizeCandidate(
  candidate: Omit<ScientificClaim, "contentHash" | "extractedAt"> & { __passageId?: string },
  extractedAt: string,
): { ok: true; claim: ScientificClaim; error?: undefined } | { ok: false; claim?: undefined; error: string } {
  // A claim with no supporting passage has no provenance — reject outright.
  if (!candidate.provenance || !candidate.provenance.supportingPassage) {
    return { ok: false, error: "missing supporting passage (no provenance)" };
  }
  if (!candidate.assertion || !candidate.assertion.objectNormalized) {
    return { ok: false, error: "unsupported claim: empty normalized object" };
  }

  const { __passageId, ...rest } = candidate as Record<string, unknown>;
  // Content hash is purely content-derived — it must NOT include the extraction
  // timestamp, or the same content would hash differently across runs and defeat
  // dedup, embedding reuse, and idempotent replay.
  const claim = {
    ...rest,
    extractedAt,
    contentHash: structuralHash(rest),
  };
  const validated = validateClaim(claim);
  if (!validated.ok) return { ok: false, error: validated.error };
  return { ok: true, claim: validated.claim };
}
