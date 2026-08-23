/**
 * Cross-module journey continuity — reconciled against the current integration
 * head rather than carried over from the initial census (#281/#296, issue #367
 * requirement 3).
 *
 * The initial census scored modules. It could not score the joins *between*
 * them, because most of them did not exist yet. They do now, and they are
 * where this repository's real defects have been: a species widening to its
 * genus one hop along, a search term resolving to a front page, a subject
 * arriving nowhere. In every case both modules were individually correct and
 * individually tested. Scoring modules alone would keep reporting those
 * journeys as complete.
 *
 * SCORING DISCIPLINE
 *
 * Every gate below was checked by reading the producer, the consumer and the
 * test on this branch — not from a PR title. A PR number is corroboration,
 * never the evidence itself.
 *
 *   architectureContracts      a bounded producer/parser contract exists
 *   implementationPresent      wired on BOTH sides, verified in the source
 *   integrationCanonicalBranch present on oc-autonomous-integration
 *   scientificProvenanceSecurity  non-evidence declaration + locality guard,
 *                              proven by a negative test
 *   browserEndToEnd            1 ONLY where a browser pass was actually run;
 *                              0 where it was attempted and blocked; null
 *                              where it has not been attempted
 *   deployedOperational        null throughout — no production evidence is
 *                              available to this repository
 *
 * `productComplete` is NOT_MET wherever browserEndToEnd is not 1. A merged,
 * tested join is CODE_COMPLETE and INTEGRATED_COMPLETE; it is not PRODUCT
 * COMPLETE until someone has watched a person traverse it.
 */

import type { CompletionNode, Evidence } from './types';

/** The commit this domain's evidence was checked against. */
const RECONCILED_AT = '2026-08-23T00:00:00.000Z';

type JoinSpec = {
  id: string;
  name: string;
  /** Files read on this branch to confirm both sides are wired. */
  files: string[];
  tests: string[];
  prs: string[];
  /** 1 when a browser pass was run, 0 when attempted and blocked, null when not attempted. */
  browser: 0 | 1 | null;
  browserNote: string;
  provenanceNote: string;
  nextAction: string;
  lastAccomplishment: string;
};

const JOINS: JoinSpec[] = [
  {
    id: 'dossier-research',
    name: 'Species Dossier -> Research Station carries the accepted binomial',
    files: ['src/lib/speciesDossierResearchNavigation.ts', 'src/pages/SpeciesDossier.tsx', 'src/pages/ResearchCenter.tsx'],
    tests: ['src/pages/ResearchCenter.subjectHandoff.test.tsx', 'src/lib/continuumJourney.test.ts'],
    prs: ['#325', '#328'],
    browser: 0,
    browserNote: 'Attempted and blocked: /research sits behind ProtectedRoute and this environment has no Supabase session. The URL was confirmed preserved across the gate.',
    provenanceNote: 'context_is_evidence=false asserted outbound and required inbound; parser fails closed on a malformed genus.',
    nextAction: 'Sign in as a real member and confirm the Research banner names the arriving species end to end.',
    lastAccomplishment: '#328 stopped the onward links widening the species to its genus while the banner claimed the subject was preserved.',
  },
  {
    id: 'dossier-calyx',
    name: 'Species Dossier -> Calyx opens on the exact species',
    files: ['src/lib/speciesDossierCalyxNavigation.ts', 'src/pages/SpeciesDossier.tsx', 'src/components/calyx/AtlasAwareCalyxRoute.tsx', 'src/lib/calyxConversation.ts'],
    tests: ['src/pages/speciesDossierCalyxJourney.test.tsx', 'src/lib/speciesDossierCalyxNavigation.test.ts'],
    prs: ['#335', '#336'],
    browser: null,
    browserNote: 'Not attempted: rendering a dossier needs a reachable backend for /species/:slug.',
    provenanceNote: 'taxon_source=species-dossier-calyx with taxon_is_evidence=false in the turn payload; route_context keys asserted by enumeration so a new field cannot travel unnoticed.',
    nextAction: 'Open a real dossier against a live backend and follow Ask Calyx.',
    lastAccomplishment: '#336 mounted the path: the producer, parser and turn adapter existed with zero consumers between them.',
  },
  {
    id: 'dossier-matrix',
    name: 'Species Dossier -> Matrix carries a canonical taxon id',
    files: ['src/lib/speciesDossierMatrixNavigation.ts', 'src/features/calyx-workspace/identificationContext.ts', 'src/pages/OrchidIdentificationContinuum.tsx'],
    tests: ['src/features/calyx-workspace/identificationResearchHandoff.test.ts'],
    prs: ['#330'],
    browser: 1,
    browserNote: 'Browser pass run: /orchid-identification named the carried subject and rendered the "has not observed, identified or verified" disclaimer.',
    provenanceNote: 'context_is_observation and context_is_evidence both required false; a carried name never becomes a Matrix taxon identity.',
    nextAction: 'Confirm against a live dossier that matrix_url resolves and the canonical taxon id survives.',
    lastAccomplishment: 'The dossier leg carries a real canonical id, distinct from the research leg which deliberately carries none.',
  },
  {
    id: 'research-atlas',
    name: 'Research Station -> Atlas filters on the species, not the genus',
    files: ['src/lib/researchStationNavigation.ts', 'src/pages/ResearchCenter.tsx', 'src/lib/orchidContinuum.ts'],
    tests: ['src/lib/continuumJourney.test.ts', 'src/pages/ResearchCenter.subjectHandoff.test.tsx'],
    prs: ['#328'],
    browser: 0,
    browserNote: 'Attempted and blocked by the same auth gate as the dossier->research leg.',
    provenanceNote: 'assertNoLocalityLeak fails closed rather than emitting a link; every emitted key is asserted by enumeration.',
    nextAction: 'Signed-in browser pass confirming the Atlas species filter narrows to the arriving binomial.',
    lastAccomplishment: 'applyAtlasFilters matches the canonical binomial, so the congener actually drops out rather than the filter being nominal.',
  },
  {
    id: 'research-calyx',
    name: 'Research Station -> Calyx carries the exact taxon as non-evidence',
    files: ['src/lib/researchStationNavigation.ts', 'src/lib/researchCalyxRouteBridge.ts', 'src/lib/calyxConversation.ts'],
    tests: ['src/lib/continuumJourney.test.ts'],
    prs: ['#328'],
    browser: 0,
    browserNote: 'Attempted and blocked by the auth gate.',
    provenanceNote: 'The exact taxon reaches the model only under the research-station origin, and carries taxon_is_evidence=false when it does.',
    nextAction: 'Signed-in browser pass through to a real Calyx turn.',
    lastAccomplishment: 'The species now travels with a stronger evidence marker than the genus-only route ever carried.',
  },
  {
    id: 'research-lexicon',
    name: 'Research Station -> Lexicon opens the browser on the term',
    files: ['src/lib/researchStationNavigation.ts', 'src/features/lexicon/lexiconRoute.ts'],
    tests: ['src/features/lexicon/lexiconRouteHandoff.test.ts', 'src/lib/continuumJourney.test.ts'],
    prs: ['#329'],
    browser: 1,
    browserNote: 'Browser pass run: /lexicon?q=Cattleya purpurata hydrated the search input with the term.',
    provenanceNote: 'A blank or whitespace-only term is treated as no term rather than an empty search; no locality key is emitted.',
    nextAction: 'Confirm the browser returns real canonical entries once the Lexicon backend is reachable.',
    lastAccomplishment: '#329 stopped the section root discarding the term and resolving to the front page.',
  },
  {
    id: 'research-matrix',
    name: 'Research Station -> Matrix reads the arriving subject',
    files: ['src/lib/researchStationNavigation.ts', 'src/features/calyx-workspace/identificationContext.ts', 'src/pages/OrchidIdentificationContinuum.tsx'],
    tests: ['src/features/calyx-workspace/identificationResearchHandoff.test.ts', 'src/lib/continuumJourney.test.ts'],
    prs: ['#330'],
    browser: 1,
    browserNote: 'Browser pass run against /orchid-identification with a research-station origin.',
    provenanceNote: 'The taxon read fails closed rather than truncating: a shortened binomial is a different organism. An untrusted project id degrades alone without discarding the subject.',
    nextAction: 'Confirm the return link resolves to a real persisted project.',
    lastAccomplishment: '#330 replaced an empty parse result — no subject, no acknowledgement, no route back.',
  },
  {
    id: 'classroom-calyx',
    name: 'Classroom investigation -> Calyx carries subject and question only',
    files: ['src/lib/classroomInvestigationNavigation.ts', 'src/pages/ScientificMethodLab.tsx', 'src/components/calyx/AtlasAwareCalyxRoute.tsx'],
    tests: ['src/lib/classroomInvestigationNavigation.test.ts'],
    prs: ['#343'],
    browser: 1,
    browserNote: 'Browser pass run with a seeded learner draft: a marked conclusion and hypothesis appeared in neither emitted URL nor the rendered Calyx page.',
    provenanceNote: 'The learner hypothesis, observation, design, analysis and conclusion have no parameter to travel through. An arrival must declare context_is_learner_draft=true or it is rejected.',
    nextAction: 'Confirm Calyx answers a classroom question in the learner register against a live backend.',
    lastAccomplishment: '#343 gave the lab an exit without giving learner conclusions one.',
  },
  {
    id: 'genus-profile-fanout',
    name: 'Genus Profile -> Atlas / Calyx / Research continuity',
    files: ['src/lib/genusProfileNavigation.ts', 'src/lib/calyxRouteTrustBoundary.ts', 'src/lib/researchRouteContext.ts', 'src/pages/ResearchCenter.tsx'],
    tests: ['src/lib/genusProfileNavigation.test.ts', 'src/lib/naoccGenusProfileCalyxContinuity.test.ts', 'src/lib/genusProfileResearchNavigation.test.ts'],
    prs: ['#361', '#362', '#363', '#364', '#366'],
    browser: null,
    browserNote: 'Not attempted this pass.',
    provenanceNote: 'The genus-profile origin is recognised by both the Calyx trust boundary and the Research route context; arrivals are attributed to the Genus Profile rather than falling through to a generic label.',
    nextAction: 'Browser pass from a real genus profile through each of the three destinations.',
    lastAccomplishment: 'The fan-out was completed and its arrivals attributed correctly rather than reading as Genus of the Day.',
  },
];

const shared = (join: JoinSpec): Evidence[] => [
  ...join.files.map((ref): Evidence => ({ kind: 'file', ref })),
  ...join.tests.map((ref): Evidence => ({ kind: 'test', ref })),
  ...join.prs.map((ref): Evidence => ({
    kind: 'pr',
    ref: `jsp1440/orchid-continuum-frontend${ref}`,
    note: 'Corroboration only — every gate above was scored by reading the code on this branch.',
    prState: 'merged',
  })),
];

function joinGate(join: JoinSpec): CompletionNode {
  // browserEndToEnd drives productComplete. A join nobody has traversed is not
  // a product, however green its tests are.
  const productComplete = join.browser === 1 ? 'PARTIAL' : 'NOT_MET';
  return {
    id: `gate-journey-${join.id}`,
    parentId: `int-journey-${join.id}`,
    name: join.name,
    type: 'acceptance_gate',
    status: join.browser === 1 ? 'PARTIAL' : 'PARTIAL',
    threeLevels: {
      codeComplete: 'MET',
      integratedComplete: 'MET',
      productComplete,
    },
    lane: 'INTEGRATION_COMPLETION',
    gateScores: {
      architectureContracts: 1,
      implementationPresent: 1,
      integrationCanonicalBranch: 1,
      scientificProvenanceSecurity: 1,
      browserEndToEnd: join.browser,
      deployedOperational: null,
    },
    evidence: [
      ...shared(join),
      { kind: 'note', ref: 'provenance', note: join.provenanceNote },
      { kind: 'note', ref: 'browser', note: join.browserNote },
    ],
    prs: join.prs,
    nextAction: join.nextAction,
    lastAccomplishment: join.lastAccomplishment,
    lastUpdated: RECONCILED_AT,
    children: [],
  };
}

export function buildJourneyContinuityDomain(
  branch: (
    opts: {
      id: string;
      parentId: string | null;
      name: string;
      type: CompletionNode['type'];
      nextAction: string;
      evidence?: Evidence[];
      lane?: CompletionNode['lane'];
    },
    children: CompletionNode[],
  ) => CompletionNode,
): CompletionNode {
  return branch(
    {
      id: 'domain-journey-continuity',
      parentId: 'portfolio-orchid-continuum',
      name: 'Cross-module journey continuity',
      type: 'domain',
      lane: 'INTEGRATION_COMPLETION',
      nextAction:
        'Obtain signed-in browser evidence for the four legs behind the Research auth gate; they are the only ones still without a traversal.',
    },
    JOINS.map((join) =>
      branch(
        {
          id: `int-journey-${join.id}`,
          parentId: 'domain-journey-continuity',
          name: join.name,
          type: 'integration',
          lane: 'INTEGRATION_COMPLETION',
          nextAction: join.nextAction,
        },
        [joinGate(join)],
      ),
    ),
  );
}

/** Exported for the reconciliation test, which checks the census against reality. */
export const JOURNEY_JOIN_SPECS = JOINS;
