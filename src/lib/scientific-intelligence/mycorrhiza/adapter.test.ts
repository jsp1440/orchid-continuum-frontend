import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('MycorrhizaAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns live intelligence from mycorrhizal response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 320,
        fungi_count: 85,
        taxa_count: 140,
        missing: 60,
        unresolved: 12,
        literature_coverage: 45,
      }),
    }))

    const { fetchMycorrhizaIntelligence } = await import('./adapter')
    const result = await fetchMycorrhizaIntelligence()

    expect(result.subsystemId).toBe('mycorrhiza')
    expect(result.orchidFungalRelationships).toBe(320)
    expect(result.fungiRepresented).toBe(85)
    expect(result.taxaRepresented).toBe(140)
    expect(result.missingLinks).toBe(60)
    expect(result.connectionState).toBe('connected')
    expect(result.mode).not.toBe('fallback')
    expect(result.provenance[0].endpoint).toBeTruthy()
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('returns fallback on backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const { fetchMycorrhizaIntelligence } = await import('./adapter')
    const result = await fetchMycorrhizaIntelligence()
    expect(result.mode).toBe('fallback')
    expect(result.mode).not.toBe('live')
  })

  it('handles null response without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    }))
    const { fetchMycorrhizaIntelligence } = await import('./adapter')
    await expect(fetchMycorrhizaIntelligence()).resolves.toBeDefined()
  })

  it('preserves cached data after failure', async () => {
    const cachedData = { subsystemId: 'mycorrhiza', orchidFungalRelationships: 300, mode: 'cached', connectionState: 'connected', endpoint: 'x', timestamp: new Date().toISOString() }
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: 'x', dataAge: 1000, mode: 'cached' }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchMycorrhizaIntelligence } = await import('./adapter')
    const result = await fetchMycorrhizaIntelligence()
    expect(result.orchidFungalRelationships).toBe(300)
    expect(result.mode).toBe('fallback')
  })

  it('mode is never live when data is from fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchMycorrhizaIntelligence } = await import('./adapter')
    const result = await fetchMycorrhizaIntelligence()
    expect(result.mode).not.toBe('live')
  })
})
