/**
 * fingerprint — deterministic, order-independent content fingerprints for the
 * evidence-to-decision layer.
 *
 * The RunEvidenceManifest has to be reproducible: the same governed inputs must
 * produce the same identifier, and any material change must change it. That is a
 * content-addressing requirement, not a security one, so this module computes a
 * stable *fingerprint* — never a cryptographic digest — and names its outputs
 * accordingly. We deliberately do not call this a sha256: overclaiming the
 * strength of an identifier is its own kind of fabricated rigor.
 *
 * Determinism comes from canonical serialization: object keys are sorted, so two
 * structurally equal inputs serialize identically regardless of construction
 * order. Arrays keep their order because order is meaningful for a plan or a
 * claim sequence; callers that want set semantics sort before fingerprinting.
 */

/** Canonical JSON: object keys sorted recursively so equal content serializes equally. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const entry = record[key];
    // Drop undefined so an explicitly-absent field and a missing field fingerprint
    // identically; `null` is preserved because it is a meaningful scientific value.
    if (entry === undefined) continue;
    out[key] = canonicalize(entry);
  }
  return out;
}

/**
 * FNV-1a (64-bit) over the canonical serialization, returned as 16 lowercase hex
 * chars. Fast, dependency-free, and stable across node and the browser. Prefixed
 * `fp1:` so the algorithm is legible in stored manifests and can be versioned
 * without ambiguity if we ever migrate to a stronger digest.
 */
export function contentFingerprint(value: unknown): string {
  const text = typeof value === "string" ? value : canonicalStringify(value);
  return `fp1:${fnv1a64(text)}`;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  // Hash UTF-8 bytes so non-ASCII scientific names (authorship, ×hybrids) are stable.
  const bytes = utf8Bytes(input);
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

function utf8Bytes(input: string): number[] {
  if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(input));
  // Fallback for environments without TextEncoder; correct for the BMP + surrogates.
  const bytes: number[] = [];
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}
