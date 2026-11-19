import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'https://backend.example' }));

import { fetchCapabilities, parseCapabilities, CapabilityContractError } from './commandCenterCapabilities';

// Trimmed real /api/command-center/registry `scientific_capabilities` from the backend
// branch coord/command-center-slice1-20261109 @1dc17f7e.
const REAL = [
  { boundary: 'Production retrieval needs the restricted-reader DSN (OC_BRAIN_MCP_EVIDENCE_DSN); not configured or verified', evidence: 'Real Speak turn through real MCP stdio path against a disposable local DB', id: 'calyx-single-species-pollination', live_verified: false, question: 'Who pollinates <one species>?', refs: ['#2356', '#2346', '#2357'], state: 'WORKS_LOCAL_ONLY' },
  { boundary: 'The bridge is single-species pollination only and rejects the question', evidence: 'Code path analysis', id: 'calyx-multi-species-phenology', live_verified: false, question: 'Multi-taxon snow, temperature, elevation and flowering question', refs: ['#2356', '#2346'], state: 'NOT_SUPPORTED' },
  { boundary: 'Only taxonomy-spoke edges exist', evidence: 'Read-only aggregate audit', id: 'kg-ecological-relationships-snow-orchids', live_verified: true, question: 'Cross-domain graph edges', refs: ['#2356'], state: 'ABSENT' },
  { boundary: 'No elevation; no ERA5-Land or MODIS extract', evidence: 'synthetic tests only', id: 'environmental-analysis', live_verified: false, question: 'Snowmelt analysis', refs: ['#2356'], state: 'BLOCKED' },
];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
afterEach(() => vi.unstubAllGlobals());

describe('scientific capability contract', () => {
  it('parses the real backend records and keeps states apart', () => {
    const caps = parseCapabilities(REAL);
    expect(caps.map((c) => c.state)).toEqual(['WORKS_LOCAL_ONLY', 'NOT_SUPPORTED', 'ABSENT', 'BLOCKED']);
    expect(caps.some((c) => c.state === 'WORKS_LIVE')).toBe(false);
  });

  it('refuses overclaiming or malformed records (fail closed)', () => {
    const bad = (mutate: (r: any) => void) => {
      const r = clone(REAL) as any;
      mutate(r);
      expect(() => parseCapabilities(r)).toThrow(CapabilityContractError);
    };
    bad((r) => { r[0].state = 'WORKS_LIVE'; });
    bad((r) => { r[0].live_verified = true; });
    bad((r) => { r[0].state = 'HEALTHY'; });
    bad((r) => { r[1].boundary = ''; });
    bad((r) => { r[1].refs = []; });
    expect(() => parseCapabilities({})).toThrow(CapabilityContractError);
  });

  it('accepts WORKS_LIVE only with live verification', () => {
    const r = clone(REAL) as any;
    r[0].state = 'WORKS_LIVE';
    r[0].live_verified = true;
    expect(parseCapabilities(r)[0].state).toBe('WORKS_LIVE');
  });
});

describe('fetchCapabilities', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('reports an older backend as unavailable, not as an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ modules: [] })));
    expect(await fetchCapabilities()).toEqual({ kind: 'error', message: 'This backend does not report scientific capability yet' });
  });

  it('returns unauthorized on 401 and ok for real records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)));
    expect(await fetchCapabilities()).toEqual({ kind: 'unauthorized' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ scientific_capabilities: REAL })));
    const result = await fetchCapabilities();
    expect(result.kind).toBe('ok');
  });

  it('turns a malformed record into an error', async () => {
    const r = clone(REAL) as any;
    r[0].state = 'WORKS_LIVE';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ scientific_capabilities: r })));
    expect((await fetchCapabilities()).kind).toBe('error');
  });
});
