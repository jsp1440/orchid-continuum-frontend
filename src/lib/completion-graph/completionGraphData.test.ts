import { describe, expect, it } from 'vitest';
import { COMPLETION_GRAPH } from './completionGraphData';
import { countIncompleteLeaves, flattenGraph, getLeaves, listOwnerActions, selectNextUnmetGate } from './graphOps';
import { computeGateScore } from './scoring';

describe('COMPLETION_GRAPH structural integrity', () => {
  const allNodes = flattenGraph(COMPLETION_GRAPH);

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

  it('records the scheduler->issue-automation gap as confirmed missing, not census-pending', () => {
    const gap = allNodes.find((n) => n.name.includes('Scheduler output wired to real GitHub issue creation'));
    expect(gap?.status).toBe('MISSING');
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
    expect(domainLeafCounts['domain-vision']).toBe(2);
    expect(domainLeafCounts['domain-security-governance']).toBe(3);
    expect(domainLeafCounts['domain-buying-companion']).toBe(1);
  });
});
