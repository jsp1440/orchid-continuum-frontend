/**
 * Ingestion pipeline — the one doorway sanitized events pass through.
 *
 * Order of operations is security-critical:
 *   1. Coerce/require an object.
 *   2. Sanitize metadata (and correlation free-keys) FIRST, so no secret can
 *      reach validation, storage, or logs even if the emitter misbehaved.
 *   3. Stamp received_at + redaction status.
 *   4. Strictly validate against the envelope schema.
 *   5. Final belt-and-braces secret scan of the serialized form; quarantine on
 *      any hit.
 *
 * Malformed events are QUARANTINED (returned with a reason) rather than thrown,
 * so a single bad emitter can never crash the collector. Quarantined events
 * carry no payload — only a reason and safe identifiers.
 *
 * This module is provider-neutral and side-effect-free: it does not itself
 * persist. A backend worker (or a test) supplies the sink. See
 * docs/security/ADR-0001-security-control-plane.md.
 */

import {
  SECURITY_EVENT_SCHEMA_VERSION,
  validateSecurityEvent,
  type SecurityEvent,
} from './envelope';
import {
  sanitizeDeep,
  containsSecretMaterial,
  type SanitizeStats,
} from './sanitize';

export interface IngestAccepted {
  status: 'accepted';
  event: SecurityEvent;
  sanitized: boolean;
  stats: SanitizeStats;
}

export interface IngestQuarantined {
  status: 'quarantined';
  reason: string;
  /** Safe identifiers only — never the payload. */
  ref?: { event_id?: string; source?: string; event_type?: string };
}

export type IngestResult = IngestAccepted | IngestQuarantined;

function safeRef(candidate: unknown): IngestQuarantined['ref'] {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const c = candidate as Record<string, unknown>;
  const pick = (k: string) =>
    typeof c[k] === 'string' && (c[k] as string).length <= 128
      ? (c[k] as string)
      : undefined;
  return {
    event_id: pick('event_id'),
    source: pick('source'),
    event_type: pick('event_type'),
  };
}

export interface IngestOptions {
  /** When true, received_at is not overwritten if already present. */
  preserveReceivedAt?: boolean;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

/**
 * Ingest a single candidate event. Pure function — returns a typed result.
 */
export function ingestSecurityEvent(
  candidate: unknown,
  options: IngestOptions = {},
): IngestResult {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { status: 'quarantined', reason: 'event must be a JSON object' };
  }

  const now = options.now ?? (() => new Date());
  const raw = candidate as Record<string, unknown>;

  // Guard the schema version early with a friendly reason.
  if (raw.schema_version !== SECURITY_EVENT_SCHEMA_VERSION) {
    return {
      status: 'quarantined',
      reason: `unsupported schema_version (expected ${SECURITY_EVENT_SCHEMA_VERSION})`,
      ref: safeRef(raw),
    };
  }

  // 2. Sanitize the free-form regions BEFORE anything else.
  const metaResult = sanitizeDeep(raw.metadata ?? {});
  const totalStats: SanitizeStats = { ...metaResult.stats };

  const correlation = { ...(raw.correlation as Record<string, unknown> | undefined) };
  // correlation.keys is the only free-form region in correlation.
  if (correlation && Array.isArray(correlation.keys)) {
    const keysResult = sanitizeDeep(correlation.keys);
    correlation.keys = keysResult.value;
    totalStats.redacted += keysResult.stats.redacted;
    totalStats.truncated += keysResult.stats.truncated;
    totalStats.dropped += keysResult.stats.dropped;
  }

  const anythingRedacted =
    totalStats.redacted + totalStats.truncated + totalStats.dropped > 0;

  // 3. Rebuild the candidate with sanitized regions + stamps.
  const stamped: Record<string, unknown> = {
    ...raw,
    metadata: metaResult.value,
    correlation,
    received_at:
      options.preserveReceivedAt && typeof raw.received_at === 'string'
        ? raw.received_at
        : now().toISOString(),
    redaction: {
      status: anythingRedacted ? 'redacted' : 'clean',
      redacted_field_count: totalStats.redacted,
    },
  };

  // 4. Strict validation.
  const validation = validateSecurityEvent(stamped);
  if (!validation.ok) {
    return {
      status: 'quarantined',
      reason: `schema validation failed: ${(validation.issues ?? []).slice(0, 5).join('; ')}`,
      ref: safeRef(raw),
    };
  }

  // 5. Belt-and-braces: serialize the FINAL event and scan for secret patterns.
  // If anything survived (e.g. a secret embedded in an allowlisted-looking
  // field the key heuristic missed), quarantine rather than store.
  const serialized = JSON.stringify(validation.event);
  if (containsSecretMaterial(serialized)) {
    return {
      status: 'quarantined',
      reason: 'secret-like material detected in serialized event',
      ref: safeRef(raw),
    };
  }

  return {
    status: 'accepted',
    event: validation.event,
    sanitized: anythingRedacted,
    stats: totalStats,
  };
}

/**
 * Idempotent batch ingest. De-duplicates by event_id within the batch (an
 * emitter retrying should not create duplicate incidents). Returns accepted
 * events plus a quarantine list.
 */
export function ingestBatch(
  candidates: unknown[],
  options: IngestOptions = {},
): { accepted: SecurityEvent[]; quarantined: IngestQuarantined[] } {
  const accepted: SecurityEvent[] = [];
  const quarantined: IngestQuarantined[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const result = ingestSecurityEvent(candidate, options);
    if (result.status === 'accepted') {
      if (seen.has(result.event.event_id)) continue; // idempotent
      seen.add(result.event.event_id);
      accepted.push(result.event);
    } else {
      quarantined.push(result);
    }
  }
  return { accepted, quarantined };
}
