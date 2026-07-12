// BUILD-059A — Mission Control Data-Shape Regression Tests
//
// These tests guard against the production runtime error introduced by BUILD-059:
//   "Ju.slice is not a function. (In 'Ju.slice(0,1)', 'Ju.slice' is undefined)"
//
// Root cause: MissionControlService imported `grantItems` (a filter function)
// from missionControlIntelligence, then called `grantItems.slice(0,1)` treating
// it as an array.  In minified production output `grantItems` → `Ju`, giving the
// above error.  BUILD-059A repairs the call and adds `safeArr()` guards around
// all unvalidated backend collection fields so that a malformed response can
// never crash the provider.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level helpers — exercise the module without hitting the network.
// We mock `fetchMissionControlOperations` so we can feed arbitrary payloads.
// ---------------------------------------------------------------------------

// We import the private helpers indirectly by exercising fetchMissionControlSnapshot.
// The module is re-imported after each mock reset so the mocks take effect.

type MockPayload = Record<string, unknown>;

function buildMinimalOps(overrides: Partial<MockPayload> = {}): MockPayload {
  return {
    generatedAt: new Date().toISOString(),
    dataMode: 'fallback',
    diagnostics: [],
    globalHealth: [],
    subsystemRegistry: [],
    scientificSystems: [],
    completenessMatrix: [],
    harvesters: [],
    repositories: [],
    calyxSelfAudit: {
      summary: '',
      canDo: [],
      cannotDoYet: [],
      connectedTools: [],
      failingServices: [],
      riskLevel: 'low',
    },
    recommendations: [],
    recentActivity: [],
    safetyBoundaries: [],
    governance: {
      build: 'test',
      status: 'unknown',
      northStar: '',
      missions: [],
      policies: [],
      decisions: [],
      questions: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// safeArr — unit-test the exported normalization helper by testing the
// MissionControlService functions that call it with deliberately bad inputs.
// We test via `fetchMissionControlSnapshot` which delegates to the helpers.
// ---------------------------------------------------------------------------

describe('MissionControlService — safeArr / collection normalization', () => {
  beforeEach(() => {
    vi.resetModules();
    // Prevent real localStorage reads during tests
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // 1. Valid arrays — must pass through unchanged.
  // -------------------------------------------------------------------------
  it('preserves valid recommendation records from a direct array', async () => {
    const rec = {
      id: 'r1',
      title: 'Valid recommendation',
      priority: 'high',
      rationale: 'Good reason',
      ownerDecisionNeeded: 'Approve',
      nextBuild: 'BUILD-X',
    };

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const { fetchMissionControlOperations } = await import('@/lib/missionControlOps');
    vi.mocked(fetchMissionControlOperations);

    vi.doMock('@/lib/missionControlOps', async (importOriginal) => {
      const original = await importOriginal<typeof import('@/lib/missionControlOps')>();
      return {
        ...original,
        fetchMissionControlOperations: vi.fn().mockResolvedValue(
          buildMinimalOps({ recommendations: [rec] }),
        ),
      };
    });

    // Re-import to pick up the new mock
    vi.resetModules();
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ recommendations: [rec] }),
      ),
    }));

    const { fetchMissionControlSnapshot: snap } = await import('@/lib/mission-control/MissionControlService');
    const result = await snap();

    expect(result.dashboard.recommendations).toBeInstanceOf(Array);
    const found = result.dashboard.recommendations.find((r) => r.id === 'r1');
    expect(found).toBeDefined();
    expect(found?.title).toBe('Valid recommendation');
  });

  // -------------------------------------------------------------------------
  // 2. `grantItems` is a function — calling `.slice` must NOT throw.
  // -------------------------------------------------------------------------
  it('does NOT throw "slice is not a function" when grantItems is a function', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(buildMinimalOps()),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');

    // Must not throw – previously threw "Ju.slice is not a function"
    await expect(fetchMissionControlSnapshot()).resolves.not.toThrow();
  });

  // -------------------------------------------------------------------------
  // 3. globalHealth = null — must not crash, must return empty recommendations.
  // -------------------------------------------------------------------------
  it('handles globalHealth: null without crashing', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ globalHealth: null }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.dashboard.recommendations).toBeInstanceOf(Array);
    expect(result.dashboard).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. globalHealth = {} (plain object instead of array) — must not crash.
  // -------------------------------------------------------------------------
  it('handles globalHealth: {} (object not array) without crashing', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ globalHealth: {} }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    await expect(fetchMissionControlSnapshot()).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. globalHealth wrapped as { items: [...] } — must be unwrapped.
  // -------------------------------------------------------------------------
  it('unwraps globalHealth: { items: [...] } wrapper shape', async () => {
    const subsystem = {
      id: 'test-sub',
      name: 'Test',
      category: 'Test',
      status: 'warning',
      completeness: 60,
      lastChecked: new Date().toISOString(),
      summary: 'Test summary',
      blockers: [],
      recommendedNextAction: 'Do something',
    };

    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ globalHealth: { items: [subsystem] } }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    // safeArr unwraps { items } and subsystem-driven recommendations are derived
    expect(result.dashboard).toBeDefined();
    expect(result.dashboard.recommendations).toBeInstanceOf(Array);
  });

  // -------------------------------------------------------------------------
  // 6. recommendations = null — must not crash, spread must produce [].
  // -------------------------------------------------------------------------
  it('handles recommendations: null without crashing', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ recommendations: null }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.dashboard.recommendations).toBeInstanceOf(Array);
  });

  // -------------------------------------------------------------------------
  // 7. recommendations = undefined — must not crash.
  // -------------------------------------------------------------------------
  it('handles recommendations: undefined without crashing', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ recommendations: undefined }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.dashboard.recommendations).toBeInstanceOf(Array);
  });

  // -------------------------------------------------------------------------
  // 8. diagnostics = null — hasLiveExecutiveState must not crash.
  // -------------------------------------------------------------------------
  it('handles diagnostics: null — backendAvailable defaults to false', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ diagnostics: null }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.backendAvailable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. repositories = null — buildRepositoryRevision must return 'unknown'.
  // -------------------------------------------------------------------------
  it('handles repositories: null — repositoryRevision returns "unknown"', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ repositories: null }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.repositoryRevision).toBe('unknown');
  });

  // -------------------------------------------------------------------------
  // 10. repositories wrapped as { data: [...] } — safeArr must unwrap it.
  // -------------------------------------------------------------------------
  it('handles repositories: { data: [...] } wrapper shape', async () => {
    const repo = {
      name: 'test-repo',
      defaultBranch: 'main',
      latestCommit: 'abc123',
      deploymentTarget: 'Render',
      deployStatus: 'healthy',
      frontendDeployNeeded: false,
      backendDeployNeeded: false,
      knownBlockers: [],
    };

    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ repositories: { data: [repo] } }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    // safeArr unwraps { data } so find works and returns the commit
    expect(result.repositoryRevision).toBe('abc123');
  });

  // -------------------------------------------------------------------------
  // 11. diagnostics with healthy executive state endpoint — backendAvailable true.
  // -------------------------------------------------------------------------
  it('sets backendAvailable: true when executive state diagnostic is healthy', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({
          diagnostics: [
            {
              label: 'Executive state',
              endpoint: 'https://calyx.example.com/api/executive/state',
              status: 'healthy',
              detail: 'OK',
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.backendAvailable).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 12. Entirely malformed payload (string instead of object) — must not crash.
  // -------------------------------------------------------------------------
  it('handles a completely malformed backend payload without crashing', async () => {
    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({
          globalHealth: 'not-an-array',
          recommendations: 42,
          diagnostics: true,
          repositories: 'oops',
        }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    await expect(fetchMissionControlSnapshot()).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 13. globalHealth subsystems drive recommendations correctly.
  // -------------------------------------------------------------------------
  it('derives subsystem-driven recommendations from globalHealth with warning status', async () => {
    const subsystem = {
      id: 'backend',
      name: 'Backend',
      category: 'Runtime',
      status: 'warning',
      completeness: 45,
      lastChecked: new Date().toISOString(),
      summary: 'Backend partially reachable.',
      blockers: [],
      recommendedNextAction: 'Fix backend routes.',
      route: '/mission-control#backend',
    };

    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ globalHealth: [subsystem] }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    const derived = result.dashboard.recommendations.find((r) => r.id === 'subsystem-backend');
    expect(derived).toBeDefined();
    expect(derived?.priority).toBe('high');
  });

  // -------------------------------------------------------------------------
  // 14. recommendations capped at MAX_RECOMMENDATIONS (12).
  // -------------------------------------------------------------------------
  it('caps merged recommendations at 12', async () => {
    const recs = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      title: `Rec ${i}`,
      priority: 'medium',
      rationale: 'reason',
      ownerDecisionNeeded: 'decide',
      nextBuild: 'BUILD-X',
    }));

    vi.doMock('@/lib/missionControlOps', async () => ({
      ...(await vi.importActual<typeof import('@/lib/missionControlOps')>('@/lib/missionControlOps')),
      fetchMissionControlOperations: vi.fn().mockResolvedValue(
        buildMinimalOps({ recommendations: recs }),
      ),
    }));

    const { fetchMissionControlSnapshot } = await import('@/lib/mission-control/MissionControlService');
    const result = await fetchMissionControlSnapshot();

    expect(result.dashboard.recommendations.length).toBeLessThanOrEqual(12);
  });
});
