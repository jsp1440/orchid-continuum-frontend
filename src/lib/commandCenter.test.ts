import { afterEach, describe, expect, it, vi } from 'vitest';
import registryFixture from './__fixtures__/commandCenterRegistry.json';
import healthFixture from './__fixtures__/commandCenterHealth.json';

vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'https://backend.example' }));

import {
  dependencyNeighbours,
  evidenceLink,
  fetchHealth,
  fetchRegistry,
  maturityLabel,
  parseHealth,
  parseRegistry,
  RegistryContractError,
  searchModules,
  statusCounts,
} from './commandCenter';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

afterEach(() => vi.unstubAllGlobals());

// The fixtures are a trimmed REAL backend response (see _fixture_note), kept in
// step with tests/test_command_center_readonly.py::REGISTRY_KEYS in
// orchid-calyx-backend. Regenerate them when that contract changes.
describe('registry contract (fixture generated from the real backend response)', () => {
  it('parses the real registry', () => {
    const registry = parseRegistry(registryFixture);
    expect(registry.modules.length).toBeGreaterThan(8);
    expect(registry.evidence_kind).toBe('SNAPSHOT');
    const counts = statusCounts(registry.modules);
    expect(counts.UNASSESSED).toBeGreaterThan(0);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(registry.modules.length);
  });

  it('keeps higher maturity levels unverified, never passing', () => {
    for (const m of parseRegistry(registryFixture).modules) {
      expect(m.maturity.BUILT).toBe(true);
      for (const level of ['TESTED', 'REVIEWED', 'INTEGRATED', 'DEPLOYED', 'LIVE_VERIFIED'] as const) {
        expect(maturityLabel(m.maturity[level])).toBe('unverified');
      }
    }
  });

  it('refuses a malformed or overclaiming payload (fail closed)', () => {
    const bad = (mutate: (r: any) => void) => {
      const r = clone(registryFixture) as any;
      mutate(r);
      expect(() => parseRegistry(r)).toThrow(RegistryContractError);
    };
    bad((r) => { r.modules[0].status = 'HEALTHY'; });
    bad((r) => { r.modules[0].maturity.DEPLOYED = 'yes'; });
    bad((r) => { r.evidence_kind = 'LIVE'; });
    bad((r) => { delete r.modules; });
    bad((r) => { r.modules[1].name = r.modules[0].name; });
    bad((r) => { const m = r.modules.find((x: any) => x.status !== 'UNASSESSED'); m.status_refs = []; });
    bad((r) => { r.pull_requests[0].verification.hosted = true; });
    bad((r) => { r.pull_requests[0].verification.independent = true; });
    expect(() => parseRegistry(null)).toThrow(RegistryContractError);
    expect(() => parseRegistry([])).toThrow(RegistryContractError);
  });

  it('shows PRs with no hosted or independent acceptance', () => {
    for (const pr of parseRegistry(registryFixture).pull_requests) {
      expect(pr.verification.hosted).toBe(false);
      expect(pr.verification.independent).toBe(false);
    }
  });
});

describe('module search, status and dependency navigation', () => {
  const modules = parseRegistry(registryFixture).modules;

  it('searches by name, path and reason, and filters by status', () => {
    expect(searchModules(modules, 'brain_mission').map((m) => m.name)).toContain('brain_mission');
    expect(searchModules(modules, 'BRAIN_MISSION').length).toBe(searchModules(modules, 'brain_mission').length);
    expect(searchModules(modules, '', 'BLOCKED').every((m) => m.status === 'BLOCKED')).toBe(true);
    expect(searchModules(modules, 'zzz-no-such-module')).toEqual([]);
    expect(searchModules(modules, '', 'ALL').length).toBe(modules.length);
  });

  it('UNASSESSED modules are never counted as DONE', () => {
    const unassessed = modules.filter((m) => m.status === 'UNASSESSED');
    expect(unassessed.length).toBeGreaterThan(0);
    expect(searchModules(modules, '', 'DONE').some((m) => unassessed.includes(m))).toBe(false);
  });

  it('navigates dependencies only to modules that exist', () => {
    const withDeps = modules.find((m) => m.depends_on.length > 0)!;
    const view = dependencyNeighbours(modules, withDeps.name)!;
    const names = new Set(modules.map((m) => m.name));
    expect(view.dependsOn.length).toBeGreaterThan(0);
    for (const n of [...view.dependsOn, ...view.dependedOnBy]) expect(names.has(n)).toBe(true);
    expect(dependencyNeighbours(modules, 'nope')).toBeNull();
  });
});

describe('evidence links', () => {
  it('links only #number refs to the backend repo', () => {
    expect(evidenceLink('#2346')).toBe('https://github.com/jsp1440/orchid-calyx-backend/issues/2346');
    for (const ref of ['javascript:alert(1)', 'https://evil.example', '#12;rm', '#', '2346', '#99999999']) {
      expect(evidenceLink(ref)).toBeNull();
    }
  });
});

describe('health contract', () => {
  it('parses the real probe response and never reports scientific health', () => {
    const health = parseHealth(healthFixture);
    expect(health.scientific.state).toBe('NOT_ASSESSED');
  });
  it('rejects a payload that claims scientific health from HTTP', () => {
    const h = clone(healthFixture) as any;
    h.scientific.state = 'HEALTHY';
    expect(() => parseHealth(h)).toThrow(RegistryContractError);
    expect(() => parseHealth({ kind: 'SNAPSHOT' })).toThrow(RegistryContractError);
  });
});

describe('fetch behaviour', () => {
  const jsonResponse = (body: unknown, status = 200, type = 'application/json') =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

  it('returns unauthorized on 401/403 without attempting to send credentials itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: 'x' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRegistry()).toEqual({ kind: 'unauthorized', status: 401 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://backend.example/api/command-center/registry');
    const headerNames = Object.keys((init as RequestInit).headers as Record<string, string>).map((h) => h.toLowerCase());
    expect(headerNames).toEqual(['accept']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 403)));
    expect(await fetchRegistry()).toEqual({ kind: 'unauthorized', status: 403 });
  });

  it('rejects HTML 200 (app-shell) and malformed JSON as errors, not data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    expect((await fetchRegistry()).kind).toBe('error');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ modules: [] })));
    expect((await fetchRegistry()).kind).toBe('error');
  });

  it('returns ok for the real fixture and surfaces network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(registryFixture)));
    expect((await fetchRegistry()).kind).toBe('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(healthFixture)));
    expect((await fetchHealth()).kind).toBe('ok');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchRegistry()).toEqual({ kind: 'error', message: 'offline' });
  });
});
