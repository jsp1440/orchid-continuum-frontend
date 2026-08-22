/**
 * Orchid judging practice — the scoring engine, recovered from the retired
 * FCOS judging application.
 *
 * WHAT WAS PORTED AND WHAT WAS DELIBERATELY LEFT BEHIND
 *
 * The legacy implementation (`judging_standards.py` in the retired
 * Orchid_Continuum_Online application) did three things. Two of them are worth
 * keeping and one of them is the reason this module exists at all.
 *
 * Kept: the rubric shape — organisations, categories, weighted criteria — and
 * the deterministic arithmetic that turns criterion scores into a total and a
 * band.
 *
 * NOT ported: the legacy system sent the orchid to GPT-4o, took the model's
 * numbers as the scores, and recorded the result as `suggested_award_level`
 * with `is_award_worthy: true` in a database. A model's opinion of a flower is
 * not an award, and writing it down as one manufactures an authority that does
 * not exist. Here every criterion score is entered by the person practising,
 * and nothing is persisted or issued.
 *
 * ALSO NOT PORTED: a real defect. The legacy `_determine_award_level` sorted
 * awards by minimum score descending and returned the first the total met.
 * AOS records CBR with a minimum of 0, so *every* score — 12 points, 3 points —
 * came back as CBR with `is_award_worthy: true`. Awards that are not decided by
 * a point threshold are excluded from band resolution here and reported
 * separately as what they are.
 *
 * THE RUBRIC DATA IS AN UNVERIFIED HISTORICAL SNAPSHOT.
 *
 * It was transcribed into a retired application at an unknown date and has not
 * been checked against any organisation's current published standards. It is
 * reproduced so the practice tool has realistic structure. It is not a
 * statement of what the American Orchid Society, the European Orchid Council or
 * the Australian Orchid Council currently require, and nothing built on it may
 * present itself as conferring or predicting a real award.
 */

export type JudgingCriterion = {
  criteria: string;
  maxPoints: number;
  description: string;
};

export type JudgingBand = {
  code: string;
  name: string;
  minScore: number;
  description: string;
};

export type JudgingOrganization = {
  code: string;
  name: string;
  categories: Record<string, JudgingCriterion[]>;
  bands: JudgingBand[];
  /**
   * Recognitions the source recorded without a point threshold. They are not
   * decided by a score and so cannot be resolved from one.
   */
  nonScoredRecognitions: JudgingBand[];
};

/** Provenance of the rubric data, carried with it so it cannot be quoted bare. */
export const RUBRIC_PROVENANCE = {
  source: 'Orchid_Continuum_Online · judging_standards.py',
  status: 'unverified_historical_snapshot',
  statement:
    'Transcribed from a retired application at an unknown date and never checked against any organisation’s current published standards. Structure for practice only — not a statement of current requirements and not a real award.',
} as const;

const AOS_FLOWER: JudgingCriterion[] = [
  { criteria: 'Form', maxPoints: 30, description: 'Shape, symmetry, and proportion of flowers' },
  { criteria: 'Color', maxPoints: 15, description: 'Clarity, intensity, and harmony of colors' },
  { criteria: 'Substance/Texture', maxPoints: 15, description: 'Thickness and surface quality of petals/sepals' },
  { criteria: 'Size', maxPoints: 10, description: 'Overall flower size relative to species norm' },
  { criteria: 'Floriferousness', maxPoints: 15, description: 'Number of flowers and arrangement' },
  { criteria: 'Stem and Presentation', maxPoints: 15, description: 'Stem strength and flower presentation' },
];

const AOS_PLANT: JudgingCriterion[] = [
  { criteria: 'Cultural Perfection', maxPoints: 25, description: 'Overall health and vigor' },
  { criteria: 'Size of Plant', maxPoints: 20, description: 'Plant size relative to container and species' },
  { criteria: 'Specimen Character', maxPoints: 20, description: 'Multiple growths and maturity' },
  { criteria: 'Arrangement and Condition', maxPoints: 15, description: 'Presentation and grooming' },
  { criteria: 'Rarity and Distinction', maxPoints: 20, description: 'Uniqueness and special characteristics' },
];

const EU_FLOWER: JudgingCriterion[] = [
  { criteria: 'Form and Shape', maxPoints: 25, description: 'Geometric perfection and symmetry' },
  { criteria: 'Color and Pattern', maxPoints: 20, description: 'Color intensity and pattern clarity' },
  { criteria: 'Size', maxPoints: 15, description: 'Flower size and proportions' },
  { criteria: 'Substance', maxPoints: 15, description: 'Petal thickness and durability' },
  { criteria: 'Inflorescence', maxPoints: 15, description: 'Flower count and arrangement' },
  { criteria: 'Impact', maxPoints: 10, description: 'Overall visual impact' },
];

const EU_PLANT: JudgingCriterion[] = [
  { criteria: 'Plant Health', maxPoints: 30, description: 'Vigor and freedom from defects' },
  { criteria: 'Growth Habit', maxPoints: 25, description: 'Natural form and balance' },
  { criteria: 'Cultural Achievement', maxPoints: 25, description: 'Cultivation excellence' },
  { criteria: 'Presentation', maxPoints: 20, description: 'Display quality and grooming' },
];

export const JUDGING_ORGANIZATIONS: JudgingOrganization[] = [
  {
    code: 'AOS',
    name: 'American Orchid Society',
    categories: { flower: AOS_FLOWER, plant: AOS_PLANT },
    bands: [
      { code: 'FCC', name: 'First Class Certificate', minScore: 90, description: 'Exceptional quality, 90+ points' },
      { code: 'AM', name: 'Award of Merit', minScore: 80, description: 'High quality, 80–89 points' },
      { code: 'HCC', name: 'Highly Commended Certificate', minScore: 75, description: 'Commendable quality, 75–79 points' },
    ],
    nonScoredRecognitions: [
      { code: 'CCM', name: 'Certificate of Cultural Merit', minScore: 80, description: 'Outstanding cultivation — judged in the plant/culture category rather than resolved from a flower score' },
      { code: 'CBR', name: 'Certificate of Botanical Recognition', minScore: 0, description: 'Botanical interest — not decided by a point total' },
    ],
  },
  {
    code: 'EU',
    name: 'European Orchid Council',
    categories: { flower: EU_FLOWER, plant: EU_PLANT },
    bands: [
      { code: 'Gold', name: 'Gold Certificate', minScore: 90, description: 'Outstanding excellence' },
      { code: 'Silver', name: 'Silver Certificate', minScore: 80, description: 'High quality' },
      { code: 'Bronze', name: 'Bronze Certificate', minScore: 70, description: 'Good quality' },
    ],
    nonScoredRecognitions: [],
  },
];

export function judgingOrganization(code: string): JudgingOrganization | null {
  const normalized = String(code ?? '').trim().toUpperCase();
  return JUDGING_ORGANIZATIONS.find((org) => org.code === normalized) ?? null;
}

export type CriterionEntry = {
  criteria: string;
  /** The points the person practising awarded. Null when they have not scored it. */
  points: number | null;
  maxPoints: number;
};

export type PracticeScore = {
  entries: CriterionEntry[];
  /** Points entered so far. */
  total: number;
  /** Maximum available across every criterion in the category. */
  maxTotal: number;
  /** Maximum available across the criteria actually scored. */
  scoredMax: number;
  complete: boolean;
  unscored: string[];
  /**
   * The band the total reaches, or null.
   *
   * Null on an incomplete sheet even when the running total already clears a
   * threshold: a partial score is not a low score, and resolving a band from
   * one would let a half-finished sheet read as a verdict.
   */
  band: JudgingBand | null;
  /** Recognitions a point total cannot decide, carried so they are not silently dropped. */
  nonScoredRecognitions: JudgingBand[];
};

/** Clamp an entered value into the criterion's range, rejecting nonsense. */
function normalizePoints(value: number | null | undefined, maxPoints: number): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > maxPoints) return maxPoints;
  return value;
}

/**
 * Score a practice sheet.
 *
 * Pure and deterministic: the same entries always give the same result, and
 * nothing is persisted, transmitted or issued. This is arithmetic over numbers
 * a person typed, not an assessment of a plant.
 */
export function scorePracticeSheet(
  organizationCode: string,
  category: string,
  entered: Record<string, number | null>,
): PracticeScore | null {
  const organization = judgingOrganization(organizationCode);
  if (!organization) return null;

  const criteria = organization.categories[category];
  if (!criteria) return null;

  const entries: CriterionEntry[] = criteria.map((criterion) => ({
    criteria: criterion.criteria,
    maxPoints: criterion.maxPoints,
    points: normalizePoints(entered[criterion.criteria], criterion.maxPoints),
  }));

  const scored = entries.filter((entry) => entry.points !== null);
  const total = scored.reduce((sum, entry) => sum + (entry.points ?? 0), 0);
  const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
  const scoredMax = scored.reduce((sum, entry) => sum + entry.maxPoints, 0);
  const unscored = entries.filter((entry) => entry.points === null).map((entry) => entry.criteria);
  const complete = unscored.length === 0;

  // Highest band the total reaches, and only on a complete sheet. Bands are
  // sorted here rather than trusted to be declared in order.
  const band = complete
    ? ([...organization.bands]
        .sort((a, b) => b.minScore - a.minScore)
        .find((candidate) => candidate.minScore > 0 && total >= candidate.minScore) ?? null)
    : null;

  return {
    entries,
    total,
    maxTotal,
    scoredMax,
    complete,
    unscored,
    band,
    nonScoredRecognitions: organization.nonScoredRecognitions,
  };
}
