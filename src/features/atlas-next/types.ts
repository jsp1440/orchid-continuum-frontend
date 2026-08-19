/**
 * ATLAS-NEXT — shared vocabulary for the spatial reasoning interface.
 *
 * This file holds no data and makes no claims. It defines the states the
 * Atlas is allowed to be in, so that every surface downstream is forced to
 * say which kind of thing it is showing.
 *
 * Two distinctions here are load-bearing and must not be collapsed:
 *
 *   1. `unknown` vs `unavailable`.
 *      `unknown` means the knowledge graph holds nothing. That is a research
 *      question and it is content — it renders, it is legible, it is not an
 *      error. `unavailable` means we could not reach the data or the viewer
 *      is not authorised to see it. That says nothing about the orchid.
 *
 *   2. `correlated` vs `documented_relationship`.
 *      Two things sharing a grid cell is co-occurrence. A study naming a
 *      partner is a documented relationship. The Atlas must never render the
 *      first as if it were the second.
 */

// ---------------------------------------------------------------------------
// Evidence states
// ---------------------------------------------------------------------------

export type EvidenceState =
  | 'observed'
  | 'documented_relationship'
  | 'correlated'
  | 'inferred'
  | 'modeled'
  | 'unknown'
  | 'unavailable'
  | 'conflicting';

export interface EvidenceDescriptor {
  state: EvidenceState;
  /** Short label for a chip. */
  label: string;
  /** One sentence a non-specialist can read, stating what this does and does not mean. */
  meaning: string;
  /** Whether this state asserts something about the orchid at all. */
  assertsAboutOrchid: boolean;
  /** Token colour. Deliberately NOT a red/green pass-fail ramp. */
  tone: string;
}

export const EVIDENCE: Record<EvidenceState, EvidenceDescriptor> = {
  observed: {
    state: 'observed',
    label: 'Observed',
    meaning: 'Recorded directly on this occurrence record by the source dataset.',
    assertsAboutOrchid: true,
    tone: '#7fc49a',
  },
  documented_relationship: {
    state: 'documented_relationship',
    label: 'Documented relationship',
    meaning: 'A published study names this relationship for this species.',
    assertsAboutOrchid: true,
    tone: '#b98ce0',
  },
  correlated: {
    state: 'correlated',
    label: 'Co-occurrence only',
    meaning:
      'These things are recorded in the same place. Nothing here shows that one affects the other.',
    assertsAboutOrchid: false,
    tone: '#d8b24c',
  },
  inferred: {
    state: 'inferred',
    label: 'Inferred',
    meaning: 'Carried over from a related record rather than recorded here directly.',
    assertsAboutOrchid: false,
    tone: '#d8b24c',
  },
  modeled: {
    state: 'modeled',
    label: 'Modelled',
    meaning: 'Produced by a model, not by an observation. Read it as a hypothesis.',
    assertsAboutOrchid: false,
    tone: '#7fa8d8',
  },
  unknown: {
    state: 'unknown',
    label: 'Not recorded',
    meaning: 'The Continuum holds nothing here. That gap is a research question, not a fault.',
    assertsAboutOrchid: false,
    tone: '#9ba6c9',
  },
  unavailable: {
    state: 'unavailable',
    label: 'Unavailable',
    meaning:
      'This could not be reached or is not released at this access level. It says nothing about the orchid.',
    assertsAboutOrchid: false,
    tone: '#8b9487',
  },
  conflicting: {
    state: 'conflicting',
    label: 'Sources disagree',
    meaning: 'More than one source is on record here and they do not agree.',
    assertsAboutOrchid: false,
    tone: '#d87a4c',
  },
};

/** True for the two states that mean "no claim is being made", for either reason. */
export const isSilentState = (s: EvidenceState): boolean =>
  s === 'unknown' || s === 'unavailable';

// ---------------------------------------------------------------------------
// Scale ladder
// ---------------------------------------------------------------------------
//
// The Atlas is ONE spatial system seen at different scales, not a set of
// separate maps. Every level below names the same globe; what changes is how
// far the camera sits, whether records are shown individually or aggregated,
// and how precisely a coordinate may be drawn.
//
// `availability` is resolved at RUNTIME against the canonical data, never
// asserted here — a level is offered only when the graph actually carries the
// field that level is organised by.

export type ScaleLevel =
  | 'earth'
  | 'world'
  | 'continent'
  | 'country'
  | 'state'
  | 'landscape'
  | 'locality';

export interface ScaleDescriptor {
  level: ScaleLevel;
  label: string;
  /** Camera distance in globe units. Lower is closer. */
  cameraDistance: number;
  /** How occurrence records are drawn at this scale. */
  render: 'aggregated' | 'individual';
  /**
   * Grid cell size in degrees used when aggregating at this scale.
   * Also the coarsest precision at which a record may be drawn here.
   */
  aggregationDeg: number;
  /**
   * Drawn radius of a mark in globe units. It shrinks as the camera closes in:
   * a mark sized for the whole planet becomes a blot once a few thousand
   * records share one country, and a blot hides the density it is made of.
   */
  markRadius: number;
  /** Which canonical field organises descent INTO this level. */
  organisedBy: 'none' | 'region' | 'country' | 'locality';
  purpose: string;
}

export const SCALES: Record<ScaleLevel, ScaleDescriptor> = {
  earth: {
    level: 'earth',
    label: 'Earth',
    cameraDistance: 350,
    render: 'aggregated',
    aggregationDeg: 10,
    markRadius: 1.05,
    organisedBy: 'none',
    purpose: 'The whole planet at once. Where does this family occur at all?',
  },
  world: {
    level: 'world',
    label: 'World',
    cameraDistance: 300,
    render: 'aggregated',
    aggregationDeg: 5,
    markRadius: 0.85,
    organisedBy: 'none',
    purpose: 'Global pattern. Which parts of the world hold records?',
  },
  continent: {
    level: 'continent',
    label: 'Continent',
    cameraDistance: 235,
    render: 'aggregated',
    aggregationDeg: 2,
    markRadius: 0.55,
    organisedBy: 'region',
    purpose: 'One region of the world, organised by the recorded region field.',
  },
  country: {
    level: 'country',
    label: 'Country',
    cameraDistance: 185,
    render: 'individual',
    aggregationDeg: 1,
    markRadius: 0.34,
    organisedBy: 'country',
    purpose: 'One country, with its records shown individually.',
  },
  state: {
    level: 'state',
    label: 'State / Province',
    cameraDistance: 160,
    render: 'individual',
    aggregationDeg: 0.5,
    markRadius: 0.24,
    organisedBy: 'region',
    purpose: 'A subdivision within a country.',
  },
  landscape: {
    level: 'landscape',
    label: 'Landscape',
    cameraDistance: 145,
    render: 'individual',
    aggregationDeg: 0.25,
    markRadius: 0.17,
    organisedBy: 'locality',
    purpose: 'A valley, ridge, or reserve — the scale at which habitat is legible.',
  },
  locality: {
    level: 'locality',
    label: 'Locality / Site',
    cameraDistance: 135,
    render: 'individual',
    aggregationDeg: 0.1,
    markRadius: 0.13,
    organisedBy: 'locality',
    purpose: 'A single site. Subject to locality protection for sensitive taxa.',
  },
};

export const SCALE_ORDER: ScaleLevel[] = [
  'earth',
  'world',
  'continent',
  'country',
  'state',
  'landscape',
  'locality',
];

// ---------------------------------------------------------------------------
// Thematic modes
// ---------------------------------------------------------------------------
//
// The Atlas answers questions, not "layers". Slice 1 implements exactly one.
// The rest are declared so the state machine, the URL, and the Calyx context
// already have somewhere to put them — declaring is not implementing, and an
// unimplemented mode must never render as if it had data behind it.

export type ThematicMode =
  | 'where-it-lives'
  | 'what-lives-with-it'
  | 'what-feeds-it'
  | 'what-pollinates-it'
  | 'when-it-blooms'
  | 'what-is-changing'
  | 'what-is-unknown';

export interface ThematicDescriptor {
  mode: ThematicMode;
  /** The human question, not a category name. */
  question: string;
  implemented: boolean;
  /** Canonical fields this mode reads. Empty while unimplemented. */
  reads: string[];
  /** Why it is not implemented yet, stated plainly. Null once implemented. */
  blockedBy: string | null;
}

export const THEMATIC_MODES: Record<ThematicMode, ThematicDescriptor> = {
  'where-it-lives': {
    mode: 'where-it-lives',
    question: 'Where does it live?',
    implemented: true,
    reads: ['lat', 'lng', 'country', 'region', 'locality', 'elevation_m', 'habitat', 'year'],
    blockedBy: null,
  },
  'what-lives-with-it': {
    mode: 'what-lives-with-it',
    question: 'What lives alongside it?',
    implemented: false,
    reads: [],
    blockedBy: 'Co-occurrence would be correlation only; needs an explicit non-causal presentation.',
  },
  'what-feeds-it': {
    mode: 'what-feeds-it',
    question: 'What feeds it before it can feed itself?',
    implemented: false,
    reads: [],
    blockedBy: 'Mycorrhizal evidence covers a small number of species; needs its own coverage surface.',
  },
  'what-pollinates-it': {
    mode: 'what-pollinates-it',
    question: 'What pollinates it?',
    implemented: false,
    reads: [],
    blockedBy: 'Pollinator records are sparse and unevenly attributed across datasets.',
  },
  'when-it-blooms': {
    mode: 'when-it-blooms',
    question: 'When does it bloom?',
    implemented: false,
    reads: [],
    blockedBy: 'Requires a time system; occurrence year alone is not phenology.',
  },
  'what-is-changing': {
    mode: 'what-is-changing',
    question: 'What is changing where it lives?',
    implemented: false,
    reads: [],
    blockedBy: 'Requires external environmental and land-use datasets not yet contracted.',
  },
  'what-is-unknown': {
    mode: 'what-is-unknown',
    question: 'What is not known here?',
    implemented: false,
    reads: [],
    blockedBy: 'Depends on the coverage model that the modes above will produce.',
  },
};

// ---------------------------------------------------------------------------
// Access level
// ---------------------------------------------------------------------------
//
// Slice 1 always runs as `public`. The parameter exists throughout so that
// authenticated research access is a value change rather than a rewrite, and
// so that no code path can quietly assume full precision.

export type AtlasAccessLevel = 'public' | 'research';
