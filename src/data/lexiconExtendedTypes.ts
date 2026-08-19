import type { AssetKind, FundingProvenance, LiteratureRecord } from './types';

export type PartnerCategory =
  | 'Grant & Funding Partners'
  | 'Scientific Partners'
  | 'Community Partners'
  | 'Technology Components'
  | 'Data Partners';

export interface PartnerRecord {
  id: string;
  organization_name: string;
  logo_url?: string;
  logo_pending?: boolean;
  website?: string;
  relationship_type: string;
  category: PartnerCategory;
  grant_or_program?: string;
  supported_component?: string;
  acknowledgment_text?: string;
  funding_period?: string;
  supported_assets?: string[];
  status: 'proposed' | 'pending' | 'active' | 'component';
  status_label: string;
  note?: string;
}

export type ValidationClass =
  | 'A_literature_constrained'
  | 'B_specimen_constrained'
  | 'C_composite_scientific'
  | 'D_conceptual_diagram'
  | 'E_decorative';

export type CheckResult =
  | 'pass'
  | 'review'
  | 'not_tested'
  | 'supported'
  | 'constrained'
  | 'illustrative'
  | 'not_evaluated';

export type ValidationBadge =
  | 'ai_assisted_illustration'
  | 'evidence_constrained'
  | 'specimen_constrained'
  | 'literature_constrained'
  | 'machine_checked'
  | 'community_reviewed'
  | 'expert_reviewed'
  | 'scientific_approval_pending'
  | 'scientifically_reviewed';

export type ExpertReviewStatus =
  | 'not_reviewed'
  | 'expert_review_pending'
  | 'revision_requested'
  | 'expert_reviewed'
  | 'approved_for_publication'
  | 'superseded';

export type ReviewerLevel =
  | 'public_participant'
  | 'trained_participant'
  | 'experienced_grower'
  | 'orchid_society_reviewer'
  | 'subject_matter_specialist'
  | 'scientific_editor';

export type MeasurementBasis =
  | 'relative_uncalibrated'
  | 'ratio'
  | 'angular'
  | 'shape_descriptor'
  | 'calibrated_absolute';

export interface ReferenceImageRecord {
  image_id: string;
  thumbnail_url?: string;
  taxon?: string;
  source?: string;
  photographer?: string;
  license?: string;
  provenance_id?: string;
  image_orientation?: string;
  usable_for_measurement?: boolean;
  characters_extracted?: string[];
  confidence?: 'high' | 'moderate' | 'low' | 'not_assessed';
  note?: string;
}

export interface MorphometricMeasurement {
  character: string;
  structure?: string;
  basis?: MeasurementBasis;
  units?: string;
  calibrated?: boolean;
  sample_size?: number;
  median?: number | string;
  mean?: number | string;
  observed_range?: string;
  interquartile_range?: string;
  method?: string;
  confidence?: 'high' | 'moderate' | 'low' | 'not_assessed';
  note?: string;
}

export interface ColourObservation {
  feature: string;
  observed_colour_phenotype?: string;
  inferred_pigment_class?: string;
  chemically_verified_pigment?: string;
  evidence_note?: string;
}

export interface GenerationSpecItem {
  structure: string;
  character: string;
  target_state?: string;
  measured_range?: string;
  representative_value?: string;
  source_evidence?: string;
  confidence?: 'high' | 'moderate' | 'low' | 'not_assessed';
  literature_support?: string;
}

export interface CharacterConformanceCheck {
  check: string;
  result: CheckResult;
  method?: string;
  note?: string;
}

export interface CommunityReviewQuestion {
  id: string;
  prompt: string;
  options: string[];
  tallies?: Record<string, number>;
}

export interface CommunityReviewRecord {
  status: 'not_opened' | 'open' | 'closed';
  opened_date?: string;
  reviewer_count?: number;
  questions?: CommunityReviewQuestion[];
  consensus_statements?: string[];
  note?: string;
}

export interface ExpertReviewRecord {
  status: ExpertReviewStatus;
  reviewer?: string;
  credentials?: string;
  affiliation?: string;
  date?: string;
  comments?: string;
  requested_corrections?: string[];
  approval_decision?: string;
  note?: string;
}

export interface IllustrationVersion {
  version: string;
  date?: string;
  summary: string;
  state?: string;
}

export interface IllustrationValidationRecord {
  illustration_id: string;
  lexicon_term_id?: string;
  lexicon_term?: string;
  illustration_type?: AssetKind;
  validation_class?: ValidationClass;
  validation_class_pending?: boolean;
  version?: string;
  creation_date?: string;
  revision_date?: string;
  ai_assisted?: boolean;
  ai_disclosure?: string;
  purpose?: string;
  source_image_count?: number;
  source_image_ids?: string[];
  source_taxa?: string[];
  source_provenance?: string;
  photographer?: string;
  licenses?: string[];
  reference_images?: ReferenceImageRecord[];
  reference_status_note?: string;
  literature_sources?: LiteratureRecord[];
  literature_status_note?: string;
  measured_characters?: MorphometricMeasurement[];
  measurement_status_note?: string;
  measurement_methods?: string[];
  colour_observations?: ColourObservation[];
  generation_specification?: GenerationSpecItem[];
  generation_spec_note?: string;
  pre_generation_analysis_note?: string;
  post_generation_analysis_note?: string;
  character_level_conformance?: CharacterConformanceCheck[];
  known_limitations?: string[];
  community_review?: CommunityReviewRecord;
  expert_review?: ExpertReviewRecord;
  scientific_approval?: 'prototype_under_development' | 'pending' | 'approved' | 'not_applicable';
  scientific_approval_note?: string;
  version_history?: IllustrationVersion[];
  badges?: ValidationBadge[];
  funding?: FundingProvenance;
}
