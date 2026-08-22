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
 * Sibling nodes are averaged unweighted when rolling up (see scoring.ts) —
 * a domain with one deeply-audited module and five UNKNOWN-census modules
 * will look more "complete" than it should until those five get their own
 * audit pass. That is a known limitation of this first census, not a
 * deliberate weighting choice — tracked as remaining work on issue #281.
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
  type?: CompletionNode['type'];
}): CompletionNode {
  return {
    id: nextId(opts.idHint),
    parentId: opts.parentId,
    name: opts.name,
    type: opts.type ?? 'capability',
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
  type?: CompletionNode['type'];
}): CompletionNode {
  return {
    id: nextId(opts.idHint),
    parentId: opts.parentId,
    name: opts.name,
    type: opts.type ?? 'capability',
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

// ─── Homepage / Featured Genus / Public Calyx ──────────────────────────────
// Real evidence: src/lib/featuredTaxonNavigation.ts (confirmed on origin/main,
// commit e035b1a / #231) defines featuredTaxonAtlasHref / featuredTaxonCalyxHref /
// featuredTaxonResearchHref, consumed by HomeAtlasContinuum.tsx,
// DailyGenusFeatureContinuum.tsx, and HomepageStewardshipClose.tsx.

const homepageToAtlasIntegration: CompletionNode = {
  id: 'int-homepage-featured-genus-atlas',
  parentId: 'module-homepage-core',
  name: 'Homepage / Featured Genus -> Atlas handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/featuredTaxonNavigation.ts', note: 'featuredTaxonAtlasHref() — genus-only handoff; confirmed on origin/main.' },
    { kind: 'file', ref: 'src/components/orchid/HomeAtlasContinuum.tsx' },
    { kind: 'file', ref: 'src/components/orchid/DailyGenusFeatureContinuum.tsx' },
    { kind: 'test', ref: 'src/lib/featuredTaxonNavigation.test.ts' },
    { kind: 'test', ref: 'src/components/orchid/HomeAtlasContinuum.test.tsx' },
    { kind: 'commit', ref: 'e035b1a', note: 'OC autonomous integration batch (#231) — file confirmed present on origin/main at this commit.' },
  ],
  nextAction: 'Run a live browser pass: click the Featured Genus Atlas link on the homepage and confirm Atlas mounts filtered to the same genus with no locality/coordinate leakage.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const homepageToCalyxIntegration: CompletionNode = {
  id: 'int-homepage-featured-genus-calyx',
  parentId: 'module-homepage-core',
  name: 'Homepage / Featured Genus -> Calyx handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/featuredTaxonNavigation.ts', note: 'featuredTaxonCalyxHref() tags origin=homepage-featured-taxon so Calyx never treats it as evidence.' },
    { kind: 'file', ref: 'src/components/orchid/HomeAtlasContinuum.tsx' },
    { kind: 'file', ref: 'src/components/orchid/DailyGenusFeatureContinuum.tsx' },
    { kind: 'file', ref: 'src/components/calyx/AtlasAwareCalyxRoute.tsx' },
    { kind: 'test', ref: 'src/components/calyx/AtlasAwareCalyxRoute.test.ts' },
    { kind: 'test', ref: 'src/lib/genusDayContextHandoff.test.ts' },
  ],
  nextAction: 'Confirm the /calyx?genus=...&origin=homepage-featured-taxon route renders a live Calyx conversation seeded with only genus context, then run a browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const homepageToResearchIntegration: CompletionNode = {
  id: 'int-homepage-featured-genus-research',
  parentId: 'module-homepage-core',
  name: 'Homepage / Featured Genus -> Research handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/featuredTaxonNavigation.ts', note: 'featuredTaxonResearchHref() — genus is interaction context only, never promoted to evidence.' },
    { kind: 'file', ref: 'src/components/orchid/HomepageStewardshipClose.tsx' },
    { kind: 'test', ref: 'src/lib/canonicalScientificJourney.test.ts' },
  ],
  nextAction: 'Confirm Research Center preloads the handed-off genus without treating it as a persisted project subject, then run a browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const homepageDomain = branch({
  id: 'domain-homepage',
  parentId: 'portfolio-orchid-continuum',
  name: 'Homepage / Featured Genus / Public Calyx',
  type: 'domain',
  nextAction: 'Audit Featured Genus rotation data sourcing; run browser passes for the three scored handoffs below.',
}, [
  branch({
    id: 'module-homepage-core',
    parentId: 'domain-homepage',
    name: 'Homepage core',
    type: 'module',
    nextAction: 'See child capabilities and integrations.',
  }, [
    censusPending({
      idHint: 'cap-homepage-featured-genus-rotation',
      parentId: 'module-homepage-core',
      name: 'Featured Genus rotation & Public Calyx entry surface',
      evidence: [
        { kind: 'route', ref: '/' },
        { kind: 'file', ref: 'src/pages/Index.tsx' },
        { kind: 'file', ref: 'src/components/orchid/DailyGenusFeatureContinuum.tsx' },
      ],
      nextAction: 'Audit whether the daily genus rotation sources real Continuum data or a fixed/fixture rotation list, and score deterministic-rotation + real-data gates.',
      lane: 'PRODUCT_COMPLETION',
    }),
    homepageToAtlasIntegration,
    homepageToCalyxIntegration,
    homepageToResearchIntegration,
  ]),
]);

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

const universityToCalyxIntegration: CompletionNode = {
  id: 'int-university-calyx',
  parentId: 'module-university-core',
  name: 'University Applied AI & Data Science lab -> Calyx tutor handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/pages/AppliedAIDataScienceLab.tsx', note: '"askCalyx" mutation calls createCalyxConversation()/sendCalyxTurn() after lab execution; confirmed on origin/main.' },
    { kind: 'file', ref: 'src/lib/calyxWorkspace.ts' },
    { kind: 'file', ref: 'src/lib/appliedAiDataScience.ts', note: 'Declares calyx_tutor_contract and calyx_context types.' },
  ],
  nextAction: 'Confirm the Calyx tutor response is scoped to the executed lab\'s own evidence (no unrelated persisted context), then run a browser pass.',
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
    universityToCalyxIntegration,
    censusPending({
      idHint: 'int-university-research-continuation',
      parentId: 'module-university-core',
      name: 'University -> Research Station continuation handoff',
      evidence: [{ kind: 'file', ref: 'src/pages/UniversityReviewerWorkspace.tsx', note: 'Not yet traced for a University -> Research Station handoff path this pass.' }],
      nextAction: 'Confirm whether a University -> Research Station continuity handoff exists and, if so, apply the same contract-based pattern as the Atlas -> Research handoff (#278).',
      lane: 'INTEGRATION_COMPLETION',
      type: 'integration',
    }),
  ]),
]);

// ─── Cross-Module Integration Journeys ─────────────────────────────────────
// The #296 integration census. Atlas -> Research is tracked separately under
// the Atlas domain (int-atlas-research-handoff) to avoid duplicating that PR's
// evidence. University -> Research and University -> Calyx are tracked under
// the University domain for the same reason. Everything else lives here.

const researchToCalyxIntegration: CompletionNode = {
  id: 'int-research-calyx',
  parentId: 'module-integration-journeys-core',
  name: 'Research Station -> Calyx ("Ask Calyx") handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/pages/ResearchCenter.tsx', note: '"Ask Calyx" action uses featuredTaxonCalyxHref(routeGenus); confirmed on origin/main.' },
    { kind: 'file', ref: 'src/lib/featuredTaxonNavigation.ts' },
  ],
  nextAction: 'Confirm the Ask Calyx link preserves only genus context (never coordinates/locality) with a dedicated regression, then run a browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const matrixToLexiconIntegration: CompletionNode = {
  id: 'int-matrix-lexicon',
  parentId: 'module-integration-journeys-core',
  name: 'Matrix Identification -> Lexicon glossary handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/components/matrix/MatrixLexiconGuide.tsx', note: 'Confirmed on origin/main; reachable from OrchidIdentificationNext.tsx.' },
    { kind: 'file', ref: 'src/lib/matrixLexicon.ts' },
    { kind: 'test', ref: 'src/lib/matrixLexicon.test.ts' },
  ],
  nextAction: 'Confirm glossary explanations reference real Lexicon entries (not inline copy), then run a browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const literatureToKnowledgeGraphIntegration: CompletionNode = {
  id: 'int-literature-knowledge-graph',
  parentId: 'module-integration-journeys-core',
  name: 'Literature -> Knowledge Graph integration',
  type: 'integration',
  status: 'MISSING',
  threeLevels: { codeComplete: 'PARTIAL', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 0, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/knowledgeGraph.ts', note: "KNOWLEDGE_GRAPH_DOMAINS declares 'literature' as a domain — the architecture contract exists." },
    { kind: 'file', ref: 'src/lib/scientific-intelligence/literature/adapter.ts', note: 'No import of knowledgeGraph.ts, or vice versa, found this pass (grep) — the contract exists but no code path connects them.' },
  ],
  nextAction: 'Wire the literature adapter\'s output into a real Knowledge Graph node/edge write path, or confirm KG sources literature evidence some other way this pass missed.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const speciesDossierToAtlasIntegration: CompletionNode = {
  id: 'int-species-dossier-atlas',
  parentId: 'module-integration-journeys-core',
  name: 'Species Dossier -> Atlas handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/speciesDossier.ts', note: 'SpeciesDossierEnvelope declares atlas: SpeciesAtlasEnvelope and fetchSpeciesAtlas().' },
    { kind: 'file', ref: 'src/pages/SpeciesDossier.tsx', note: '"View on Atlas" action links to /atlas?species=<slug>.' },
  ],
  nextAction: 'Confirm /atlas?species=<slug> actually filters Atlas to the dossier species with a browser pass.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const speciesDossierToMatrixIntegration: CompletionNode = {
  id: 'int-species-dossier-matrix',
  parentId: 'module-integration-journeys-core',
  name: 'Species Dossier -> Matrix Identification handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'PARTIAL', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 0, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/speciesDossier.ts', note: 'SpeciesDossierEnvelope declares matrix_url: string in its contract.' },
    { kind: 'file', ref: 'src/pages/SpeciesDossier.tsx', note: 'matrix_url is not read or rendered anywhere in this file this pass (grep found no reference) — the contract field is unused.' },
  ],
  nextAction: 'Render the dossier\'s matrix_url as a "Continue in Matrix Identification" action, or confirm the field is intentionally deferred.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const speciesDossierToCalyxIntegration: CompletionNode = {
  id: 'int-species-dossier-calyx',
  parentId: 'module-integration-journeys-core',
  name: 'Species Dossier -> Calyx narrative handoff',
  type: 'integration',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
  lane: 'INTEGRATION_COMPLETION',
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: 1, browserEndToEnd: 0, deployedOperational: null },
  evidence: [
    { kind: 'file', ref: 'src/lib/speciesDossier.ts', note: 'DossierSection calyx_narrative field.' },
    { kind: 'file', ref: 'src/pages/SpeciesDossier.tsx' },
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#293', note: 'Same evidence-receipt rendering already scored under the Species Dossier domain.', prState: 'merged' },
  ],
  nextAction: 'Same as the Evidence dossier rendering gate — run a live browser smoke test against a real Calyx backend.',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const integrationJourneysDomain = branch({
  id: 'domain-integration-journeys',
  parentId: 'portfolio-orchid-continuum',
  name: 'Cross-Module Integration Journeys',
  type: 'domain',
  nextAction: 'Close the browser/live-acceptance gap on every PARTIAL journey below; resolve the UNKNOWN journeys with direct code tracing.',
}, [
  branch({
    id: 'module-integration-journeys-core',
    parentId: 'domain-integration-journeys',
    name: 'Integration journeys',
    type: 'module',
    nextAction: 'See child integration nodes. Atlas -> Research lives under the Atlas domain; University -> Research and University -> Calyx live under the University domain — not duplicated here.',
  }, [
    researchToCalyxIntegration,
    censusPending({
      idHint: 'int-calyx-verification-workbench',
      parentId: 'module-integration-journeys-core',
      name: 'Calyx reasoning -> Verification Workbench handoff',
      evidence: [
        { kind: 'file', ref: 'src/components/calyx/CalyxVerificationWorkbench.tsx' },
        { kind: 'file', ref: 'src/components/calyx/ScientificSynthesis.tsx' },
      ],
      nextAction: 'Trace whether a live Calyx conversation turn actually opens/feeds the Verification Workbench, or whether the two components are only sibling routes.',
      lane: 'INTEGRATION_COMPLETION',
      type: 'integration',
    }),
    censusPending({
      idHint: 'int-research-verification-workbench',
      parentId: 'module-integration-journeys-core',
      name: 'Research Station -> Verification Workbench handoff',
      evidence: [
        { kind: 'file', ref: 'src/pages/ResearchCenter.tsx', note: 'No import of CalyxVerificationWorkbench or a verification route found in this file this pass.' },
      ],
      nextAction: 'Confirm whether Research Station findings can be sent into the Verification Workbench at all; if no such path exists, reclassify this leaf as MISSING with evidence.',
      lane: 'INTEGRATION_COMPLETION',
      type: 'integration',
    }),
    matrixToLexiconIntegration,
    censusPending({
      idHint: 'int-matrix-calyx',
      parentId: 'module-integration-journeys-core',
      name: 'Matrix Identification -> Calyx Vision handoff',
      evidence: [
        { kind: 'file', ref: 'src/components/matrix/MatrixVisionReviewPanel.tsx', note: 'References "Calyx Vision · Review gate" copy; no direct Calyx backend call traced this pass.' },
      ],
      nextAction: 'Trace whether MatrixVisionReviewPanel actually calls a Calyx Vision backend endpoint or only displays static review-gate copy.',
      lane: 'INTEGRATION_COMPLETION',
      type: 'integration',
    }),
    literatureToKnowledgeGraphIntegration,
    censusPending({
      idHint: 'int-literature-calyx',
      parentId: 'module-integration-journeys-core',
      name: 'Literature -> Calyx handoff',
      evidence: [
        { kind: 'file', ref: 'src/lib/scientific-intelligence/literature/adapter.ts', note: 'No Calyx import or reference found in this frontend file this pass. Calyx retrieval of literature evidence may happen entirely backend-side, which this repository cannot observe — treated as genuinely unknown, not confirmed missing.' },
      ],
      nextAction: 'Ask the backend team whether Calyx retrieves literature evidence server-side; a frontend-only census cannot resolve this leaf.',
      lane: 'SCIENTIFIC_DATA_COMPLETION',
      type: 'integration',
    }),
    speciesDossierToAtlasIntegration,
    speciesDossierToMatrixIntegration,
    speciesDossierToCalyxIntegration,
    censusPending({
      idHint: 'int-species-dossier-research',
      parentId: 'module-integration-journeys-core',
      name: 'Species Dossier -> Research Station handoff',
      evidence: [
        { kind: 'file', ref: 'src/pages/SpeciesDossier.tsx', note: 'No link/action to /research found in this file this pass.' },
      ],
      nextAction: 'Confirm whether a dossier -> Research Station continuation path exists or should be added, matching the pattern already used for Atlas.',
      lane: 'INTEGRATION_COMPLETION',
      type: 'integration',
    }),
    confirmedMissing({
      idHint: 'int-conservatory-calyx',
      parentId: 'module-integration-journeys-core',
      name: 'Conservatory / OASIS -> Calyx handoff',
      evidence: [
        { kind: 'file', ref: 'src/pages/MyConservatory.tsx', note: 'No calyx/Calyx reference found (grep).' },
        { kind: 'file', ref: 'src/pages/OACS.tsx', note: 'No calyx/Calyx reference found (grep).' },
      ],
      nextAction: 'Build a Conservatory -> Calyx handoff (e.g. "Ask Calyx about this plant") following the same bounded-context contract pattern as the homepage/Research handoffs.',
      lane: 'PRODUCT_COMPLETION',
      type: 'integration',
    }),
    confirmedMissing({
      idHint: 'int-buying-companion-conservatory',
      parentId: 'module-integration-journeys-core',
      name: 'Orchid Buying Companion -> Conservatory handoff',
      evidence: [
        { kind: 'file', ref: 'src/App.tsx', note: 'Depends on the Orchid Buying Companion module, which does not exist anywhere in src/ this pass (see the Orchid Buying Companion domain).' },
      ],
      nextAction: 'Blocked on the Orchid Buying Companion module itself being built first; revisit once that module exists.',
      lane: 'PRODUCT_COMPLETION',
      type: 'integration',
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
    idHint: 'domain-buying-companion',
    name: 'Orchid Buying Companion',
    evidence: [
      { kind: 'file', ref: 'src/App.tsx', note: 'No route, component, or file matching "buying companion" found anywhere in src/ (grep -ri).' },
    ],
    nextAction: 'Confirm with the owner whether this module has a canonical name elsewhere in the codebase before building — no matching code was found this pass.',
    lane: 'PRODUCT_COMPLETION',
  },
  {
    idHint: 'domain-vision',
    name: 'Vision / image intelligence',
    evidence: [
      { kind: 'file', ref: 'src/lib/visionActivationPreflight.ts' },
      { kind: 'file', ref: 'src/lib/scientific-intelligence/vision/adapter.ts' },
      { kind: 'file', ref: 'src/components/matrix/VisionActivationPreflightCard.tsx' },
    ],
    nextAction: 'Trace vision adapter consumers beyond Matrix and score real image-review acceptance gates.',
    lane: 'SCIENTIFIC_DATA_COMPLETION',
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
  {
    idHint: 'domain-autonomous-control-plane',
    name: 'Autonomous completion control plane',
    evidence: [
      { kind: 'file', ref: 'src/lib/completion-graph/', note: 'This census itself — issue #281 is the first implementation of this domain.' },
      { kind: 'file', ref: 'src/lib/missionControlQueue.ts' },
      { kind: 'issue', ref: '#281' },
    ],
    nextAction: 'Wire this completion graph into Mission Control (in progress this PR) and connect the scheduler output to real queued issues.',
    lane: 'INTEGRATION_COMPLETION',
  },
  {
    idHint: 'domain-security-governance',
    name: 'Security / partner-data governance',
    evidence: [
      { kind: 'file', ref: 'src/lib/atlasLocalitySafety.ts', note: 'Sensitive-locality redaction exists for Atlas; not yet confirmed as a cross-cutting policy applied to every relevant domain.' },
    ],
    nextAction: 'Confirm security/governance acceptance gates are actually attached as cross-cutting checks on every domain above, not just Atlas.',
    lane: 'RELEASE_ACCEPTANCE',
  },
  {
    idHint: 'domain-production-release',
    name: 'Production/deployment/release operations',
    evidence: [
      { kind: 'file', ref: 'scripts/verify-deployment-contract.mjs' },
      { kind: 'file', ref: 'scripts/verify-university-production.mjs' },
    ],
    nextAction: 'Execute both verification scripts against the current deployment target and record pass/fail as deployed/operational evidence.',
    lane: 'RELEASE_ACCEPTANCE',
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
  homepageDomain,
  speciesDossierDomain,
  atlasDomain,
  literatureDomain,
  matrixDomain,
  universityDomain,
  integrationJourneysDomain,
  ...stubDomains,
]);

export const COMPLETION_GRAPH_CENSUS_DATE = CENSUS_DATE;
