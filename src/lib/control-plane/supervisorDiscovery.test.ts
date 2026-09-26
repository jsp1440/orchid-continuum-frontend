import { describe, expect, it, vi } from 'vitest';
import capturedPlan from './__fixtures__/evidence_gap_reserve_plan.json';
import { bridgeBackendReservePlan, type BackendReservePlan } from './backendReserveQueueBridge';
import {
  discoverSupervisorWork,
  PORTFOLIO_MODULES,
} from './supervisorDiscovery';
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

describe('terminal graph evidence adapter', () => {
  it('recognizes the exact OC-GRAPH-NODE line used by materialized graph issues', async () => {
    const { isTerminalGraphIssue } = await import('../../../scripts/oc-supervisor-discovery');

    expect(isTerminalGraphIssue(
      'prose before\nOC-GRAPH-NODE: cap-deployment-contract-validation\nprose after',
      ['oc-done', 'oc-cap:schema-validation'],
    )).toBe(true);
    expect(isTerminalGraphIssue('', ['oc-node:cap-completion-graph-engine', 'oc-done'])).toBe(true);
    expect(isTerminalGraphIssue('mentions OC-GRAPH-NODE in prose only', ['oc-done'])).toBe(false);
  });
});

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
      state: 'closed' as const,
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

  it('treats a closed oc-done graph issue as terminal evidence instead of rematerializing it', () => {
    const completed = {
      number: 912,
      repository: 'jsp1440/orchid-continuum-frontend',
      state: 'closed' as const,
      title: 'Deployment contract validation',
      body: 'OC-GRAPH-NODE: cap-deployment-contract-validation',
      labels: ['oc-done', 'oc-cap:schema-validation'],
    };

    const result = discoverSupervisorWork(
      root([leaf()]),
      [{ repository: 'jsp1440/orchid-continuum-frontend', issues: [completed] }],
      NOW,
    );

    expect(result.graphSelection).toBeNull();
    expect(result.packets).toContainEqual(expect.objectContaining({
      existingIssueNumber: 912,
      status: 'completed',
      action: 'observe',
      lifecycleState: 'completed',
    }));
    expect(result.packets.some((packet) => packet.action === 'materialize')).toBe(false);
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

describe('supervisor source adapters', () => {
  it('classifies dependency, validation, evidence, integration, improvement, and Brain sources', () => {
    const result = discoverSupervisorWork(
      root([]),
      [{
        repository: 'jsp1440/orchid-continuum-frontend',
        issues: [
          { number: 920, repository: 'jsp1440/orchid-continuum-frontend', state: 'open', title: 'Dependency gap',
            body: 'OC-SWARM-CAPABILITY: schema-validation\nOC-SWARM-DEPENDS-ON: #1', labels: [] },
          { number: 921, repository: 'jsp1440/orchid-continuum-frontend', state: 'open', title: 'Failed validation',
            body: 'OC-SWARM-CAPABILITY: test-execution\nOC-VALIDATION-FAILED: test failed', labels: [] },
          { number: 922, repository: 'jsp1440/orchid-continuum-frontend', state: 'open', title: 'Stale evidence',
            body: 'OC-SWARM-CAPABILITY: schema-validation\nOC-EVIDENCE-STALE: evidence expired', labels: [] },
          { number: 923, repository: 'jsp1440/orchid-continuum-frontend', state: 'open', title: 'Integration gap',
            body: 'OC-SWARM-CAPABILITY: test-execution\nOC-SWARM-WRITES: integration', labels: [] },
          { number: 924, repository: 'jsp1440/orchid-continuum-frontend', state: 'open', title: 'Improvement discovery',
            body: 'OC-QUEUE-CAPABILITY: improvement:discovery-loop:v1', labels: ['oc-blocked'] },
        ],
      }, {
        repository: 'jsp1440/Orchid-Continuum-Brain',
        issues: [{ number: 925, repository: 'jsp1440/Orchid-Continuum-Brain', state: 'open', title: 'Brain module backlog',
          body: 'OC-SWARM-CAPABILITY: schema-validation', labels: [] }],
      }],
      NOW,
    );

    expect(result.packets.find((packet) => packet.source.reference === '#920')).toMatchObject({
      source: { kind: 'dependency-gap' }, status: 'eligible', action: 'queue',
    });
    expect(result.packets.find((packet) => packet.source.reference === '#921')).toMatchObject({
      source: { kind: 'failed-validation' }, status: 'eligible', action: 'queue',
    });
    expect(result.packets.find((packet) => packet.source.reference === '#922')).toMatchObject({
      source: { kind: 'stale-evidence' }, status: 'eligible', action: 'queue',
    });
    expect(result.packets.find((packet) => packet.source.reference === '#923')).toMatchObject({
      source: { kind: 'integration-gap' }, status: 'eligible', action: 'queue',
    });
    expect(result.packets.find((packet) => packet.source.reference === '#924')).toMatchObject({
      source: { kind: 'improvement-discovery' }, status: 'blocked', action: 'observe',
      executionMode: 'provider', providerRequirement: 'required',
    });
    expect(result.packets.find((packet) => packet.source.reference === '#925')).toMatchObject({
      source: { kind: 'brain-backlog' }, status: 'eligible', action: 'queue',
    });
  });
});


describe('portfolio steward discovery', () => {
  it('materializes a real failed-validation issue through an explicit repository binding', () => {
    const result = discoverSupervisorWork(
      root([]),
      [{
        repository: 'jsp1440/orchid-continuum-frontend',
        available: true,
        issues: [{
          number: 47,
          repository: 'jsp1440/orchid-continuum-frontend',
          state: 'open',
          title: 'Sentinel: Featured Genus deployment audit failing',
          body: 'The deployed Featured Genus audit failed. See workflow run 29156535302.',
          labels: [],
        }],
        pullRequests: [{ number: 1200, repository: 'jsp1440/orchid-continuum-frontend', state: 'open', title: 'Release', body: '', labels: [], draft: false }],
        ciRuns: [{ id: 29156535302, name: 'featured-genus-render-sentinel', status: 'completed', conclusion: 'failure' }],
      }],
      NOW,
    );

    const packet = result.packets.find((candidate) => candidate.existingIssueNumber === 47);
    expect(packet).toMatchObject({
      schema: 'oc.supervisor-task.v1',
      source: { kind: 'failed-validation', repository: 'jsp1440/orchid-continuum-frontend', reference: '#47' },
      targetModule: 'featured-genus-release-sentinel',
      graphNodeId: 'cap-homepage-featured-genus',
      capability: 'featured-genus-verification',
      lane: 'testing',
      executionMode: 'deterministic',
      providerRequirement: 'none',
      priority: 3,
      status: 'eligible',
      action: 'queue',
      validationContract: { failClosed: true },
    });
    expect(packet?.sourceEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'issue', reference: '#47' }),
      expect.objectContaining({ kind: 'module-manifest' }),
    ]));
    expect(packet?.validationCriteria.join(' ')).toContain('verify:featured-genus');
    expect(result.portfolio.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'testing',
        access: 'available',
        openIssueNumbers: [47],
        ciRunsObserved: 1,
      }),
    ]));
    expect(result.portfolio.laneCounts.testing).toBeGreaterThanOrEqual(1);
  });

  it('reuses a queued bound task without creating a second packet or changing its fingerprint', () => {
    const issue = {
      number: 47,
      repository: 'jsp1440/orchid-continuum-frontend',
      state: 'open' as const,
      title: 'Sentinel: Featured Genus deployment audit failing',
      body: 'The deployed Featured Genus audit failed.',
      labels: ['oc-queued', 'oc-cap:featured-genus-verification'],
    };
    const first = discoverSupervisorWork(root([]), [{ repository: issue.repository, issues: [issue] }], NOW);
    const second = discoverSupervisorWork(root([]), [{ repository: issue.repository, issues: [issue] }], NOW);
    const firstPacket = first.packets.find((candidate) => candidate.existingIssueNumber === 47);
    const secondPacket = second.packets.find((candidate) => candidate.existingIssueNumber === 47);

    expect(first.packets.filter((candidate) => candidate.existingIssueNumber === 47)).toHaveLength(1);
    expect(firstPacket).toMatchObject({ action: 'reuse', lifecycleState: 'queued' });
    expect(secondPacket?.deduplication.fingerprint).toBe(firstPacket?.deduplication.fingerprint);
  });

  it('parks an unchanged deterministic repair without a durable repair lineage', () => {
    const result = discoverSupervisorWork(
      root([]),
      [{
        repository: 'jsp1440/orchid-continuum-frontend',
        issues: [{
          number: 47,
          repository: 'jsp1440/orchid-continuum-frontend',
          state: 'open',
          title: 'Sentinel: Featured Genus deployment audit failing',
          body: 'The deployed Featured Genus audit failed.',
          labels: ['oc-repair', 'oc-cap:featured-genus-verification'],
        }],
        pullRequests: [],
      }],
      NOW,
    );

    expect(result.packets).toContainEqual(expect.objectContaining({
      existingIssueNumber: 47,
      status: 'parked',
      action: 'observe',
      lifecycleState: 'parked',
    }));
    expect(result.packets.find((packet) => packet.existingIssueNumber === 47)?.action).not.toBe('queue');
  });

  it('records inaccessible repositories as bounded portfolio gaps and never promotes them to work', () => {
    const result = discoverSupervisorWork(
      root([]),
      [{
        repository: 'jsp1440/Orchid-Continuum-Brain',
        available: false,
        accessError: 'permission denied',
        issues: [],
      }],
      NOW,
    );

    expect(result.portfolio.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleId: 'brain-reasoning', access: 'unavailable' }),
    ]));
    expect(result.portfolio.accessGaps.join(' ')).toContain('permission denied');
    expect(result.packets).toEqual([]);
  });

  it('keeps the portfolio registry bounded to concrete module evidence rather than filling a quota', () => {
    expect(PORTFOLIO_MODULES.length).toBeGreaterThanOrEqual(15);
    expect(PORTFOLIO_MODULES.every((module) => module.repository && module.evidenceReference && module.lane)).toBe(true);
    expect(new Set(PORTFOLIO_MODULES.map((module) => module.moduleId)).size).toBe(PORTFOLIO_MODULES.length);
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
        body: 'acceptance prose only\nOC-GRAPH-NODE: cap-deployment-contract-validation\nmore prose',
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

describe('bounded graph discovery in the supervisor script', () => {
  const snapshotIssue = (number: number, body: string, state: 'open' | 'closed' = 'open') => ({
    number, repository: 'jsp1440/orchid-continuum-frontend', state, title: `#${number}`, body, labels: [] as string[],
  });

  it('reads the dedupe index by label across open and closed issues, plus the live snapshot', async () => {
    const { readDiscoveryFingerprintIndex } = await import('../../../scripts/oc-supervisor-discovery');
    const index = readDiscoveryFingerprintIndex('jsp1440/orchid-continuum-frontend',
      [snapshotIssue(7, 'OC-DISCOVERY-FINGERPRINT: ocfp1-0000000a')],
      () => [{ number: 3, state: 'closed', body: 'closed as won\'t fix\nOC-DISCOVERY-FINGERPRINT: ocfp1-0000000b' }]);
    expect(index).toEqual({ available: true, fingerprints: new Set(['ocfp1-0000000a', 'ocfp1-0000000b']) });
  });

  it('reports an unreadable index as unavailable, never as empty', async () => {
    const { readDiscoveryFingerprintIndex } = await import('../../../scripts/oc-supervisor-discovery');
    const index = readDiscoveryFingerprintIndex('jsp1440/orchid-continuum-frontend', [], () => {
      throw new Error('gh: HTTP 502');
    });
    expect(index).toEqual({ available: false, reason: 'gh: HTTP 502' });
  });

  it('files at most three, creates every label before the write, and records each outcome', async () => {
    const { materializeDiscoveredGraphIssues } = await import('../../../scripts/oc-supervisor-discovery');
    const calls: string[] = [];
    let next = 900;
    const run = materializeDiscoveredGraphIssues([], NOW, {
      fingerprintIndex: { available: true, fingerprints: new Set() },
      ensureLabel: (name) => { calls.push(`label:${name}`); },
      createIssue: (title, body, labels) => {
        calls.push(`create:${labels.join(',')}`);
        expect(body).toMatch(/^OC-DISCOVERY-FINGERPRINT: ocfp1-[0-9a-f]{8}$/m);
        expect(title.length).toBeGreaterThan(0);
        return ++next;
      },
    });
    expect(run.filed.length).toBeGreaterThan(0);
    expect(run.filed.length).toBeLessThanOrEqual(3);
    expect(run.notFiled).toEqual([]);
    for (const filed of run.filed) {
      const create = calls.findIndex((c) => c.startsWith('create:') && c.includes(`oc-node:${filed.nodeId}`));
      expect(create).toBeGreaterThan(-1);
      expect(calls[create]).toContain('oc-discovered');
      expect(calls[create]).toContain(`oc-cap:${filed.capability}`);
      // Every label of this candidate was ensured before its create.
      for (const label of calls[create].slice('create:'.length).split(',')) {
        expect(calls.indexOf(`label:${label}`)).toBeLessThan(create);
      }
    }
  });

  it('records a failed write as not filed, with the reason, and never as filed', async () => {
    const { materializeDiscoveredGraphIssues } = await import('../../../scripts/oc-supervisor-discovery');
    const run = materializeDiscoveredGraphIssues([], NOW, {
      fingerprintIndex: { available: true, fingerprints: new Set() },
      ensureLabel: () => {},
      createIssue: () => { throw new Error('gh: label not found'); },
    });
    expect(run.filed).toEqual([]);
    expect(run.notFiled.length).toBeGreaterThan(0);
    expect(run.notFiled[0].reason).toContain('label not found');
  });

  it('files nothing when the index is unavailable, and never calls the writer', async () => {
    const { materializeDiscoveredGraphIssues } = await import('../../../scripts/oc-supervisor-discovery');
    let writes = 0;
    const run = materializeDiscoveredGraphIssues([], NOW, {
      fingerprintIndex: { available: false, reason: 'gh: HTTP 502' },
      ensureLabel: () => { writes++; },
      createIssue: () => { writes++; return 1; },
    });
    expect(run.result.failedClosed).toBe(true);
    expect(run.filed).toEqual([]);
    expect(writes).toBe(0);
  });
});

describe('opt-in backend evidence-gap reserve pass in the supervisor script', () => {
  const REPO = 'jsp1440/orchid-continuum-frontend';
  const heldFingerprint = capturedPlan.proposals[0].material_fingerprint;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  const harness = () => {
    const calls: string[] = [];
    let next = 700;
    return {
      calls,
      ensureLabel: (name: string) => { calls.push(`label:${name}`); },
      createIssue: (title: string, _body: string, labels: string[]) => {
        calls.push(`create:${title}|${labels.join(',')}`);
        return ++next;
      },
    };
  };
  const emptyIndex = { available: true as const, fingerprints: new Set<string>() };
  // The captured production plan proposes morphology, phenology and
  // nomenclature. Only nomenclature has a local executor, so tests of the
  // filing mechanics (depth, ceiling, labels) use the same plan with every
  // proposal in that domain; the real mixed plan is asserted on its own below.
  const executablePlan = {
    ...capturedPlan,
    proposals: capturedPlan.proposals.map((proposal) => ({
      ...proposal, source_payload: { ...proposal.source_payload, domain: 'nomenclature' },
    })),
  };

  it('is off unless OC_ADMIT_BACKEND_RESERVE is exactly 1, and then files and fetches nothing', async () => {
    const { backendReserveEnabled, materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    expect(backendReserveEnabled({})).toBe(false);
    expect(backendReserveEnabled({ OC_ADMIT_BACKEND_RESERVE: 'true' })).toBe(false);
    expect(backendReserveEnabled({ OC_ADMIT_BACKEND_RESERVE: '1' })).toBe(true);
    const fetchImpl = vi.fn(async () => json(capturedPlan)) as unknown as typeof fetch;
    const io = harness();
    const run = await materializeBackendReservePlan([], {
      enabled: false, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex, fetchImpl, ...io,
    });
    expect(run.enabled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(io.calls).toEqual([]);
  });

  it('files exactly the bridge creates for a green plan, each with its priority label', async () => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const expected = bridgeBackendReservePlan(executablePlan as BackendReservePlan, []).plan.create;
    expect(expected).toHaveLength(3);
    const io = harness();
    const run = await materializeBackendReservePlan([], {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(executablePlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.failedClosed).toBeNull();
    expect(run.paidProviderCalls).toBe(0);
    expect(run.filed.map((f) => f.sourceKey)).toEqual(expected.map((e) => e.sourceKey));
    expect(run.filed.map((f) => f.labels)).toEqual(expected.map((e) => [...e.labels, 'oc-discovered']));
    expect(run.filed.map((f) => f.labels[1])).toEqual(['oc-p1', 'oc-p1', 'oc-p2']);
    const creates = io.calls.filter((c) => c.startsWith('create:'));
    expect(creates).toEqual(expected.map((e) => `create:${e.title}|${[...e.labels, 'oc-discovered'].join(',')}`));
    for (const create of creates) {
      const at = io.calls.indexOf(create);
      for (const label of create.split('|')[1].split(',')) {
        expect(io.calls.indexOf(`label:${label}`)).toBeLessThan(at);
      }
    }
  });

  it.each([
    ['blocked upstream', async () => json({ ...capturedPlan, status: 'evidence_gaps_unavailable',
      status_reason: 'kg unreachable', proposals: [] }), 'upstream blocked: evidence_gaps_unavailable (kg unreachable)'],
    ['http failure', async () => json({ detail: 'down' }, 503), 'transport: http_503'],
    ['network failure', async () => { throw new TypeError('fetch failed'); }, 'transport: transport_error'],
  ])('files nothing on a %s and records the reason', async (_name, impl, reason) => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const io = harness();
    const run = await materializeBackendReservePlan([], {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: impl as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.failedClosed).toBe(reason);
    expect(run.filed).toEqual([]);
    expect(io.calls).toEqual([]);
  });

  it('files nothing and never fetches when the dedupe index is unreadable', async () => {
    const { materializeBackendReservePlan, readReserveFingerprintIndex } = await import('../../../scripts/oc-supervisor-discovery');
    const fetchImpl = vi.fn(async () => json(capturedPlan)) as unknown as typeof fetch;
    const io = harness();
    const run = await materializeBackendReservePlan([], {
      enabled: true, baseUrl: 'https://calyx.test', fetchImpl, ...io,
      fingerprintIndex: readReserveFingerprintIndex(REPO, [], () => { throw new Error('gh: HTTP 502'); }),
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.failedClosed).toBe('reserve dedupe index unavailable: gh: HTTP 502');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(io.calls).toEqual([]);
  });

  // Reproduces the first enabled production pass (run 36169624549, 2026-09-25):
  // `refill_planned` with 3 proposals, but four legacy `PREPARED:` queue-bridge
  // lineages, all `oc-blocked`, held the whole depth, so nothing was filed and
  // nothing said why.
  const legacyLineage = (number: number, key: string, labels: string[]) => ({
    number, repository: REPO, state: 'open' as const, title: `PREPARED: backend legacy ${number}`,
    body: `<!-- oc-queue-bridge:${key} -->\n\nSource: jsp1440/orchid-calyx-backend`, labels,
  });
  const heldLegacy = [
    legacyLineage(539, 'jsp1440/orchid-calyx-backend|self-audit|issue-1264', ['oc-blocked', 'oc-p1']),
    legacyLineage(567, 'jsp1440/orchid-calyx-backend|coverage-matrix|issue-1085', ['oc-blocked', 'oc-p0', 'oc-runtime-backoff']),
    legacyLineage(579, 'jsp1440/orchid-calyx-backend|taxonomy-readiness|issue-1084', ['oc-blocked', 'oc-runtime-backoff']),
    legacyLineage(591, 'jsp1440/orchid-calyx-backend|browser-source-adapter|issue-1194', ['oc-blocked', 'oc-runtime-backoff']),
  ];

  it('does not let held (oc-blocked) lineages consume the reserve depth', async () => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const io = harness();
    const run = await materializeBackendReservePlan(heldLegacy, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(executablePlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.failedClosed).toBeNull();
    expect(run.reserveSlots).toEqual({ targetDepth: 3, preparedOpenCount: 0, eligibleCount: 3, openReserveIssues: 0, ceiling: 9 });
    expect(run.filed).toHaveLength(3);
    expect(run.filed.every((f) => f.labels.includes('oc-prepared') && f.labels.includes('oc-discovered'))).toBe(true);
  });

  // #816-#818 settled to oc-validating (awaiting human review) on 2026-09-25 and
  // then held the whole depth, so no further mission was ever filed.
  it('does not let reserve missions awaiting review (oc-validating) consume the depth, but counts them at the ceiling', async () => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const fixture = (await import('../__fixtures__/reserve-mission-issues-816-818.json')).default as {
      issues: Array<{ number: number; title: string; body: string }>;
    };
    const settled = fixture.issues.map((issue) => ({
      number: issue.number, repository: REPO, state: 'open' as const, title: issue.title,
      body: issue.body, labels: ['oc-validating', 'oc-p2', 'oc-discovered'],
    }));
    const io = harness();
    const run = await materializeBackendReservePlan(settled, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(executablePlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.failedClosed).toBeNull();
    expect(run.reserveSlots?.preparedOpenCount).toBe(0);
    expect(run.reserveSlots?.openReserveIssues).toBe(3);
    expect(run.filed).toHaveLength(3);
  });

  it('still counts executable open lineages against the depth and records why it filed nothing', async () => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const executable = heldLegacy.slice(0, 3).map((issue) => ({ ...issue, labels: ['oc-prepared', 'oc-p2'] }));
    const io = harness();
    const run = await materializeBackendReservePlan(executable, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(capturedPlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.reserveSlots).toEqual({ targetDepth: 3, preparedOpenCount: 3, eligibleCount: 3, openReserveIssues: 0, ceiling: 9 });
    expect(run.filed).toEqual([]);
    expect(io.calls).toEqual([]);
  });

  // Held reserve issues free their depth slots, so without a ceiling a parked
  // reserve issue would let every 5-minute pass file three more.
  const openReserveIssue = (number: number, labels: string[]) => ({
    number, repository: REPO, state: 'open' as const, title: `Earlier reserve mission ${number}`,
    body: `Prepared from the canonical backend reserve planner. Material fingerprint: ${String(number).padStart(64, 'a')}`,
    labels,
  });

  it('files nothing once open backend-reserve issues, held or not, reach the ceiling', async () => {
    const { materializeBackendReservePlan, BACKEND_RESERVE_OPEN_CEILING } = await import('../../../scripts/oc-supervisor-discovery');
    expect(BACKEND_RESERVE_OPEN_CEILING).toBe(9);
    const open = Array.from({ length: 9 }, (_, i) => openReserveIssue(800 + i, ['oc-blocked', 'oc-discovered']));
    const io = harness();
    const run = await materializeBackendReservePlan(open, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(executablePlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.reserveSlots).toEqual({ targetDepth: 3, preparedOpenCount: 0, eligibleCount: 3, openReserveIssues: 9, ceiling: 9 });
    expect(run.filed).toEqual([]);
    expect(run.notFiled).toHaveLength(3);
    expect(run.notFiled.every((entry) => entry.reason === 'open backend-reserve issues 9 at ceiling 9; settle or close existing ones first')).toBe(true);
    expect(io.calls).toEqual([]);
  });

  it('files only up to the ceiling when a pass would cross it', async () => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const open = Array.from({ length: 8 }, (_, i) => openReserveIssue(800 + i, ['oc-blocked', 'oc-discovered']));
    const io = harness();
    const run = await materializeBackendReservePlan(open, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(executablePlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.filed).toHaveLength(1);
    expect(run.notFiled.map((entry) => entry.reason)).toEqual([
      'open backend-reserve issues 9 at ceiling 9; settle or close existing ones first',
      'open backend-reserve issues 9 at ceiling 9; settle or close existing ones first',
    ]);
  });

  it('keeps a held lineage suppressing its own source key and title', async () => {
    const { existingWorkRefs } = await import('../../../scripts/oc-supervisor-discovery');
    const refs = existingWorkRefs(heldLegacy);
    expect(refs.map((ref) => ref.holdsReserveSlot)).toEqual([false, false, false, false]);
    expect(refs[0].sourceKey).toBe('jsp1440/orchid-calyx-backend|self-audit|issue-1264');
  });

  it('sends held fingerprints upstream and never refiles an already-filed fingerprint', async () => {
    const { materializeBackendReservePlan, readReserveFingerprintIndex } = await import('../../../scripts/oc-supervisor-discovery');
    const open = [{ number: 41, repository: REPO, state: 'open' as const, title: 'Earlier reserve mission',
      body: `Prepared from the canonical backend reserve planner. Material fingerprint: ${heldFingerprint}`, labels: ['oc-prepared'] }];
    const index = readReserveFingerprintIndex(REPO, open, () => []);
    expect(index).toEqual({ available: true, fingerprints: new Set([heldFingerprint]) });
    const urls: string[] = [];
    // The upstream ignores the hint and returns the full plan: local dedupe still holds.
    const fetchImpl = (async (url: string) => { urls.push(url); return json(capturedPlan); }) as unknown as typeof fetch;
    const io = harness();
    const run = await materializeBackendReservePlan(open, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: index, fetchImpl, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(new URL(urls[0]).searchParams.getAll('fingerprint')).toEqual([heldFingerprint]);
    expect(run.filed.map((f) => f.fingerprint)).not.toContain(heldFingerprint);
    expect(run.suppressed).toContainEqual(expect.objectContaining({
      reason: `material fingerprint ${heldFingerprint} already filed`,
    }));
    expect(io.calls.filter((c) => c.startsWith('create:')).length).toBe(run.filed.length);
    expect(run.filed.length).toBeLessThan(3);
  });

  // The real plan of 2026-09-25 (morphology, phenology, nomenclature): only the
  // morphology and nomenclature missions can execute, so only they are
  // requested and filed; phenology has no executor.
  it('requests only executable domains and never files a mission no local executor can run', async () => {
    const { materializeBackendReservePlan } = await import('../../../scripts/oc-supervisor-discovery');
    const urls: string[] = [];
    const io = harness();
    const run = await materializeBackendReservePlan([], {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async (url: string) => { urls.push(url); return json(capturedPlan); }) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(new URL(urls[0]).searchParams.getAll('domain')).toEqual(['morphology', 'nomenclature']);
    expect(run.filed.map((f) => f.fingerprint)).toEqual([
      capturedPlan.proposals[0].material_fingerprint,
      capturedPlan.proposals[2].material_fingerprint,
    ]);
    expect(run.notFiled.map((entry) => entry.reason)).toEqual([
      'no local executor for reserve domain phenology',
    ]);
    expect(io.calls.filter((c) => c.startsWith('create:'))).toHaveLength(2);
  });

  // #825-#827 (morphology, no executor) filled the whole depth on 2026-09-25
  // and every later scheduled pass filed nothing (run 36194099171).
  it('does not let reserve missions no executor can run consume the depth, but counts them at the ceiling', async () => {
    const { materializeBackendReservePlan, existingWorkRefs } = await import('../../../scripts/oc-supervisor-discovery');
    const fixture = (await import('../__fixtures__/reserve-mission-issues-825-827.json')).default as {
      issues: Array<{ number: number; title: string; body: string; labels: string[] }>;
    };
    // Morphology now has an executor, so the stranded case is replayed with a
    // domain that still has none (phenology); everything else is verbatim.
    const stranded = fixture.issues.map((issue) => ({
      ...issue, body: issue.body.replace('- Domain: morphology', '- Domain: phenology'),
      repository: REPO, state: 'open' as const,
    }));
    expect(existingWorkRefs(stranded).map((ref) => ref.holdsReserveSlot)).toEqual([false, false, false]);
    const io = harness();
    const run = await materializeBackendReservePlan(stranded, {
      enabled: true, baseUrl: 'https://calyx.test', fingerprintIndex: emptyIndex,
      fetchImpl: (async () => json(executablePlan)) as unknown as typeof fetch, ...io,
    });
    if (!run.enabled) throw new Error('expected enabled run');
    expect(run.reserveSlots).toEqual({ targetDepth: 3, preparedOpenCount: 0, eligibleCount: 3, openReserveIssues: 3, ceiling: 9 });
    expect(run.filed).toHaveLength(3);
  });

  it('still counts an open executable (nomenclature) reserve mission against the depth', async () => {
    const { existingWorkRefs } = await import('../../../scripts/oc-supervisor-discovery');
    const fixture = (await import('../__fixtures__/reserve-mission-issues-816-818.json')).default as {
      issues: Array<{ number: number; title: string; body: string }>;
    };
    const nomenclature = fixture.issues
      .filter((issue) => /^- Domain: nomenclature$/m.test(issue.body))
      .map((issue) => ({ ...issue, repository: REPO, state: 'open' as const, labels: ['oc-prepared', 'oc-p2'] }));
    expect(nomenclature.length).toBeGreaterThan(0);
    expect(existingWorkRefs(nomenclature).every((ref) => ref.holdsReserveSlot)).toBe(true);
  });
});

describe('graph discovery sees derived reserve-mission bindings', () => {
  const REPO = 'jsp1440/orchid-continuum-frontend';
  // #820 (2026-09-25): discovery read cap-kg-evidence-gap-research-missions as
  // having "no live executable issue" while #816-#818 were bound to it by the
  // derived reserve binding, and filed a duplicate provider-required issue.
  it('treats a legacy reserve mission as the live issue of its leaf', async () => {
    const { openIssueRefs } = await import('../../../scripts/oc-supervisor-discovery');
    const { resolveExecutableIssue } = await import('../completion-graph/executableIssue');
    const { COMPLETION_GRAPH } = await import('../completion-graph/completionGraphData');
    const fixture = (await import('../__fixtures__/reserve-mission-issues-816-818.json')).default as {
      issues: Array<{ number: number; title: string; state: string; labels: string[]; body: string; user: { login: string } }>;
    };
    // Built as fetchRepositorySnapshot builds one: `author` is `user.login`.
    const snapshots = fixture.issues.map((issue) => ({
      number: issue.number, repository: REPO, state: 'open' as const,
      title: issue.title, body: issue.body, labels: issue.labels, author: issue.user.login,
    }));
    const find = (node: typeof COMPLETION_GRAPH, id: string): typeof COMPLETION_GRAPH | undefined =>
      node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean);
    const leaf = find(COMPLETION_GRAPH, 'cap-kg-evidence-gap-research-missions');
    if (!leaf) throw new Error('reserve mission leaf missing from the completion graph');

    const refs = openIssueRefs(snapshots);
    expect(resolveExecutableIssue(leaf, refs)).toBe(816);
    // The derived node is a planning-view annotation only.
    expect(snapshots[0].labels).not.toContain('oc-node:cap-kg-evidence-gap-research-missions');
    // Without the derivation the leaf looks untracked -- the #820 defect.
    const raw = snapshots.map((issue) => ({ number: issue.number, body: issue.body, labels: issue.labels }));
    expect(resolveExecutableIssue(leaf, raw)).toBeNull();
  });

  it('derives nothing for a person-filed copy of a reserve mission, or one without oc-discovered', async () => {
    const { openIssueRefs } = await import('../../../scripts/oc-supervisor-discovery');
    const fixture = (await import('../__fixtures__/reserve-mission-issues-816-818.json')).default as {
      issues: Array<{ number: number; title: string; labels: string[]; body: string }>;
    };
    const [real] = fixture.issues;
    const base = { number: 9001, repository: REPO, state: 'open' as const, title: real.title, body: real.body };
    const refs = openIssueRefs([
      { ...base, labels: real.labels, author: 'octocat' },
      { ...base, labels: real.labels },
      { ...base, labels: real.labels.filter((label) => label !== 'oc-discovered'), author: 'github-actions[bot]' },
    ]);
    for (const ref of refs) expect(ref.labels).not.toContain('oc-node:cap-kg-evidence-gap-research-missions');
  });

  it('derives nothing for an issue that is not a reserve mission', async () => {
    const { openIssueRefs } = await import('../../../scripts/oc-supervisor-discovery');
    const refs = openIssueRefs([{ number: 5, repository: REPO, state: 'open', title: 'x',
      body: 'OC-SUPERVISOR-SOURCE: completion-graph', labels: ['oc-queued'] }]);
    expect(refs[0].labels).toEqual(['oc-queued']);
  });
});
