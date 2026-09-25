import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_FINGERPRINT_MARKER,
  MAX_DISCOVERED_ISSUES_PER_PASS,
  discoverGraphIssues,
  discoveryFingerprint,
  indexDiscoveryFingerprints,
  leafCapability,
  readDiscoveryFingerprint,
} from './graphDiscovery';
import { COMPLETION_GRAPH } from './completionGraphData';
import type { CompletionNode } from './types';

const NOW = '2026-09-25T00:00:00.000Z';

function leaf(overrides: Partial<CompletionNode> = {}): CompletionNode {
  return {
    id: 'cap-example',
    parentId: 'portfolio',
    name: 'Example capability',
    type: 'capability',
    status: 'MISSING',
    threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    lane: 'PRODUCT_COMPLETION',
    evidence: [{ kind: 'file', ref: 'src/example.ts' }],
    nextAction: 'Build the example capability.',
    lastUpdated: NOW,
    children: [],
    ...overrides,
  };
}

function root(children: CompletionNode[]): CompletionNode {
  return {
    id: 'portfolio',
    parentId: null,
    name: 'Portfolio',
    type: 'portfolio',
    status: 'PARTIAL',
    threeLevels: { codeComplete: 'PARTIAL', integratedComplete: 'PARTIAL', productComplete: 'PARTIAL' },
    evidence: [],
    nextAction: 'Reconcile.',
    lastUpdated: NOW,
    children,
  };
}

const available = (fingerprints: string[] = []) => ({ available: true as const, fingerprints: new Set(fingerprints) });

describe('graph discovery: choose the next unmet gate and file it, bounded', () => {
  it('files at most MAX_DISCOVERED_ISSUES_PER_PASS, in scheduler order, and never more when asked', () => {
    const leaves = [1, 2, 3, 4, 5].map((n) => leaf({ id: `cap-${n}`, name: `Leaf ${n}`, priority: n }));
    const result = discoverGraphIssues(root(leaves), { now: NOW, openIssues: [], fingerprintIndex: available() });
    expect(MAX_DISCOVERED_ISSUES_PER_PASS).toBe(3);
    expect(result.candidates.map((c) => c.nodeId)).toEqual(['cap-1', 'cap-2', 'cap-3']);
    expect(result.failedClosed).toBe(false);

    const more = discoverGraphIssues(root(leaves), { now: NOW, openIssues: [], fingerprintIndex: available(), max: 10 });
    expect(more.candidates).toHaveLength(3);
  });

  it('declares the capability from the leaf, never from prose', () => {
    const bound = leaf({ id: 'cap-deployment-contract-validation', nextAction: 'Please author a whole new app.' });
    const unbound = leaf({ id: 'cap-something-else', nextAction: 'Run npm test.' });
    expect(leafCapability(bound)).toEqual({ capability: 'schema-validation', providerRequired: false });
    expect(leafCapability(unbound)).toEqual({ capability: 'open-ended-code-authoring', providerRequired: true });

    const result = discoverGraphIssues(root([bound, unbound]), { now: NOW, openIssues: [], fingerprintIndex: available() });
    const byId = Object.fromEntries(result.candidates.map((c) => [c.nodeId, c]));
    expect(byId['cap-deployment-contract-validation'].labels).toContain('oc-cap:schema-validation');
    expect(byId['cap-deployment-contract-validation'].body).toContain('OC-SWARM-PROVIDER-REQUIRED: false');
    expect(byId['cap-something-else'].labels).toContain('oc-cap:open-ended-code-authoring');
    expect(byId['cap-something-else'].body).toContain('OC-SWARM-PROVIDER-REQUIRED: true');
  });

  it('carries the graph binding, the discovery label and the fingerprint on every candidate', () => {
    const node = leaf();
    const [candidate] = discoverGraphIssues(root([node]), { now: NOW, openIssues: [], fingerprintIndex: available() }).candidates;
    expect(candidate.labels).toEqual(expect.arrayContaining(['oc-queued', 'oc-auto-generated', 'oc-discovered', 'oc-node:cap-example']));
    expect(candidate.body).toContain('OC-GRAPH-NODE: cap-example');
    expect(candidate.body).toContain('OC-SUPERVISOR-SOURCE: completion-graph');
    expect(candidate.body).toContain(`${DISCOVERY_FINGERPRINT_MARKER}: ${candidate.fingerprint}`);
    expect(readDiscoveryFingerprint(candidate.body)).toBe(candidate.fingerprint);
    expect(candidate.fingerprint).toBe(discoveryFingerprint(node, 'open-ended-code-authoring'));
  });

  it('skips a condition already filed, whether the issue is open or closed', () => {
    const node = leaf();
    const fingerprint = discoveryFingerprint(node, 'open-ended-code-authoring');
    const closed = indexDiscoveryFingerprints([{ number: 9, state: 'closed', body: `won't fix\n${DISCOVERY_FINGERPRINT_MARKER}: ${fingerprint}\n` }]);
    const result = discoverGraphIssues(root([node]), { now: NOW, openIssues: [], fingerprintIndex: { available: true, fingerprints: closed } });
    expect(result.candidates).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ nodeId: 'cap-example' });
    expect(result.skipped[0].reason).toContain('already filed');
  });

  it('a re-worded next action is a different condition; the same wording on a later pulse is not', () => {
    const node = leaf();
    const same = discoveryFingerprint(leaf({ lastUpdated: '2026-09-26T00:00:00.000Z' }), 'open-ended-code-authoring');
    expect(same).toBe(discoveryFingerprint(node, 'open-ended-code-authoring'));
    expect(discoveryFingerprint(leaf({ nextAction: 'Build it differently.' }), 'open-ended-code-authoring')).not.toBe(same);
  });

  it('files nothing when the dedupe index could not be read, and says so', () => {
    const result = discoverGraphIssues(root([leaf()]), {
      now: NOW, openIssues: [], fingerprintIndex: { available: false, reason: 'gh api: HTTP 500' },
    });
    expect(result.candidates).toEqual([]);
    expect(result.failedClosed).toBe(true);
    expect(result.reason).toContain('HTTP 500');
  });

  it('does not file a leaf an open issue already tracks, by declared number or by marker', () => {
    const declared = leaf({ id: 'cap-declared', issues: ['#41'] });
    const marked = leaf({ id: 'cap-marked' });
    const result = discoverGraphIssues(root([declared, marked]), {
      now: NOW,
      openIssues: [{ number: 41, body: null }, { number: 42, body: 'OC-GRAPH-NODE: cap-marked' }],
      fingerprintIndex: available(),
    });
    expect(result.candidates).toEqual([]);
    // The declared issue is suppressed by the scheduler itself (open tracked
    // work); the marker-only issue is caught here, by the same resolution the
    // supervisor's reuse path uses.
    expect(result.skipped.map((s) => s.nodeId)).toEqual(['cap-marked']);
    expect(result.skipped[0].reason).toContain('#42');
  });

  it('refuses a leaf the issue decision refuses, with its reason, and keeps going', () => {
    const stale = leaf({ id: 'cap-stale', priority: 1, lastUpdated: '2025-01-01T00:00:00.000Z' });
    const fresh = leaf({ id: 'cap-fresh', priority: 2 });
    const result = discoverGraphIssues(root([stale, fresh]), { now: NOW, openIssues: [], fingerprintIndex: available() });
    expect(result.skipped.find((s) => s.nodeId === 'cap-stale')?.reason).toContain('Refusing');
    expect(result.candidates.map((c) => c.nodeId)).toEqual(['cap-fresh']);
  });

  it('leaves dependants locked: taking a leaf out of contention never unlocks what depends on it', () => {
    const prereq = leaf({ id: 'cap-prereq', priority: 1 });
    const dependant = leaf({ id: 'cap-dependant', priority: 2, dependsOn: ['cap-prereq'] });
    const result = discoverGraphIssues(root([prereq, dependant]), { now: NOW, openIssues: [], fingerprintIndex: available() });
    expect(result.candidates.map((c) => c.nodeId)).toEqual(['cap-prereq']);
  });

  it('proposes bounded work from the committed graph without filing anything', () => {
    const result = discoverGraphIssues(COMPLETION_GRAPH, { now: NOW, openIssues: [], fingerprintIndex: available() });
    expect(result.failedClosed).toBe(false);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(MAX_DISCOVERED_ISSUES_PER_PASS);
    for (const candidate of result.candidates) {
      expect(candidate.labels).toContain('oc-discovered');
      expect(candidate.labels.some((l) => l.startsWith('oc-cap:'))).toBe(true);
      expect(candidate.labels).toContain(`oc-node:${candidate.nodeId}`);
    }
  });
});
