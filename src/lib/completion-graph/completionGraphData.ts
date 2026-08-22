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
import type { CompletionNode, Evidence, ExecutionLane } from './types';

const CENSUS_DATE = '2026-08-22T00:00:00.000Z';

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
    idHint: 'domain-homepage',
    name: 'Homepage / Featured Genus / Public Calyx',
    evidence: [
      { kind: 'route', ref: '/' },
      { kind: 'file', ref: 'src/pages/Index.tsx' },
      { kind: 'route', ref: '/calyx' },
      { kind: 'file', ref: 'src/components/calyx/AtlasAwareCalyxRoute.tsx' },
    ],
    nextAction: 'Decompose into Homepage, Featured Genus rotation, and Public Calyx capabilities with real acceptance gates.',
    lane: 'PRODUCT_COMPLETION',
  },
  {
    idHint: 'domain-calyx-verification',
    name: 'Calyx reasoning + Verification Workbench',
    evidence: [
      { kind: 'route', ref: '/speak-with-calyx' },
      { kind: 'file', ref: 'src/components/calyx/CalyxVerificationWorkbench.tsx' },
      { kind: 'route', ref: '/calyx-science' },
      { kind: 'file', ref: 'src/pages/CalyxScienceStatus.tsx' },
    ],
    nextAction: 'Audit Verification Workbench against real Calyx reasoning traces and score its acceptance gates.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
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
    idHint: 'domain-lexicon',
    name: 'Glossary / Lexicon / Knowledge Explorer',
    evidence: [
      { kind: 'route', ref: '/lexicon/*' },
      { kind: 'file', ref: 'src/features/lexicon/LexiconAppLayout.tsx' },
      { kind: 'route', ref: '/intelligence-graph' },
    ],
    nextAction: 'Decompose Lexicon and Knowledge Explorer into separate capabilities and score against real term/relationship coverage.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
  },
  {
    idHint: 'domain-conservatory',
    name: 'Conservatory / OASIS',
    evidence: [
      { kind: 'route', ref: '/conservatory/*' },
      { kind: 'file', ref: 'src/pages/MyConservatory.tsx' },
      { kind: 'route', ref: '/oacs' },
      { kind: 'file', ref: 'src/pages/OACS.tsx' },
    ],
    nextAction: 'Audit authenticated conservatory features and OASIS separately; both currently only confirmed to exist, not scored.',
    lane: 'PRODUCT_COMPLETION',
  },
  {
    idHint: 'domain-knowledge-graph',
    name: 'Knowledge Graph',
    evidence: [
      { kind: 'route', ref: '/knowledge' },
      { kind: 'route', ref: '/intelligence-graph' },
      { kind: 'file', ref: 'src/lib/knowledgeGraph.ts' },
      { kind: 'file', ref: 'src/lib/scientific-intelligence/knowledge-graph/adapter.ts' },
    ],
    nextAction: 'Score KG completeness/connectivity against real backend counts, not Mission Control fallback insights.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
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
  ...stubDomains,
]);

export const COMPLETION_GRAPH_CENSUS_DATE = CENSUS_DATE;
