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

/** Evidence-check date for the 2026-09-26 reconciliation against main 56bd85a. */
const RECON_0926_DATE = '2026-09-26T00:00:00.000Z';

/** The main commit the 2026-09-26 browser specs were executed against. */
const RECON_0926_SHA = '56bd85a50141ea1529e19da255208c07cca3bd24';

/**
 * Evidence note for a Playwright spec executed green at RECON_0926_SHA.
 * Reference-backend browser evidence proves the mounted production bundle
 * against fixture data; it is never deployed or production evidence.
 */
function referenceBackendRun(spec: string, passed: number, proves: string): Evidence {
  return {
    kind: 'test',
    ref: spec,
    note: `Executed green at main ${RECON_0926_SHA.slice(0, 8)} on 2026-09-26 (${passed}/${passed} passed, desktop-chromium, production bundle via vite preview) against the provider-free REFERENCE BACKEND (e2e/support/reference-backend.mjs). ${proves} Reference-backend evidence only: it is not deployed, live or production evidence.`,
  };
}

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
  reconciledAgainstSha: '56bd85a50141ea1529e19da255208c07cca3bd24',
  reconciledAt: '2026-09-26T08:15:00.000Z',
  scope:
    'Reconciled against main 56bd85a against the work merged on 2026-09-26 (#837, #838, #840-#846; #828/#829/#833; backend #1636-#1638). Browser gates are scored only where a Playwright spec was executed green at 56bd85a against the provider-free reference backend (e2e/support/reference-backend.mjs): that is fixture-backed browser evidence, never deployed or production evidence, and every deployed gate stays unevaluated. Leaves whose only remaining gates are owner-governed (deployed passes, auth policy, #788 acceptance, scientific review/publication) are OWNER_ACTION with the action named. Earlier domains retain their recorded evidence dates; this is not a new portfolio-wide audit. Census coverage is reported alongside each percentage.',
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
    {
      // Retain the original census allocation so existing oc-node bindings and
      // every later census ID stay stable. UNKNOWN was an unscored August
      // census entry, not a serialized state or a missing migration.
      ...censusPending({
        idHint: 'cap-atlas-next-thematic',
        parentId: 'module-atlas-next',
        name: 'Public thematic Atlas / advanced research Atlas',
        evidence: [
          { kind: 'route', ref: '/atlas-next' },
          { kind: 'file', ref: 'src/features/atlas-next/useAtlasData.publicErrors.test.ts' },
          { kind: 'file', ref: 'src/features/atlas-next/questions.ts', note: 'Record-location and knowledge-gap questions are implemented; unsupported scientific themes remain explicitly withheld.' },
          { kind: 'file', ref: 'src/features/atlas-next/useAtlasData.ts', note: 'Canonical occurrence reader; transport failure differs from empty evidence. No fixture coordinates are substituted.' },
          { kind: 'file', ref: 'src/features/atlas-next/AtlasNextShell.tsx', note: 'Public access is fixed explicitly. The full public/research split is not yet implemented.' },
          { kind: 'file', ref: 'src/components/orchid/HomeAtlasContinuum.tsx', note: 'Homepage shares featured-genus evidence and links to Atlas; the requested 4–6 thematic homepage choices remain unfinished.' },
          { kind: 'test', ref: 'src/features/atlas-next/failClosed.test.ts' },
          { kind: 'test', ref: 'src/features/atlas-next/featuredGenusResearchJourney.test.ts' },
          { kind: 'issue', ref: '#167', note: 'Continue the existing implementation and PR #174 lineage; do not claim deployed visual acceptance from source inspection.' },
        ],
        nextAction: 'Finish the bounded thematic homepage presentation and public/research disclosure using canonical evidence; preserve owner visual-review hold and unavailable themes.',
        lane: 'PRODUCT_COMPLETION',
      }),
      status: 'PARTIAL',
      threeLevels: { codeComplete: 'PARTIAL', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
      gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1,
        scientificProvenanceSecurity: 1, browserEndToEnd: null, deployedOperational: null },
      lastUpdated: '2026-09-21T00:00:00.000Z',
    },
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
// Real evidence, reconciled against main 56bd85a on 2026-09-26 (#840, which
// supersedes #832): route /literature renders <Literature/> (src/App.tsx),
// which lists the extraction corpus through src/lib/literatureIndex.ts from
// GET /api/literature-extraction/papers. The backend router mounts every
// /api/literature-extraction/* route behind verify_owner_or_api_key
// (app/literature_extraction/routes.py). #840 wrapped /literature and
// /literature/:paperId in ProtectedRoute and classified them
// router-authenticated; a signed-in member is still refused (the backend has
// no member path) and now sees a distinct owner-access state rather than a
// generic "unauthorised". Code and tests are real; the PUBLIC browser the
// leaf names is reachable by neither the public nor members, which is an
// owner access-policy decision, not a frontend gap.

const literaturePublicBrowser: CompletionNode = {
  ...censusPending({
    idHint: 'cap-literature-public-browser',
    parentId: 'module-literature-core',
    name: 'Public literature/evidence browser',
    evidence: [
      { kind: 'route', ref: '/literature', note: 'Routes to <Literature/> in src/App.tsx inside <ProtectedRoute/> since #840 (and /literature/:paperId likewise); the <ComingSoon/> placeholder is gone from this route.' },
      { kind: 'file', ref: 'src/lib/routeAccessPolicy.ts', note: '#840: /literature and /literature/:paperId are classified router-authenticated, matching the backend verify_owner_or_api_key gate instead of presenting a public page that refuses every visitor.' },
      { kind: 'test', ref: 'src/lib/routeAccessPolicy.test.ts', note: '#840: fails if the literature routes lose their ProtectedRoute wrapper or access classification.' },
      { kind: 'file', ref: 'src/components/literature/LiteratureAccessRequired.tsx', note: '#840: distinct 401/403 state ("Owner or API access required — this literature workspace is not yet open to members"), no retry, kept apart from outage (5xx/network), missing (404), malformed and empty states.' },
      { kind: 'file', ref: 'src/pages/Literature.tsx', note: 'Paged corpus listing with distinct unauthorised / outage / rejected / malformed states; counts, not content.' },
      { kind: 'file', ref: 'src/lib/literatureIndex.ts', note: 'Reads GET /api/literature-extraction/papers?limit&offset; a 200 without a papers array is malformed, never an empty corpus.' },
      { kind: 'file', ref: 'src/pages/LiteraturePaper.tsx', note: 'Single-paper view over /api/literature-extraction/papers/{id} and its source binding.' },
      { kind: 'test', ref: 'src/pages/Literature.test.tsx', note: 'Page tests: listing, damaged rows, paging, empty store, outage/retry, malformed 200, and (#840) the owner-access state mounted over the backend\'s own 401 bodies in __fixtures__/literatureAccessDenied.realBackend.json, captured with FastAPI TestClient from backend main c346a7219; 403 is a labelled synthetic shape because this gate never emits one.' },
      { kind: 'test', ref: 'src/pages/LiteraturePaper.test.tsx', note: 'Includes a mount over __fixtures__/literaturePaper.realBackend.json, captured from GET /api/literature-extraction/papers/{id} on backend main c37ff0ca6: every claim renders uncertain polarity, unreviewed, and publication blocked (awaiting review).' },
      { kind: 'file', ref: 'src/lib/explorationContext.ts', note: 'Exploration "literature" nodes now route to /literature instead of /coming-soon/literature.' },
    ],
    nextAction: 'Owner-gated first: the backend serves /api/literature-extraction/* only to an owner session or API key, so neither the public nor members can browse it (see ownerActions). Executable meanwhile, without changing auth: a reference-backend Playwright spec for /literature that signs in and asserts the owner-access state on the captured 401 and the listing/paging states on captured payloads. Discovery, dedupe, taxon linking, citations/source anchors and corpus-wide conflict review from the mission spec remain unbuilt.',
    lane: 'PRODUCT_COMPLETION',
  }),
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  // Claim review, polarity and the blocked publication decision are rendered
  // from a paper captured through the real backend route (main c37ff0ca6).
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1, browserEndToEnd: null, deployedOperational: null },
  prs: ['#840'],
  ownerActions: ['Access-policy decision (owner): either add a bounded member or public read-only listing to the backend literature-extraction router, or accept owner/API-key-only access as the final shape and rename this leaf accordingly. The frontend must not weaken or work around verify_owner_or_api_key.'],
  lastUpdated: RECON_0926_DATE,
};

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
  nextAction: 'The literature browser exists behind sign-in; the backend serves it to owner/API-key sessions only (owner access-policy decision recorded on the leaf). Decide the intelligence adapter\'s downstream integration.',
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
  nextAction: 'The morphology viewer surface itself was not changed or re-verified; its provenance gate stays unevaluated. Candidate score-vs-coverage and unknown-observation rendering on the same page are now pinned to captured backend payloads under cap-matrix-report-lexicon. Remaining: real specimen data and a browser pass (3 of 6 gate categories).',
  lastUpdated: CENSUS_DATE,
  children: [],
};

const matrixReportLexiconGate: CompletionNode = {
  id: 'cap-matrix-report-lexicon',
  parentId: 'module-matrix-core',
  name: 'Vision review, report generation & Lexicon/Calyx glossary explanation',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'PARTIAL' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    // Candidate comparison + Calyx explanation views are pinned to payloads
    // captured from the real backend routes: per-character basis, candidate
    // registry provenance, explanation provider/epistemic state, and a
    // locality-key guard on rendered provenance.
    scientificProvenanceSecurity: 1,
    // #846: the guided session was driven in a real browser against the
    // reference backend. Fixture-backed browser evidence, not deployment.
    browserEndToEnd: 1,
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
    { kind: 'file', ref: 'src/components/matrix/MatrixCandidateEvidence.tsx' },
    { kind: 'file', ref: 'src/lib/matrixCandidateEvidence.ts' },
    { kind: 'test', ref: 'src/lib/matrixCandidateEvidence.test.ts', note: 'Pinned to __fixtures__/matrixIdentification.realBackend.json, captured verbatim from backend main 73626917 via TestClient (sessions, evaluate, explain).' },
    { kind: 'test', ref: 'src/components/matrix/MatrixCandidateEvidence.test.tsx' },
    { kind: 'test', ref: 'src/pages/OrchidIdentificationNext.evidence.test.tsx' },
    referenceBackendRun('e2e/matrix-guided-session.spec.ts', 5, 'Drives /orchid-identification through one session (registry from the reference backend; create, two observations with one explicitly unknown, evaluate after each, Calyx explanation replayed from payloads captured from the backend Matrix routers via FastAPI TestClient over a SYNTHETIC registry): rank order, per-candidate basis, score vs coverage, the unknown observation recorded but ignored, registry and Calyx provenance, a synthetic locality token withheld, and exactly what the browser sent; fails closed on the backend\'s real 503, an unreachable service and two synthetic malformed 2xx evaluate bodies.'),
    { kind: 'file', ref: 'src/lib/matrixIdentification.ts', note: '#846: the client rejects non-JSON 2xx bodies, sessions without an id and evaluations it cannot render (previously a non-JSON evaluate body reported "Session ready" and a report-less evaluation crashed the route).' },
    { kind: 'test', ref: 'src/lib/matrixIdentification.test.ts' },
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#846', prState: 'merged', note: 'Corroboration only; merged as 56bd85a.' },
  ],
  prs: ['#846'],
  nextAction: 'Executable: extend e2e/matrix-guided-session.spec.ts (reference backend) to the vision review panel, report generation (MatrixReportPanel) and the Lexicon glossary guide, none of which the guided-session spec asserts. Owner-gated: a deployed pass on real specimen data (deployedOperational unevaluated; 5 of 6 gate categories evaluated).',
  lastUpdated: RECON_0926_DATE,
  children: [],
};

const matrixDomain = branch({
  id: 'domain-matrix',
  parentId: 'portfolio-orchid-continuum',
  name: 'Matrix Identification',
  type: 'domain',
  nextAction: 'Guided-session browser pass is in (#846, reference backend). Remaining: provenance and browser gates for the morphology viewer, browser coverage for vision review/report/glossary, and an audit of registry review and readiness.',
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
    // #845 (supersedes #796): the lab prototype's release gate is mounted over
    // payloads captured from the backend learning API and fails closed when it
    // is unavailable or disabled. Unit/render tests: not browser evidence.
    scientificProvenanceSecurity: 1,
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
    { kind: 'test', ref: 'src/pages/OrchidUniversity.test.tsx', note: '#845: first page-level mount of /university; renders the guided-inquiry curriculum rather than an empty or error tree, and keeps the reviewer-boundary text honest.' },
    { kind: 'test', ref: 'src/pages/UniversityLabPrototype.test.tsx', note: '#845: mounts the lab prototype over __fixtures__/universityReadOnly.realBackend.json, captured verbatim from backend main c346a7219 via FastAPI TestClient (/api/learning/release-readiness, /capabilities, /catalog, /chapters/{id}, /laboratories/{id}); backend-unavailable fails closed with no substituted science (synthetic rejected-promise error state), university-disabled stays closed and lists the captured blockers, read-only renders the captured chapter and laboratory.' },
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#845', prState: 'merged', note: 'Corroboration only; merged as 464af79.' },
    { kind: 'file', ref: 'scripts/verify-university-production.mjs', note: 'Dedicated production-verification script exists — see Release/Acceptance domain.' },
  ],
  prs: ['#845'],
  nextAction: 'Executable: a reference-backend Playwright spec for /university and /university/lab asserting the captured read-only and disabled release states in a real browser (no browser pass exists yet). Owner-gated: the deployed run of `npm run verify:university-production`, tracked as OWNER_ACTION on cap-university-production-live-verification.',
  lastUpdated: RECON_0926_DATE,
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

const schedulerIssueAutomationGap: CompletionNode = {
  ...censusPending({
    idHint: 'cap-scheduler-issue-automation',
    parentId: 'module-autonomous-control-plane-core',
    name: 'Scheduler output wired to real GitHub issue creation/queueing',
    evidence: [
      { kind: 'file', ref: 'src/lib/completion-graph/graphDiscovery.ts', note: 'discoverGraphIssues(): walks selectAdmissibleLeaf() ranking, declares the capability from the leaf, dedupes by OC-DISCOVERY-FINGERPRINT against open and closed issues, at most 3 per pass, files nothing when the index cannot be read.' },
      { kind: 'file', ref: 'scripts/oc-supervisor-discovery.ts', note: 'materializeDiscoveredGraphIssues() runs in the scheduled supervisor job: label-query index, labels created before the write, each filed/not-filed candidate recorded in .oc-wave/supervisor-discovery.json.' },
      { kind: 'test', ref: 'src/lib/completion-graph/graphDiscovery.test.ts' },
      { kind: 'test', ref: 'src/lib/control-plane/supervisorDiscovery.test.ts' },
      { kind: 'file', ref: 'src/lib/completion-graph/graphOps.ts', note: 'selectNextUnmetGate() remains the Observatory display; the executable loop uses the same scheduler ranking through selectAdmissibleLeaf().' },
    ],
    nextAction: 'Observe the first scheduled supervisor run on main that files a discovered issue and record its run id and issue number here; until then the loop is code-complete and wired, not proven live.',
    lane: 'INTEGRATION_COMPLETION',
  }),
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 0,
    scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
  lastUpdated: '2026-09-25T00:00:00.000Z',
};

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
    { kind: 'ci', ref: 'npm run validate:deployment', note: 'Local execution output: "Deployment contract valid. Verified 5 critical client routes and two SPA fallback mechanisms." Exit code 0. This is a static-file contract check (App.tsx routes and public/_redirects, the sole Render routing mechanism), not a live deployment probe.' },
  ],
  nextAction: 'This checks local contract files only — still needs a real browser/live pass against the actual deployed origin to confirm the routes resolve correctly in production, not just that the config declares them.',
  lastAccomplishment: 'Ran `npm run validate:deployment` against current HEAD this pass: passed cleanly, confirming /university, /university/lab, /conservatory/*, /mission-control, /calyx are all declared routes with a working SPA fallback in public/_redirects.',
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
    { kind: 'ci', ref: 'npm run verify:university-production', note: 'Executed this pass with no arguments: "FAIL: frontend URL is required", exit code 1. The script takes the production frontend/API origins as positional CLI arguments; no canonical production URL is documented anywhere in this repository (README, docs/, package.json) for an autonomous run to supply.' },
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

// #842 (2026-09-26): the Lexicon entry view reads the public Vision-Lexicon
// concept evidence summary. A new leaf rather than evidence on the Matrix
// preflight: it is a separate route, consumer and backend contract.
const visionLexiconEvidenceSummaryGate: CompletionNode = {
  id: 'cap-vision-lexicon-evidence-summary',
  parentId: 'module-vision-core',
  name: 'Public vision-evidence summary on Lexicon entries',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
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
    { kind: 'route', ref: '/lexicon/*' },
    { kind: 'file', ref: 'src/components/lexicon/EntryView.tsx', note: 'Mounts VisionEvidenceSummary for the entry\'s concept_id; entries without a UUID concept id keep the static Vision Lab note and make no request.' },
    { kind: 'file', ref: 'src/components/lexicon/VisionEvidenceSummary.tsx', note: 'Renders counts, review state, reference-set titles and backend limitations as returned; outage and malformed bodies are never shown as "no evidence"; no image is rendered.' },
    { kind: 'file', ref: 'src/lib/visionEvidence.ts', note: 'Fail-closed client for the public GET /api/vision-lexicon/lexicon/concepts/{concept_id}/vision-evidence (backend app/vision_lexicon/routes.py, mounted on backend main): not_applicable / unavailable / malformed / empty / ready; credentials omitted; no image URL constructed.' },
    { kind: 'test', ref: 'src/lib/visionEvidence.test.ts', note: 'Pinned to __fixtures__/visionEvidence.realBackend.json, captured via FastAPI TestClient from backend main c346a7219 (the populated case was built in-process through the real reference-set and analysis routes; no durable persistence).' },
    { kind: 'test', ref: 'src/components/lexicon/VisionEvidenceSummary.test.tsx' },
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#842', prState: 'merged', note: 'Corroboration only; merged as 9192a69.' },
  ],
  prs: ['#842'],
  nextAction: 'Executable: a reference-backend Playwright spec that opens a Lexicon entry with a UUID concept id and asserts the ready, empty, unavailable and malformed states from the captured payloads. Owner-gated: a deployed pass against canonical Vision-Lexicon evidence (no production evidence exists).',
  lastUpdated: RECON_0926_DATE,
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
  }, [visionMatrixReviewGate, visionIntelligenceAdapterGate, visionLexiconEvidenceSummaryGate]),
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
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'UNKNOWN' },
  lane: 'RELEASE_ACCEPTANCE',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    // #838: the trace is a running test on main, not a one-off grep.
    integrationCanonicalBranch: 1,
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
    { kind: 'test', ref: 'src/lib/localitySafetyCrossCutting.test.ts', note: '#838 (supersedes #831): fails CI when any traced source file of Conservation, Species Dossier, Matrix (14 files incl. RelationshipMatrixNext, AtlasMatrixContinuation and the matrix components/libs), Conservatory/OASIS (MyConservatory, ConservatoryReadiness, OasisConnective, conservatoryCultivationCalyx) or University (OrchidUniversity, lab prototype, reviewer workspace/panel, notebook, investigations, universityApi/ReviewerApi/Release) gains an unreviewed latitude/longitude/lat/lng/lon/locality/coordinate line; only policy prose stating that locality is withheld is allow-listed. A static source check: it does not observe runtime payloads.' },
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#838', prState: 'merged', note: 'Corroboration only; merged as 6992e31.' },
  ],
  prs: ['#838'],
  nextAction: 'Add the surfaces merged on 2026-09-26 and still outside the pinned list to TRACED_SURFACES in src/lib/localitySafetyCrossCutting.test.ts: src/lib/interactionDiscovery.ts and src/components/interactions/InteractionDiscoveryPanel.tsx (#841), src/lib/visionEvidence.ts and src/components/lexicon/VisionEvidenceSummary.tsx (#842), src/features/atlas-next/incomingTaxon.ts (#844); then decide whether Home, Calyx, Lexicon, LiteraturePaper, DeceptionLab and CommunityObservation join the traced scope. A browser-level check that no rendered page shows coordinates outside Atlas remains unevaluated.',
  lastAccomplishment: '#838 pinned the locality trace for Conservation, Species Dossier, Matrix, Conservatory/OASIS and University as a running Vitest suite on main.',
  lastUpdated: RECON_0926_DATE,
  children: [],
};

const securityGovernanceDomain = branch({
  id: 'domain-security-governance',
  parentId: 'portfolio-orchid-continuum',
  name: 'Security / partner-data governance',
  type: 'domain',
  nextAction: 'Locality trace now pinned for Matrix/Conservatory-OASIS/University (#838); add the 2026-09-26 surfaces to it, and audit ProtectedRoute coverage and partner-data disclosure as separate capabilities.',
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
  // Only the deployed gate remains, and it is owner-governed.
  status: 'OWNER_ACTION',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'PARTIAL' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    // #845 (supersedes #808): reference-backend browser pass, not deployment.
    browserEndToEnd: 1,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/components/calyx/ScientificSynthesis.tsx', note: 'Renders CalyxVerificationWorkbench from CalyxWorkspace -- confirmed reachable from /speak-with-calyx, not orphaned.' },
    { kind: 'file', ref: 'src/components/calyx/CalyxVerificationWorkbench.tsx' },
    { kind: 'file', ref: 'src/lib/calyxVerification.ts', note: 'checkCalyxMissionClaim() structurally checks sourceRevisionId, anchorIds, locator, excerpt, and content hash per evidence item and fails/needs_review closed when any are absent -- genuine provenance enforcement, not a cosmetic pass-through.' },
    { kind: 'test', ref: 'src/lib/calyxVerification.test.ts' },
    { kind: 'test', ref: 'src/components/calyx/ScientificSynthesis.test.tsx' },
    { kind: 'test', ref: 'src/lib/naoccGovernedVerificationContinuity.test.ts', note: 'Cross-checks checkCalyxMissionClaim against buildCalyxTurnContext and researchStationCalyxHref together, confirming Research identity stays non-evidentiary while Calyx audits only governed evidence.' },
    referenceBackendRun('e2e/calyx-verification-workbench.spec.ts', 1, 'Drives /speak-with-calyx, opens "Check Calyx" and asserts the audit the reference mission\'s own evidence earns: a failing exact-source-anchors check (the fixture source has no locator), the withheld-vs-absent excerpt distinction, retained counterevidence and the stated publication objection, with provenance verbatim. The mission is invented fixture material.'),
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#845', prState: 'merged', note: 'Corroboration only; merged as 464af79 (ports #808 verbatim).' },
  ],
  prs: ['#845'],
  ownerActions: ['Run (or authorise a run of) the Workbench against a real, non-fixture Calyx mission on the deployed orchid-calyx-backend and record the audit it renders; automation must not infer deployed readiness from the reference backend.'],
  nextAction: 'Owner-gated: deployed pass auditing a real (non-fixture) Calyx mission claim (deployedOperational unevaluated; the reference-backend browser pass is in).',
  lastUpdated: RECON_0926_DATE,
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
    { kind: 'file', ref: 'src/lib/calyxScience.ts', note: '#845 (supersedes #795): fetchCalyxScienceDashboard() settles the eight /api/science/* calls independently (Promise.allSettled); a failed section is recorded in sectionErrors and its data stays empty/null, and the call throws only when every endpoint is unreachable -- no fabricated department/gap/mission data.' },
    { kind: 'file', ref: 'src/pages/CalyxScienceStatus.tsx', note: '#845: stat tiles read "-"/"unavailable" rather than a fabricated zero when their section failed or no dashboard exists; runtime mode reads "unavailable" when summary and status both failed; failed department/dataset/dossier sections say the telemetry is unavailable, not confirmed zero.' },
    { kind: 'test', ref: 'src/lib/calyxScience.test.ts', note: 'Healthy responses are /api/science/* payloads captured verbatim from backend main c346a7219 (__fixtures__/calyxScienceDashboard.realBackend.json); failing endpoints are synthetic HTTP 5xx error states.' },
    { kind: 'test', ref: 'src/pages/CalyxScienceStatus.test.tsx', note: '#845: page mounted over the same captured payloads with a synthetic HTTP 503 for failing sections; only the owner-session check is mocked to reach the dashboard, the owner gate itself is unchanged. Unit/render evidence, not browser evidence.' },
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#845', prState: 'merged', note: 'Corroboration only; merged as 464af79.' },
    { kind: 'file', ref: 'src/lib/ownerOperationsConsole.ts', note: 'createOwnerSession/validateOwnerSession gate the dashboard; validateOwnerSession rejects sessions with authenticated:true but a missing/whitespace owner field.' },
    { kind: 'test', ref: 'src/lib/ownerSessionVerification.test.ts' },
    { kind: 'test', ref: 'src/lib/ownerControlVerification.test.ts' },
  ],
  prs: ['#845'],
  ownerActions: ['Run /calyx-science against the deployed Calyx backend with a real owner session (an owner-held credential no agent can create) and record the departments/gaps actually returned.'],
  nextAction: 'Executable: serve the captured /api/science/* payloads and a reference owner-session stand-in from e2e/support/reference-backend.mjs (it has neither today; the app\'s owner gate is not changed), then a Playwright spec for /calyx-science asserting the per-section unavailable states in a real browser (browserEndToEnd unevaluated). Owner-gated: the deployed run in ownerActions.',
  lastUpdated: RECON_0926_DATE,
  children: [],
};

const calyxVerificationDomain = branch({
  id: 'domain-calyx-verification',
  parentId: 'portfolio-orchid-continuum',
  name: 'Calyx reasoning + Verification Workbench',
  type: 'domain',
  nextAction: 'Workbench browser pass is in (#845, reference backend; deployed pass owner-gated). Remaining: browser passes for conversational reasoning and Science Status, and an audit of the Calyx voice/speech pipeline as a separate capability.',
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

// Evidence-gap research missions (2026-09-25). The supervisor's backend reserve
// pass files canonical bounded research missions (backendReserveQueueBridge.ts)
// that no node named, so every one landed in `unboundQueued`. This leaf is their
// issue-side binding target (`OC-GRAPH-NODE:` in the mission body). Only the
// `nomenclature` and `morphology` domains have provider-free executors; other domains bind here
// but declare no capability and keep the honest undeclared refusal. A lane that
// runs settles to `oc-validating` at most -- a machine report is evidence for
// human review, never acceptance -- so this leaf stays PARTIAL. It has no
// dependsOn and nothing depends on it: its exclusive lease holds only this node.
const kgEvidenceGapResearchMissionsGate: CompletionNode = {
  id: 'cap-kg-evidence-gap-research-missions',
  parentId: 'module-knowledge-graph-core',
  name: 'Evidence-gap research missions (bounded, review_required nomenclature evidence reports)',
  type: 'capability',
  status: 'PARTIAL',
  threeLevels: { codeComplete: 'PARTIAL', integratedComplete: 'PARTIAL', productComplete: 'NOT_MET' },
  lane: 'SCIENTIFIC_DATA_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    // Scheduled run 36226111465 on main executed a reserve mission to
    // oc-validating. Execution on main is not acceptance: reports await
    // human scientific review, so product stays NOT_MET.
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'file', ref: 'src/lib/control-plane/backendReserveQueueBridge.ts', note: 'sourcePayloadBody() emits OC-GRAPH-NODE for every canonical research mission and OC-SWARM-CAPABILITY only for an executable domain: nomenclature-evidence-lookup for "nomenclature", morphology-source-lookup for "morphology".' },
    { kind: 'file', ref: 'scripts/oc-nomenclature-lookup.mjs', note: 'Provider-free executor: at most 3 GBIF species GETs (no occurrence/locality endpoint), writes oc.nomenclature-evidence-report.v1 with review_required true and every mutation/publication flag false, posts one digest-idempotent comment.' },
    { kind: 'file', ref: 'scripts/oc-capability-router.mjs', note: 'LOCAL_EXECUTORS binds nomenclature-evidence-lookup to npm run research:nomenclature-lookup and morphology-source-lookup to npm run research:morphology-source-lookup.' },
    { kind: 'file', ref: 'scripts/oc-morphology-source-lookup.mjs', note: 'Provider-free executor for domain "morphology": GBIF species/match, the accepted usage\'s descriptions and at most 5 source-usage records (no occurrence/distribution endpoint). Keeps only morphology/diagnostic/general description types, never reproduces description text, writes oc.morphology-source-report.v1 (review_required, every mutation/publication flag false) and one digest-idempotent comment.' },
    { kind: 'test', ref: 'src/morphologySourceLookup.test.ts', note: 'Documented-shape GBIF description fixtures (labelled fixture-only); covers domain gating, type allowlist and locality exclusion, no text reproduction, URL allowlist, transport failure, idempotent comment, routing and settlement to oc-validating.' },
    { kind: 'test', ref: 'src/nomenclatureLookup.test.ts', note: 'Replays GBIF responses captured from api.gbif.org; covers parsing/refusal, domain gating, match-type mapping, contradiction, transport failure, idempotent comment, routing, graph binding and settlement to oc-validating; since #837 also that a binding is derived only from an issue authored by the reserve bot with the oc-discovered label, and that only report markers authored by github-actions[bot] suppress a report.' },
    { kind: 'file', ref: 'scripts/oc-reserve-mission-binding.mjs', note: '#837: deriveReserveMissionBinding() requires the reserve-bot author and oc-discovered label (a snapshot with no author derives nothing); #829: EXECUTABLE_RESERVE_DOMAINS (now [\'nomenclature\', \'morphology\'], from RESERVE_DOMAIN_CAPABILITIES) — an open reserve mission in a domain no local executor runs no longer holds reserve depth (the open-issue ceiling still counts it).' },
    { kind: 'file', ref: 'scripts/oc-dispatch-control.ts', note: '#828: DETERMINISTIC_ONLY_NODES makes this node admissible only for issues that route provider-free; provider-lane issues bound here stay queued with the reason.' },
    { kind: 'file', ref: 'src/lib/control-plane/backendReservePlanClient.ts', note: '#829: the reserve-plan request sends domain=<executable domains>; a prepared mission in a non-executable domain is still refused before filing if a backend ignores the filter.' },
    { kind: 'test', ref: 'src/providerCapacityAdmission.test.ts', note: '#828: without the guard a provider-lane issue on this node is admitted with a free provider slot.' },
    { kind: 'test', ref: 'src/lib/control-plane/supervisorDiscovery.test.ts', note: '#829: the captured backend plan (morphology, phenology, nomenclature) now files the morphology and nomenclature missions and leaves phenology unfiled; the #825-#827 bodies, replayed with a domain that has no executor (phenology), release depth but count at the ceiling.' },
    { kind: 'file', ref: '.github/workflows/orchid-continuous-completion.yml', note: '#833: dispatch and audit jobs are skipped on pull_request, so unmerged code can no longer execute a reserve mission against the live queue (PR #821 run 36188258778 had executed #816).' },
    { kind: 'commit', ref: 'jsp1440/orchid-calyx-backend@a102e9fb8', note: 'Backend #1636: evidence_gap_candidates skips caller-held missions before the per-pass cap of 3.' },
    { kind: 'commit', ref: 'jsp1440/orchid-calyx-backend@24252d2a9', note: 'Backend #1637: GET /api/runner/knowledge-gaps/reserve-plan accepts a repeatable domain filter applied before the cap (422 on unknown domains).' },
    { kind: 'commit', ref: 'jsp1440/orchid-calyx-backend@c346a7219', note: 'Backend #1638: pages past held example taxa via a read-only keyset query (locality-gated domains return nothing) so nomenclature gaps keep yielding missions.' },
    { kind: 'ci', ref: 'jsp1440/orchid-continuum-frontend/actions/runs/36226111465', note: 'Scheduled "Orchid Continuous Completion" run on main (head bb53932, #833), 2026-09-26T07:13Z, conclusion success: executed reserve mission #836 (Acianthera esmeraldae) with npm run research:nomenclature-lookup, exit 0, provider_calls 0, posted a review_required report; #836 carries oc-validating (as do #834 and #835, filed the same morning; their run ids were not checked in this pass).' },
  ],
  prs: ['#819', '#828', '#829', '#833', '#837'],
  ownerActions: ['Human scientific review of the machine-retrieved nomenclature reports on #816-#818, #823, #824, #830 and #834-#836 (all oc-validating). Accepting any of them, and any KG, taxonomy or publication change, is owner-governed; automation settles a report to oc-validating at most.'],
  nextAction: 'deliver a review_required nomenclature evidence report; no publication/KG/taxonomy mutation',
  lastUpdated: RECON_0926_DATE,
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
  }, [kgGenusEvidenceGate, kgVisualizationGate, kgMissionControlAdapterGate, kgEvidenceGapResearchMissionsGate]),
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
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'PARTIAL' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    browserEndToEnd: 1,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/conservatory/*' },
    { kind: 'file', ref: 'src/pages/MyConservatory.tsx' },
    { kind: 'file', ref: 'src/components/auth/ProtectedRoute.tsx', note: 'Confirmed by reading src/App.tsx: /conservatory/* is wrapped in ProtectedRoute, not publicly reachable without auth.' },
    { kind: 'test', ref: 'src/pages/MyConservatory.test.tsx' },
    { kind: 'test', ref: 'e2e/conservatory-journey.spec.ts', note: 'Scheduled provider-free run 3738 passed all 14 mounted production-bundle browser checks, including CRUD/persistence, QR round trip, photo privacy, collection review, buying companion, auth persistence, iPad layout, and Calyx cultivation handoff.' },
  ],
  nextAction: 'Owner-gated confirmation against the deployed live backend and a real authenticated session remains; the provider-free reference backend does not prove production service readiness.',
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

const researchStationDomain = branch({
  id: 'domain-research-station',
  parentId: 'portfolio-orchid-continuum',
  name: 'Research Station',
  type: 'domain',
  nextAction: 'Trait Explorer awaits owner access-policy and deployed passes (see its ownerActions); continue the remaining workbench census without duplicating existing project or literature implementations.',
}, [branch({
  id: 'domain-research-station-module',
  parentId: 'domain-research-station',
  name: 'Research Station',
  type: 'module',
  nextAction: 'See trait retrieval and remaining capability gates.',
}, [
  censusPending({
    idHint: 'domain-research-station-cap',
    parentId: 'domain-research-station-module',
    name: 'Remaining Research Station capability census',
    evidence: [
      { kind: 'route', ref: '/research' },
      { kind: 'file', ref: 'src/pages/ResearchCenter.tsx' },
      { kind: 'issue', ref: '#278', note: 'Atlas -> Research handoff scored separately under Atlas.' },
    ],
    nextAction: 'Audit the project workbench, advanced queries, ecological networks, literature and exports independently of the bounded Trait Explorer consumer.',
    lane: 'PRODUCT_COMPLETION',
  }),
  {
    id: 'cap-research-trait-explorer',
    parentId: 'domain-research-station-module',
    name: 'Trait Explorer: subject-bound read-only retrieval with provenance',
    type: 'capability',
    // Only owner-governed gates remain: the backend's access policy and a
    // deployed pass.
    status: 'OWNER_ACTION',
    threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'PARTIAL' },
    lane: 'PRODUCT_COMPLETION',
    gateScores: {
      architectureContracts: 1,
      implementationPresent: 1,
      // Consumer on frontend main; GET /api/research/traits (backend #1611)
      // is on backend main (app/research_traits/routes.py, re-captured at
      // 615af698b with identical bodies apart from generated_at).
      integrationCanonicalBranch: 1,
      scientificProvenanceSecurity: 1,
      // #843: reference-backend browser pass, not deployment.
      browserEndToEnd: 1,
      deployedOperational: null,
    },
    evidence: [
      { kind: 'issue', ref: '#525' },
      { kind: 'route', ref: '/research' },
      { kind: 'doc', ref: 'docs/contracts/RESEARCH-TRAITS-001.md', note: 'Consumer contract only; backend implementation is not claimed.' },
      { kind: 'file', ref: 'src/components/research/ResearchTraitExplorer.tsx' },
      { kind: 'file', ref: 'src/lib/researchTraits.ts' },
      { kind: 'test', ref: 'src/lib/researchTraits.test.ts' },
      { kind: 'test', ref: 'src/components/research/ResearchTraitExplorer.test.tsx' },
      { kind: 'test', ref: 'src/lib/researchTraits.pr1611Payload.test.ts', note: 'Client accepts AVAILABLE/UNAVAILABLE/ABSENT bodies captured from backend PR #1611 (head d68d9a9e); #843 re-captured from backend main 615af698b with the same harness and found identical bodies apart from generated_at.' },
      { kind: 'file', ref: 'e2e/support/reference-backend.mjs', note: '#843: answers GET /api/research/traits only for the two captured subjects, verbatim from src/lib/__fixtures__/researchTraits.pr1611.json; any other subject gets a 503. Failure modes: the captured 401 and FastAPI 500, and a clearly synthetic off-contract body.' },
      referenceBackendRun('e2e/research-trait-explorer.spec.ts', 7, 'Signs in through ProtectedRoute on /research: AVAILABLE values render with provenance while null counts and sample sizes stay UNKNOWN, a WITHHELD trait discloses nothing, UNAVAILABLE and ABSENT render as distinct non-findings with no records, and a 500, a 401 and an off-contract body fail closed and clear prior records.'),
      { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#843', prState: 'merged', note: 'Corroboration only; merged as 350cc39.' },
    ],
    issues: ['#525'],
    prs: ['#843'],
    ownerActions: [
      'Access-policy decision (owner): the backend mounts /api/research/traits behind verify_owner_or_api_key, so a signed-in member is answered 401 (the state the #843 spec asserts). Decide whether members get a bounded read path; the frontend must not work around the gate.',
      'Deployed pass: open /research on the deployed release against the deployed backend with canonical persisted trait evidence and record what renders (deployedOperational unevaluated).',
    ],
    nextAction: 'Owner-gated: the access-policy decision and deployed pass named in ownerActions. The reference-backend browser pass is in (#843); the frontend reports missing/unavailable contracts without fabricated data.',
    lastAccomplishment: '#843 drove the Trait Explorer in a real browser against captured backend bodies on the reference backend, including every fail-closed state.',
    lastUpdated: RECON_0926_DATE,
    children: [],
  },
  {
    id: 'cap-research-evidence-chain',
    parentId: 'domain-research-station-module',
    name: 'Workbench evidence chain: candidate knowledge, review standing, conflicts and citing ledger',
    type: 'capability',
    status: 'PARTIAL',
    threeLevels: { codeComplete: 'MET', integratedComplete: 'UNKNOWN', productComplete: 'NOT_MET' },
    lane: 'PRODUCT_COMPLETION',
    gateScores: {
      architectureContracts: 1,
      implementationPresent: 1,
      integrationCanonicalBranch: null,
      scientificProvenanceSecurity: 1,
      browserEndToEnd: null,
      deployedOperational: null,
    },
    evidence: [
      { kind: 'route', ref: '/research' },
      { kind: 'file', ref: 'src/components/research/ResearchEvidenceChain.tsx' },
      { kind: 'file', ref: 'src/lib/researchEvidenceChain.ts', note: 'Reads GET /api/candidate-knowledge/candidates/{id}, /api/candidate-knowledge/conflicts and /api/research/projects/{id}/reasoning-ledgers, all served on backend main.' },
      { kind: 'test', ref: 'src/lib/researchEvidenceChain.test.ts', note: 'Pinned to __fixtures__/researchEvidenceChain.realBackend.json, captured through TestClient on backend main c37ff0ca6 with the repo fakes.' },
      { kind: 'test', ref: 'src/components/research/ResearchEvidenceChain.test.tsx' },
    ],
    nextAction: 'Merge to main (integration gate), then a signed-in browser pass on a project whose evidence links resolve to real candidates. Aggregate evidence detail (/api/evidence-aggregation/aggregates/{id}) is not yet read.',
    lastUpdated: '2026-09-25T00:00:00.000Z',
    children: [],
  },
])]);

const ecologicalRelationshipsDomain = branch({
  id: 'domain-pollinator-mycorrhiza',
  parentId: 'portfolio-orchid-continuum',
  name: 'Pollinator / mycorrhiza / ecological relationships',
  type: 'domain',
  nextAction: 'Run a browser pass against deployed canonical records for both relationship leaves; retain explicit unavailable states when relationship tables are empty or discovery is unavailable.',
}, [
  branch({
    id: 'module-pollinator-mycorrhiza',
    parentId: 'domain-pollinator-mycorrhiza',
    name: 'Pollinator and mycorrhizal relationship profiles',
    type: 'module',
    nextAction: 'See the real-data relationship capability.',
  }, [
    {
      id: 'cap-pollinator-mycorrhiza-real-data',
    parentId: 'module-pollinator-mycorrhiza',
    name: 'Canonical pollinator and mycorrhizal relationship retrieval',
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
      { kind: 'issue', ref: '#528' },
      { kind: 'route', ref: '/pollinators/:taxa' },
      { kind: 'route', ref: '/mycorrhizae/:taxa' },
      { kind: 'file', ref: 'src/lib/orchidContinuum.ts', note: 'Pollinator aggregates read species.pollinators plus atlas_occurrences; mycorrhizal aggregates join species to species_mycorrhizal. Empty or unavailable reads return no relationship rather than fixtures.' },
      { kind: 'file', ref: 'src/pages/PollinatorProfile.tsx' },
      { kind: 'file', ref: 'src/pages/MycorrhizaProfile.tsx', note: 'Empty relationship state explicitly says no mycorrhizal data will be fabricated.' },
      { kind: 'test', ref: 'src/lib/ecologicalRelationshipData.sourceIntegrity.test.ts' },
      { kind: 'test', ref: 'src/lib/completion-graph/completionGraphData.test.ts' },
    ],
    issues: ['#528'],
    nextAction: 'Verify both profiles in a deployed browser against canonical populated and empty relationship states; code, integration, and anti-fabrication sourcing are proven, but browser/deployment gates remain unevaluated.',
    lastAccomplishment: 'Verified canonical Supabase-backed relationship reads and added regression guards against fixture fallback while preserving honest empty states.',
    lastUpdated: '2026-09-08T00:00:00.000Z',
      children: [],
    },
    // #841 (2026-09-26): a separate backend contract and consumer from the
    // Supabase-backed profiles above, so it is its own leaf.
    {
      id: 'cap-relationship-interaction-discovery',
      parentId: 'module-pollinator-mycorrhiza',
      name: 'Relationship Explorer: review-bound GloBI interaction discovery with provenance',
      type: 'capability',
      status: 'PARTIAL',
      threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
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
        { kind: 'route', ref: '/relationship-explorer/:species' },
        { kind: 'file', ref: 'src/pages/RelationshipExplorer.tsx', note: 'Mounts InteractionDiscoveryPanel for the routed species.' },
        { kind: 'file', ref: 'src/components/interactions/InteractionDiscoveryPanel.tsx', note: 'Renders each GloBI candidate verbatim with provider, dataset version, study citation and UNVERIFIED evidence state; truncation is stated; an empty result reads as an ingestion gap, not an ecological finding.' },
        { kind: 'file', ref: 'src/lib/interactionDiscovery.ts', note: 'Fail-closed client for the public GET /api/interactions/discovery (backend app/interaction_discovery/routes.py, mounted on backend main): ok / empty / unavailable / malformed; field allow-list drops locator, revision_id and any locality field; refuses an empty taxon; a body without review_bound / knowledge_graph_mutation guarantees is malformed, not empty.' },
        { kind: 'test', ref: 'src/lib/interactionDiscovery.realBackendContract.test.ts', note: 'Pinned to __fixtures__/interactionDiscovery.realBackend.json, captured via FastAPI TestClient on app.main from backend main c346a7219; the ok shape is the backend\'s own test fixture records ingested through the real GloBI ingest path.' },
        { kind: 'test', ref: 'src/components/interactions/InteractionDiscoveryPanel.test.tsx' },
        { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#841', prState: 'merged', note: 'Corroboration only; merged as bec8b2e.' },
      ],
      prs: ['#841'],
      nextAction: 'Executable: a reference-backend Playwright spec on /relationship-explorer/:species asserting the ok (with provenance and UNVERIFIED state), empty, unavailable and malformed panel states from the captured payloads. Owner-gated: a deployed pass against ingested GloBI records; promoting any candidate to a verified KG edge is human-review work, never automatic.',
      lastUpdated: RECON_0926_DATE,
      children: [],
    },
  ]),
]);

const STUB_DOMAINS: StubDomainSpec[] = [
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
    { kind: 'file', ref: 'scripts/featured-genus-render-sentinel.mjs', note: 'The governed provider-free validator checks approved Calyx media provenance, the mounted Featured Genus section and continuation, browser errors, and the deployed release SHA.' },
    { kind: 'ci', ref: 'npm run verify:featured-genus', note: 'A passing deployed-browser acceptance report is required before this leaf may settle from validation to done; route smoke/build/test evidence alone remains validation.' },
  ],
  issues: ['#47'],
  nextAction: 'Run `npm run verify:featured-genus` against the current Render release and require the deployed-browser acceptance report (approved media/provenance, synchronized continuation, no browser errors, and an attested release SHA). Provider-backed narrative generation is not part of this provider-free gate.',
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
  // Only the deployed gate remains, and it is owner-governed.
  status: 'OWNER_ACTION',
  threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'PARTIAL' },
  lane: 'PRODUCT_COMPLETION',
  gateScores: {
    architectureContracts: 1,
    implementationPresent: 1,
    integrationCanonicalBranch: 1,
    scientificProvenanceSecurity: 1,
    // #845 (supersedes #810): production-bundle browser pass, not deployment.
    browserEndToEnd: 1,
    deployedOperational: null,
  },
  evidence: [
    { kind: 'route', ref: '/education/judging-practice' },
    { kind: 'file', ref: 'src/pages/JudgingPractice.tsx', note: 'Header comment states the capability was recovered from the retired FCOS judging app but its "authority claim did not" come across: scoring is deterministic, a person enters every score, nothing is persisted, and no award is issued or predicted. RUBRIC_PROVENANCE discloses the rubric as "an unverified historical snapshot" on the page itself.' },
    { kind: 'file', ref: 'src/lib/judgingPractice.ts' },
    { kind: 'test', ref: 'src/lib/judgingPractice.test.ts' },
    { kind: 'test', ref: 'src/pages/JudgingPractice.test.tsx' },
    referenceBackendRun('e2e/judging-practice-journey.spec.ts', 5, 'Rubric provenance disclosed on the page as an unverified historical snapshot, all six AOS criteria rendered, the band withheld on an incomplete sheet, a complete sheet scored deterministically with the not-an-award statement, and switching organisation resets entries. The page is client-only; no backend datum is involved.'),
    { kind: 'pr', ref: 'jsp1440/orchid-continuum-frontend#845', prState: 'merged', note: 'Corroboration only; merged as 464af79.' },
  ],
  prs: ['#845'],
  ownerActions: ['Deployed pass: open /education/judging-practice on the current Render release and confirm the rubric provenance disclosure and deterministic scoring render (deployedOperational unevaluated).'],
  nextAction: 'Owner-gated: the deployed pass named in ownerActions. The production-bundle browser pass is in (#845).',
  lastUpdated: RECON_0926_DATE,
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
  nextAction: 'Judging practice has its browser pass (#845; deployed pass owner-gated). Run browser passes for the glossary hub, Orchids on Screen and the Scientific Method Lab; the teacher dashboard remains owner/backend-blocked, not a frontend gap.',
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
  researchStationDomain,
  ecologicalRelationshipsDomain,
  ...stubDomains,
]);

export const COMPLETION_GRAPH_CENSUS_DATE = CENSUS_DATE;
