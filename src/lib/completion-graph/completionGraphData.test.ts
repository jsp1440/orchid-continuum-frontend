import { describe, expect, it } from 'vitest';
import { COMPLETION_GRAPH } from './completionGraphData';
import { countIncompleteLeaves, flattenGraph, getLeaves, listOwnerActions, selectNextUnmetGate } from './graphOps';
import { computeGateScore } from './scoring';

describe('COMPLETION_GRAPH structural integrity', () => {
  const allNodes = flattenGraph(COMPLETION_GRAPH);

  it('#167 reconciles the stale thematic census without changing bindings or claiming product acceptance', () => {
    const thematic = allNodes.find(node => node.id === 'cap-atlas-next-thematic-5')!;
    expect(thematic.status).toBe('PARTIAL');
    expect(thematic.threeLevels.productComplete).toBe('NOT_MET');
    expect(thematic.gateScores?.browserEndToEnd).toBeNull();
    expect(thematic.gateScores?.deployedOperational).toBeNull();
    expect(thematic.evidence.some(e => e.ref === 'src/features/atlas-next/useAtlasData.ts')).toBe(true);
    expect(thematic.evidence.some(e => e.ref === 'src/components/orchid/HomeAtlasContinuum.tsx')).toBe(true);
    expect(allNodes.some(node => node.id === 'cap-atlas-guided-tours-6')).toBe(true);
  });

  it('#525/#843 scores the trait consumer from a reference-backend browser pass without claiming a live backend or completing the remaining station', () => {
    const station = allNodes.find((node) => node.id === 'domain-research-station')!;
    const leaves = getLeaves(station);
    const traits = leaves.find((node) => node.id === 'cap-research-trait-explorer')!;
    expect(traits.issues).toContain('#525');
    expect(traits.threeLevels.productComplete).not.toBe('MET');
    expect(traits.gateScores?.deployedOperational).toBeNull();
    expect(traits.gateScores?.browserEndToEnd).toBe(1);
    expect(traits.evidence.some((e) => e.ref === 'e2e/research-trait-explorer.spec.ts' && /REFERENCE BACKEND/.test(e.note ?? ''))).toBe(true);
    // The backend gates /api/research/traits to owner/API key; that and the
    // deployed pass are named owner actions, not silent gaps.
    expect(traits.status).toBe('OWNER_ACTION');
    expect(traits.ownerActions?.some((a) => a.includes('verify_owner_or_api_key'))).toBe(true);
    expect(leaves.some((node) => node.status === 'UNKNOWN' && !node.gateScores)).toBe(true);
  });

  it('#528 replaces the relationship census stub with a scored real-data capability', () => {
    const domain = allNodes.find((node) => node.id === 'domain-pollinator-mycorrhiza')!;
    const leaves = getLeaves(domain);

    // #841 added the interaction-discovery leaf beside the profile leaf.
    expect(leaves.map((leaf) => leaf.id)).toEqual([
      'cap-pollinator-mycorrhiza-real-data',
      'cap-relationship-interaction-discovery',
    ]);
    const relationship = leaves[0];
    expect(relationship.status).toBe('PARTIAL');
    expect(relationship.threeLevels).toEqual({
      codeComplete: 'MET',
      integratedComplete: 'MET',
      productComplete: 'UNKNOWN',
    });
    expect(relationship.gateScores?.scientificProvenanceSecurity).toBe(1);
    expect(relationship.gateScores?.browserEndToEnd).toBeNull();
    expect(relationship.gateScores?.deployedOperational).toBeNull();
    expect(
      relationship.evidence.some((e) =>
        e.ref.includes('ecologicalRelationshipData.sourceIntegrity.test.ts'),
      ),
    ).toBe(true);
  });

  it('scores the Research evidence chain and literature provenance from captured payloads, never browser or deployment', () => {
    const leaves = getLeaves(COMPLETION_GRAPH);
    const chain = leaves.find((node) => node.id === 'cap-research-evidence-chain')!;
    expect(chain.gateScores?.scientificProvenanceSecurity).toBe(1);
    expect(chain.gateScores?.integrationCanonicalBranch).toBeNull();
    expect(chain.gateScores?.browserEndToEnd).toBeNull();
    expect(chain.gateScores?.deployedOperational).toBeNull();
    const literature = leaves.find((node) => node.id.startsWith('cap-literature-public-browser'))!;
    expect(literature.gateScores?.scientificProvenanceSecurity).toBe(1);
    expect(literature.gateScores?.browserEndToEnd).toBeNull();
    const traits = leaves.find((node) => node.id === 'cap-research-trait-explorer')!;
    // Backend #1611 is on backend main and the consumer on frontend main.
    expect(traits.gateScores?.integrationCanonicalBranch).toBe(1);
  });

  it('scores the Matrix comparison provenance gate from captured payload tests and the guided-session browser gate from the reference backend, never deployment', () => {
    const leaf = allNodes.find((node) => node.id === 'cap-matrix-report-lexicon');
    expect(leaf?.gateScores?.scientificProvenanceSecurity).toBe(1);
    expect(leaf?.gateScores?.browserEndToEnd).toBe(1);
    expect(leaf?.evidence.some((e) => e.ref === 'e2e/matrix-guided-session.spec.ts')).toBe(true);
    expect(leaf?.gateScores?.deployedOperational).toBeNull();
    expect(leaf?.status).toBe('PARTIAL');
    expect(leaf?.evidence.some((e) => e.ref === 'src/lib/matrixCandidateEvidence.test.ts')).toBe(true);
  });

  it('2026-09-26 reconciliation: reference-backend browser evidence never scores a deployed gate, and owner-gated leaves name the owner action', () => {
    const leaves = getLeaves(COMPLETION_GRAPH);
    const referenceBacked = leaves.filter((leaf) =>
      leaf.evidence.some((e) => /REFERENCE BACKEND/.test(e.note ?? '')),
    );
    expect(referenceBacked.map((leaf) => leaf.id).sort()).toEqual([
      'cap-calyx-verification-workbench',
      'cap-judging-practice',
      'cap-matrix-report-lexicon',
      'cap-research-trait-explorer',
    ]);
    for (const leaf of referenceBacked) {
      expect(leaf.gateScores?.browserEndToEnd, leaf.id).toBe(1);
      expect(leaf.gateScores?.deployedOperational, leaf.id).toBeNull();
      expect(leaf.status, leaf.id).not.toBe('DONE');
      expect(leaf.threeLevels.productComplete, leaf.id).not.toBe('MET');
    }
    for (const id of ['cap-calyx-verification-workbench', 'cap-judging-practice', 'cap-research-trait-explorer']) {
      const leaf = leaves.find((node) => node.id === id)!;
      expect(leaf.status, id).toBe('OWNER_ACTION');
      expect(leaf.ownerActions?.length, id).toBeGreaterThan(0);
    }
    // Unit/render tests alone never score a browser gate.
    for (const id of ['cap-vision-lexicon-evidence-summary', 'cap-relationship-interaction-discovery', 'cap-calyx-science-status-dashboard', 'cap-university-curriculum-core']) {
      expect(leaves.find((node) => node.id === id)?.gateScores?.browserEndToEnd, id).toBeNull();
    }
    // #788's acceptance (narrowed records) is not met by the filter-identity pass.
    const researchAtlas = leaves.find((node) => node.id === 'gate-journey-research-atlas')!;
    expect(researchAtlas.status).toBe('OWNER_ACTION');
    expect(researchAtlas.issues).toContain('#788');
    expect(researchAtlas.nextAction).toContain('#788');
    expect(researchAtlas.gateScores?.deployedOperational).toBeNull();
  });

  it('has a single root with parentId null', () => {
    expect(COMPLETION_GRAPH.parentId).toBeNull();
    const nonRootWithNullParent = allNodes.filter((n) => n.id !== COMPLETION_GRAPH.id && n.parentId === null);
    expect(nonRootWithNullParent).toEqual([]);
  });

  it('has globally unique node ids', () => {
    const ids = allNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every non-root parentId resolves to a real node in the graph', () => {
    const idSet = new Set(allNodes.map((n) => n.id));
    for (const node of allNodes) {
      if (node.id === COMPLETION_GRAPH.id) continue;
      expect(idSet.has(node.parentId as string)).toBe(true);
    }
  });

  it('every leaf has at least one evidence citation', () => {
    for (const leaf of getLeaves(COMPLETION_GRAPH)) {
      expect(leaf.evidence.length).toBeGreaterThan(0);
    }
  });

  it('every scored leaf (gateScores present) reports a non-null percentage', () => {
    for (const leaf of getLeaves(COMPLETION_GRAPH)) {
      if (leaf.gateScores) {
        expect(computeGateScore(leaf.gateScores).percentage).not.toBeNull();
      }
    }
  });

  it('never marks a leaf DONE without an evaluated browser or deployed gate', () => {
    // A leaf claiming DONE with no live/browser proof would violate the
    // "green unit tests alone do not equal integrated or deployed complete" rule.
    for (const leaf of getLeaves(COMPLETION_GRAPH)) {
      if (leaf.status !== 'DONE') continue;
      const scores = leaf.gateScores;
      expect(scores?.browserEndToEnd === 1 || scores?.deployedOperational === 1).toBe(true);
    }
  });

  it('exposes at least one actionable next-unmet gate for the scheduler', () => {
    expect(selectNextUnmetGate(COMPLETION_GRAPH)).not.toBeNull();
  });

  it('reports a finite, non-zero count of incomplete leaves', () => {
    const incomplete = countIncompleteLeaves(COMPLETION_GRAPH);
    expect(incomplete).toBeGreaterThan(0);
    expect(Number.isFinite(incomplete)).toBe(true);
  });

  it('surfaces the university live-verification gate as an explicit owner action, not a silent gap', () => {
    const ownerActionIds = listOwnerActions(COMPLETION_GRAPH).map((n) => n.id);
    expect(ownerActionIds).toContain('cap-university-production-live-verification');
  });

  it('scores the deployment contract capability from a real executed check, not an assumed pass', () => {
    const gate = allNodes.find((n) => n.id === 'cap-deployment-contract-validation');
    expect(gate?.evidence.some((e) => e.ref.includes('validate:deployment'))).toBe(true);
    expect(computeGateScore(gate?.gateScores).percentage).not.toBeNull();
  });

  it('scores the public literature browser on the real /literature route, without claiming the public can reach it', () => {
    const leaf = getLeaves(COMPLETION_GRAPH).find((node) => node.id.startsWith('cap-literature-public-browser'));
    expect(leaf?.status).toBe('PARTIAL');
    expect(leaf?.threeLevels.codeComplete).toBe('MET');
    // The backend listing is owner/API-key gated, so product completion is
    // NOT_MET until the public can actually browse it; a browser gate has not
    // been evaluated and must not be scored.
    expect(leaf?.threeLevels.productComplete).toBe('NOT_MET');
    expect(leaf?.gateScores?.browserEndToEnd).toBeNull();
    expect(leaf?.gateScores?.deployedOperational).toBeNull();
    expect(leaf?.evidence.some((e) => e.ref === 'src/pages/Literature.tsx')).toBe(true);
    expect(leaf?.evidence.some((e) => e.ref === 'src/pages/Literature.test.tsx')).toBe(true);
    expect(leaf?.evidence.some((e) => e.ref === 'src/pages/ComingSoon.tsx')).toBe(false);
  });

  it('scores the scheduler->issue-automation loop as wired but not yet proven live', () => {
    const gap = getLeaves(COMPLETION_GRAPH).find((n) => n.id.startsWith('cap-scheduler-issue-automation'));
    expect(gap?.status).toBe('PARTIAL');
    expect(gap?.threeLevels.codeComplete).toBe('MET');
    // No scheduled run has been observed filing a discovered issue yet, so
    // integration on the canonical branch scores 0 and product stays NOT_MET.
    expect(gap?.gateScores?.integrationCanonicalBranch).toBe(0);
    expect(gap?.threeLevels.productComplete).toBe('NOT_MET');
    expect(gap?.evidence.some((e) => e.ref === 'src/lib/completion-graph/graphDiscovery.ts')).toBe(true);
    expect(gap?.evidence.some((e) => e.ref === 'src/lib/completion-graph/graphDiscovery.test.ts')).toBe(true);
  });

  it('#281 round 2: Buying Companion, Vision, and Security/governance are no longer single generic census-pending stubs', () => {
    // Each of these domains previously had exactly one child capability
    // (an "Initial capability census" placeholder). Deleting the real
    // decomposition would silently regress them back to that shape.
    const buyingCompanion = allNodes.find((n) => n.name === 'Orchid Buying Companion (any form)');
    expect(buyingCompanion?.status).toBe('MISSING');
    expect(buyingCompanion?.gateScores).toBeTruthy();

    const visionLeaves = ['cap-vision-matrix-activation-preflight', 'cap-vision-intelligence-adapter'];
    for (const id of visionLeaves) {
      const leaf = allNodes.find((n) => n.id === id);
      expect(leaf, `expected vision leaf ${id} to exist`).toBeTruthy();
      expect(leaf?.gateScores).toBeTruthy();
      expect(computeGateScore(leaf?.gateScores).percentage).not.toBeNull();
    }

    const localityGate = allNodes.find((n) => n.id === 'cap-locality-safety-cross-cutting');
    expect(localityGate?.gateScores).toBeTruthy();
    expect(computeGateScore(localityGate?.gateScores).percentage).not.toBeNull();
    // Security/governance still has two genuinely census-pending capabilities
    // (auth-gating coverage, partner-data disclosure) — that is honest, not a regression.
    expect(allNodes.some((n) => n.name.includes('Authenticated-area gating coverage'))).toBe(true);
    expect(allNodes.some((n) => n.name.includes('Partner-data disclosure boundaries'))).toBe(true);
  });

  it('#281 round 2: Buying Companion, Vision, and Security/governance have real per-domain leaf structure, not a single "Initial capability census" stub', () => {
    const domainLeafCounts: Record<string, number> = {
      'domain-buying-companion': getLeaves(allNodes.find((n) => n.id === 'domain-buying-companion')!).length,
      'domain-vision': getLeaves(allNodes.find((n) => n.id === 'domain-vision')!).length,
      'domain-security-governance': getLeaves(allNodes.find((n) => n.id === 'domain-security-governance')!).length,
    };
    // #842 added the Lexicon vision-evidence summary leaf.
    expect(domainLeafCounts['domain-vision']).toBe(3);
    expect(domainLeafCounts['domain-security-governance']).toBe(3);
    expect(domainLeafCounts['domain-buying-companion']).toBe(1);
  });

  it('#281 round 3: Calyx, Knowledge Graph, and Conservatory/OASIS are no longer single generic census-pending stubs', () => {
    const scoredLeafIds = [
      'cap-calyx-conversational-reasoning',
      'cap-calyx-verification-workbench',
      'cap-calyx-science-status-dashboard',
      'cap-kg-genus-evidence',
      'cap-kg-visualization-graph',
      'cap-kg-mission-control-adapter',
      'cap-conservatory-collection',
      'cap-conservatory-readiness-gate',
      'cap-oasis-greenhouse-monitoring',
    ];
    for (const id of scoredLeafIds) {
      const leaf = allNodes.find((n) => n.id === id);
      expect(leaf, `expected leaf ${id} to exist`).toBeTruthy();
      expect(leaf?.gateScores, `expected leaf ${id} to have gateScores`).toBeTruthy();
      expect(computeGateScore(leaf?.gateScores).percentage).not.toBeNull();
    }

    const domainLeafCounts: Record<string, number> = {
      'domain-calyx-verification': getLeaves(allNodes.find((n) => n.id === 'domain-calyx-verification')!).length,
      'domain-knowledge-graph': getLeaves(allNodes.find((n) => n.id === 'domain-knowledge-graph')!).length,
      'domain-conservatory': getLeaves(allNodes.find((n) => n.id === 'domain-conservatory')!).length,
    };
    expect(domainLeafCounts['domain-calyx-verification']).toBe(3);
    expect(domainLeafCounts['domain-knowledge-graph']).toBe(4);
    expect(domainLeafCounts['domain-conservatory']).toBe(3);

    // #522: the naming conflict between the two "Knowledge Graph" routes is
    // resolved (docs/contracts/KNOWLEDGE-GRAPH-ROUTE-NAMING-CONTRACT.md) --
    // this client-derived rollup is named "Intelligence Graph" and must not
    // collapse back into a single undifferentiated "Knowledge Graph" node.
    const kgVisualization = allNodes.find((n) => n.id === 'cap-kg-visualization-graph');
    expect(kgVisualization?.gateScores?.architectureContracts).toBe(1);
  });

  it('#242: Homepage/Featured Genus/Public Calyx is decomposed, not a single generic census-pending stub', () => {
    const scoredLeafIds = [
      'cap-homepage-hero-continuum',
      'cap-homepage-featured-genus',
      'cap-homepage-public-calyx',
    ];
    for (const id of scoredLeafIds) {
      const leaf = allNodes.find((n) => n.id === id);
      expect(leaf, `expected leaf ${id} to exist`).toBeTruthy();
      expect(leaf?.gateScores, `expected leaf ${id} to have gateScores`).toBeTruthy();
      expect(computeGateScore(leaf?.gateScores).percentage).not.toBeNull();
    }

    const homepageLeaves = getLeaves(allNodes.find((n) => n.id === 'domain-homepage')!);
    expect(homepageLeaves.length).toBe(3);

    // #171 (HOMEPAGE-RECOVERY-008) is cited rather than duplicated by a new issue.
    const heroGate = allNodes.find((n) => n.id === 'cap-homepage-hero-continuum');
    expect(heroGate?.issues).toContain('#171');
  });

  it('#166 keeps the remaining Featured Genus gate provider-free and explicit', () => {
    const gate = allNodes.find((n) => n.id === 'cap-homepage-featured-genus');
    expect(gate?.nextAction).toContain('npm run verify:featured-genus');
    expect(gate?.evidence.some((e) => e.ref === 'scripts/featured-genus-render-sentinel.mjs')).toBe(true);
    expect(gate?.nextAction).not.toContain('AI narrative');
  });

  it('#242: Calyx education & show-management surfaces are a real, newly-censused domain', () => {
    const scoredLeafIds = [
      'cap-education-glossary-hub',
      'cap-judging-practice',
      'cap-screen-orchids',
      'cap-scientific-method-lab',
      'cap-classroom-teacher-dashboard',
    ];
    for (const id of scoredLeafIds) {
      const leaf = allNodes.find((n) => n.id === id);
      expect(leaf, `expected leaf ${id} to exist`).toBeTruthy();
      expect(leaf?.gateScores, `expected leaf ${id} to have gateScores`).toBeTruthy();
      expect(computeGateScore(leaf?.gateScores).percentage).not.toBeNull();
    }

    const educationLeaves = getLeaves(allNodes.find((n) => n.id === 'domain-education-show-management')!);
    expect(educationLeaves.length).toBe(5);

    // Classroom stays honestly backend-blocked (mirrors OASIS), never silently marked complete.
    const classroom = allNodes.find((n) => n.id === 'cap-classroom-teacher-dashboard');
    expect(classroom?.threeLevels.productComplete).toBe('NOT_MET');
    expect(classroom?.gateScores?.deployedOperational).toBe(0);
  });
});
