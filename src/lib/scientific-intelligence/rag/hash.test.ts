import { describe, it, expect } from 'vitest'
import { sha256Hex, canonicalize, contentHash } from './hash'

describe('rag/hash', () => {
  it('computes known SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    )
  })

  it('is deterministic and order-independent for structured content', () => {
    const a = contentHash({ b: 2, a: 1, nested: { y: 1, x: 2 } })
    const b = contentHash({ nested: { x: 2, y: 1 }, a: 1, b: 2 })
    expect(a).toBe(b)
    expect(a.startsWith('sha256:')).toBe(true)
  })

  it('changes when content materially changes', () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
  })

  it('canonicalize drops undefined like JSON.stringify', () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}')
  })
})
