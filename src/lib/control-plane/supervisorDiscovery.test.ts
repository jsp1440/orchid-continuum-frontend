import { describe, expect, it } from 'vitest';
import { discoverSupervisorWork } from './supervisorDiscovery';
import type { CompletionNode } from '../completion-graph/types';

const NOW = '2026-09-23T00:00:00.000Z';

function leaf(overrides: Partial<CompletionNode> = {}): CompletionNode {
  return {
    id: 'cap-deployment-contract-validation',
    parentId: 'module',
    name: 'Deployment contract validation',
    type: 'capability',
    status: 'PARTIAL',
    threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
    lane: 'RELEASE_ACCEPTANCE',
    evidence: [],
    nextAction: 'Run npm run validate:deployment.',
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
    nextAction: 'Reconcile the portfolio.',
    lastUpdated: NOW,
    children,
  };
}

describe('continuous supervisor discovery', () => {
  it('selects only an explicitly bound deterministic graph leaf', () => {
    const selected = leaf();
    const higherPriorityButUnbound = leaf({
      id: 'cap-unbound-feature',
      name: 'Unbound feature',
      priority: 0,
      nextAction: 'Implement a broad feature.',
    });

    const result = discoverSupervisorWork(
      root([higherPriorityButUnbound, selected]),
      [{ repository: 'jsp1440/orchid-continuum-frontend', issues: [] }],
      NOW,
    );

    expect(result.graphSelection?.nodeId).toBe('cap-deployment-contract-validation');
    const packet = result.packets.find((candidate) => candidate.source.kind === 'completion-graph');
    expect(packet).toMatchObject({
      taskId: 'graph:cap-deployment-contract-validation:schema-validation',
      targetRepo: 'jsp1440/orchid-continuum-frontend',
      targetModule: 'production-release-core',
      capability: 'schema-validation',
      dependencies: [],
      riskClass: 'low',
      ownerGateStatus: 'none',
      providerRequirement: 'none',
      status: 'eligible',
      action: 'materialize',
    });
    expect(packet?.validationCriteria.join(' ')).toContain('npm run validate:deployment');
    expect(packet?.completionEvidenceRequirements.join(' ')).toContain('oc.provider-free-evidence.v1');
  });

  it('advances to the next deterministic leaf after the first packet is terminal', () => {
    const first = leaf({
      id: 'cap-completion-graph-engine',
      name: 'Completion graph engine evidence refresh',
      lane: 'INTEGRATION_COMPLETION',
      nextAction: 'Run the graph test suite.',
    });
    const second = leaf();
    const completedFirst = {
      number: 910,
      repository: 'jsp1440/orchid-continuum-frontend',
      state: 'open' as const,
      title: 'Completion graph engine evidence refresh',
      body: 'OC-GRAPH-NODE: cap-completion-graph-engine',
      labels: ['oc-done', 'oc-cap:test-execution'],
    };

    const result = discoverSupervisorWork(
      root([first, second]),
      [{ repository: 'jsp1440/orchid-continuum-frontend', issues: [completedFirst] }],
      NOW,
    );

    expect(result.graphSelection?.nodeId).toBe('cap-deployment-contract-validation');
    expect(result.packets.find((packet) => packet.source.kind === 'completion-graph')).toMatchObject({
      taskId: 'graph:cap-deployment-contract-validation:schema-validation',
      action: 'materialize',
      lifecycleState: 'discovered',
    });
  });

  it('does not create work from broad unbound backlog prose', () => {
    const result = discoverSupervisorWork(
      root([leaf({ id: 'cap-unbound-feature', priority: 0 })]),
      [{
        repository: 'jsp1440/orchid-continuum-frontend',
        issues: [{
          number: 289,
          repository: 'jsp1440/orchid-continuum-frontend',
          state: 'open',
          title: 'Legitimate but not explicitly executable',
          body: 'This is a real backlog item with acceptance prose.',
          labels: ['oc-queued'],
        }],
      }],
      NOW,
    );

    expect(result.packets).toEqual([]);
    expect(result.graphSelection).toBeNull();
  });

  it('queues an explicit deterministic issue without waiting for a manual label', () => {
    const result = discoverSupervisorWork(
      root([]),
      [{
        repository: 'jsp1440/orchid-continuum-frontend',
        issues: [{
          number: 911,
          repository: 'jsp1440/orchid-continuum-frontend',
          state: 'open',
          title: 'Deterministic schema check',
          body: 'OC-SWARM-CAPABILITY: schema-validation',
          labels: [],
        }],
      }],
      NOW,
    );

    expect(result.packets).toContainEqual(expect.objectContaining({
      taskId: 'issue:jsp1440/orchid-continuum-frontend#911:schema-validation',
      source: expect.objectContaining({ kind: 'deterministic-check' }),
      status: 'eligible',
      action: 'queue',
      executionMode: 'deterministic',
      lifecycleState: 'discovered',
      providerRequirement: 'none',
      deduplication: expect.objectContaining({ fingerprint: expect.stringMatching(/^ocfp1-/) }),
    }));
  });

  it('surfaces explicit parked and owner-gated work without admitting it', () => {
    const result = discoverSupervisorWork(
      root([]),
      [{
        repository: 'jsp1440/orchid-calyx-backend',
        issues: [
          {
            number: 1401,
            repository: 'jsp1440/orchid-calyx-backend',
            state: 'open',
            title: 'Budget-denial state machine',
            body: 'OC-SWARM-CAPABILITY: provider-failover',
            labels: ['oc-blocked', 'oc-p1'],
          },
          {
            number: 177,
            repository: 'jsp1440/orchid-continuum-frontend',
            state: 'open',
            title: 'Owner validation',
            body: 'OC-SWARM-CAPABILITY: test-execution\\nOC-AUTO-HOLD: true',
            labels: ['oc-owner-gate', 'oc-cap:test-execution'],
          },
        ],
      }],
      NOW,
    );

    expect(result.packets.map((packet) => [packet.taskId, packet.status])).toEqual([
      ['issue:jsp1440/orchid-calyx-backend#1401:provider-failover', 'blocked'],
      ['issue:jsp1440/orchid-continuum-frontend#177:test-execution', 'owner-gate'],
    ]);
    expect(result.parkedSources).toHaveLength(2);
  });

  it('recognizes an already materialized graph packet and never duplicates it', () => {
    const result = discoverSupervisorWork(
      root([leaf()]),
      [{
        repository: 'jsp1440/orchid-continuum-frontend',
        issues: [{
          number: 900,
          repository: 'jsp1440/orchid-continuum-frontend',
          state: 'open',
          title: 'Graph leaf',
          body: 'OC-GRAPH-NODE: cap-deployment-contract-validation',
          labels: ['oc-queued', 'oc-cap:schema-validation'],
        }],
      }],
      NOW,
    );

    const packet = result.packets.find((candidate) => candidate.source.kind === 'completion-graph');
    expect(packet).toMatchObject({
      action: 'reuse',
      existingIssueNumber: 900,
      status: 'eligible',
    });
  });
});


describe('generated packet binding', () => {
  it('binds the exact line-anchored graph marker without reading free-form prose', async () => {
    const { declaredNodesByIssue } = await import('../../../scripts/oc-dispatch-control');
    expect(declaredNodesByIssue([
      {
        number: 901,
        state: 'open',
        title: 'A title mentioning cap-unbound-feature',
        body: 'acceptance prose only\\nOC-GRAPH-NODE: cap-deployment-contract-validation\\nmore prose',
        labels: [{ name: 'oc-queued' }],
      },
    ])).toEqual({ 901: ['cap-deployment-contract-validation'] });
    expect(declaredNodesByIssue([
      {
        number: 902,
        state: 'open',
        title: 'cap-deployment-contract-validation',
        body: 'free-form prose only',
        labels: [{ name: 'oc-queued' }],
      },
    ])).toEqual({});
  });
});
