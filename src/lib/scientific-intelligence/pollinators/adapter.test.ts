import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('PollinatorAdapter', () => {
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

  it('returns live intelligence from pollinator response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 680,
        missing: 120,
        taxaWithoutEvidence: 45,
        conflicts: 8,
        unresolved: 22,
        sources: ['GBIF', 'iNaturalist'],
      }),
    }))

    const { fetchPollinatorIntelligence } = await import('./adapter')
    const result = await fetchPollinatorIntelligence()

    expect(result.subsystemId).toBe('pollinators')
    expect(result.knownRelationships).toBe(680)
    expect(result.missingRecords).toBe(120)
    expect(result.taxaWithoutEvidence).toBe(45)
    expect(result.connectionState).toBe('connected')
    expect(result.mode).not.toBe('fallback')
    expect(result.provenance[0].endpoint).toBeTruthy()
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('returns fallback on backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const { fetchPollinatorIntelligence } = await import('./adapter')
    const result = await fetchPollinatorIntelligence()
    expect(result.mode).toBe('fallback')
    expect(result.mode).not.toBe('live')
  })

  it('handles null response without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    }))
    const { fetchPollinatorIntelligence } = await import('./adapter')
    await expect(fetchPollinatorIntelligence()).resolves.toBeDefined()
  })

  it('preserves cached data after failure', async () => {
    const cachedData = { subsystemId: 'pollinators', knownRelationships: 700, mode: 'cached', connectionState: 'connected', endpoint: 'x', timestamp: new Date().toISOString() }
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: 'x', dataAge: 1000, mode: 'cached' }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchPollinatorIntelligence } = await import('./adapter')
    const result = await fetchPollinatorIntelligence()
    expect(result.knownRelationships).toBe(700)
    expect(result.mode).toBe('fallback')
  })

  it('mode is never live when data is from fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchPollinatorIntelligence } = await import('./adapter')
    const result = await fetchPollinatorIntelligence()
    expect(result.mode).not.toBe('live')
  })

  it('does not crash on empty array response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }))
    const { fetchPollinatorIntelligence } = await import('./adapter')
    const result = await fetchPollinatorIntelligence()
    expect(result.knownRelationships).toBe(0)
  })
})
