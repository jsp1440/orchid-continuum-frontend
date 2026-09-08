import { describe, expect, it } from 'vitest';
import {
  derivePortfolioStewardTarget,
  planPortfolioSteward,
  type ModuleCapabilityObservation,
  type PortfolioStewardInput,
} from './portfolioSteward';

const observation = (
  module: string,
  overrides: Partial<ModuleCapabilityObservation> = {},
): ModuleCapabilityObservation => ({
  module,
  brainIntent: 'required',
  frontend: 'implemented',
  backend: 'implemented',
  priority: 'oc-p1',
  evidence: [`repo://${module}`],
  ...overrides,
});

const base = (overrides: Partial<PortfolioStewardInput> = {}): PortfolioStewardInput => ({
  observations: [],
  repositories: { brain: 'available', frontend: 'available', backend: 'available' },
  existing: [],
  actionableCount: 18,
  maxActiveLanes: 5,
  wavesAhead: 3,
  targetFloor: 20,
  maxCreatePerCycle: 5,
  ...overrides,
});

describe('Portfolio Steward #532', () => {
  it('derives depth from lane capacity with the MVP floor', () => {
    expect(derivePortfolioStewardTarget(5, 3, 20)).toBe(20);
    expect(derivePortfolioStewardTarget(10, 3, 20)).toBe(30);
    expect(derivePortfolioStewardTarget(35, 3, 20)).toBe(105);
  });

  it('compares three modules and creates only evidenced missing work', () => {
    const result = planPortfolioSteward(
      base({
        observations: [
          observation('Calyx'),
          observation('Atlas', { frontend: 'missing', priority: 'oc-p0' }),
          observation('Literature', { brainIntent: 'ambiguous', priority: 'oc-p1' }),
        ],
      }),
    );

    expect(result.plan.create.map((item) => item.title)).toEqual([
      'CAPABILITY GAP: Atlas frontend parity',
      'RECONCILE: Literature intent versus repository truth',
    ]);
    expect(result.plan.create).toHaveLength(2);
    expect(result.diagnostics).toMatchObject({
      mode: 'deterministic-no-api',
      paidProviderCalls: 0,
      actionableCount: 18,
      targetDepth: 20,
      refillDeficit: 2,
    });
  });

  it('creates zero duplicates on a second unchanged cycle', () => {
    const input = base({
      observations: [
        observation('Atlas', { frontend: 'missing', priority: 'oc-p0' }),
        observation('Literature', { brainIntent: 'ambiguous' }),
      ],
    });
    const first = planPortfolioSteward(input);
    const existing = first.plan.create.map((item) => ({
      sourceKey: item.sourceKey,
      title: item.title,
      state: 'open' as const,
      kind: 'issue' as const,
    }));
    const second = planPortfolioSteward({
      ...input,
      existing,
      actionableCount: 20,
    });

    expect(second.plan.create).toHaveLength(0);
    expect(second.plan.suppressed).toHaveLength(2);
  });

  it('retires completed evidence and advances to the next uncovered gap', () => {
    const completed = observation('Atlas');
    const next = observation('Mycorrhizal', {
      backend: 'missing',
      priority: 'oc-p1',
    });
    const existing = [{
      sourceKey:
        'jsp1440/orchidcontinuumbrain|brain-knowledge-gap|module-capability-atlas',
      title: 'CAPABILITY GAP: Atlas frontend parity',
      state: 'open' as const,
      kind: 'issue' as const,
    }];
    const result = planPortfolioSteward(
      base({
        observations: [completed, next],
        existing,
        actionableCount: 19,
      }),
    );

    expect(result.plan.retire).toEqual([
      {
        sourceKey:
          'jsp1440/orchidcontinuumbrain|brain-knowledge-gap|module-capability-atlas',
        reason: 'source-completed',
      },
    ]);
    expect(result.plan.create.map((item) => item.title)).toEqual([
      'CAPABILITY GAP: Mycorrhizal backend parity',
    ]);
  });

  it('continues unaffected repositories with one diagnostic per unavailable source', () => {
    const result = planPortfolioSteward(
      base({
        repositories: {
          brain: 'available',
          frontend: 'unavailable',
          backend: 'available',
        },
        observations: [
          observation('Calyx'),
          observation('Conservatory', { backend: 'missing' }),
        ],
      }),
    );

    expect(result.plan.create.map((item) => item.title)).toEqual([
      'RECONCILE: frontend repository unavailable to Portfolio Steward',
      'CAPABILITY GAP: Conservatory backend parity',
    ]);
    expect(result.diagnostics.discoveredGaps).toHaveLength(2);
  });

  it('classifies protected gaps fail-closed without consuming refill capacity', () => {
    const result = planPortfolioSteward(
      base({
        observations: [
          observation('Taxonomy activation', {
            backend: 'missing',
            priority: 'oc-p0',
            protectedClasses: ['canonical-taxonomy-mutation'],
          }),
          observation('Research Station', { frontend: 'missing' }),
        ],
      }),
    );

    expect(result.plan.create.map((item) => item.title)).toEqual([
      'CAPABILITY GAP: Research Station frontend parity',
    ]);
    expect(result.plan.protected).toHaveLength(1);
    expect(result.diagnostics.blockers[0]).toContain('canonical-taxonomy-mutation');
  });

  it('fails closed on malformed capacity and never exposes provider authority', () => {
    expect(() => planPortfolioSteward(base({ maxActiveLanes: 0 }))).toThrow(
      'maxActiveLanes must be a positive integer',
    );

    const rendered = JSON.stringify(planPortfolioSteward(base()));
    expect(rendered).not.toMatch(/anthropic|gemini|openai|api[_-]?key|model/i);
  });
});
