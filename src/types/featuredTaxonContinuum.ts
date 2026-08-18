/**
 * FeaturedTaxonContinuum — the canonical contract for the featured taxon.
 *
 * ONE document, assembled by the Orchid Continuum backend, carrying everything
 * the public homepage is allowed to say about the genus and species currently
 * in focus. Types only: this file defines the contract, it does not implement
 * or fake it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The audit in `docs/audits/GENUS-OF-THE-DAY-DATA-PATH-AUDIT.md` found the
 * featured taxon assembled in the browser from six origins, with the frontend
 * choosing the genus from a hardcoded list, supplying elevation and phenology
 * from literals, writing ecological sentences from regex matches over
 * third-party prose, and collapsing "the service is down" into "we have no
 * record". This contract exists so none of that has anywhere to live.
 *
 * FOUR RULES THE CONTRACT ENFORCES BY SHAPE
 * -----------------------------------------
 * 1. **The backend chooses the taxon.** `focus.selection` is server-decided.
 *    There is no client-side rotation to disagree with.
 * 2. **Every scientific value is evidenced.** A value only reaches the UI
 *    inside `Evidenced<T>`, which forces a scope, the taxon that scope refers
 *    to, and at least one provenance record. Genus-level evidence cannot be
 *    rendered as a species-level claim, because the scope travels with it.
 * 3. **Absence is representable.** `Field<T>` is a discriminated union. There
 *    is no `undefined` to paper over with a default, and no way to render an
 *    outage as an empty archive.
 * 4. **Disagreement is representable.** `records` is a list, so two sources
 *    that conflict are both carried rather than one silently winning.
 *
 * WHAT CONSUMERS MAY NOT DO
 * -------------------------
 * A section rendering this payload may format, translate, and lay out. It may
 * not compose a scientific claim from two fields, substitute another taxon's
 * record, supply a default for a missing value, or call a third party to fill
 * a gap. A `Field` that is not `present` renders as the gap it is.
 */

// ---------------------------------------------------------------------------
// Evidence primitives
// ---------------------------------------------------------------------------

/** The taxonomic level a piece of evidence actually reaches. */
export type EvidenceScope = 'family' | 'genus' | 'species' | 'population';

/** How a claim came to be held, and by whom. */
export interface Provenance {
  /** Readable source name, e.g. "Orchid Continuum taxonomy", "IUCN Red List". */
  source: string;
  /** Stable identifier for the record within that source. */
  sourceId?: string;
  /** Link to the source record, where one can be shown publicly. */
  sourceUrl?: string;
  /** ISO-8601 date the source asserted the claim. */
  assertedAt?: string;
  /** ISO-8601 date the Continuum read it. Required — staleness is a fact. */
  retrievedAt: string;
  license?: string;
  attribution?: string;
}

/** A formatted reference. */
export interface Citation {
  citation: string;
  doi?: string;
  url?: string;
  year?: number;
}

/**
 * One evidenced value.
 *
 * `scope` and `scopeTaxon` together prevent the single most common defect in
 * the current homepage: a genus-level statement rendered under a species name.
 */
export interface Evidenced<T> {
  value: T;
  scope: EvidenceScope;
  /** The taxon the evidence is actually about — not necessarily the focus. */
  scopeTaxon: string;
  /** At least one entry. A value with no provenance must not be sent. */
  provenance: Provenance[];
  citations?: Citation[];
  /** A limit the reader must know to read the value correctly. */
  caveat?: string;
  /**
   * How the claim was arrived at. `inferred` and `contested` must be visually
   * distinguishable from `reported` in any UI that renders them.
   */
  confidence?: 'reported' | 'inferred' | 'contested';
}

/**
 * A section of the document, in exactly one of four states.
 *
 * `absent` and `unavailable` are different facts and must never be merged:
 * one is a gap in knowledge, the other is a gap in service.
 */
export type Field<T> =
  | {
      status: 'present';
      /** One or more records. Conflicting evidence is carried, not resolved. */
      records: Evidenced<T>[];
    }
  | {
      status: 'absent';
      /** Why nothing is held — e.g. "no sequencing has been published". */
      reason: string;
      /** What work would close the gap, when that is known. */
      gap?: string;
    }
  | {
      status: 'restricted';
      /** Withheld deliberately, e.g. a sensitive locality. */
      reason: string;
    }
  | {
      status: 'unavailable';
      /** This sub-service failed for this request. Says nothing about the taxon. */
      reason: string;
      retryable: boolean;
    };

// ---------------------------------------------------------------------------
// Focus — which taxon, chosen by whom
// ---------------------------------------------------------------------------

export interface FocusSpecies {
  scientificName: string;
  taxonId: string;
  authority?: string;
}

export interface FeaturedTaxonFocus {
  rank: 'genus';
  genus: string;
  /** Continuum taxonomy identifier. Every downstream lookup keys on this. */
  taxonId: string;
  /** The species this window presents, when one has been selected. */
  species: FocusSpecies | null;
  selection: {
    method: 'daily_rotation' | 'curator_override';
    /** ISO-8601. The window the backend, not the browser, decided. */
    windowStart: string;
    windowEnd: string;
    /** Which service made the choice. */
    decidedBy: string;
  };
}

// ---------------------------------------------------------------------------
// Section payloads
// ---------------------------------------------------------------------------

/**
 * Identity. Not a `Field`, because a document that cannot name its taxon is
 * invalid rather than incomplete.
 */
export interface TaxonomySection {
  acceptedName: string;
  family: string;
  authority: Field<string>;
  subfamily: Field<string>;
  tribe: Field<string>;
  subtribe: Field<string>;
  /** Accepted species in the genus. A count, never an estimate typed by hand. */
  acceptedSpeciesCount: Field<number>;
  synonyms: Field<string>;
  provenance: Provenance[];
}

export interface MediaRecord {
  mediaId: string;
  scientificName: string;
  taxonId: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  kind: 'photograph' | 'illustration' | 'micrograph' | 'herbarium_sheet';
  qualityScore: number | null;
}

export interface OccurrencePoint {
  occurrenceId: string;
  scientificName: string;
  taxonId: string | null;
  latitude: number;
  longitude: number;
  country: string | null;
  /** ISO-8601 date of the observation or collection. */
  eventDate: string | null;
  basisOfRecord:
    | 'preserved_specimen'
    | 'human_observation'
    | 'machine_observation'
    | 'living_specimen'
    | 'unknown';
}

export interface OccurrenceSet {
  points: OccurrencePoint[];
  /** Total the backend holds, which may exceed what was returned. */
  totalRecords: number;
  returnedRecords: number;
  /** Whether coordinates were generalised before leaving the backend. */
  coordinatePrecision: 'exact' | 'rounded' | 'generalized';
  /** Records withheld for locality sensitivity. Counted, so the gap is visible. */
  sensitiveWithheldCount: number;
}

export interface GeographySummary {
  countries: { country: string; recordCount: number }[];
  nativeRange: string | null;
  endemicTo: string | null;
  /**
   * Regions with no survey effort. Rendering these is what stops an empty map
   * from reading as an absent orchid.
   */
  unsurveyedRegions: string[];
}

export interface HabitatStatement {
  statement: string;
  /** Controlled-vocabulary term where one exists. */
  habitatType: string | null;
  substrate: 'epiphytic' | 'lithophytic' | 'terrestrial' | 'mixed' | 'unknown';
}

export interface ElevationRange {
  minimumMetres: number | null;
  maximumMetres: number | null;
  basis: 'occurrence_records' | 'published_range' | 'expert_assertion';
  /** Records the range was computed from, when derived from occurrences. */
  sampleSize: number | null;
}

export interface PhenologyObservation {
  /** Months 1–12 with actual observations. Never defaulted, never padded. */
  floweringMonths: number[];
  hemisphere: 'northern' | 'southern' | 'both';
  basis: 'observation_records' | 'published_account';
  observationCount: number | null;
}

export interface PollinatorAssociation {
  pollinatorName: string;
  pollinatorTaxonId: string | null;
  pollinatorRank: 'species' | 'genus' | 'family' | 'guild';
  /**
   * What was actually witnessed. A visit is not a pollination and an inference
   * is neither; the distinction is the point of this field.
   */
  interaction:
    | 'pollination_observed'
    | 'visitation_observed'
    | 'pollinarium_removal'
    | 'inferred_from_morphology';
  orchidTaxonId: string;
}

export interface MycorrhizalAssociation {
  fungalTaxon: string;
  fungalRank: 'species' | 'genus' | 'family' | 'operational_taxonomic_unit';
  fungalFamily: string | null;
  associationType: 'germination' | 'adult_root' | 'both' | 'unspecified';
  detectionMethod: 'sequencing' | 'culture' | 'microscopy' | 'literature_report';
  orchidTaxonId: string;
}

export interface LiteratureRecord {
  citation: Citation;
  /** What this reference supports on this page, when it supports one claim. */
  claim: string | null;
  /** Which sections of this document the reference backs. */
  relatesTo: FeaturedTaxonSectionName[];
}

export interface ConservationAssessment {
  /** Category code, e.g. "EN". */
  category: string;
  /** Category in words, e.g. "Endangered". */
  categoryLabel: string;
  authority: string;
  criteria: string | null;
  assessmentYear: number | null;
  assessmentScope: 'global' | 'regional' | 'national';
}

// ---------------------------------------------------------------------------
// Coverage — what this deployment can and cannot answer
// ---------------------------------------------------------------------------

export type FeaturedTaxonSectionName =
  | 'taxonomy'
  | 'media'
  | 'occurrences'
  | 'geography'
  | 'habitat'
  | 'elevation'
  | 'phenology'
  | 'pollinators'
  | 'mycorrhizae'
  | 'literature'
  | 'conservation';

/**
 * The backend's own account of its limits, sent with every document.
 *
 * This is what lets the homepage say "the Continuum does not hold this yet"
 * truthfully and specifically, instead of showing a blank panel or a constant.
 */
export interface CoverageReport {
  /** Sections this deployment can serve at all. */
  supported: FeaturedTaxonSectionName[];
  /** Sections not built yet. Render as "not yet assembled", never as empty. */
  notImplemented: { section: FeaturedTaxonSectionName; note: string }[];
  /** Sections that failed for this request only. */
  degraded: { section: FeaturedTaxonSectionName; reason: string }[];
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface FeaturedTaxonContinuum {
  contractVersion: '1.0.0';
  /** ISO-8601 timestamp the document was assembled. */
  generatedAt: string;

  focus: FeaturedTaxonFocus;

  taxonomy: TaxonomySection;
  media: Field<MediaRecord>;
  occurrences: Field<OccurrenceSet>;
  geography: Field<GeographySummary>;
  habitat: Field<HabitatStatement>;
  elevation: Field<ElevationRange>;
  phenology: Field<PhenologyObservation>;
  pollinators: Field<PollinatorAssociation>;
  mycorrhizae: Field<MycorrhizalAssociation>;
  literature: Field<LiteratureRecord>;
  conservation: Field<ConservationAssessment>;

  coverage: CoverageReport;
}

/**
 * The result of asking for the featured taxon.
 *
 * A transport failure is its own state. There is deliberately no variant that
 * returns a partial or substituted document — a caller either has a real
 * payload or knows it does not.
 */
export type FeaturedTaxonResult =
  | { status: 'ok'; payload: FeaturedTaxonContinuum }
  | { status: 'unavailable'; reason: string; retryable: boolean }
  | { status: 'invalid'; reason: string };
