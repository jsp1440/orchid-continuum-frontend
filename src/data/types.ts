/**
 * ORCHID CONTINUUM — ILLUSTRATED ORCHID LEXICON
 * Core data model migrated from the Famous AI build.
 *
 * Empty fields are a legitimate state and MUST be rendered as awaiting
 * enrichment rather than filled with invented content.
 */

export type MaturityFlag =
  | 'core_definition'
  | 'scientifically_enriched'
  | 'etymology_added'
  | 'illustrated'
  | 'photographic_examples'
  | 'literature_linked'
  | 'taxonomy_linked'
  | 'identification_linked'
  | 'vision_enabled'
  | 'calyx_connected'
  | 'expert_reviewed';

export type ReviewState =
  | 'draft'
  | 'source_imported'
  | 'literature_reviewed'
  | 'illustration_reviewed'
  | 'expert_reviewed'
  | 'published'
  | 'revision_needed';

export type CertaintyLevel =
  | 'scientific_consensus'
  | 'supported_interpretation'
  | 'active_research_area'
  | 'evidence_incomplete'
  | 'competing_hypotheses'
  | 'unresolved'
  | 'candidate_knowledge'
  | 'literature_review_pending';

export type AssetKind =
  | 'ai_assisted_illustration'
  | 'photograph'
  | 'annotated_photograph'
  | 'scientific_diagram'
  | 'conceptual_visualization';

export type MediaType =
  | 'static_illustration'
  | 'annotated_photo'
  | 'interactive_diagram'
  | 'animation'
  | 'video'
  | 'model_3d';

export type LexiconCategory =
  | 'Floral Morphology'
  | 'Vegetative Morphology'
  | 'Anatomy'
  | 'Development'
  | 'Physiology'
  | 'Pollination Biology'
  | 'Ecology'
  | 'Evolution'
  | 'Taxonomy'
  | 'Nomenclature'
  | 'Botanical Latin'
  | 'Orchid Culture'
  | 'Reproductive Biology'
  | 'Mycorrhizal Biology'
  | 'Conservation Terminology';

export interface Provenance {
  source?: string;
  source_record_id?: string;
  citation?: string;
  contributor?: string;
  illustrator_or_photographer?: string;
  ai_generation_disclosure?: string;
  license?: string;
  scientific_reviewer?: string;
  confidence?: 'high' | 'moderate' | 'low' | 'not_assessed';
  validation_status?: ReviewState;
  date_created?: string;
  date_revised?: string;
}

export interface FundingProvenance {
  funding_source?: string;
  grant_program?: string;
  supported_asset_or_activity?: string;
  date?: string;
  acknowledgment_text?: string;
  status?: 'proposed' | 'pending' | 'awarded';
}

export interface LiteratureRecord {
  id: string;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  doi?: string;
  url?: string;
  summary?: string;
  topic_tags?: string[];
  study_type?: string;
  evidence_type?: string;
  related_term?: string;
  related_taxon?: string;
  provenance?: Provenance;
}

export interface ImageRegionAnnotation {
  region_id: string;
  visible_structure?: string;
  character_state?: string;
  confidence?: 'high' | 'moderate' | 'low' | 'not_assessed';
  taxon?: string;
  reviewer?: string;
  provenance?: Provenance;
  bbox?: [number, number, number, number];
}

export interface LexiconAsset {
  id: string;
  kind: AssetKind;
  media_type?: MediaType;
  title?: string;
  caption?: string;
  alt_text?: string;
  url?: string;
  schematic?: string;
  labels?: string[];
  status?: 'available' | 'in_development' | 'awaiting_review';
  regions?: ImageRegionAnnotation[];
  provenance?: Provenance;
  funding?: FundingProvenance;
  illustrates?: string[];
  depicts?: { label: string; slug?: string; note?: string }[];
  shows_character_state?: string;
  contrasts_with?: string;
  supports?: string[];
  version?: string;
  reviewed_by?: string;
  source_system?: string;
  source_record_id?: string;
  import_batch?: string;
}

export interface ExplanatoryBlock {
  id: string;
  heading: string;
  body: string;
  certainty?: CertaintyLevel;
  note?: string;
}

export interface CharacterState {
  label: string;
  description?: string;
  notes?: string;
}

export interface TaxonLink {
  name: string;
  rank?: 'family' | 'subfamily' | 'tribe' | 'genus' | 'species' | 'group';
  note?: string;
}

export type RelationshipPredicate =
  | 'defined_by'
  | 'illustrated_by'
  | 'demonstrated_by'
  | 'contrasts_with'
  | 'occurs_in'
  | 'used_to_diagnose'
  | 'supported_by'
  | 'related_to'
  | 'part_of'
  | 'connects_to';

export interface Relationship {
  predicate: RelationshipPredicate;
  target: string;
  target_slug?: string;
  target_kind?:
    | 'term'
    | 'taxon'
    | 'literature'
    | 'image'
    | 'system'
    | 'character'
    | 'concept';
  note?: string;
}

export interface EtymologySegment {
  form: string;
  language?: 'Greek' | 'Latin' | 'Botanical Latin' | 'Other';
  gloss?: string;
  role?: 'root' | 'prefix' | 'suffix' | 'combining form';
}

export interface Etymology {
  segments?: EtymologySegment[];
  botanical_latin_notes?: string;
  historical_usage?: string;
  related_forms?: string[];
  verified?: boolean;
}

export interface StandardsConnection {
  standard: string;
  concept_or_term?: string;
  note?: string;
  mapping_state?: 'proposed_mapping' | 'aligned' | 'not_yet_mapped';
}

export interface LinkedEvidence {
  label: string;
  kind: 'literature' | 'image' | 'observation' | 'specimen' | 'dataset' | 'project';
  status: 'available' | 'awaiting_import' | 'awaiting_contribution' | 'not_applicable';
  note?: string;
}

export interface ConservationGuidance {
  why_it_matters?: string;
  what_to_record?: string[];
  minimum_evidence?: string[];
  do_not_infer_from?: string[];
  monitoring_relevance?: string;
  restoration_relevance?: string;
  standards_connections?: StandardsConnection[];
  linked_evidence?: LinkedEvidence[];
  certainty?: CertaintyLevel;
  scope_note?: string;
}

export interface DefinitionVersion {
  version: string;
  date?: string;
  definition?: string;
  summary: string;
  author?: string;
  review_state?: ReviewState;
  reason_for_revision?: string;
  sources?: string[];
}

export interface MigrationOverlay {
  source_system: 'Famous AI Illustrated Orchid Lexicon migration';
  fields: string[];
}

export interface LexiconEntry {
  id: string;
  concept_id?: string;
  concept_uri?: string;
  slug: string;
  preferred_term: string;
  pronunciation?: string;
  category?: LexiconCategory;
  subcategory?: string;
  quick_definition?: string;
  expanded_definition?: string;
  scope_note?: string;
  synonyms?: string[];
  related_terminology?: string[];
  contrasting_terms?: string[];
  broader_concept?: { label: string; slug?: string };
  narrower_concepts?: { label: string; slug?: string }[];
  etymology?: Etymology;
  anatomical_context?: string;
  morphological_context?: string;
  mechanism_blocks?: ExplanatoryBlock[];
  significance_blocks?: ExplanatoryBlock[];
  evolution_blocks?: ExplanatoryBlock[];
  variation_notes?: string;
  character_states?: CharacterState[];
  example_taxa?: TaxonLink[];
  identification_significance?: string;
  identification_cautions?: string[];
  identification_companion_characters?: string[];
  conservation?: ConservationGuidance;
  assets?: LexiconAsset[];
  research_questions?: string[];
  literature?: LiteratureRecord[];
  literature_status?: string;
  relationships?: Relationship[];
  definition_versions?: DefinitionVersion[];
  calyx_notes?: string;
  vision_lab_notes?: string;
  provenance?: Provenance;
  funding?: FundingProvenance;
  maturity?: MaturityFlag[];
  review_state?: ReviewState;
  certainty_summary?: CertaintyLevel;
  source_system?: string;
  source_record_id?: string;
  import_batch?: string;
  date_created?: string;
  date_revised?: string;
  migration_overlay?: MigrationOverlay;
}

export interface LexiconStats {
  total_entries: number;
  illustrated_entries: number;
  enriched_entries: number;
  literature_linked_entries: number;
  taxonomy_linked_entries: number;
  expert_reviewed_entries: number;
  categories: number;
}

export type {
  PartnerCategory,
  PartnerRecord,
  ValidationClass,
  CheckResult,
  ValidationBadge,
  ExpertReviewStatus,
  ReviewerLevel,
  MeasurementBasis,
  ReferenceImageRecord,
  MorphometricMeasurement,
  ColourObservation,
  GenerationSpecItem,
  CharacterConformanceCheck,
  CommunityReviewQuestion,
  CommunityReviewRecord,
  ExpertReviewRecord,
  IllustrationVersion,
  IllustrationValidationRecord,
} from './lexiconExtendedTypes';
