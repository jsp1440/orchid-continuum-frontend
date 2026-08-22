import { describe, expect, it } from 'vitest';
import { COMPLETION_GRAPH } from './completionGraphData';
import { findCreditViolations, findThreeLevelsViolations } from './evidenceRules';
import { countIncompleteLeaves, flattenGraph, getLeaves, selectNextUnmetGate } from './graphOps';
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

  it('never claims a gate score of 1 without active supporting evidence (no skipped/cancelled CI, no stale/superseded PR, no empty citations)', () => {
    expect(findCreditViolations(COMPLETION_GRAPH)).toEqual([]);
  });

  it('never declares productComplete=MET without a confirmed deployedOperational gate (CODE_COMPLETE alone never becomes PRODUCT_COMPLETE)', () => {
    expect(findThreeLevelsViolations(COMPLETION_GRAPH)).toEqual([]);
  });
});

describe('#296 integration census coverage', () => {
  const allNames = flattenGraph(COMPLETION_GRAPH).map((n) => n.name.toLowerCase());

  // Every cross-module journey the mission requires "at minimum" — each pair
  // must be represented by at least one node whose name mentions both ends.
  // This is a permanent regression guard: deleting a journey node fails this.
  const REQUIRED_JOURNEYS: Array<[string, string]> = [
    ['homepage', 'atlas'],
    ['homepage', 'calyx'],
    ['homepage', 'research'],
    ['atlas', 'research'],
    ['research', 'calyx'],
    ['calyx', 'verification'],
    ['research', 'verification'],
    ['university', 'calyx'],
    ['university', 'research'],
    ['matrix', 'lexicon'],
    ['matrix', 'calyx'],
    ['literature', 'knowledge graph'],
    ['literature', 'calyx'],
    ['species dossier', 'atlas'],
    ['species dossier', 'matrix'],
    ['species dossier', 'calyx'],
    ['species dossier', 'research'],
    ['conservatory', 'calyx'],
    ['buying companion', 'conservatory'],
  ];

  it.each(REQUIRED_JOURNEYS)('has a census node representing %s -> %s', (from, to) => {
    const match = allNames.some((name) => name.includes(from) && name.includes(to));
    expect(match).toBe(true);
  });

  it('gives every leaf integration-type node real (non-empty) evidence, same rule as any other leaf', () => {
    const integrationLeaves = flattenGraph(COMPLETION_GRAPH).filter((n) => n.type === 'integration' && n.children.length === 0);
    // Nearly one leaf per required journey (Atlas->Research is the one
    // exception: it wraps a scored acceptance_gate leaf instead of scoring
    // the integration node directly, so it doesn't add to this count).
    expect(integrationLeaves.length).toBeGreaterThanOrEqual(REQUIRED_JOURNEYS.length - 1);
    for (const node of integrationLeaves) {
      expect(node.evidence.length).toBeGreaterThan(0);
    }
  });
});
