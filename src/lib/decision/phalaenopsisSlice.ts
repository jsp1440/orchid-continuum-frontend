/**
 * phalaenopsisSlice — the first product vertical slice, run end to end over a
 * documented, production-equivalent fixture dataset.
 *
 * Decision question:
 *   "Which traits and environmental evidence best distinguish cool-growing from
 *    warm-growing Phalaenopsis species, and how strong is the evidence for a
 *    practical cultivation classification?"
 *
 * DATASET PROVENANCE — READ THIS BEFORE TRUSTING THE NUMBERS
 * ----------------------------------------------------------
 * The evidence below is a CURATED FIXTURE, not a live pull from the governed
 * backends. It exists so the whole FRAME→…→REVIEW journey can be exercised,
 * mounted, and tested deterministically before the live connectors are wired in.
 * To keep the science honest under that constraint:
 *   - every SourceAnchor is `sourceKind: "fixture"` and says so in its attribution;
 *   - substantive claims are `sourced_assertion` at `draft` review, never
 *     `direct_observation`, because nothing here is a governed measurement;
 *   - genuine unknowns are recorded as `missing` claims (evidence gaps), never
 *     filled in;
 *   - a real counter-claim is preserved via a CONTRADICTS relation, so the run
 *     surfaces a live conflict rather than a tidy consensus.
 * The claims encode widely-held orchid-horticulture understanding (Phalaenopsis
 * are predominantly warm-growing lowland tropical epiphytes; a minority from
 * higher-elevation / subtropical habitats tolerate cooler nights). No specific
 * paper, DOI, or measurement is fabricated. When the live literature and
 * occurrence/trait connectors land, `buildPhalaenopsisFixture` is the seam they
 * replace.
 */

import { makeClaim, makeMissingClaim, makeRelation } from "./claims";
import {
  buildComparisonTable,
  assessUncertainty,
  buildProvisionalSynthesis,
  type CellAssignment,
} from "./synthesis";
import {
  buildDecisionArtifact,
  buildKnowledgeGraphProposal,
  buildRunManifest,
} from "./artifact";
import {
  runDecisionPipeline,
  type RunState,
  type StageExecutor,
  type StageResult,
} from "./orchestration";
import {
  DECISION_STAGES,
  type ComparisonCriterion,
  type DecisionAlternative,
  type DecisionArtifact,
  type DecisionFrame,
  type DecisionStage,
  type EvidenceAppraisal,
  type EvidenceClaim,
  type EvidenceRelation,
  type KnowledgeGraphProposal,
  type ResearchPlan,
  type RunEvidenceManifest,
  type SourceAnchor,
  type UncertaintyAssessment,
} from "./contracts";

/** The pinned taxonomy release the whole slice resolves names against. */
export const PHALAENOPSIS_TAXONOMY_RELEASE = "world-plants-hassler-2024-fixture";

const PROJECT_ID = "rdp_phal_cool_warm";

/* ----------------------------- frame ----------------------------- */

export const PHALAENOPSIS_FRAME: DecisionFrame = {
  question:
    "Which traits and environmental evidence best distinguish cool-growing from warm-growing Phalaenopsis species, and how strong is the evidence for a practical cultivation classification?",
  intendedOutput: "A practical, evidence-graded cultivation classification (cool- vs warm-growing) with cited support, preserved counterevidence, and explicit gaps.",
  audience: ["growers", "students", "researchers", "collection managers"],
  scope: "Genus Phalaenopsis (accepted names under the pinned World Plants/Hassler release); cultivation-relevant thermal traits and their environmental correlates.",
  assumptions: [
    "Native elevation and habitat climate are informative proxies for cultivation temperature tolerance.",
    "Cultivation 'cool' vs 'warm' is a practical band, not a sharp physiological threshold.",
  ],
  constraints: [
    "Protected-locality policy applies to any occurrence-derived evidence at every render/export boundary.",
    "Fixture dataset: no live governed retrieval in this run.",
  ],
  inclusionCriteria: [
    "Accepted Phalaenopsis species with cultivation-relevant thermal or elevation evidence.",
    "Sources attributable and license-clear.",
  ],
  exclusionCriteria: [
    "Grex/hybrids and unresolved names.",
    "Anecdote without an attributable source.",
  ],
  stoppingRule:
    "Stop when each alternative has at least one supported trait criterion, all open conflicts are recorded, and remaining gaps are logged as missing-information claims — or when the evidence is judged insufficient for a firm classification.",
};

/* -------------------------- alternatives ------------------------- */

export const PHALAENOPSIS_ALTERNATIVES: DecisionAlternative[] = [
  { alternativeId: "alt_warm", label: "Warm-growing", description: "Lowland tropical epiphytes tolerating warm days and warm nights year-round." },
  { alternativeId: "alt_cool", label: "Cool-growing", description: "Higher-elevation / subtropical taxa tolerating cooler nights and a wider diurnal range." },
];

export const PHALAENOPSIS_CRITERIA: ComparisonCriterion[] = [
  { criterionId: "crit_elevation", label: "Native elevation", description: "Typical native elevation band from occurrence evidence.", weight: 0.35 },
  { criterionId: "crit_nighttemp", label: "Night temperature tolerance", description: "Trait/observation of tolerated night minima.", weight: 0.35 },
  { criterionId: "crit_habitat", label: "Habitat climate", description: "Habitat classification (lowland tropical vs montane/subtropical).", weight: 0.3 },
];

/* --------------------------- fixture ----------------------------- */

function fixtureAnchor(id: string, title: string, kind: SourceAnchor["sourceKind"] = "fixture"): SourceAnchor {
  return {
    anchorId: id,
    sourceKind: kind,
    title,
    revisionId: null,
    sourceAnchorIds: [],
    contentHash: null,
    retrievedAt: null,
    license: "fixture-illustrative",
    attribution: "Curated production-equivalent fixture (not a live governed source).",
    locator: null,
    displayPolicy: "AUTHORIZED_EXCERPT",
    excerptAbsence: null,
  };
}

const APPRAISAL_MODERATE: EvidenceAppraisal = {
  sourceType: "curated horticultural/biogeographic synthesis (fixture)",
  sourceAuthority: "moderate",
  directness: "moderate",
  relevanceToQuestion: "high",
  methodologicalFit: "moderate",
  independence: "moderate",
  temporalRelevance: "moderate",
  completeness: "low",
};

export type PhalaenopsisFixture = {
  claims: EvidenceClaim[];
  relations: EvidenceRelation[];
  anchors: SourceAnchor[];
  assignments: CellAssignment[];
};

/**
 * The seam the live connectors will replace. Returns a stable, deterministic set
 * of claims/relations/anchors so the manifest fingerprint is reproducible across
 * runs. Uses explicit claim ids for that reproducibility.
 */
export function buildPhalaenopsisFixture(): PhalaenopsisFixture {
  const aElev = fixtureAnchor("anc_elev", "Phalaenopsis native elevation ranges (fixture synthesis)", "occurrence_dataset");
  const aTrait = fixtureAnchor("anc_trait", "Phalaenopsis thermal tolerance notes (fixture synthesis)", "trait_dataset");
  const aHabitat = fixtureAnchor("anc_habitat", "Phalaenopsis habitat classifications (fixture synthesis)", "occurrence_dataset");
  const aCounter = fixtureAnchor("anc_counter", "Intraspecific thermal plasticity report (fixture)", "literature");
  const anchors = [aElev, aTrait, aHabitat, aCounter];

  // Warm-growing support
  const cWarmElev = makeClaim({
    claimId: "cl_warm_elev",
    kind: "sourced_assertion",
    statement: "Most Phalaenopsis species occur at low elevations (roughly 0–800 m), consistent with warm-growing cultivation.",
    taxonIds: ["phalaenopsis"],
    anchors: [aElev],
    appraisal: APPRAISAL_MODERATE,
    modelConfidence: 0.6,
  });
  const cWarmNight = makeClaim({
    claimId: "cl_warm_night",
    kind: "sourced_assertion",
    statement: "Lowland Phalaenopsis tolerate warm nights (~18–24°C) and are intolerant of sustained cold.",
    taxonIds: ["phalaenopsis"],
    anchors: [aTrait],
    appraisal: APPRAISAL_MODERATE,
    modelConfidence: 0.6,
  });
  const cWarmHabitat = makeClaim({
    claimId: "cl_warm_habitat",
    kind: "sourced_assertion",
    statement: "The genus is predominantly lowland-tropical-epiphytic in habitat.",
    taxonIds: ["phalaenopsis"],
    anchors: [aHabitat],
    appraisal: APPRAISAL_MODERATE,
    modelConfidence: 0.6,
  });

  // Cool-growing support (the minority case)
  const cCoolElev = makeClaim({
    claimId: "cl_cool_elev",
    kind: "sourced_assertion",
    statement: "A minority of Phalaenopsis (e.g. some subtropical / higher-elevation taxa) occur above ~1000 m, consistent with cooler-tolerant cultivation.",
    taxonIds: ["phalaenopsis"],
    anchors: [aElev],
    appraisal: { ...APPRAISAL_MODERATE, completeness: "low", independence: "low" },
    modelConfidence: 0.45,
  });
  const cCoolHabitat = makeClaim({
    claimId: "cl_cool_habitat",
    kind: "sourced_assertion",
    statement: "Some taxa occupy montane or subtropical habitats with a wider diurnal temperature range.",
    taxonIds: ["phalaenopsis"],
    anchors: [aHabitat],
    appraisal: { ...APPRAISAL_MODERATE, completeness: "low" },
    modelConfidence: 0.45,
  });

  // Counterevidence — preserved, not netted away.
  const cCounter = makeClaim({
    claimId: "cl_counter_plasticity",
    kind: "sourced_assertion",
    statement: "Reported intraspecific thermal plasticity means native elevation is an imperfect predictor of cultivation temperature band.",
    taxonIds: ["phalaenopsis"],
    anchors: [aCounter],
    appraisal: { ...APPRAISAL_MODERATE, directness: "low", sourceAuthority: "moderate" },
    modelConfidence: 0.5,
  });

  // Interpretation (write-back candidate) + hypothesis.
  const cInterpretation = makeClaim({
    claimId: "cl_interpretation",
    kind: "interpretation",
    statement: "Native elevation combined with habitat climate is the most practical two-signal proxy for a cool-vs-warm cultivation band in Phalaenopsis.",
    taxonIds: ["phalaenopsis"],
    modelConfidence: 0.5,
  });

  // Genuine gaps — recorded as missing, never as absence.
  const gapNightData = makeMissingClaim(
    "Species-level tolerated night-minimum measurements are unavailable for most Phalaenopsis taxa in this fixture.",
    ["phalaenopsis"],
    "cl_gap_night",
  );
  const gapCoolNight = makeMissingClaim(
    "Night-temperature tolerance evidence for the cool-growing alternative is not present (only elevation/habitat proxies).",
    ["phalaenopsis"],
    "cl_gap_cool_night",
  );

  const claims = [
    cWarmElev,
    cWarmNight,
    cWarmHabitat,
    cCoolElev,
    cCoolHabitat,
    cCounter,
    cInterpretation,
    gapNightData,
    gapCoolNight,
  ];

  const relations: EvidenceRelation[] = [
    makeRelation({ relationId: "r1", relation: "SUPPORTS", fromClaimId: cWarmElev.claimId, toRef: "alt_warm" }),
    makeRelation({ relationId: "r2", relation: "SUPPORTS", fromClaimId: cWarmNight.claimId, toRef: "alt_warm" }),
    makeRelation({ relationId: "r3", relation: "SUPPORTS", fromClaimId: cWarmHabitat.claimId, toRef: "alt_warm" }),
    makeRelation({ relationId: "r4", relation: "SUPPORTS", fromClaimId: cCoolElev.claimId, toRef: "alt_cool" }),
    makeRelation({ relationId: "r5", relation: "SUPPORTS", fromClaimId: cCoolHabitat.claimId, toRef: "alt_cool" }),
    // Counter-claim contradicts the elevation-as-predictor support — a live conflict.
    makeRelation({
      relationId: "r6",
      relation: "CONTRADICTS",
      fromClaimId: cCounter.claimId,
      toRef: cCoolElev.claimId,
      note: "Thermal plasticity weakens elevation as a standalone predictor.",
    }),
    // Interpretation is derived from the two proxy signals.
    makeRelation({ relationId: "r7", relation: "DERIVED_FROM", fromClaimId: cInterpretation.claimId, toRef: cWarmElev.claimId }),
    makeRelation({ relationId: "r8", relation: "SUPPORTS", fromClaimId: cWarmElev.claimId, toRef: cInterpretation.claimId }),
    // A qualification: the interpretation is qualified by the plasticity counter-claim.
    makeRelation({
      relationId: "r9",
      relation: "QUALIFIES",
      fromClaimId: cCounter.claimId,
      toRef: cInterpretation.claimId,
      note: "Proxy is practical but imperfect.",
    }),
  ];

  const assignments: CellAssignment[] = [
    { alternativeId: "alt_warm", criterionId: "crit_elevation", claimIds: [cWarmElev.claimId], summary: "Low elevation (0–800 m) typical." },
    { alternativeId: "alt_warm", criterionId: "crit_nighttemp", claimIds: [cWarmNight.claimId], summary: "Warm nights (~18–24°C); cold-intolerant." },
    { alternativeId: "alt_warm", criterionId: "crit_habitat", claimIds: [cWarmHabitat.claimId], summary: "Lowland tropical epiphyte." },
    { alternativeId: "alt_cool", criterionId: "crit_elevation", claimIds: [cCoolElev.claimId], summary: "Minority above ~1000 m." },
    // Deliberately left empty → a visible gap, backed by cl_gap_cool_night.
    { alternativeId: "alt_cool", criterionId: "crit_nighttemp", claimIds: [], summary: "" },
    { alternativeId: "alt_cool", criterionId: "crit_habitat", claimIds: [cCoolHabitat.claimId], summary: "Montane/subtropical, wider diurnal range." },
  ];

  return { claims, relations, anchors, assignments };
}

/* --------------------------- the run ----------------------------- */

export const PHALAENOPSIS_PLAN: ResearchPlan = {
  planId: "plan_phal_cool_warm",
  taxonomyRelease: PHALAENOPSIS_TAXONOMY_RELEASE,
  editableByUser: true,
  steps: [
    { stepId: "s1", stage: "FRAME", description: "Fix the decision frame, alternatives, and stopping rule.", dataClasses: [] },
    { stepId: "s2", stage: "PLAN", description: "Resolve taxonomic scope against the pinned release; plan retrieval.", dataClasses: ["taxonomy"] },
    { stepId: "s3", stage: "RETRIEVE", description: "Retrieve elevation/climate, trait, and literature evidence.", dataClasses: ["occurrence", "elevation", "climate", "trait", "literature"] },
    { stepId: "s4", stage: "SCREEN", description: "Apply inclusion/exclusion criteria.", dataClasses: [] },
    { stepId: "s5", stage: "EXTRACT", description: "Extract atomic claims with lawful source anchors.", dataClasses: [] },
    { stepId: "s6", stage: "SYNTHESIZE", description: "Build comparison table and provisional synthesis.", dataClasses: [] },
    { stepId: "s7", stage: "CHALLENGE", description: "Surface counterevidence, conflicts, and gaps.", dataClasses: [] },
    { stepId: "s8", stage: "VERIFY", description: "Route material claims to Check Calyx / Verification Workbench.", dataClasses: [] },
    { stepId: "s9", stage: "RENDER", description: "Render the cited decision-ready artifact.", dataClasses: [] },
    { stepId: "s10", stage: "REVIEW", description: "Stage for governed human review; nothing auto-published.", dataClasses: [] },
  ],
};

export type PhalaenopsisJourney = {
  runState: RunState;
  manifest: RunEvidenceManifest;
  uncertainty: UncertaintyAssessment;
  artifact: DecisionArtifact;
  proposal: KnowledgeGraphProposal;
  fixture: PhalaenopsisFixture;
};

/**
 * Run the whole slice deterministically. Stage executors are pure functions over
 * the fixture, so the run is reproducible and needs no network — exactly what the
 * mounted/end-to-end tests require before live connectors exist. Pass
 * `failAtStage` to simulate a provider failure and observe the truthful partial.
 */
export async function runPhalaenopsisJourney(options?: {
  runId?: string;
  createdAt?: string;
  failAtStage?: DecisionStage;
  isCancelled?: () => boolean;
  tokenBudget?: number | null;
}): Promise<PhalaenopsisJourney> {
  const runId = options?.runId ?? "run_phal_fixture_1";
  const createdAt = options?.createdAt ?? "2026-08-25T00:00:00.000Z";
  const fixture = buildPhalaenopsisFixture();

  const passthrough = (output: unknown, extra?: Partial<StageResult>): StageExecutor => {
    return ({ stage }) => {
      if (options?.failAtStage === stage) {
        return { status: "failed", output: null, degradedReason: `simulated provider failure at ${stage}`, provider: "fixture" };
      }
      return { status: "complete", output, provider: "fixture", promptVersion: "fixture-1", tokensUsed: 1, ...(extra ?? {}) };
    };
  };

  const executors: Partial<Record<DecisionStage, StageExecutor>> = {
    FRAME: passthrough(PHALAENOPSIS_FRAME),
    PLAN: passthrough(PHALAENOPSIS_PLAN, { recordCount: PHALAENOPSIS_PLAN.steps.length }),
    RETRIEVE: passthrough({ anchors: fixture.anchors }, { sourceCount: fixture.anchors.length, recordCount: fixture.anchors.length }),
    SCREEN: passthrough({ included: fixture.claims.length }),
    EXTRACT: passthrough({ claims: fixture.claims, relations: fixture.relations }, { recordCount: fixture.claims.length }),
    SYNTHESIZE: passthrough({ assignments: fixture.assignments }),
    CHALLENGE: passthrough({ ok: true }),
    VERIFY: passthrough({ routedToCheckCalyx: true }),
    RENDER: passthrough({ ok: true }),
    REVIEW: passthrough({ staged: true }),
  };

  const runState = await runDecisionPipeline({
    runId,
    executors,
    maxAttemptsPerStage: 1,
    tokenBudget: options?.tokenBudget ?? null,
    isCancelled: options?.isCancelled,
  });

  const comparison = buildComparisonTable(PHALAENOPSIS_ALTERNATIVES, PHALAENOPSIS_CRITERIA, fixture.assignments);
  const uncertainty = assessUncertainty(fixture.claims, fixture.relations);
  const synthesis = buildProvisionalSynthesis({
    conclusion:
      "Provisionally, Phalaenopsis is best treated as predominantly warm-growing, with a recognised cooler-tolerant minority distinguished chiefly by higher native elevation and montane/subtropical habitat. Night-temperature evidence is the strongest single discriminator where present but is largely missing.",
    limitations: [
      "Dataset is a curated fixture, not live governed retrieval.",
      "Night-temperature tolerance data is absent for most taxa.",
    ],
    uncertainty,
  });

  const stageTelemetry = runState.stages.map((s) => s.telemetry);
  const manifest = buildRunManifest({
    runId,
    projectId: PROJECT_ID,
    taxonomyRelease: PHALAENOPSIS_TAXONOMY_RELEASE,
    createdAt,
    frame: PHALAENOPSIS_FRAME,
    plan: PHALAENOPSIS_PLAN,
    claims: fixture.claims,
    anchors: fixture.anchors,
    stages: stageTelemetry,
    outputs: { comparison, synthesis },
    partial: runState.partial,
    resumeFrom: runState.resumeFrom,
  });

  const artifact = buildDecisionArtifact({
    artifactId: "art_phal_cool_warm",
    projectId: PROJECT_ID,
    runId,
    frame: PHALAENOPSIS_FRAME,
    synthesis,
    comparison,
    claims: fixture.claims,
  });

  const interpretation = fixture.claims.find((c) => c.claimId === "cl_interpretation")!;
  const proposal = buildKnowledgeGraphProposal({
    proposalId: "kgp_phal_cool_warm",
    projectId: PROJECT_ID,
    runId,
    claim: interpretation,
    claims: fixture.claims,
    relations: fixture.relations,
  });

  return { runState, manifest, uncertainty, artifact, proposal, fixture };
}

/** All ten stages, for callers that want to render the pipeline shell. */
export const PHALAENOPSIS_STAGES: readonly DecisionStage[] = DECISION_STAGES;
