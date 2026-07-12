import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('KnowledgeGraphAdapter', () => {
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

  it('returns live intelligence when executive state has knowledge graph subsystem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        globalHealth: [{
          id: 'knowledge-graph',
          name: 'Knowledge Graph',
          status: 'healthy',
          completeness: 72,
          lastChecked: new Date().toISOString(),
          recommendedNextAction: 'Review orphaned relationships.',
          blockers: [],
          sourceRecordCounts: { entities: 1200, relationships: 4500 },
        }],
      }),
    }))

    const { fetchKnowledgeGraphIntelligence } = await import('./adapter')
    const result = await fetchKnowledgeGraphIntelligence()

    expect(result.subsystemId).toBe('knowledge-graph')
    expect(result.connectionState).toBe('connected')
    expect(result.connectedEntities).toBe(1200)
    expect(result.relationshipCount).toBe(4500)
    expect(result.mode).not.toBe('unavailable')
    expect(result.mode).not.toBe('fallback')
    expect(result.provenance.length).toBeGreaterThan(0)
    expect(result.provenance[0].endpoint).toContain('calyx')
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('falls back to unavailable mode on backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

    const { fetchKnowledgeGraphIntelligence } = await import('./adapter')
    const result = await fetchKnowledgeGraphIntelligence()

    expect(result.mode).toBe('fallback')
    expect(result.connectionState).toBe('fallback')
    expect(result.fallbackReason).toBeTruthy()
  })

  it('does not crash on null response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    }))

    const { fetchKnowledgeGraphIntelligence } = await import('./adapter')
    await expect(fetchKnowledgeGraphIntelligence()).resolves.toBeDefined()
  })

  it('does not crash on malformed response (string)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => 'not-an-object',
    }))

    const { fetchKnowledgeGraphIntelligence } = await import('./adapter')
    await expect(fetchKnowledgeGraphIntelligence()).resolves.toBeDefined()
  })

  it('returns fallback (not live) when backend returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))

    const { fetchKnowledgeGraphIntelligence } = await import('./adapter')
    const result = await fetchKnowledgeGraphIntelligence()

    expect(result.mode).not.toBe('live')
    expect(['fallback', 'unavailable', 'error']).toContain(result.mode)
  })

  it('preserves stale cache after failure', async () => {
    const cachedData = {
      subsystemId: 'knowledge-graph',
      subsystemName: 'Knowledge Graph',
      mode: 'cached' as const,
      connectionState: 'connected' as const,
      endpoint: 'https://cached.example.com',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      dataAge: 3600000,
      blockers: [],
      missingEvidence: [],
      recommendedNextAction: 'Cached action',
      provenance: [],
      metrics: {},
      connectedEntities: 500,
      relationshipCount: 2000,
      missingRelationships: [],
      orphanedRecords: 0,
      unsupportedCategories: [],
      provenanceGaps: [],
      graphCompleteness: 0.6,
      repairAction: 'Cached repair',
    }

    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: cachedData.endpoint, dataAge: 3600000, mode: 'cached' }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))

    const { fetchKnowledgeGraphIntelligence } = await import('./adapter')
    const result = await fetchKnowledgeGraphIntelligence()

    expect(result.connectedEntities).toBe(500)
    expect(result.mode).toBe('fallback')
  })
})
