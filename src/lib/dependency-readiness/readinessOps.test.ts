import { describe, expect, it } from 'vitest';
import type { DependencyRecord } from './types';
import {
  applyCanaryOutcome,
  countByReadiness,
  flattenRequirements,
  groupByEnvironment,
  listByClassification,
  listBackendOnlySecrets,
  listUnresolvedRequiredRows,
} from './readinessOps';

const FIXTURE: DependencyRecord[] = [
  {
    id: 'dep-a',
    provider: 'Provider A',
    owningCapability: 'Capability A',
    classification: 'SECRET',
    requirements: [
      {
        environment: 'BACKEND_RENDER',
        required: true,
        source: 'file-a.ts',
        readiness: 'CONFIGURED',
        validationMethod: 'presence check',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'no reference found',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A',
        blockerOrNextAction: 'None.',
      },
    ],
  },
  {
    id: 'dep-b',
    provider: 'Provider B',
    owningCapability: 'Capability B',
    classification: 'PUBLIC_CONFIG',
    requirements: [
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: true,
        source: 'workflow-b.yml',
        readiness: 'MISSING',
        validationMethod: 'presence check',
        blockerOrNextAction: 'Add it.',
      },
    ],
  },
];

describe('flattenRequirements', () => {
  it('produces one row per requirement, tagged with its owning record metadata', () => {
    const rows = flattenRequirements(FIXTURE);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => typeof r.dependencyId === 'string')).toBe(true);
    expect(rows.find((r) => r.environment === 'BACKEND_RENDER')?.dependencyId).toBe('dep-a');
  });
});

describe('groupByEnvironment', () => {
  it('separates Render rows from GitHub Actions rows', () => {
    const groups = groupByEnvironment(FIXTURE);
    expect(groups.BACKEND_RENDER).toHaveLength(1);
    expect(groups.FRONTEND_RENDER).toHaveLength(1);
    expect(groups.FRONTEND_GITHUB_ACTIONS).toHaveLength(1);
    expect(groups.BACKEND_GITHUB_ACTIONS).toHaveLength(0);
  });
});

describe('countByReadiness', () => {
  it('tallies every readiness state, including zero counts', () => {
    const counts = countByReadiness(FIXTURE);
    expect(counts.CONFIGURED).toBe(1);
    expect(counts.NOT_REQUIRED).toBe(1);
    expect(counts.MISSING).toBe(1);
    expect(counts.UNKNOWN).toBe(0);
    expect(counts.INVALID).toBe(0);
    expect(counts.EXTERNAL_BLOCKER).toBe(0);
  });
});

describe('listUnresolvedRequiredRows', () => {
  it('surfaces required rows that are neither CONFIGURED nor NOT_REQUIRED', () => {
    const unresolved = listUnresolvedRequiredRows(FIXTURE);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].dependencyId).toBe('dep-b');
  });

  it('excludes a required-and-CONFIGURED row', () => {
    const unresolved = listUnresolvedRequiredRows(FIXTURE);
    expect(unresolved.some((r) => r.dependencyId === 'dep-a')).toBe(false);
  });
});

describe('listByClassification', () => {
  it('filters to only the requested classification', () => {
    expect(listByClassification(FIXTURE, 'SECRET').map((r) => r.id)).toEqual(['dep-a']);
    expect(listByClassification(FIXTURE, 'PUBLIC_CONFIG').map((r) => r.id)).toEqual(['dep-b']);
  });
});

describe('listBackendOnlySecrets', () => {
  it('flags a SECRET required only in backend environments', () => {
    expect(listBackendOnlySecrets(FIXTURE).map((r) => r.id)).toEqual(['dep-a']);
  });

  it('does not flag a PUBLIC_CONFIG record even if backend-only', () => {
    const backendOnlyPublicConfig: DependencyRecord[] = [
      {
        id: 'dep-c',
        provider: 'Provider C',
        owningCapability: 'Capability C',
        classification: 'PUBLIC_CONFIG',
        requirements: [
          {
            environment: 'BACKEND_RENDER',
            required: true,
            source: 'file-c.ts',
            readiness: 'CONFIGURED',
            validationMethod: 'read directly',
            blockerOrNextAction: 'None.',
          },
        ],
      },
    ];
    expect(listBackendOnlySecrets(backendOnlyPublicConfig)).toEqual([]);
  });

  it('does not flag a secret that is also required in a frontend environment', () => {
    const bothSides: DependencyRecord[] = [
      {
        id: 'dep-d',
        provider: 'Provider D',
        owningCapability: 'Capability D',
        classification: 'SECRET',
        requirements: [
          { environment: 'BACKEND_RENDER', required: true, source: 'x', readiness: 'CONFIGURED', validationMethod: 'x', blockerOrNextAction: 'None.' },
          { environment: 'FRONTEND_GITHUB_ACTIONS', required: true, source: 'x', readiness: 'CONFIGURED', validationMethod: 'x', blockerOrNextAction: 'None.' },
        ],
      },
    ];
    expect(listBackendOnlySecrets(bothSides)).toEqual([]);
  });
});

describe('applyCanaryOutcome', () => {
  it('does not report a configured credential as healthy when its canary auth-rejects', () => {
    expect(applyCanaryOutcome('CONFIGURED', 'AUTH_REJECTED')).toBe('INVALID');
  });

  it('does not report a configured credential as healthy when the provider is unavailable', () => {
    expect(applyCanaryOutcome('CONFIGURED', 'PROVIDER_UNAVAILABLE')).toBe('EXTERNAL_BLOCKER');
  });

  it('promotes UNKNOWN to CONFIGURED only on an actual successful canary', () => {
    expect(applyCanaryOutcome('UNKNOWN', 'SUCCESS')).toBe('CONFIGURED');
  });

  it('leaves readiness untouched when the canary was not run', () => {
    expect(applyCanaryOutcome('UNKNOWN', 'NOT_RUN')).toBe('UNKNOWN');
    expect(applyCanaryOutcome('CONFIGURED', 'NOT_RUN')).toBe('CONFIGURED');
  });

  it('does not silently heal an already-INVALID row on a later NOT_RUN check', () => {
    expect(applyCanaryOutcome('INVALID', 'NOT_RUN')).toBe('INVALID');
  });
});
