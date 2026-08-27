/**
 * Sanitization & redaction layer.
 *
 * Runs BEFORE schema validation on every candidate security event. Its job is
 * to guarantee that no secret-bearing material is ever stored, logged, or
 * transmitted by the security control plane. It is intentionally aggressive and
 * fails safe: when in doubt, redact.
 *
 * What it does:
 *  - Recursively walks the metadata object.
 *  - Redacts values under secret-looking KEYS (tokens, passwords, cookies,
 *    authorization headers, connection strings, private prompt attachments,
 *    sensitive-locality fields, personal identifiers).
 *  - Redacts values that LOOK like secrets regardless of key (JWTs, bearer
 *    tokens, API-key prefixes, private keys, DB URIs, long high-entropy blobs).
 *  - Caps oversized strings/arrays so full request/response bodies cannot be
 *    captured wholesale.
 *  - Drops deeply nested structures beyond a bounded depth.
 *
 * The redaction marker never contains any part of the original value.
 *
 * See docs/security/PRIVACY_RETENTION.md for policy and the canary-string
 * tests in sanitize.test.ts that prove secrets never survive.
 */

export const REDACTION_MARKER = '[REDACTED]';
export const TRUNCATION_MARKER = '[TRUNCATED]';
export const DROPPED_MARKER = '[DROPPED]';

/** Bounds — conservative on purpose. */
const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_KEYS_PER_OBJECT = 100;

/**
 * Keys whose VALUES must always be redacted. Matched case-insensitively as a
 * substring of the normalized key (word-ish boundaries collapsed) so
 * `db_password`, `apiKey`, `Authorization`, `x-access-token` all match.
 */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /pass(word|wd|phrase)?/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /\bkey\b/i,
  /credential/i,
  /authorization/i,
  /\bauth\b/i,
  /bearer/i,
  /cookie/i,
  /session[_-]?(id|token|key)/i,
  /connection[_-]?string/i,
  /\bdsn\b/i,
  /database[_-]?url/i,
  /\bsalt\b/i,
  /signature/i,
  /\botp\b/i,
  /mfa/i,
  /ssn/i,
  /credit[_-]?card/i,
  // Sensitive-locality fields — never widen precise coordinates in security events.
  /(latitude|longitude|coordinates?|geohash|precise[_-]?locality|decimal_lat|decimal_lon)/i,
];

/**
 * Value patterns that indicate a secret regardless of the key it sits under.
 * Order matters only for readability; all are tried.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  // JWT (three base64url segments)
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/,
  // Bearer / authorization header value
  /\bBearer\s+[A-Za-z0-9._~+/-]{10,}=*/i,
  /\bBasic\s+[A-Za-z0-9+/]{10,}=*/i,
  // Common provider key prefixes (GitHub, OpenAI/Anthropic-style, Google, Slack, Stripe, AWS)
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{10,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{12,}\b/,
  // PEM private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // Database / broker connection URIs with embedded credentials
  /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/i,
  // Any URL carrying user:pass@
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i,
];

/**
 * High-entropy heuristic: long runs of base64-ish characters with no spaces are
 * likely keys/tokens even when they do not match a known prefix. We keep this
 * conservative (length >= 40) to avoid redacting ordinary identifiers.
 */
const HIGH_ENTROPY = /^[A-Za-z0-9+/_-]{40,}={0,2}$/;

function keyLooksSecret(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((re) => re.test(key));
}

function valueLooksSecret(value: string): boolean {
  if (SECRET_VALUE_PATTERNS.some((re) => re.test(value))) return true;
  // High-entropy single-token strings (no whitespace) of significant length.
  if (!/\s/.test(value) && HIGH_ENTROPY.test(value)) return true;
  return false;
}

export interface SanitizeStats {
  /** Number of leaf values redacted for secret key or secret value. */
  redacted: number;
  /** Number of values truncated for length. */
  truncated: number;
  /** Number of branches dropped for depth/size. */
  dropped: number;
}

function sanitizeString(value: string, stats: SanitizeStats): string {
  if (valueLooksSecret(value)) {
    stats.redacted += 1;
    return REDACTION_MARKER;
  }
  if (value.length > MAX_STRING_LENGTH) {
    stats.truncated += 1;
    return value.slice(0, MAX_STRING_LENGTH) + TRUNCATION_MARKER;
  }
  return value;
}

function sanitizeValue(
  value: unknown,
  depth: number,
  keyIsSecret: boolean,
  stats: SanitizeStats,
): unknown {
  // A secret-looking key redacts its entire subtree, whatever the shape.
  if (keyIsSecret) {
    stats.redacted += 1;
    return REDACTION_MARKER;
  }

  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'number' || t === 'boolean') return value;

  if (t === 'string') {
    return sanitizeString(value as string, stats);
  }

  if (depth >= MAX_DEPTH) {
    stats.dropped += 1;
    return DROPPED_MARKER;
  }

  if (Array.isArray(value)) {
    const capped = value.slice(0, MAX_ARRAY_LENGTH);
    if (value.length > MAX_ARRAY_LENGTH) stats.dropped += 1;
    return capped.map((v) => sanitizeValue(v, depth + 1, false, stats));
  }

  if (t === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_KEYS_PER_OBJECT,
    );
    for (const [k, v] of entries) {
      out[k] = sanitizeValue(v, depth + 1, keyLooksSecret(k), stats);
    }
    return out;
  }

  // Functions, symbols, bigint, etc. are never safe to store.
  stats.dropped += 1;
  return DROPPED_MARKER;
}

export interface SanitizeResult<T = unknown> {
  value: T;
  stats: SanitizeStats;
  /** True if anything was redacted/truncated/dropped. */
  changed: boolean;
}

/**
 * Recursively sanitize an arbitrary JSON-ish value (typically an event's
 * metadata). Returns a deep-cloned, redacted copy plus stats. Never mutates the
 * input.
 */
export function sanitizeDeep<T = unknown>(input: T): SanitizeResult<T> {
  const stats: SanitizeStats = { redacted: 0, truncated: 0, dropped: 0 };
  const value = sanitizeValue(input, 0, false, stats) as T;
  const changed = stats.redacted + stats.truncated + stats.dropped > 0;
  return { value, stats, changed };
}

/**
 * Convenience predicate used by tests and by the ingestion service to assert
 * that a serialized blob contains no known secret patterns. This is a
 * belt-and-braces check on the FINAL stored form.
 */
export function containsSecretMaterial(serialized: string): boolean {
  return (
    SECRET_VALUE_PATTERNS.some((re) => re.test(serialized)) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(serialized)
  );
}
