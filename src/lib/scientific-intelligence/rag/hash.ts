/**
 * Deterministic, dependency-free SHA-256 for content-addressable hashing.
 *
 * The event-driven scientific RAG slice hashes publication bytes, parsed
 * documents, extracted claims, and embedding inputs to decide what has changed
 * and to key idempotent processing. Those hashes must be:
 *
 *   • deterministic across Node (Vitest/CI) and the browser bundle — so no
 *     `node:crypto` import and no async `crypto.subtle`;
 *   • stable for identical logical content regardless of key ordering — so
 *     objects are serialised through a canonical, key-sorted encoder before
 *     hashing.
 *
 * This is a straight, well-known SHA-256 implementation over UTF-8 bytes. It is
 * used for change detection and idempotency, never as a security primitive.
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rrot(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

function utf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(input)
  // Extremely defensive fallback; TextEncoder is present in Node and browsers.
  const out: number[] = []
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    if (code < 0x80) out.push(code)
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return Uint8Array.from(out)
}

/** SHA-256 of a UTF-8 string, returned as lowercase hex. */
export function sha256Hex(input: string): string {
  const bytes = utf8Bytes(input)
  const bitLen = bytes.length * 8

  // Pad: append 0x80, then zeros, then 64-bit big-endian length.
  const withOne = bytes.length + 1
  const totalLen = withOne + ((56 - (withOne % 64) + 64) % 64) + 8
  const buffer = new Uint8Array(totalLen)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80
  // 64-bit length: JS numbers are safe well past our payload sizes; high word 0.
  const hi = Math.floor(bitLen / 0x100000000)
  const lo = bitLen >>> 0
  buffer[totalLen - 8] = (hi >>> 24) & 0xff
  buffer[totalLen - 7] = (hi >>> 16) & 0xff
  buffer[totalLen - 6] = (hi >>> 8) & 0xff
  buffer[totalLen - 5] = hi & 0xff
  buffer[totalLen - 4] = (lo >>> 24) & 0xff
  buffer[totalLen - 3] = (lo >>> 16) & 0xff
  buffer[totalLen - 2] = (lo >>> 8) & 0xff
  buffer[totalLen - 1] = lo & 0xff

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4
      w[i] = ((buffer[j] << 24) | (buffer[j + 1] << 16) | (buffer[j + 2] << 8) | buffer[j + 3]) >>> 0
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rrot(w[i - 15], 7) ^ rrot(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rrot(w[i - 2], 17) ^ rrot(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i += 1) {
      const s1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + s1 + ch + K[i] + w[i]) >>> 0
      const s0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (s0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7)
}

/**
 * Canonical JSON: object keys sorted recursively so that logically identical
 * content produces byte-identical serialisation (and therefore an identical
 * hash) regardless of key insertion order. `undefined` is dropped the way
 * `JSON.stringify` drops it.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
}

/** Content hash of arbitrary structured content, prefixed for readability. */
export function contentHash(value: unknown): string {
  const payload = typeof value === 'string' ? value : canonicalize(value)
  return `sha256:${sha256Hex(payload)}`
}

/** Short deterministic id derived from a content hash, for edge/embedding keys. */
export function shortHash(value: unknown): string {
  return contentHash(value).slice(7, 7 + 16)
}
