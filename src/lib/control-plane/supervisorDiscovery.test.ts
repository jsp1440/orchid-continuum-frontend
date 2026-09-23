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
