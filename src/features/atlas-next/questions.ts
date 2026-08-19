/**
 * ATLAS-NEXT — the thematic question engine.
 *
 * A thematic question is not a layer with a nicer name. A layer says "here is
 * some data"; a question commits to what would count as an answer, what
 * evidence it needs, how strong a claim it is entitled to make, and at which
 * scales it means anything at all. Encoding that lets the interface refuse to
 * answer honestly rather than drawing something and hoping.
 *
 * Availability is resolved at RUNTIME against the records in view. A question
 * can be fully implemented and still be unavailable, because the selection in
 * front of the viewer carries none of the evidence it needs — and saying so is
 * more useful than an empty map.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { EvidenceState, ScaleLevel } from './types';
import type { TimeCompatibility } from './time';

export type QuestionId =
  | 'where-it-lives'
  | 'what-is-not-known-here'
  | 'what-changes-with-elevation'
  | 'what-habitat'
  | 'where-pollinator-documented'
  | 'where-fungal-partner-documented'
  | 'where-relationships-overlap'
  | 'when-does-it-flower'
  | 'what-has-changed-through-time'
  | 'what-conservation-evidence'
  | 'what-environmental-conditions'
  | 'what-separated-populations-share';

/** How the answer is drawn. Each mode is a different kind of claim. */
export type PresentationMode =
  /** One mark per record. Claims only "a record exists here". */
  | 'records'
  /** Graticule tallies. Claims only "this many records fall in this square". */
  | 'record-tally'
  /** Tallies coloured by how complete the evidence behind them is. */
  | 'evidence-coverage'
  /** Reserved: a continuous surface. Nothing in Slice 2 is entitled to one. */
  | 'surface';

/** What a question needs before it may be offered. */
export interface EvidenceRequirement {
  /** Field or relation on the canonical contract. */
  field: string;
  /** Whether the question is meaningless without it, or merely thinner. */
  necessity: 'required' | 'enriching';
  note?: string;
}

export type ProvenanceRequirement =
  /** Every mark traces to a source dataset and record id. */
  | 'per-record'
  /** Claims rest on a citation attached to the relationship. */
  | 'per-relationship-citation'
  /** Would rest on an external dataset the Continuum does not yet hold. */
  | 'external-dataset';

export type AvailabilityState =
  /** Implemented, and the current selection carries what it needs. */
  | 'available'
  /** Implemented, but nothing in the current selection carries the evidence. */
  | 'no-evidence-in-view'
  /** Not built yet. */
  | 'not-implemented'
  /** Could be drawn, but not honestly. Deliberately withheld. */
  | 'withheld';

export interface QuestionAvailability {
  state: AvailabilityState;
  reason: string;
  /** Measured against the records currently in view, when measurable. */
  coverage?: { withEvidence: number; total: number };
}

export interface ThematicQuestion {
  id: QuestionId;
  /** Short label for a control. */
  title: string;
  /** The question a person would actually ask. */
  question: string;
  requires: EvidenceRequirement[];
  presentation: PresentationMode;
  /** Rungs at which this question means something. */
  scales: ScaleLevel[];
  time: TimeCompatibility;
  /**
   * The strongest evidence state this question may ever assert. A question
   * cannot be rendered in a way that implies anything stronger than this.
   */
  strongestClaim: EvidenceState;
  provenance: ProvenanceRequirement;
  /** Keys this question contributes to AtlasContext for a guide to read. */
  calyxContribution: string[];
  /** Static baseline; runtime availability is computed by resolveAvailability. */
  implemented: boolean;
  /** Why it is not built, when it is not. */
  blockedBy: string | null;
}

const ALL_SCALES: ScaleLevel[] = [
  'earth',
  'world',
  'continent',
  'country',
  'state',
  'landscape',
  'locality',
];

export const QUESTIONS: Record<QuestionId, ThematicQuestion> = {
  'where-it-lives': {
    id: 'where-it-lives',
    title: 'Where it lives',
    question: 'Where does it live?',
    requires: [
      { field: 'lat/lng', necessity: 'required' },
      { field: 'country', necessity: 'enriching' },
      { field: 'region', necessity: 'enriching' },
      { field: 'elevation_m', necessity: 'enriching' },
      { field: 'habitat', necessity: 'enriching' },
    ],
    presentation: 'record-tally',
    scales: ALL_SCALES,
    time: 'occurrence-year',
    strongestClaim: 'observed',
    provenance: 'per-record',
    calyxContribution: ['visible.records', 'visible.species', 'visible.countries', 'selection'],
    implemented: true,
    blockedBy: null,
  },

  'what-is-not-known-here': {
    id: 'what-is-not-known-here',
    title: 'What is not known',
    question: 'What is not known here?',
    requires: [
      { field: 'lat/lng', necessity: 'required' },
      {
        field: 'pollinators',
        necessity: 'enriching',
        note: 'Its absence is the subject, so absence cannot disqualify the question.',
      },
      { field: 'mycorrhizal', necessity: 'enriching', note: 'Same — absence is the finding.' },
      { field: 'habitat', necessity: 'enriching' },
      { field: 'elevation_m', necessity: 'enriching' },
      { field: 'year', necessity: 'enriching' },
      { field: 'source_dataset / source_record_id', necessity: 'enriching' },
      { field: 'coordinate_uncertainty_m', necessity: 'enriching' },
    ],
    presentation: 'evidence-coverage',
    scales: ALL_SCALES,
    time: 'occurrence-year',
    // It reports what the archive holds. It asserts nothing about biology, so
    // it can never be stronger than an observation about the records.
    strongestClaim: 'observed',
    provenance: 'per-record',
    calyxContribution: ['knowledgeGap', 'visibleEvidence', 'provenanceRefs'],
    implemented: true,
    blockedBy: null,
  },

  'what-changes-with-elevation': {
    id: 'what-changes-with-elevation',
    title: 'Elevation',
    question: 'What changes with elevation?',
    requires: [
      { field: 'elevation_m', necessity: 'required' },
      { field: 'terrain DEM', necessity: 'required', note: 'External; not yet contracted.' },
    ],
    presentation: 'records',
    scales: ['country', 'state', 'landscape', 'locality'],
    time: 'occurrence-year',
    strongestClaim: 'correlated',
    provenance: 'external-dataset',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'Per-record elevation is patchy and there is no terrain surface to read it against. Needs a DEM (Slice 3).',
  },

  'what-habitat': {
    id: 'what-habitat',
    title: 'Habitat',
    question: 'What habitat does it occupy?',
    requires: [{ field: 'habitat', necessity: 'required' }, { field: 'biome', necessity: 'required' }],
    presentation: 'records',
    scales: ['continent', 'country', 'state', 'landscape'],
    time: 'none',
    strongestClaim: 'observed',
    provenance: 'per-record',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'Habitat is free text with no controlled vocabulary, and biome is populated on no records at all. Aggregating either would invent a classification.',
  },

  'where-pollinator-documented': {
    id: 'where-pollinator-documented',
    title: 'Pollinators',
    question: 'Where is its pollinator documented?',
    requires: [{ field: 'pollinators', necessity: 'required' }],
    presentation: 'records',
    scales: ['world', 'continent', 'country', 'state'],
    time: 'none',
    strongestClaim: 'documented_relationship',
    provenance: 'per-relationship-citation',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'Pollinator records are sparse and carry no per-record provenance, so a map of them would not show where the evidence is — only where somebody typed something.',
  },

  'where-fungal-partner-documented': {
    id: 'where-fungal-partner-documented',
    title: 'Fungal partners',
    question: 'Where is its fungal partner documented?',
    requires: [{ field: 'mycorrhizal', necessity: 'required' }],
    presentation: 'records',
    scales: ['world', 'continent', 'country'],
    time: 'none',
    strongestClaim: 'documented_relationship',
    provenance: 'per-relationship-citation',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'Fifteen species carry a literature-backed partner. That is real evidence and far too little coverage to draw as a distribution; the gap view carries it instead.',
  },

  'where-relationships-overlap': {
    id: 'where-relationships-overlap',
    title: 'Overlap',
    question: 'Where do relationships overlap?',
    requires: [
      { field: 'pollinators', necessity: 'required' },
      { field: 'mycorrhizal', necessity: 'required' },
    ],
    presentation: 'records',
    scales: ['continent', 'country'],
    time: 'none',
    strongestClaim: 'correlated',
    provenance: 'per-relationship-citation',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'Two ranges crossing is co-occurrence. Drawing it before the interface can make that unmistakable would manufacture an ecological claim out of a map operation.',
  },

  'when-does-it-flower': {
    id: 'when-does-it-flower',
    title: 'Flowering',
    question: 'When does it flower?',
    requires: [{ field: 'event date / month', necessity: 'required' }],
    presentation: 'records',
    scales: ['country', 'state', 'landscape'],
    time: 'flowering-season',
    strongestClaim: 'observed',
    provenance: 'per-record',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'The store holds a collection year, not an event date. A year cannot tell you a month, and a collection date is not a flowering observation.',
  },

  'what-has-changed-through-time': {
    id: 'what-has-changed-through-time',
    title: 'Change',
    question: 'What has changed through time?',
    requires: [{ field: 'year', necessity: 'required' }],
    presentation: 'record-tally',
    scales: ['world', 'continent', 'country'],
    time: 'occurrence-year',
    strongestClaim: 'observed',
    provenance: 'per-record',
    calyxContribution: [],
    implemented: false,
    // Deliberately withheld rather than merely unbuilt.
    blockedBy:
      'Collection years measure collecting effort, not orchids. A decline in records between decades is a fact about botanists. Presenting it as change on the ground would be the single most misleading thing this Atlas could do.',
  },

  'what-conservation-evidence': {
    id: 'what-conservation-evidence',
    title: 'Conservation',
    question: 'What conservation evidence applies here?',
    requires: [
      { field: 'conservation assessment', necessity: 'required' },
      { field: 'protected areas', necessity: 'required', note: 'External; WDPA licensing to check.' },
    ],
    presentation: 'records',
    scales: ['country', 'state', 'landscape'],
    time: 'none',
    strongestClaim: 'documented_relationship',
    provenance: 'external-dataset',
    calyxContribution: [],
    implemented: false,
    blockedBy:
      'Assessments reach an occurrence only by name match, and no protected-area dataset is contracted. Both are Slice 3 or later.',
  },

  'what-environmental-conditions': {
    id: 'what-environmental-conditions',
    title: 'Conditions',
    question: 'What environmental conditions characterise this range?',
    requires: [{ field: 'climate rasters', necessity: 'required', note: 'External; WorldClim/CHELSA.' }],
    presentation: 'surface',
    scales: ['continent', 'country', 'state'],
    time: 'environmental-series',
    strongestClaim: 'modeled',
    provenance: 'external-dataset',
    calyxContribution: [],
    implemented: false,
    blockedBy: 'No environmental raster is contracted, and anything derived from one is modelled, not observed.',
  },

  'what-separated-populations-share': {
    id: 'what-separated-populations-share',
    title: 'Disjunctions',
    question: 'What do separated populations have in common?',
    requires: [
      { field: 'climate rasters', necessity: 'required' },
      { field: 'elevation_m', necessity: 'required' },
    ],
    presentation: 'records',
    scales: ['world', 'continent'],
    time: 'none',
    strongestClaim: 'correlated',
    provenance: 'external-dataset',
    calyxContribution: [],
    implemented: false,
    blockedBy: 'Depends on the environmental layers above, and on saying "similar" without implying "therefore".',
  },
};

export const QUESTION_ORDER: QuestionId[] = [
  'where-it-lives',
  'what-is-not-known-here',
  'what-changes-with-elevation',
  'what-habitat',
  'where-pollinator-documented',
  'where-fungal-partner-documented',
  'where-relationships-overlap',
  'when-does-it-flower',
  'what-has-changed-through-time',
  'what-conservation-evidence',
  'what-environmental-conditions',
  'what-separated-populations-share',
];

/**
 * Resolve availability against the records actually in view.
 *
 * An unimplemented question reports why it is unbuilt. An implemented question
 * still has to show that the current selection carries the evidence it needs —
 * otherwise it reports that instead of drawing an empty answer.
 */
export function resolveAvailability(
  q: ThematicQuestion,
  points: AtlasOccurrencePoint[],
): QuestionAvailability {
  if (!q.implemented) {
    return { state: 'not-implemented', reason: q.blockedBy ?? 'Not built yet.' };
  }
  if (points.length === 0) {
    return { state: 'no-evidence-in-view', reason: 'No records are in view.' };
  }

  const required = q.requires.filter((r) => r.necessity === 'required');
  for (const req of required) {
    if (req.field === 'lat/lng') continue; // guaranteed by the loader
    const withIt = points.filter((p) => hasField(p, req.field)).length;
    if (withIt === 0) {
      return {
        state: 'no-evidence-in-view',
        reason: `No record in view carries ${req.field}.`,
        coverage: { withEvidence: 0, total: points.length },
      };
    }
  }
  return { state: 'available', reason: '' };
}

function hasField(p: AtlasOccurrencePoint, field: string): boolean {
  switch (field) {
    case 'elevation_m':
      return typeof p.elevation_m === 'number';
    case 'habitat':
      return !!p.habitat?.trim();
    case 'biome':
      return !!p.biome?.trim();
    case 'year':
      return typeof p.year === 'number';
    case 'pollinators':
      return p.pollinators.some((x) => x.taxon || x.name);
    case 'mycorrhizal':
      return !!p.mycorrhizal?.taxon;
    case 'conservation assessment':
      return !!(p.conservationStatus || p.iucnCode);
    default:
      return false;
  }
}
