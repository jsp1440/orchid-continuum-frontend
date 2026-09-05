/**
 * Canonical completion graph — initial census (OC-OBSERVATORY-001 / issue #281).
 *
 * This is a FIRST PASS, not a finished audit. Every node's evidence was
 * checked against current `oc-autonomous-integration` (this branch) at the
 * time of writing — real routes in src/App.tsx, real files, real PR bodies —
 * never invented. Two rules this file follows strictly:
 *
 *   1. A leaf only gets `gateScores` when it was genuinely investigated
 *      (PR body read, reachability traced from a routed page, or both).
 *      Everything else is `status: 'UNKNOWN'` with no gateScores at all, so
 *      its percentage renders as "not yet scored" rather than a fabricated
 *      number — see the `computeGateScore` contract in scoring.ts.
 *   2. Every scored leaf's `gateScores` records the *coverage* implicitly:
 *      categories left `null` were not evaluated this pass. The UI must
 *      show coverage alongside percentage so partial evidence never reads
 *      as more confident than it is.
 *
 * Sibling nodes roll up weighted by structural leaf count (see
 * computeNodePercentage in scoring.ts), not a flat per-child average — a
 * domain with one deeply-audited module and five UNKNOWN-census modules is
 * weighted by how many leaves each side actually represents, and
 * computeNodeCensusCoverage exposes what fraction of the subtree has been
 * evaluated at all so a small, well-scored slice of a large un-audited
 * domain never reads as more confident than it is.
 */

import { rollupStatus, rollupThreeLevels } from './scoring';
import type { EvidenceSnapshot } from './evidenceFreshness';
import { buildJourneyContinuityDomain } from './journeyContinuityDomain';
import type { CompletionNode, Evidence, ExecutionLane } from './types';

const CENSUS_DATE = '2026-08-22T00:00:00.000Z';

/** Evidence-check date for nodes added by the #242 audit pass (Homepage, education/show-management). */
const AUDIT_242_DATE = '2026-09-05T00:00:00.000Z';

/**
 * The integration commit this graph's evidence was checked against.
 *
 * CENSUS_DATE above says when nodes were last written. It says nothing about
 * whether they still describe the running code, which is the question an owner
 * reading a percentage is actually asking. This snapshot answers that: the
 * Observatory compares it to the commit the build was made from and refuses to
 * present the numbers as current when they cannot be confirmed.
 *
 * Update BOTH fields whenever evidence is reconciled. Leaving the SHA behind
 * makes the dashboard report drift, which is the correct and safe failure.
 */
export const COMPLETION_GRAPH_SNAPSHOT: EvidenceSnapshot = {
  reconciledAgainstSha: '5bf293397fc5203a24a70e2608ce67bb71d420b8',
  reconciledAt: '2026-09-05T00:00:00.000Z',
  scope:
    'Initial census (#281) plus the mounted-journey, Verification Workbench, Classroom and legacy-salvage work landed through this commit, plus the #242 audit pass decomposing Homepage/Featured Genus/Public Calyx and the previously-uncensused Calyx education & show-management surfaces. Not every domain has been re-scored — census coverage is reported alongside each percentage.',
};

let autoId = 0;
function nextId(prefix: string): string {
  autoId += 1;
  return `${prefix}-${autoId}`;
}

/** A capability/module identified by name but not yet decomposed or scored this pass. */
function censusPending(opts: {
  parentId: string;
  name: string;
  evidence: Evidence[];
  nextAction: string;
  lane?: ExecutionLane;
  idHint: string;
}): CompletionNode {
  return {
    id: nextId(opts.idHint),
    parentId: opts.parentId,
    name: opts.name,
    type: 'capability',
    status: 'UNKNOWN',
    threeLevels: { codeComplete: 'UNKNOWN', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' },
    lane: opts.lane,
    evidence: opts.evidence,
    nextAction: opts.nextAction,
    lastUpdated: CENSUS_DATE,
    children: [],
  };
}

/** A capability/module confirmed absent by direct evidence (e.g. a route that renders a stub page). */
function confirmedMissing(opts: {
  parentId: string;
  name: string;
  evidence: Evidence[];
  nextAction: string;
  lane?: ExecutionLane;
  idHint: string;
}): CompletionNode {
  return {
    id: nextId(opts.idHint),
    parentId: opts.parentId,
    name: opts.name,
    type: 'capability',
    status: 'MISSING',
    threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    lane: opts.lane,
    gateScores: {
      architectureContracts: null,
      implementationPresent: 0,
      integrationCanonicalBranch: null,
      scientificProvenanceSecurity: null,
      browserEndToEnd: null,
      deployedOperational: null,
    },
    evidence: opts.evidence,
    nextAction: opts.nextAction,
    lastUpdated: CENSUS_DATE,
    children: [],
  };
}

function branch(opts: {
  id: string;
  parentId: string | null;
  name: string;
  type: CompletionNode['type'];
  nextAction: string;
  evidence?: Evidence[];
  lane?: ExecutionLane;
}, children: CompletionNode[]): CompletionNode {
  const draft: CompletionNode = {
    id: opts.id,
    parentId: opts.parentId,
    name: opts.name,
    type: opts.type,
    status: 'UNKNOWN',
    threeLevels: { codeComplete: 'UNKNOWN', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' },
    lane: opts.lane,
    evidence: opts.evidence ?? [],
    nextAction: opts.nextAction,
    lastUpdated: CENSUS_DATE,
    children,
  };
  draft.status = rollupStatus(draft);
  draft.threeLevels = rollupThreeLevels(children);
  return draft;
}

// ─── Species Dossier / Federation ──────────────────────────────────────────
// Real evidence: PR #293 (merged 2026-08-22 onto oc-autonomous-integration),
// src/pages/SpeciesDossier.tsx, src/lib/speciesDossier.ts, route /species/:slug.

const speciesDossierEvidenceGate: CompletionNode = {
  id: 'gate-species-dossier-evidence-receipts',
  parentId: 'cap-species-dossier-evidence-rendering',
  name: 'Evidence receipts render on /species/:slug with honest fallbacks',
  type: 'acceptance_gate',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: 0,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#293', note: 'Merged 2026-08-22T06:18:32Z onto oc-autonomous-integration; 753/753 tests, typecheck/lint/build clean.' },
    { kind: 'file', ref: 'src/pages/SpeciesDossier.tsx' },
    { kind: 'file', ref: 'src/lib/speciesDossier.ts' },
    { kind: 'test', ref: 'src/pages/SpeciesDossier.test.tsx' },
    { kind: 'route', ref: '/species/:slug' },
  ],
  prs: ['#293'],
  nextAction: 'Run a live browser smoke test against a real Calyx backend to confirm evidence_state/confidence/license render with real (non-test) data, then fold Conservation/Native-range fields onto dossier-sourced receipts (explicitly deferred in #293).',
  lastAccomplishment: '#293 wired fetchSpeciesDossier into the live route with anti-fabrication fallbacks ("confidence not supplied" instead of coercing to 0) and full test coverage.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const speciesDossierDomain = branch({
  id: 'domain-species-dossier',
  parentId: 'portfolio-orchid-continuum',
  name: 'Species Dossier / Federation',
  type: 'domain',
  nextAction: 'Audit resolveFederatedSpecies real-vs-fixture behavior; decompose remaining dossier sections beyond evidence-receipt rendering.',
}, [
  branch({
    id: 'module-species-dossier-core',
    parentId: 'domain-species-dossier',
    name: 'Species Dossier core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    branch({
      id: 'cap-species-dossier-evidence-rendering',
      parentId: 'module-species-dossier-core',
      name: 'Evidence dossier rendering',
      type: 'capability',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
      nextAction: 'See acceptance gate.',
    }, [speciesDossierEvidenceGate]),
    censusPending({
      idHint: 'cap-species-dossier-federation',
      parentId: 'module-species-dossier-core',
      name: 'Federated species resolution (resolveFederatedSpecies)',
      evidence: [{ kind: 'file', ref: 'src/lib/speciesDossier.ts', note: 'Function present; explicitly out of scope for #293 ("not touched, scoped separately"). Not exercised or audited this pass.' }],
      nextAction: 'Audit resolveFederatedSpecies for real-vs-fixture data sourcing and add an acceptance gate.',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
    }),
  ]),
]);

// ─── Atlas / Living Atlas / guided tours ───────────────────────────────────
// Real evidence: PR #278 (merged, promoted to main), routes /atlas, /atlas-next,
// /atlas/ecuador, /atlas/:species in src/App.tsx.

const atlasResearchHandoffGate: CompletionNode = {
  id: 'gate-atlas-research-handoff',
  parentId: 'int-atlas-research-handoff',
  name: 'Atlas Next -> Research Station handoff is wired on both sides through the shared contract',
  type: 'acceptance_gate',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: 0,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#278', note: 'Merged and promoted to main (commit 857786e supersedes the #278 merge commit 34ae1b9).' },
    { kind: 'file', ref: 'src/features/atlas-next/AtlasNextShell.tsx' },
    { kind: 'file', ref: 'src/pages/ResearchCenter.tsx' },
    { kind: 'test', ref: 'src/features/atlas-next/researchWiring.test.ts' },
    { kind: 'commit', ref: '857786e', note: 'Promote oc-autonomous-integration to main — includes #278.' },
  ],
  prs: ['#278', '#272'],
  nextAction: 'Run a live browser check: select an Atlas Next point, follow "Continue in Research Station", confirm the banner and genus context render from a real (non-null) genus end to end.',
  lastAccomplishment: '#278 replaced two divergent inline re-derivations of the handoff rule with one shared, fail-closed contract (SAFE_GENUS-validated genus, no occurrence/coordinate/locality data crosses the boundary).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const atlasDomain = branch({
  id: 'domain-atlas',
  parentId: 'portfolio-orchid-continuum',
  name: 'Atlas / Living Atlas / guided tours',
  type: 'domain',
  nextAction: 'Run a full capability-by-capability audit of the remaining Atlas layers listed below.',
}, [
  branch({
    id: 'module-atlas-core',
    parentId: 'domain-atlas',
    name: 'Atlas core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    censusPending({
      idHint: 'cap-atlas-occurrence-retrieval',
      parentId: 'module-atlas-core',
      name: 'Occurrence retrieval & core map',
      evidence: [
        { kind: 'route', ref: '/atlas' },
        { kind: 'route', ref: '/atlas/:species' },
        { kind: 'file', ref: 'src/pages/Atlas.tsx' },
        { kind: 'file', ref: 'src/lib/atlasLocalitySafety.ts' },
        { kind: 'test', ref: 'src/lib/atlasLocalitySafety.test.ts' },
      ],
      nextAction: 'Score architecture/implementation/integration/provenance/browser/deploy gates against real GBIF-backed data.',
      lane: 'PRODUCT_COMPLETION',
    }),
    censusPending({
      idHint: 'cap-atlas-locality-governance',
      parentId: 'module-atlas-core',
      name: 'Locality governance, elevation, temporal/phenology, habitat/climate layers',
      evidence: [
        { kind: 'file', ref: 'src/lib/atlasLocalitySafety.publicProjection.test.ts' },
        { kind: 'route', ref: '/habitats' },
        { kind: 'route', ref: '/climate' },
      ],
      nextAction: 'Confirm sensitive-locality redaction rules and habitat/climate layer data sourcing (real vs fixture) with dedicated acceptance gates.',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
    }),
    censusPending({
      idHint: 'cap-atlas-conservation-pollinator-layers',
      parentId: 'module-atlas-core',
      name: 'Conservation & pollinator/mycorrhiza layers',
      evidence: [
        { kind: 'route', ref: '/conservation' },
        { kind: 'route', ref: '/pollinators' },
        { kind: 'route', ref: '/mycorrhizae' },
      ],
      nextAction: 'Audit whether these layers surface inside the Atlas map itself vs. only as standalone routes, per the mission\'s "Atlas is not one bar" decomposition.',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
    }),
  ]),
  branch({
    id: 'module-atlas-next',
    parentId: 'domain-atlas',
    name: 'Living Atlas Next (candidate)',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    censusPending({
      idHint: 'cap-atlas-next-thematic',
      parentId: 'module-atlas-next',
      name: 'Public thematic Atlas / advanced research Atlas',
      evidence: [
        { kind: 'route', ref: '/atlas-next' },
        { kind: 'file', ref: 'src/features/atlas-next/useAtlasData.publicErrors.test.ts' },
      ],
      nextAction: 'Score real-vs-fixture data coverage and public/research mode separation.',
      lane: 'PRODUCT_COMPLETION',
    }),
    censusPending({
      idHint: 'cap-atlas-guided-tours',
      parentId: 'module-atlas-next',
      name: 'Guided expedition tours',
      evidence: [
        { kind: 'route', ref: '/atlas/ecuador' },
        { kind: 'file', ref: 'src/pages/EcuadorExpedition.tsx' },
      ],
      nextAction: 'Confirm tour content is real expedition data, not placeholder copy, and add an acceptance gate.',
      lane: 'PRODUCT_COMPLETION',
    }),
    branch({
      id: 'int-atlas-research-handoff',
      parentId: 'module-atlas-next',
      name: 'Continuity handoffs (Atlas Next -> Research Station)',
      type: 'integration',
      lane: 'INTEGRATION_COMPLETION',
      nextAction: 'See acceptance gate.',
    }, [atlasResearchHandoffGate]),
  ]),
]);

// ─── Literature / evidence ──────────────────────────────────────────────────
// Real evidence: route /literature renders <ComingSoon/> (confirmed missing at
// product level); src/lib/scientific-intelligence/literature/adapter.ts exists
// and is consumed only by Mission Control's own scoring, not by any user route.

const literaturePublicBrowser = confirmedMissing({
  idHint: 'cap-literature-public-browser',
  parentId: 'module-literature-core',
  name: 'Public literature/evidence browser',
  evidence: [
    { kind: 'route', ref: '/literature', note: 'Routes to <ComingSoon/> in src/App.tsx — confirmed placeholder, not a real browser.' },
    { kind: 'file', ref: 'src/pages/ComingSoon.tsx' },
  ],
  nextAction: 'Build the actual literature discovery/browse UI described in the mission spec (discovery, ingestion status, dedupe, bibliographic identity, full text, extraction, taxon linking, citations/source anchors, conflicts/review, corpus coverage).',
  lane: 'PRODUCT_COMPLETION',
});

const literatureIntelligenceAdapter: CompletionNode = {
  id: 'cap-literature-intelligence-adapter',
  parentId: 'module-literature-core',
  name: 'Literature scientific-intelligence adapter (internal, Mission Control only)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 0,
    scientificProvenanceSecurity: null,
    browserEndToEnd: 0,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/scientific-intelligence/literature/adapter.ts' },
    { kind: 'test', ref: 'src/lib/scientific-intelligence/literature/adapter.test.ts' },
    { kind: 'file', ref: 'src/lib/mission-control/intelligentMissionControl.ts', note: 'Only consumer found via grep — feeds Mission Control scoring, not exposed to any user-facing route or the Knowledge Graph.' },
  ],
  nextAction: 'Decide whether this adapter should feed the public literature browser and KG integration described in the mission spec, or remains Mission-Control-internal telemetry; wire accordingly.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const literatureDomain = branch({
  id: 'domain-literature',
  parentId: 'portfolio-orchid-continuum',
  name: 'Literature / evidence',
  type: 'domain',
  nextAction: 'Build the public browser (confirmed missing) and decide the adapter\'s downstream integration.',
}, [
  branch({
    id: 'module-literature-core',
    parentId: 'domain-literature',
    name: 'Literature core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [literaturePublicBrowser, literatureIntelligenceAdapter]),
]);

// ─── Matrix Identification ──────────────────────────────────────────────────
// Real evidence: /orchid-identification routes to OrchidIdentificationNext.tsx,
// which imports MatrixMorphologyViewer, MatrixVisionReviewPanel (which in turn
// renders MatrixReportPanel) and MatrixLexiconGuide — traced by grep, all four
// are reachable from a routed page, not orphaned.

const matrixMorphologyGate: CompletionNode = {
  id: 'cap-matrix-morphology-viewer',
  parentId: 'module-matrix-core',
  name: 'Character/state morphology viewer',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/orchid-identification' },
    { kind: 'file', ref: 'src/pages/OrchidIdentificationNext.tsx' },
    { kind: 'file', ref: 'src/components/matrix/MatrixMorphologyViewer.tsx' },
    { kind: 'file', ref: 'src/lib/matrixIdentification.ts' },
    { kind: 'test', ref: 'src/components/matrix/MatrixMorphologyViewer.test.tsx' },
    { kind: 'test', ref: 'src/lib/matrixIdentification.test.ts' },
  ],
  nextAction: 'Verify scoring-vs-coverage, uncertainty, and next-best-observation logic against real specimen data with a live/browser pass (only architecture + implementation + reachability were confirmed this pass — 3 of 6 gate categories, ~60% weight coverage).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const matrixReportLexiconGate: CompletionNode = {
  id: 'cap-matrix-report-lexicon',
  parentId: 'module-matrix-core',
  name: 'Vision review, report generation & Lexicon/Calyx glossary explanation',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/components/matrix/MatrixVisionReviewPanel.tsx' },
    { kind: 'file', ref: 'src/components/matrix/MatrixReportPanel.tsx', note: 'Reachable via MatrixVisionReviewPanel -> OrchidIdentificationNext, not orphaned.' },
    { kind: 'file', ref: 'src/components/matrix/MatrixLexiconGuide.tsx' },
    { kind: 'file', ref: 'src/lib/matrixReports.ts' },
    { kind: 'file', ref: 'src/lib/matrixLexicon.ts' },
    { kind: 'test', ref: 'src/lib/matrixReports.test.ts' },
    { kind: 'test', ref: 'src/lib/matrixLexicon.test.ts' },
  ],
  nextAction: 'Confirm evidence-trail/comparison views and glossary explanations use real Calyx responses, then run a browser pass (3 of 6 gate categories evaluated, ~60% weight coverage).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const matrixDomain = branch({
  id: 'domain-matrix',
  parentId: 'portfolio-orchid-continuum',
  name: 'Matrix Identification',
  type: 'domain',
  nextAction: 'Complete scientific/provenance and browser/e2e gates for the two scored capabilities; audit registry review and registry readiness separately.',
}, [
  branch({
    id: 'module-matrix-core',
    parentId: 'domain-matrix',
    name: 'Matrix Identification core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    matrixMorphologyGate,
    matrixReportLexiconGate,
    censusPending({
      idHint: 'cap-matrix-registry-review',
      parentId: 'module-matrix-core',
      name: 'Matrix registry review & readiness',
      evidence: [
        { kind: 'route', ref: '/mission-control/matrix-registry-review' },
        { kind: 'file', ref: 'src/pages/MatrixRegistryConceptReview.tsx' },
        { kind: 'file', ref: 'src/lib/matrixRegistryReview.ts' },
        { kind: 'file', ref: 'src/lib/matrixRegistryReadiness.ts' },
      ],
      nextAction: 'Audit whether reviewed registry versions are actually derived deterministically from canonical concept mappings, per the route\'s own stated purpose.',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
    }),
  ]),
]);

// ─── University / Applied AI & Data Science ────────────────────────────────
// Real evidence: routes /university, /university/lab, /university/applied-ai-data-science,
// /university/review; universityApi.ts / appliedAiDataScience.ts consumed by all four pages.

const universityCoreGate: CompletionNode = {
  id: 'cap-university-curriculum-core',
  parentId: 'module-university-core',
  name: 'Curriculum/modules, lab prototype & reviewer workspace',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/university' },
    { kind: 'route', ref: '/university/lab' },
    { kind: 'route', ref: '/university/review' },
    { kind: 'file', ref: 'src/pages/OrchidUniversity.tsx' },
    { kind: 'file', ref: 'src/pages/UniversityLabPrototype.tsx' },
    { kind: 'file', ref: 'src/pages/UniversityReviewerWorkspace.tsx' },
    { kind: 'file', ref: 'src/lib/universityApi.ts' },
    { kind: 'test', ref: 'src/lib/universityApi.test.ts' },
    { kind: 'file', ref: 'scripts/verify-university-production.mjs', note: 'Dedicated production-verification script exists — see Release/Acceptance domain.' },
  ],
  nextAction: 'Run `npm run verify:university-production` against a live deployment and record its result as browser/deployed evidence (not yet executed this pass).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const universityAppliedAiGate: CompletionNode = {
  id: 'cap-university-applied-ai',
  parentId: 'module-university-core',
  name: 'Applied AI & Data Science lab (Statistics/EDA, Calyx tutor)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/university/applied-ai-data-science' },
    { kind: 'file', ref: 'src/pages/AppliedAIDataScienceLab.tsx' },
    { kind: 'file', ref: 'src/lib/appliedAiDataScience.ts' },
    { kind: 'test', ref: 'src/lib/appliedAiDataScience.test.ts' },
  ],
  nextAction: 'Confirm deterministic replay and assessment scoring against real learner sessions with a live/browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const universityDomain = branch({
  id: 'domain-university',
  parentId: 'portfolio-orchid-continuum',
  name: 'University / Applied AI & Data Science',
  type: 'domain',
  nextAction: 'Execute the existing verify:university-production script and record results; audit Research Station continuation handoff.',
}, [
  branch({
    id: 'module-university-core',
    parentId: 'domain-university',
    name: 'University core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    universityCoreGate,
    universityAppliedAiGate,
    censusPending({
      idHint: 'cap-university-research-continuation',
      parentId: 'module-university-core',
      name: 'Research Station continuation handoff',
      evidence: [{ kind: 'file', ref: 'src/pages/UniversityReviewerWorkspace.tsx', note: 'Not yet traced for a University -> Research Station handoff path this pass.' }],
      nextAction: 'Confirm whether a University -> Research Station continuity handoff exists and, if so, apply the same contract-based pattern as the Atlas -> Research handoff (#278).',
      lane: 'INTEGRATION_COMPLETION',
    }),
  ]),
]);

// ─── Autonomous completion control plane ───────────────────────────────────
// Real evidence: this engine itself. src/lib/completion-graph/{types,scoring,
// graphOps,completionGraphData}.ts, src/components/mission-control/
// CompletionObservatory.tsx mounted inside src/pages/MissionControl.tsx at the
// "Completion Observatory" panel (grep-confirmed, not orphaned), current HEAD
// c8238e778cf5cd4b29710102de5f162feddbd500 (PR #298, merged).

const completionGraphEngineGate: CompletionNode = {
  id: 'cap-completion-graph-engine',
  parentId: 'module-autonomous-control-plane-core',
  name: 'Recursive completion graph engine + Mission Control observatory panel',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: 0,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#298', note: 'Merged onto oc-autonomous-integration as commit c8238e7.' },
    { kind: 'commit', ref: 'c8238e778cf5cd4b29710102de5f162feddbd500', note: 'Current oc-autonomous-integration HEAD at census time; includes #298.' },
    { kind: 'file', ref: 'src/lib/completion-graph/types.ts' },
    { kind: 'file', ref: 'src/lib/completion-graph/scoring.ts' },
    { kind: 'file', ref: 'src/lib/completion-graph/graphOps.ts' },
    { kind: 'file', ref: 'src/lib/completion-graph/completionGraphData.ts' },
    { kind: 'file', ref: 'src/components/mission-control/CompletionObservatory.tsx' },
    { kind: 'file', ref: 'src/pages/MissionControl.tsx', note: 'CompletionObservatory mounted at the "Completion Observatory" panel, grep-confirmed reachable, not orphaned.' },
    { kind: 'test', ref: 'src/lib/completion-graph/scoring.test.ts' },
    { kind: 'test', ref: 'src/lib/completion-graph/graphOps.test.ts' },
    { kind: 'test', ref: 'src/lib/completion-graph/completionGraphData.test.ts' },
    { kind: 'test', ref: 'src/components/mission-control/CompletionObservatory.render.test.tsx' },
    { kind: 'route', ref: '/mission-control' },
  ],
  prs: ['#298'],
  nextAction: 'Open Mission Control in a real browser session and confirm the Completion Observatory panel renders live (not just under jsdom) before claiming browser-end-to-end.',
  lastAccomplishment: 'This engine is the first implementation of OC-OBSERVATORY-001 itself: a recursive Portfolio->Domain->Module->Capability->Integration->Acceptance Gate graph, weighted rollup + census-coverage scoring, and a drill-down UI wired into the real Mission Control page.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const schedulerIssueAutomationGap = confirmedMissing({
  idHint: 'cap-scheduler-issue-automation',
  parentId: 'module-autonomous-control-plane-core',
  name: 'Scheduler output wired to real GitHub issue creation/queueing',
  evidence: [
    { kind: 'file', ref: 'src/lib/completion-graph/graphOps.ts', note: 'selectNextUnmetGate() is exported and grep-confirmed to have exactly one consumer: CompletionObservatory.tsx\'s own UI render. No caller files an issue, queues work, or otherwise acts on its output.' },
  ],
  nextAction: 'Wire selectNextUnmetGate() output into the autonomous scheduler\'s issue creation/queueing path so "choose next unmet gate -> bounded issue" is a real automated loop, not just a UI display.',
  lane: 'INTEGRATION_COMPLETION',
});

const autonomousControlPlaneDomain = branch({
  id: 'domain-autonomous-control-plane',
  parentId: 'portfolio-orchid-continuum',
  name: 'Autonomous completion control plane',
  type: 'domain',
  nextAction: 'Capture a real browser session of Mission Control rendering this panel, then wire the scheduler\'s selectNextUnmetGate() output to actual issue creation.',
}, [
  branch({
    id: 'module-autonomous-control-plane-core',
    parentId: 'domain-autonomous-control-plane',
    name: 'Completion control plane core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [completionGraphEngineGate, schedulerIssueAutomationGap]),
]);

// ─── Production/deployment/release operations ──────────────────────────────
// Real evidence: both verification scripts were actually executed this pass
// against current HEAD (not merely confirmed to exist).

const deploymentContractGate: CompletionNode = {
  id: 'cap-deployment-contract-validation',
  parentId: 'module-production-release-core',
  name: 'Deployment contract validation (critical client routes + SPA fallback)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
  lane: 'RELEASE_ACCEPTANCE',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: 0,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'scripts/verify-deployment-contract.mjs' },
    { kind: 'commit', ref: 'c8238e778cf5cd4b29710102de5f162feddbd500', note: 'Executed via `npm run validate:deployment` against this exact HEAD.' },
    { kind: 'ci', ref: 'npm run validate:deployment', note: 'Local execution output: "Deployment contract valid. Verified 5 critical client routes and two SPA fallback mechanisms." Exit code 0. This is a static-file contract check (App.tsx routes, public/_redirects, vercel.json), not a live deployment probe.' },
  ],
  nextAction: 'This checks local contract files only — still needs a real browser/live pass against the actual deployed origin to confirm the routes resolve correctly in production, not just that the config declares them.',
  lastAccomplishment: 'Ran `npm run validate:deployment` against current HEAD this pass: passed cleanly, confirming /university, /university/lab, /conservatory/*, /mission-control, /calyx are all declared routes with a working SPA fallback in both public/_redirects and vercel.json.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const universityProductionLiveVerification: CompletionNode = {
  id: 'cap-university-production-live-verification',
  parentId: 'module-production-release-core',
  name: 'University live-production verification (verify-university-production.mjs)',
  type: 'capability',
  status: 'OWNER_ACTION',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'UNKNOWN', productComplete: 'NOT_MET' },
  lane: 'RELEASE_ACCEPTANCE',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: null,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'scripts/verify-university-production.mjs', note: 'Real script: fetches a live frontend origin\'s /university/lab route, asserts an attested full Git-SHA meta tag, and cross-checks a live API origin.' },
    { kind: 'ci', ref: 'npm run verify:university-production', note: 'Executed this pass with no arguments: "FAIL: frontend URL is required", exit code 1. The script takes the production frontend/API origins as positional CLI arguments; no canonical production URL is documented anywhere in this repository (README, docs/, vercel.json, package.json) for an autonomous run to supply.' },
  ],
  ownerActions: ['Provide the canonical deployed production frontend_origin and api_origin (or wire them as CI secrets/args in a scheduled workflow) so verify-university-production.mjs can run to completion and this gate can move off OWNER_ACTION.'],
  nextAction: 'Once the owner supplies (or CI is wired with) the real production origins, run `npm run verify:university-production -- <frontendUrl> <apiUrl>` and record the resulting evidence JSON.',
  lastAccomplishment: 'Confirmed this pass that the script itself is real and executable — it fails for the correct, honest reason (no target configured), not because it is missing or broken.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const productionReleaseDomain = branch({
  id: 'domain-production-release',
  parentId: 'portfolio-orchid-continuum',
  name: 'Production/deployment/release operations',
  type: 'domain',
  nextAction: 'Owner: supply canonical production origins so the university live-verification gate can run; otherwise this domain is at its evidence ceiling for an unattended autonomous pass.',
}, [
  branch({
    id: 'module-production-release-core',
    parentId: 'domain-production-release',
    name: 'Release verification core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [deploymentContractGate, universityProductionLiveVerification]),
]);

// ─── Orchid Buying Companion ────────────────────────────────────────────────
// Real evidence: grep -ri "buying.companion|BuyingCompanion" across src/ this
// pass returns nothing — no route, page, or component. Recorded as confirmed
// MISSING (not census-pending) because absence was directly verified, not
// assumed from silence.

const buyingCompanionDomain = branch({
  id: 'domain-buying-companion',
  parentId: 'portfolio-orchid-continuum',
  name: 'Orchid Buying Companion',
  type: 'domain',
  nextAction: 'Confirm with the owner whether this module has a canonical name elsewhere in the Brain before building — no matching code exists in this repository.',
}, [
  branch({
    id: 'module-buying-companion-core',
    parentId: 'domain-buying-companion',
    name: 'Orchid Buying Companion core',
    type: 'module',
    nextAction: 'See child capability.',
  }, [
    confirmedMissing({
      idHint: 'cap-buying-companion',
      parentId: 'module-buying-companion-core',
      name: 'Orchid Buying Companion (any form)',
      evidence: [
        { kind: 'file', ref: 'src/App.tsx', note: 'Route table grepped for "buying" and "companion" — no match.' },
        { kind: 'file', ref: 'src/pages/', note: 'grep -ri "buying.companion|BuyingCompanion" across src/ this pass returns zero files.' },
      ],
      nextAction: 'Owner: confirm intended scope/name for this module before any implementation begins — building against an unconfirmed name would risk an overlapping lineage.',
      lane: 'PRODUCT_COMPLETION',
    }),
  ]),
]);

// ─── Vision / image intelligence ───────────────────────────────────────────
// Real evidence: two independently-wired vision surfaces confirmed this pass —
// the Matrix vision-review activation preflight, and the Mission Control
// scientific-intelligence vision adapter. Neither has scientific/provenance,
// browser, or deployment evidence gathered yet.

const visionMatrixReviewGate: CompletionNode = {
  id: 'cap-vision-matrix-activation-preflight',
  parentId: 'module-vision-core',
  name: 'Vision activation preflight & Matrix vision review panel',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/visionActivationPreflight.ts', note: 'Real fetch against /api/vision-lexicon/activation-preflight with a typed blocker/activation-order contract, not a stub.' },
    { kind: 'file', ref: 'src/components/matrix/VisionActivationPreflightCard.tsx' },
    { kind: 'file', ref: 'src/components/matrix/MatrixVisionReviewPanel.tsx' },
    { kind: 'file', ref: 'src/pages/OrchidIdentificationNext.tsx', note: 'Confirmed reachable: OrchidIdentificationNext renders MatrixVisionReviewPanel, not orphaned.' },
    { kind: 'route', ref: '/orchid-identification' },
  ],
  nextAction: 'Run against a live backend to confirm real (non-blocked) activation state and record a browser pass; only architecture + implementation + reachability were confirmed this pass (3 of 6 gate categories, ~60% weight coverage).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const visionIntelligenceAdapterGate: CompletionNode = {
  id: 'cap-vision-intelligence-adapter',
  parentId: 'module-vision-core',
  name: 'Vision Lab scientific-intelligence adapter (Mission Control)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/scientific-intelligence/vision/adapter.ts', note: 'Real probe against IMAGES_BACKEND_BASE_URL/images/genus with an explicit anti-fabrication fallback contract (unavailable != zero).' },
    { kind: 'file', ref: 'src/lib/mission-control/intelligentMissionControl.ts', note: 'Confirmed consumer: imports VisionIntelligence and folds it into the Mission Control subsystem bundle under the "vision"/"image" subsystem match.' },
  ],
  nextAction: 'Confirm the adapter reads real, non-fallback totals against a live Images backend, then add a browser pass (3 of 6 gate categories evaluated, ~60% weight coverage).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const visionDomain = branch({
  id: 'domain-vision',
  parentId: 'portfolio-orchid-continuum',
  name: 'Vision / image intelligence',
  type: 'domain',
  nextAction: 'Complete scientific/provenance and browser/e2e gates for both scored capabilities.',
}, [
  branch({
    id: 'module-vision-core',
    parentId: 'domain-vision',
    name: 'Vision / image intelligence core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [visionMatrixReviewGate, visionIntelligenceAdapterGate]),
]);

// ─── Security / partner-data governance ────────────────────────────────────
// Real evidence: sensitive-locality redaction was traced this pass beyond
// Atlas alone — atlasLocalitySafety.ts is also consumed by atlas-next's own
// sensitivity.ts/atlasContext.ts and by researchStationNavigation.ts (the
// already-scored Atlas -> Research handoff), and the three domains that
// receive genus-level handoffs from Atlas (Species Dossier, Conservation,
// Research Station) were directly grepped this pass and confirmed to carry
// no raw latitude/longitude/locality fields into their own rendering — so
// this is a traced finding, not an assumption that silence means safety.
// Auth gating (ProtectedRoute) and partner-data disclosure (partners.ts,
// all "pending"/"proposed" placeholders, no real partner records) were
// spot-checked but not exhaustively audited this pass.

const localitySafetyCrossCuttingGate: CompletionNode = {
  id: 'cap-locality-safety-cross-cutting',
  parentId: 'module-security-governance-core',
  name: 'Sensitive-locality redaction as a cross-cutting policy',
  type: 'acceptance_gate',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'UNKNOWN' },
  lane: 'RELEASE_ACCEPTANCE',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: null,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/atlasLocalitySafety.ts' },
    { kind: 'file', ref: 'src/pages/Atlas.tsx' },
    { kind: 'file', ref: 'src/components/atlas/LiveAtlasMap.tsx' },
    { kind: 'file', ref: 'src/lib/researchStationNavigation.ts', note: 'Consumes atlasLocalitySafety; matches the already-scored Atlas -> Research handoff (gate-atlas-research-handoff).' },
    { kind: 'file', ref: 'src/features/atlas-next/sensitivity.ts' },
    { kind: 'file', ref: 'src/features/atlas-next/atlasContext.ts' },
    { kind: 'file', ref: 'src/pages/ConservationHub.tsx', note: 'Grepped for latitude/longitude/locality/coordinates: none found; the page explicitly states coordinates and locality "remain in Atlas".' },
    { kind: 'file', ref: 'src/pages/SpeciesDossier.tsx', note: 'AtlasPoint/AtlasLayer types declare lat/lng in src/lib/speciesDossier.ts, but grepping the dossier page itself for latitude/longitude/locality returns no matches — those types are consumed only by Atlas map components, not rendered on the dossier.' },
  ],
  nextAction: 'Extend the same direct grep-for-raw-coordinates check to Matrix, Conservatory/OASIS, and University before calling this policy fully cross-cutting; only Atlas, Atlas Next, Research Station, Conservation, and Species Dossier were traced this pass.',
  lastAccomplishment: 'Traced locality-safety consumption beyond the original Atlas-only assumption and confirmed three downstream consumers (Conservation, Species Dossier, Research handoff) do not leak raw coordinates.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const securityGovernanceDomain = branch({
  id: 'domain-security-governance',
  parentId: 'portfolio-orchid-continuum',
  name: 'Security / partner-data governance',
  type: 'domain',
  nextAction: 'Complete the locality-safety cross-cutting trace for Matrix/Conservatory/University; audit ProtectedRoute coverage and partner-data disclosure as separate capabilities.',
}, [
  branch({
    id: 'module-security-governance-core',
    parentId: 'domain-security-governance',
    name: 'Cross-cutting security & governance policies',
    type: 'module',
    nextAction: 'See child acceptance gate; add auth-gating and partner-data-disclosure capabilities next pass.',
  }, [
    localitySafetyCrossCuttingGate,
    censusPending({
      idHint: 'cap-auth-gating-coverage',
      parentId: 'module-security-governance-core',
      name: 'Authenticated-area gating coverage (ProtectedRoute)',
      evidence: [
        { kind: 'file', ref: 'src/components/auth/ProtectedRoute.tsx' },
        { kind: 'file', ref: 'src/components/conservatory/ConservatoryReadiness.tsx', note: 'One of several confirmed ProtectedRoute-adjacent consumers found this pass; full route audit not yet performed.' },
      ],
      nextAction: 'Enumerate every route in src/App.tsx that should require authentication and confirm each is actually wrapped in ProtectedRoute.',
      lane: 'RELEASE_ACCEPTANCE',
    }),
    censusPending({
      idHint: 'cap-partner-data-disclosure',
      parentId: 'module-security-governance-core',
      name: 'Partner-data disclosure boundaries',
      evidence: [
        { kind: 'file', ref: 'src/data/partners.ts', note: 'Spot-checked this pass: entries are explicitly "proposed"/"pending"/"component" placeholders, not disclosed real partner records — but the file was not audited exhaustively.' },
      ],
      nextAction: 'Confirm no real partner PII/agreement terms are hardcoded anywhere in src/, and that any future real partner data is server-sourced, not committed to the frontend.',
      lane: 'RELEASE_ACCEPTANCE',
    }),
  ]),
]);

// ─── Calyx reasoning + Verification Workbench ──────────────────────────────
// Real evidence traced this pass: /speak-with-calyx -> CalyxWorkspace.tsx ->
// ScientificSynthesis.tsx -> CalyxVerificationWorkbench.tsx ->
// checkCalyxMissionClaim() in calyxVerification.ts (confirmed reachable by
// grep, not orphaned). Separately, /calyx-science and
// /mission-control/science both route to CalyxScienceStatus.tsx, which is
// owner-session-gated (createOwnerSession/validateOwnerSession) and fails
// closed on a non-OK HTTP response from any of its eight /api/science/*
// calls (readJson throws, no fabricated fallback data).

const calyxConversationalReasoningGate: CompletionNode = {
  id: 'cap-calyx-conversational-reasoning',
  parentId: 'module-calyx-verification-core',
  name: 'Calyx conversational reasoning (Speak with Calyx)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/speak-with-calyx' },
    { kind: 'file', ref: 'src/pages/CalyxWorkspace.tsx' },
    { kind: 'file', ref: 'src/lib/calyxConversation.ts' },
    { kind: 'file', ref: 'src/lib/calyxService.ts', note: 'askCalyx() posts to the real /api/calyx/speak/conversations endpoint, not a client-side mock.' },
    { kind: 'test', ref: 'src/lib/calyxConversation.test.ts' },
    { kind: 'test', ref: 'src/lib/calyxService.test.ts' },
    { kind: 'test', ref: 'src/lib/calyxService.questionContext.test.ts' },
    { kind: 'test', ref: 'src/lib/calyxConversation.headerCollision.test.ts' },
  ],
  nextAction: 'Confirm speech input/output and document-upload workspace paths against a live backend, then run a browser pass (3 of 6 gate categories evaluated, ~60% weight coverage).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const calyxVerificationWorkbenchGate: CompletionNode = {
  id: 'cap-calyx-verification-workbench',
  parentId: 'module-calyx-verification-core',
  name: 'Verification Workbench (checkCalyxMissionClaim)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/components/calyx/ScientificSynthesis.tsx', note: 'Renders CalyxVerificationWorkbench from CalyxWorkspace -- confirmed reachable from /speak-with-calyx, not orphaned.' },
    { kind: 'file', ref: 'src/components/calyx/CalyxVerificationWorkbench.tsx' },
    { kind: 'file', ref: 'src/lib/calyxVerification.ts', note: 'checkCalyxMissionClaim() structurally checks sourceRevisionId, anchorIds, locator, excerpt, and content hash per evidence item and fails/needs_review closed when any are absent -- genuine provenance enforcement, not a cosmetic pass-through.' },
    { kind: 'test', ref: 'src/lib/calyxVerification.test.ts' },
    { kind: 'test', ref: 'src/components/calyx/ScientificSynthesis.test.tsx' },
    { kind: 'test', ref: 'src/lib/naoccGovernedVerificationContinuity.test.ts', note: 'Cross-checks checkCalyxMissionClaim against buildCalyxTurnContext and researchStationCalyxHref together, confirming Research identity stays non-evidentiary while Calyx audits only governed evidence.' },
  ],
  nextAction: 'Run a live/browser pass auditing a real (not fixture) Calyx mission claim end to end (2 of 6 gate categories remain unevaluated: browser/e2e and deployed/operational).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const calyxScienceStatusGate: CompletionNode = {
  id: 'cap-calyx-science-status-dashboard',
  parentId: 'module-calyx-verification-core',
  name: 'Calyx Science Status dashboard (owner-gated)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/calyx-science' },
    { kind: 'route', ref: '/mission-control/science' },
    { kind: 'file', ref: 'src/pages/CalyxScienceStatus.tsx' },
    { kind: 'file', ref: 'src/lib/calyxScience.ts', note: 'fetchCalyxScienceDashboard() throws on any non-OK response across all eight /api/science/* calls -- fails closed, no fabricated department/gap/mission data on backend failure.' },
    { kind: 'file', ref: 'src/lib/ownerOperationsConsole.ts', note: 'createOwnerSession/validateOwnerSession gate the dashboard; validateOwnerSession rejects sessions with authenticated:true but a missing/whitespace owner field.' },
    { kind: 'test', ref: 'src/lib/ownerSessionVerification.test.ts' },
    { kind: 'test', ref: 'src/lib/ownerControlVerification.test.ts' },
  ],
  nextAction: 'Run this dashboard against a live Calyx backend with a real owner session and record the science departments/gaps actually returned (3 of 6 gate categories remain unevaluated).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const calyxVerificationDomain = branch({
  id: 'domain-calyx-verification',
  parentId: 'portfolio-orchid-continuum',
  name: 'Calyx reasoning + Verification Workbench',
  type: 'domain',
  nextAction: 'Execute the three live/browser passes noted on each capability; audit the Calyx voice/speech pipeline as a separate capability next pass.',
}, [
  branch({
    id: 'module-calyx-verification-core',
    parentId: 'domain-calyx-verification',
    name: 'Calyx reasoning + verification core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [calyxConversationalReasoningGate, calyxVerificationWorkbenchGate, calyxScienceStatusGate]),
]);

// ─── Knowledge Graph ────────────────────────────────────────────────────────
// Real evidence traced this pass: fetchGenusGraphEvidence() in
// knowledgeGraph.ts calls the real backend contract
// GET /api/knowledge-graph/genus/:genus and is consumed by GenusDetail.tsx,
// DailyGenusGraphEvidence.tsx, and featuredTaxonContinuum.ts -- a genuine,
// reachable backend-KG integration. Separately, /intelligence-graph and
// /knowledge both route to the same IntelligenceGraph.tsx page, which calls
// fetchIntelligenceGraph() in orchidContinuum.ts -- this does NOT call the
// knowledge-graph backend at all; it builds a graph client-side from
// species/atlas/mycorrhizal rows already loaded elsewhere. TheKnowledgeGraph.tsx
// (src/components/orchid/) was grepped for importers and has none -- confirmed
// orphaned, not reachable from any route.
//
// #522 (2026-09-05): the naming/architecture conflict this domain's
// nextAction pointed at is now resolved by
// docs/contracts/KNOWLEDGE-GRAPH-ROUTE-NAMING-CONTRACT.md. "Knowledge Graph"
// is reserved for the genus-scoped backend capability; the client-derived
// rollup is named "Intelligence Graph" (Footer.tsx relabeled accordingly) and
// is guarded against re-conflation by
// src/lib/knowledgeGraphNamingContract.test.ts. The two are no longer both
// reachable under the same name.

const kgGenusEvidenceGate: CompletionNode = {
  id: 'cap-kg-genus-evidence',
  parentId: 'module-knowledge-graph-core',
  name: 'Genus-scoped Knowledge Graph evidence (backend-integrated)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/knowledgeGraph.ts', note: 'fetchGenusGraphEvidence() calls GET /api/knowledge-graph/genus/:genus; normalizeGenusGraphEvidence() returns status "unavailable"/"not_found"/"invalid" rather than fabricating evidence on a malformed or failed response.' },
    { kind: 'file', ref: 'src/pages/GenusDetail.tsx' },
    { kind: 'file', ref: 'src/components/orchid/DailyGenusGraphEvidence.tsx' },
    { kind: 'file', ref: 'src/lib/featuredTaxonContinuum.ts' },
    { kind: 'test', ref: 'src/lib/knowledgeGraph.test.ts' },
  ],
  nextAction: 'Confirm real genus KG payloads render correctly on a live backend with a browser pass (3 of 6 gate categories evaluated).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const kgVisualizationGate: CompletionNode = {
  id: 'cap-kg-visualization-graph',
  parentId: 'module-knowledge-graph-core',
  name: '/knowledge and /intelligence-graph visualization ("Intelligence Graph", client-derived, distinct from Knowledge Graph evidence)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/knowledge' },
    { kind: 'route', ref: '/intelligence-graph' },
    { kind: 'file', ref: 'src/pages/IntelligenceGraph.tsx' },
    { kind: 'file', ref: 'src/lib/orchidContinuum.ts', note: 'fetchIntelligenceGraph() builds nodes/edges client-side from loadSpeciesRows/loadAtlasRows/loadMycorrhizalRows -- confirmed by reading the implementation it never calls a knowledge-graph backend endpoint, unlike cap-kg-genus-evidence.' },
    { kind: 'file', ref: 'src/components/orchid/TheKnowledgeGraph.tsx', note: 'Grepped for importers across src/: none found. Confirmed orphaned -- not reachable from any route.' },
    { kind: 'file', ref: 'docs/contracts/KNOWLEDGE-GRAPH-ROUTE-NAMING-CONTRACT.md', note: '#522: documents the canonical naming split -- "Knowledge Graph" is reserved for the genus-scoped backend capability (cap-kg-genus-evidence); this client-derived rollup is named "Intelligence Graph" and must not re-adopt the "Knowledge Graph" brand.' },
    { kind: 'file', ref: 'src/components/orchid/Footer.tsx', note: '#522: nav link relabeled from "Knowledge Graph" to "Intelligence Graph" for the /knowledge route; the route path itself is unchanged.' },
    { kind: 'test', ref: 'src/lib/knowledgeGraphNamingContract.test.ts', note: '#522: guards the naming split, the backend/client-derived data-source split, and the absence of coordinates/exact locality/occurrence identifiers on this client-derived graph.' },
  ],
  nextAction: 'Confirm the "Intelligence Graph" rollup and its distinct-from-Knowledge-Graph disclosure render correctly in a live browser pass; architectureContracts now scored 1 per docs/contracts/KNOWLEDGE-GRAPH-ROUTE-NAMING-CONTRACT.md (#522).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const kgMissionControlAdapterGate: CompletionNode = {
  id: 'cap-kg-mission-control-adapter',
  parentId: 'module-knowledge-graph-core',
  name: 'Knowledge Graph scientific-intelligence adapter (internal, Mission Control only)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 0,
    scientificProvenanceSecurity: null,
    browserEndToEnd: 0,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/scientific-intelligence/knowledge-graph/adapter.ts' },
    { kind: 'file', ref: 'src/lib/mission-control/intelligentMissionControl.ts', note: 'Only consumer found via grep, same pattern as cap-literature-intelligence-adapter -- feeds Mission Control scoring, not exposed to /knowledge, /intelligence-graph, or the genus-evidence path.' },
  ],
  nextAction: 'Decide whether this adapter should feed the public /knowledge route or remains Mission-Control-internal telemetry, mirroring the same open question already recorded for the Literature adapter.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const knowledgeGraphDomain = branch({
  id: 'domain-knowledge-graph',
  parentId: 'portfolio-orchid-continuum',
  name: 'Knowledge Graph',
  type: 'domain',
  nextAction: '#522: naming conflict on /knowledge and /intelligence-graph resolved (docs/contracts/KNOWLEDGE-GRAPH-ROUTE-NAMING-CONTRACT.md); run a live browser pass on genus-scoped KG evidence and on the relabeled Intelligence Graph rollup.',
}, [
  branch({
    id: 'module-knowledge-graph-core',
    parentId: 'domain-knowledge-graph',
    name: 'Knowledge Graph core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [kgGenusEvidenceGate, kgVisualizationGate, kgMissionControlAdapterGate]),
]);

// ─── Conservatory / OASIS ───────────────────────────────────────────────────
// Real evidence traced this pass: /conservatory/* is wrapped in
// <ProtectedRoute> around MyConservatory.tsx, which performs real CRUD
// against VITE_CALYX_API_URL for accessioned plants (QR identifiers,
// passports). Its readiness gate (useConservatoryReadiness ->
// GET /api/conservatory/readiness) fails closed with an explicit
// "Collection entry remains safely blocked" message on any service error --
// confirmed by reading the source, not assumed. /oacs (OACS.tsx) tries the
// real /api/oacs/* endpoints first and falls back to data explicitly named
// OACS_DEMO_SITES/OACS_DEMO_SNAPSHOTS with a visible "demo placeholders"
// disclosure string -- honest about being a concept page per its own header
// comment, never silently presenting demo data as live.

const conservatoryCollectionGate: CompletionNode = {
  id: 'cap-conservatory-collection',
  parentId: 'module-conservatory-core',
  name: 'Authenticated personal conservatory collection (plants, QR passports)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/conservatory/*' },
    { kind: 'file', ref: 'src/pages/MyConservatory.tsx' },
    { kind: 'file', ref: 'src/components/auth/ProtectedRoute.tsx', note: 'Confirmed by reading src/App.tsx: /conservatory/* is wrapped in ProtectedRoute, not publicly reachable without auth.' },
    { kind: 'test', ref: 'src/pages/MyConservatory.test.tsx' },
  ],
  nextAction: 'Confirm plant CRUD and QR-identifier flows against a live backend and authenticated session with a browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const conservatoryReadinessGate: CompletionNode = {
  id: 'cap-conservatory-readiness-gate',
  parentId: 'module-conservatory-core',
  name: 'Collection-entry readiness gate (fail-closed)',
  type: 'acceptance_gate',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'RELEASE_ACCEPTANCE',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/components/conservatory/ConservatoryReadiness.tsx', note: 'useConservatoryReadiness() calls GET /api/conservatory/readiness and shows "Collection entry remains safely blocked" on any fetch failure -- confirmed fail-closed, not fail-open, by reading the source.' },
    { kind: 'test', ref: 'src/components/conservatory/ConservatoryReadiness.test.tsx' },
  ],
  nextAction: 'Confirm the readiness gate actually blocks collection entry end to end in a live browser session, including the /conservatory/readiness report route.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const oasisGreenhouseMonitoringGate: CompletionNode = {
  id: 'cap-oasis-greenhouse-monitoring',
  parentId: 'module-conservatory-core',
  name: 'OASIS greenhouse environmental monitoring',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: 0,
  },
  evidence: [
    { kind: 'route', ref: '/oacs' },
    { kind: 'file', ref: 'src/pages/OACS.tsx', note: 'File\'s own header comment states this is a "concept page" demonstrating the future /api/oacs/* integration "until then" -- self-declared, not inferred.' },
    { kind: 'file', ref: 'src/lib/oacs.ts', note: 'oacsApi calls real /api/oacs/sites, /sites/:id, /sites/:id/snapshot, /compare endpoints first; OACS_DEMO_SITES/OACS_DEMO_SNAPSHOTS are only used as fallback and are never relabeled as live -- confirmed honest by reading the source and its own "never marked as live" comment.' },
  ],
  nextAction: 'Implement the /api/oacs/* backend endpoints (owner/backend-team action, outside this frontend repo\'s authority) and re-score once real sensor data is reachable; deployedOperational scored 0 because the page currently confirms it is running the demo fallback, not live sensor data.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const conservatoryDomain = branch({
  id: 'domain-conservatory',
  parentId: 'portfolio-orchid-continuum',
  name: 'Conservatory / OASIS',
  type: 'domain',
  nextAction: 'Run a live/browser pass on the authenticated collection and readiness gate; OASIS remains blocked on backend /api/oacs/* implementation.',
}, [
  branch({
    id: 'module-conservatory-core',
    parentId: 'domain-conservatory',
    name: 'Conservatory / OASIS core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [conservatoryCollectionGate, conservatoryReadinessGate, oasisGreenhouseMonitoringGate]),
]);

// ─── Lexicon / Knowledge Explorer ───────────────────────────────────────────
// Real evidence: OC-LEXICON-001 (issue #524, portfolio jsp1440/Orchid-Continuum-Brain#96).
// src/lib/lexiconService.ts merges a canonical Calyx backend response
// (CALYX_BACKEND_BASE_URL + /api/lexicon) with a read-only Famous AI
// Illustrated Orchid Lexicon migration fallback; governed scientific fields
// only ever come from canonical storage. This capability instruments and
// scores the real, current ratio of canonical-served vs Famous-fallback-only
// entries, replacing the census-pending stub this domain previously carried.

const lexiconCoverageInstrumentationGate: CompletionNode = {
  id: 'cap-lexicon-coverage-instrumentation',
  parentId: 'module-lexicon-core',
  name: 'Lexicon canonical-vs-fallback coverage instrumentation',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: null,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'issue', ref: '#524', note: 'OC-LEXICON-001 -- instrument and score Lexicon canonical-vs-fallback coverage; parent portfolio jsp1440/Orchid-Continuum-Brain#96.' },
    { kind: 'file', ref: 'src/lib/lexiconService.ts', note: 'measureLexiconCoverage() mirrors the exact canonical-fetch-then-merge logic getEntries() uses, so the ratio it reports matches what getEntries()/getEntry() actually serve, not a reimplementation that could drift.' },
    { kind: 'test', ref: 'src/lib/lexiconService.test.ts', note: 'Covers a real 0% ratio on canonical-unreachable, a partial ratio on real canonical hits, and 0% (not a fabricated partial number) on an empty canonical response.' },
    { kind: 'test', ref: 'src/lib/lexiconCoverageUnavailable.test.ts', note: 'Confirms the fail-closed contract: status is "unavailable" with a null ratio, never a guessed number, when nothing exists to measure against.' },
    { kind: 'file', ref: 'src/components/mission-control/LexiconCoverageDiagnostic.tsx', note: 'Mission Control diagnostic panel rendering the measured ratio or an explicit "Coverage unavailable" state.' },
    { kind: 'test', ref: 'src/components/mission-control/LexiconCoverageDiagnostic.render.test.tsx' },
    { kind: 'file', ref: 'src/pages/MissionControl.tsx', note: 'Panel mounted in the Diagnostics column, wrapped in the existing SafePanel error boundary.' },
  ],
  nextAction: 'Merge this PR into oc-autonomous-integration to score integrationCanonicalBranch, then run a live/browser pass confirming the Mission Control Lexicon Coverage panel renders the measured ratio against a real Calyx backend session (only 3 of 6 gate categories evaluated this pass -- ~55% weight coverage; fail-closed behavior is already covered by focused tests).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const lexiconDomain = branch({
  id: 'domain-lexicon',
  parentId: 'portfolio-orchid-continuum',
  name: 'Glossary / Lexicon / Knowledge Explorer',
  type: 'domain',
  nextAction: 'See child capability for the newly-scored coverage instrumentation; Knowledge Explorer decomposition remains census-pending.',
}, [
  branch({
    id: 'module-lexicon-core',
    parentId: 'domain-lexicon',
    name: 'Lexicon core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    lexiconCoverageInstrumentationGate,
    censusPending({
      idHint: 'cap-lexicon-knowledge-explorer',
      parentId: 'module-lexicon-core',
      name: 'Knowledge Explorer and remaining Lexicon term/relationship coverage',
      evidence: [
        { kind: 'route', ref: '/lexicon/*' },
        { kind: 'file', ref: 'src/features/lexicon/LexiconAppLayout.tsx' },
        { kind: 'route', ref: '/intelligence-graph' },
      ],
      nextAction: 'Decompose Knowledge Explorer (/intelligence-graph) into its own capabilities and score real term/relationship coverage beyond the canonical-vs-fallback ratio scored in the sibling capability.',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
    }),
  ]),
]);

// ─── Remaining initial inventory: recorded as domains, census pending ──────
// Each entry below has at least one route/file existence check so "missing
// evidence" is never silently treated as zero — but none have been scored,
// per this file's rule that scoring requires genuine investigation.

type StubDomainSpec = {
  idHint: string;
  name: string;
  evidence: Evidence[];
  nextAction: string;
  lane: ExecutionLane;
};

const STUB_DOMAINS: StubDomainSpec[] = [
  {
    idHint: 'domain-research-station',
    name: 'Research Station',
    evidence: [
      { kind: 'route', ref: '/research' },
      { kind: 'file', ref: 'src/pages/ResearchCenter.tsx' },
      { kind: 'issue', ref: '#278', note: 'Atlas -> Research handoff already scored separately under the Atlas domain.' },
    ],
    nextAction: 'Audit Research Station capabilities beyond the already-scored Atlas handoff (advanced queries, trait explorers, conservation research workspace).',
    lane: 'PRODUCT_COMPLETION',
  },
  {
    idHint: 'domain-pollinator-mycorrhiza',
    name: 'Pollinator / mycorrhiza / ecological relationships',
    evidence: [
      { kind: 'route', ref: '/pollinators/:taxa' },
      { kind: 'route', ref: '/mycorrhizae/:taxa' },
      { kind: 'file', ref: 'src/pages/PollinatorProfile.tsx' },
      { kind: 'file', ref: 'src/pages/MycorrhizaProfile.tsx' },
    ],
    nextAction: 'Score relationship coverage against real KG-connected entities.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
  {
    idHint: 'domain-conservation',
    name: 'Conservation',
    evidence: [
      { kind: 'route', ref: '/conservation' },
      { kind: 'file', ref: 'src/pages/ConservationHub.tsx' },
    ],
    nextAction: 'Score conservation status data sourcing (real IUCN/CITES vs placeholder).',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
  {
    idHint: 'domain-harvester',
    name: 'Harvester / ingestion productivity',
    evidence: [
      { kind: 'file', ref: 'src/lib/missionControlOps.ts', note: 'HarvesterStatus type + Mission Control harvester panel exist; not yet audited for real vs fallback harvester state.' },
    ],
    nextAction: 'Confirm which harvesters report live state vs. fallback/mock state in the running Mission Control instance.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
  {
    idHint: 'domain-taxonomy-ops',
    name: 'Taxonomy operations',
    evidence: [
      { kind: 'file', ref: 'src/pages/TaxonomyOperations.tsx' },
      { kind: 'file', ref: 'src/pages/TaxonomyReleases.tsx' },
      { kind: 'file', ref: 'src/pages/MissionControlEntry.tsx', note: 'Mounted via MissionControlEntry\'s internal switch, not a direct App.tsx route.' },
    ],
    nextAction: 'Confirm taxonomy activation gating and score against the mission\'s explicit "no taxonomy activation" authorization boundary.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
  {
    idHint: 'domain-media-provenance',
    name: 'Media/image provenance',
    evidence: [
      { kind: 'file', ref: 'src/lib/speciesDossier.ts', note: 'DossierSection includes license/attribution fields (see Species Dossier domain); no dedicated media-provenance module found by grep for "provenance".' },
    ],
    nextAction: 'Confirm whether media/image provenance has a dedicated module or lives inside the Species Dossier evidence receipts; decompose accordingly.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
];

function buildStubDomain(spec: StubDomainSpec): CompletionNode {
  const domainId = spec.idHint;
  const moduleId = `${spec.idHint}-module`;
  return branch({
    id: domainId,
    parentId: 'portfolio-orchid-continuum',
    name: spec.name,
    type: 'domain',
    nextAction: spec.nextAction,
  }, [
    branch({
      id: moduleId,
      parentId: domainId,
      name: spec.name,
      type: 'module',
      nextAction: 'See child capability.',
    }, [
      censusPending({
        idHint: `${spec.idHint}-cap`,
        parentId: moduleId,
        name: 'Initial capability census',
        evidence: spec.evidence,
        nextAction: spec.nextAction,
        lane: spec.lane,
      }),
    ]),
  ]);
}

const stubDomains = STUB_DOMAINS.map(buildStubDomain);

// ─── Homepage / Featured Genus / Public Calyx ──────────────────────────────
// Real evidence traced this pass (#242 audit): AppLayout.tsx wraps every
// homepage section (HeroOrchid, ContinuumThread, FungalDependency,
// DailyGenusFeature, HomeSpeciesExhibit, ContinuumWeb, HomeAtlasContinuum,
// PublicCalyxGuide, HomepageStewardshipClose) in a SafeSection error
// boundary that renders an explicit "no scientific fallback content has been
// substituted" message on failure rather than a silent fabricated fallback --
// confirmed by reading the source, not assumed. featuredGenus.ts is a
// deterministic, clock-derived rotation (12h UTC window) shared by every
// homepage element that must show the same genus; fetchFeaturedNarrative()
// calls a real Supabase edge function and falls back to a locally-composed,
// science-grounded (not invented) narrative on failure. PublicCalyxGuide's
// prompts are derived from the same continuum relationships/gaps already on
// screen, and link to /calyx (AtlasAwareCalyxRoute), which renders an
// explicit non-evidentiary disclosure for the carried genus. #171
// (HOMEPAGE-RECOVERY-008, open, oc-queued) already tracks the outstanding
// integrated/responsive/deployed browser pass -- cited, not duplicated.

const homepageHeroContinuumGate: CompletionNode = {
  id: 'cap-homepage-hero-continuum',
  parentId: 'module-homepage-core',
  name: 'Hero orchid, continuum thread & fungal-dependency narrative sections',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/' },
    { kind: 'file', ref: 'src/pages/Index.tsx' },
    { kind: 'file', ref: 'src/components/AppLayout.tsx', note: 'Each section (HeroOrchid, ContinuumThread, FungalDependency, ContinuumWeb, HomepageStewardshipClose) is wrapped in a SafeSection error boundary that renders "No scientific fallback content has been substituted" on failure instead of a silent fabricated fallback -- confirmed by reading the source.' },
    { kind: 'file', ref: 'src/components/orchid/HeroOrchid.tsx' },
    { kind: 'file', ref: 'src/components/orchid/FungalDependency.tsx' },
    { kind: 'file', ref: 'src/components/orchid/ContinuumWeb.tsx' },
    { kind: 'test', ref: 'src/components/AppLayout.render.test.tsx' },
    { kind: 'test', ref: 'src/components/orchid/HeroOrchid.canonicalMedia.test.ts' },
    { kind: 'issue', ref: '#171', note: 'HOMEPAGE-RECOVERY-008 (open, oc-queued) already tracks the outstanding integrated/responsive/deployed browser pass for this domain -- not duplicated by this gate.' },
  ],
  issues: ['#171'],
  nextAction: "Run #171's integrated responsive/deployed browser pass; only architecture/implementation/integration/provenance were confirmed this pass by reading source and tests (4 of 6 gate categories, ~75% weight coverage).",
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const homepageFeaturedGenusGate: CompletionNode = {
  id: 'cap-homepage-featured-genus',
  parentId: 'module-homepage-core',
  name: 'Featured Genus rotation (Genus of the Day + Species in Focus)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/featuredGenus.ts', note: 'featuredGenusIndex()/featuredGenusName() derive a deterministic genus purely from the current UTC clock (12h window) so every visitor worldwide sees the same genus at the same moment; fetchFeaturedNarrative() calls the real genus-narrative Supabase edge function and falls back to a locally-composed, science-grounded (not invented) narrative on failure.' },
    { kind: 'file', ref: 'src/components/orchid/DailyGenusFeature.tsx' },
    { kind: 'file', ref: 'src/components/orchid/HomeSpeciesExhibit.tsx' },
    { kind: 'file', ref: 'src/lib/dailyGenusContext.ts' },
    { kind: 'test', ref: 'src/lib/featuredTaxonContinuum.test.ts' },
    { kind: 'test', ref: 'src/lib/featuredTaxonSourceIntegrity.test.ts' },
    { kind: 'test', ref: 'src/lib/featuredTaxonFungalEvidence.sourceIntegrity.test.ts' },
    { kind: 'test', ref: 'src/components/orchid/DailyGenusFeatureContinuum.test.tsx' },
    { kind: 'test', ref: 'src/components/orchid/HomeSpeciesExhibit.test.ts' },
    { kind: 'test', ref: 'src/components/orchid/featuredGenusSingleGeneration.test.ts' },
  ],
  nextAction: 'Confirm the genus-narrative edge function returns real (non-fallback) AI narrative in a live browser session and that the rotation stays single-generation under real traffic (4 of 6 gate categories confirmed this pass).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const homepagePublicCalyxGate: CompletionNode = {
  id: 'cap-homepage-public-calyx',
  parentId: 'module-homepage-core',
  name: 'Public Calyx guide & homepage-to-Calyx handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/components/orchid/PublicCalyxGuide.tsx', note: 'Prompts are derived from the same continuum relationships/gaps already shown on the page (relationships?.pollinators.hasData, continuum?.gaps.length) -- confirmed by reading the source it asks about missing evidence rather than manufacturing a complete story when the graph is incomplete.' },
    { kind: 'route', ref: '/calyx' },
    { kind: 'file', ref: 'src/components/calyx/AtlasAwareCalyxRoute.tsx', note: 'Renders a "Continuing from Genus of the Day" banner for the featured-taxon origin and explicitly states the carried genus "is not scientific evidence" -- confirmed reachable from the homepage guide via featuredTaxonCalyxHref(), not orphaned.' },
    { kind: 'file', ref: 'src/lib/featuredTaxonNavigation.ts' },
    { kind: 'test', ref: 'src/components/calyx/AtlasAwareCalyxRoute.featuredGenus.test.ts' },
    { kind: 'test', ref: 'src/lib/featuredTaxonNavigation.test.ts' },
    { kind: 'test', ref: 'src/lib/homepageFeaturedGenusEntrypoint.test.ts' },
  ],
  nextAction: 'Run a live browser check: open the homepage, click "Ask Calyx" for the current Genus of the Day, and confirm the genus-handoff banner and non-evidentiary disclosure render end to end (4 of 6 gate categories confirmed this pass).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const homepageDomain = branch({
  id: 'domain-homepage',
  parentId: 'portfolio-orchid-continuum',
  name: 'Homepage / Featured Genus / Public Calyx',
  type: 'domain',
  nextAction: 'Run the three outstanding browser/e2e passes noted on each capability; #171 already tracks the integrated responsive/deployed validation slice.',
}, [
  branch({
    id: 'module-homepage-core',
    parentId: 'domain-homepage',
    name: 'Homepage core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [homepageHeroContinuumGate, homepageFeaturedGenusGate, homepagePublicCalyxGate]),
]);

// ─── Calyx education & show-management surfaces ────────────────────────────
// Real evidence traced this pass, per #242's explicit call-out to find "any
// Calyx education or show-management surfaces actually present in current
// code": five real routed pages -- /education, /education/judging-practice,
// /classroom, /classroom/investigation, /culture/orchids-on-screen -- none
// previously represented anywhere in this graph. Judging Practice and Screen
// Orchids are fully real (deterministic scoring, curated data, explicit "not
// a real award" disclosure); the Scientific Method Lab persists a learner's
// draft to localStorage only (no backend, no scientific record), which
// AtlasAwareCalyxRoute correctly treats as ungoverned learner context when
// carried into Calyx. Classroom's own header comment self-declares it a
// "placeholder" awaiting /api/classrooms/*, mirroring the already-scored
// OASIS backend dependency (cap-oasis-greenhouse-monitoring) -- honest, not
// silently presented as live. No open issue in the tracker covers this
// cluster.

const educationGlossaryHubGate: CompletionNode = {
  id: 'cap-education-glossary-hub',
  parentId: 'module-education-show-core',
  name: 'Education contextual-learning hub (BloomBot topic glossary)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/education' },
    { kind: 'file', ref: 'src/pages/Education.tsx', note: 'Topic panels are static curated copy (VPD, PAR/DLI, etc.), not dynamically fetched or AI-generated per view -- confirmed by reading the source; the page\'s own comment calls this BloomBot\'s "first response" before linking to deeper content.' },
  ],
  nextAction: 'Confirm no topic content overstates certainty beyond the curated summary, then run a live browser pass (3 of 6 gate categories confirmed this pass).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const judgingPracticeGate: CompletionNode = {
  id: 'cap-judging-practice',
  parentId: 'module-education-show-core',
  name: 'Judging practice sheet (recovered from the retired FCOS judging app)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/education/judging-practice' },
    { kind: 'file', ref: 'src/pages/JudgingPractice.tsx', note: 'Header comment states the capability was recovered from the retired FCOS judging app but its "authority claim did not" come across: scoring is deterministic, a person enters every score, nothing is persisted, and no award is issued or predicted. RUBRIC_PROVENANCE discloses the rubric as "an unverified historical snapshot" on the page itself.' },
    { kind: 'file', ref: 'src/lib/judgingPractice.ts' },
    { kind: 'test', ref: 'src/lib/judgingPractice.test.ts' },
    { kind: 'test', ref: 'src/pages/JudgingPractice.test.tsx' },
  ],
  nextAction: 'Run a live browser pass confirming the rubric provenance disclosure and deterministic scoring render correctly end to end (4 of 6 gate categories confirmed this pass by reading source and tests).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const screenOrchidsGate: CompletionNode = {
  id: 'cap-screen-orchids',
  parentId: 'module-education-show-core',
  name: 'Orchids on Screen (culture module)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/culture/orchids-on-screen' },
    { kind: 'file', ref: 'src/pages/ScreenOrchids.tsx' },
    { kind: 'file', ref: 'src/data/screenOrchids.ts' },
    { kind: 'test', ref: 'src/data/screenOrchids.test.ts' },
    { kind: 'test', ref: 'src/pages/ScreenOrchids.test.tsx' },
  ],
  nextAction: 'Confirm the curated film/media records are real (sourced, attributable) rather than invented, then run a live browser pass (3 of 6 gate categories confirmed this pass).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const scientificMethodLabGate: CompletionNode = {
  id: 'cap-scientific-method-lab',
  parentId: 'module-education-show-core',
  name: 'Scientific Method Lab (classroom investigation draft)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/classroom/investigation' },
    { kind: 'file', ref: 'src/pages/ScientificMethodLab.tsx', note: "Draft investigation is persisted client-side only (localStorage key orchid-continuum:classroom:scientific-method-draft:v1) -- no backend write, no scientific record created." },
    { kind: 'file', ref: 'src/lib/classroomInvestigationNavigation.ts' },
    { kind: 'test', ref: 'src/lib/classroomInvestigationNavigation.test.ts' },
    { kind: 'file', ref: 'src/components/calyx/AtlasAwareCalyxRoute.tsx', note: 'Confirmed this pass: a carried classroomContext renders a "Continuing from a classroom investigation" banner that explicitly states the learner\'s hypothesis/observations/conclusion "did not travel and are not evidence" and "nothing said here enters the Continuum\'s scientific record."' },
  ],
  nextAction: 'Run a live browser pass confirming the draft persists correctly across a session and the Calyx handoff banner renders as designed (4 of 6 gate categories confirmed this pass).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const classroomTeacherDashboardGate: CompletionNode = {
  id: 'cap-classroom-teacher-dashboard',
  parentId: 'module-education-show-core',
  name: 'Teacher-facing classroom dashboard (rosters, assignments, progress reporting)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: 0,
  },
  evidence: [
    { kind: 'route', ref: '/classroom' },
    { kind: 'file', ref: 'src/pages/Classroom.tsx', note: 'File\'s own header comment self-declares this a "Teacher-facing dashboard placeholder. Conceptual UI only" awaiting /api/classrooms/* and /api/assignments/* backend endpoints; the page renders a visible "Demo · awaiting /api/classrooms" disclosure -- confirmed honest, not silently presented as live.' },
  ],
  nextAction: 'Owner/backend action: implement /api/classrooms/* and /api/assignments/* before this page can move off placeholder state -- outside this frontend repo\'s authority, same pattern as the OASIS backend dependency (cap-oasis-greenhouse-monitoring).',
  lastUpdated: AUDIT_242_DATE,
  children: [],
};

const educationShowManagementDomain = branch({
  id: 'domain-education-show-management',
  parentId: 'portfolio-orchid-continuum',
  name: 'Calyx education & show-management surfaces',
  type: 'domain',
  nextAction: 'Run the outstanding browser/e2e passes on the four real capabilities; the teacher dashboard remains owner/backend-blocked, not a frontend gap.',
}, [
  branch({
    id: 'module-education-show-core',
    parentId: 'domain-education-show-management',
    name: 'Education & show-management core',
    type: 'module',
    nextAction: 'See child capabilities.',
  }, [
    educationGlossaryHubGate,
    judgingPracticeGate,
    screenOrchidsGate,
    scientificMethodLabGate,
    classroomTeacherDashboardGate,
  ]),
]);

// ─── Root ───────────────────────────────────────────────────────────────────

export const COMPLETION_GRAPH: CompletionNode = branch({
  id: 'portfolio-orchid-continuum',
  parentId: null,
  name: 'Orchid Continuum',
  type: 'portfolio',
  nextAction: 'Select the next unmet gate via selectNextUnmetGate() and continue the per-domain census.',
}, [
  speciesDossierDomain,
  atlasDomain,
  literatureDomain,
  matrixDomain,
  universityDomain,
  autonomousControlPlaneDomain,
  productionReleaseDomain,
  buyingCompanionDomain,
  visionDomain,
  securityGovernanceDomain,
  calyxVerificationDomain,
  knowledgeGraphDomain,
  conservatoryDomain,
  lexiconDomain,
  homepageDomain,
  educationShowManagementDomain,
  buildJourneyContinuityDomain(branch),
  ...stubDomains,
]);

export const COMPLETION_GRAPH_CENSUS_DATE = CENSUS_DATE;
