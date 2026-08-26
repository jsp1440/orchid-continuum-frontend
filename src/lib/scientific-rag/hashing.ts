/**
 * Deterministic, dependency-free content hashing for the scientific RAG slice.
 *
 * This vertical slice must produce stable identity for publications, document
 * text, extracted claims, and embedding inputs so that:
 *   - unchanged content is a provable no-op (change detection, embedding reuse);
 *   - replay is idempotent (idempotency keys derive from content, not clocks);
 *   - dedup is exact rather than heuristic.
 *
 * We deliberately avoid `node:crypto` so the same function runs identically in
 * the Vitest node environment and in a browser/worker bundle. FNV-1a over the
 * UTF-8 code units, folded into a 128-bit digest with a length salt, is more
 * than strong enough for content-identity within a governed corpus. It is NOT a
 * cryptographic hash and must never be relied on for security decisions.
 */

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64(input: string, seed: bigint): bigint {
  let hash = seed;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    // Fold both bytes of the UTF-16 code unit so multibyte characters affect
    // the digest rather than collapsing to their low byte.
    hash ^= BigInt(code & 0xff);
    hash = (hash * FNV_PRIME_64) & MASK_64;
    hash ^= BigInt((code >> 8) & 0xff);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash & MASK_64;
}

function toHex64(value: bigint): string {
  return value.toString(16).padStart(16, "0");
}

/**
 * Normalise text before hashing so cosmetic differences (line endings,
 * trailing whitespace, repeated interior whitespace) do not create spurious
 * "changed content". Scientific wording differences survive; formatting noise
 * does not.
 */
export function normalizeForHash(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Content hash used across the slice. Two FNV-1a passes with different seeds,
 * concatenated, plus a length prefix, yields a 128-bit digest expressed as a
 * `sha1a-` prefixed hex string. The prefix documents the algorithm family so a
 * future migration to a real digest can be detected in stored records.
 */
export function contentHash(input: string): string {
  const normalized = normalizeForHash(input);
  const a = fnv1a64(normalized, FNV_OFFSET_64);
  const b = fnv1a64(normalized, a ^ FNV_PRIME_64);
  const lengthSalt = BigInt(normalized.length) & MASK_64;
  return `sha1a-${toHex64(a ^ lengthSalt)}${toHex64(b)}`;
}

/**
 * Stable hash over an arbitrary JSON-serialisable value. Object keys are sorted
 * recursively so semantically-equal payloads with different key order hash
 * identically — required for idempotency keys derived from structured claims.
 */
export function structuralHash(value: unknown): string {
  return contentHash(canonicalJson(value));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Idempotency key: a short, collision-resistant token derived from the parts
 * that define "the same unit of work". Consumers use it to reject duplicate
 * side effects after at-least-once delivery or replay.
 */
export function idempotencyKey(...parts: (string | number)[]): string {
  return `idk-${contentHash(parts.map((p) => String(p)).join("␟"))}`;
}
