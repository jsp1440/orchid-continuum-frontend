import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('LiteratureAdapter', () => {
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

  it('returns live intelligence when literature subsystem found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        subsystems: [{
          id: 'literature',
          name: 'Literature',
          status: 'healthy',
          completeness: 65,
          lastChecked: new Date().toISOString(),
          recommendedNextAction: 'Import latest batch.',
          blockers: [],
          sourceRecordCounts: { papers: 850, citations: 3200 },
        }],
      }),
    }))

    const { fetchLiteratureIntelligence } = await import('./adapter')
    const result = await fetchLiteratureIntelligence()

    expect(result.subsystemId).toBe('literature')
    expect(result.paperCount).toBe(850)
    expect(result.citationCount).toBe(3200)
    expect(result.connectionState).toBe('connected')
    expect(result.mode).not.toBe('fallback')
    expect(result.provenance[0].endpoint).toContain('calyx')
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('returns fallback on backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))
    const { fetchLiteratureIntelligence } = await import('./adapter')
    const result = await fetchLiteratureIntelligence()
    expect(result.mode).toBe('fallback')
    expect(result.mode).not.toBe('live')
  })

  it('handles malformed response gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ subsystems: 'not-an-array' }),
    }))
    const { fetchLiteratureIntelligence } = await import('./adapter')
    await expect(fetchLiteratureIntelligence()).resolves.toBeDefined()
  })

  it('falls back when literature subsystem not found in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ subsystems: [{ id: 'atlas', name: 'Atlas', completeness: 80, blockers: [] }] }),
    }))
    const { fetchLiteratureIntelligence } = await import('./adapter')
    const result = await fetchLiteratureIntelligence()
    expect(result.mode).toBe('fallback')
  })

  it('preserves cached data after failure', async () => {
    const cachedData = { subsystemId: 'literature', paperCount: 900, mode: 'cached', connectionState: 'connected', endpoint: 'x', timestamp: new Date().toISOString() }
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: 'x', dataAge: 1000, mode: 'cached' }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchLiteratureIntelligence } = await import('./adapter')
    const result = await fetchLiteratureIntelligence()
    expect(result.paperCount).toBe(900)
    expect(result.mode).toBe('fallback')
  })

  it('mode is never live when data is from fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchLiteratureIntelligence } = await import('./adapter')
    const result = await fetchLiteratureIntelligence()
    expect(result.mode).not.toBe('live')
  })
})
