import { describe, it, expect } from 'vitest'
import { EventLedger, LedgerError } from './eventLedger'

function makeLedger(maxAttempts = 3) {
  let tick = 0
  return new EventLedger({ maxAttempts, now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() })
}

describe('rag/eventLedger', () => {
  it('appends a durable event with full envelope metadata', () => {
    const ledger = makeLedger()
    const event = ledger.append({
      type: 'source.discovered',
      aggregateId: 'src1',
      correlationId: 'run1',
      producer: 'ingestion',
      payload: { doi: 'x' },
    })
    expect(event.eventId).toBeTruthy()
    expect(event.correlationId).toBe('run1')
    expect(event.status).toBe('pending')
    expect(event.contentHash.startsWith('sha256:')).toBe(true)
    expect(event.idempotencyKey).toContain('source.discovered')
  })

  it('is idempotent on production — the same logical fact appends once', () => {
    const ledger = makeLedger()
    const a = ledger.append({ type: 'claim.extracted', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: { v: 1 } })
    const b = ledger.append({ type: 'claim.extracted', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: { v: 1 } })
    expect(a.eventId).toBe(b.eventId)
    expect(ledger.history()).toHaveLength(1)
  })

  it('distinguishes different content under the same aggregate', () => {
    const ledger = makeLedger()
    ledger.append({ type: 'claim.extracted', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: { v: 1 } })
    ledger.append({ type: 'claim.extracted', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: { v: 2 } })
    expect(ledger.history()).toHaveLength(2)
  })

  it('dispatches with at-least-once, idempotent consumption', async () => {
    const ledger = makeLedger()
    ledger.append({ type: 'embedding.requested', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: {} })
    const applied = new Set<string>()
    let calls = 0
    const consume = async (event: { aggregateId: string }) => {
      calls += 1
      applied.add(event.aggregateId) // idempotent downstream keyed by aggregate
    }
    await ledger.dispatch('embedding.requested', consume)
    // Re-dispatch: processed events are not redelivered.
    await ledger.dispatch('embedding.requested', consume)
    expect(calls).toBe(1)
    expect(applied.size).toBe(1)
    expect(ledger.byType('embedding.requested')[0].status).toBe('processed')
  })

  it('bounds retries and dead-letters a persistently failing event', async () => {
    const ledger = makeLedger(3)
    ledger.append({ type: 'graph.update_requested', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: {} })
    const failer = () => { throw new LedgerError('transient', 'downstream down') }
    await ledger.dispatch('graph.update_requested', failer) // attempt 1 → retrying
    expect(ledger.byType('graph.update_requested')[0].status).toBe('retrying')
    await ledger.dispatch('graph.update_requested', failer) // attempt 2 → retrying
    await ledger.dispatch('graph.update_requested', failer) // attempt 3 → dead_letter
    const event = ledger.byType('graph.update_requested')[0]
    expect(event.status).toBe('dead_letter')
    expect(event.attempt).toBe(3)
    expect(ledger.deadLetter()).toHaveLength(1)
  })

  it('dead-letters a permanent (validation) failure immediately', async () => {
    const ledger = makeLedger(5)
    ledger.append({ type: 'document.parsed', aggregateId: 'd1', correlationId: 'r', producer: 'x', payload: {} })
    await ledger.dispatch('document.parsed', () => { throw new LedgerError('validation', 'bad shape') })
    expect(ledger.byType('document.parsed')[0].status).toBe('dead_letter')
    expect(ledger.byType('document.parsed')[0].attempt).toBe(1)
  })

  it('supports safe replay via requeue after a failure', async () => {
    const ledger = makeLedger(1)
    ledger.append({ type: 'graph.update_requested', aggregateId: 'c1', correlationId: 'r', producer: 'x', payload: {} })
    let shouldFail = true
    const consume = () => { if (shouldFail) throw new LedgerError('transient', 'temporarily down') }
    await ledger.dispatch('graph.update_requested', consume)
    expect(ledger.byType('graph.update_requested')[0].status).toBe('dead_letter')

    shouldFail = false
    expect(ledger.requeue(ledger.byType('graph.update_requested')[0].eventId)).toBe(true)
    const processed = await ledger.dispatch('graph.update_requested', consume)
    expect(processed).toHaveLength(1)
    expect(ledger.byType('graph.update_requested')[0].status).toBe('processed')
  })

  it('reports pending backlog and oldest pending age', () => {
    const ledger = makeLedger()
    ledger.append({ type: 'source.discovered', aggregateId: 's1', correlationId: 'r', producer: 'x', payload: {} })
    ledger.append({ type: 'source.discovered', aggregateId: 's2', correlationId: 'r', producer: 'x', payload: {} })
    expect(ledger.pending()).toHaveLength(2)
    const age = ledger.oldestPendingAgeMs(1_700_000_010_000)
    expect(age).toBeGreaterThan(0)
  })
})
