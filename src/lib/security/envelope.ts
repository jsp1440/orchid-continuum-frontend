/**
 * Security Event Envelope — versioned, provider-neutral security event contract.
 *
 * This is the single source of truth for the shape of every internal security
 * event the Orchid Continuum control plane ingests. It is deliberately
 * provider-neutral (no Render/Neon/GitHub/Gemini specifics leak into the
 * contract) so any authorized source can emit a conforming event.
 *
 * Design rules (see docs/security/THREAT_MODEL.md and PRIVACY_RETENTION.md):
 *  - Strict validation. Malformed events are REJECTED or QUARANTINED, never
 *    silently coerced into storage.
 *  - No secret-bearing fields. The schema has no field for raw tokens,
 *    passwords, cookies, or connection strings. Sanitization
 *    (see ./sanitize) runs before validation to strip anything that slips in.
 *  - Security risk is kept DISTINCT from scientific evidence quality. This
 *    contract never carries scientific confidence/provenance verdicts.
 *  - Metadata is an allowlisted, bounded record — not an arbitrary payload
 *    dump — so we do not accidentally capture private content.
 *
 * The wire contract mirrors backend `security_events` rows; the machine
 * readable JSON Schema lives in the backend repo
 * (contracts/security-event-v1.schema.json) and MUST stay in sync with this
 * module. See docs/security/ADR-0001-security-control-plane.md.
 */

import { z } from 'zod';

/** Current envelope schema version. Bump on any breaking field change. */
export const SECURITY_EVENT_SCHEMA_VERSION = 'security-event/1' as const;

// ---------------------------------------------------------------------------
// Enumerations — kept small and stable so rules/correlation can switch on them
// ---------------------------------------------------------------------------

export const SOURCE_CATEGORIES = [
  'auth', // authentication / session lifecycle
  'authz', // authorization decisions
  'admin', // administrative actions
  'api', // API gateway / rate limiting
  'agent', // AI agent / mission / tool activity
  'model', // model-provider calls
  'ingestion', // literature / occurrence / trait ingestion + provenance
  'ci', // CI workflow / deployment / migration
  'webhook', // inbound webhook verification
  'database', // bulk access / write anomalies
  'domain', // DNS / email-auth / certificate posture
  'infra', // generic infrastructure
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const ENVIRONMENTS = [
  'production',
  'staging',
  'development',
  'test',
] as const;
export type SecurityEnvironment = (typeof ENVIRONMENTS)[number];

export const ACTOR_TYPES = [
  'user',
  'service',
  'agent',
  'system',
  'anonymous',
] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const OUTCOMES = [
  'success',
  'failure',
  'denied',
  'error',
  'attempted',
  'unknown',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Severity — the potential impact of the event. Kept separate from
 * confidence (how sure we are it is real) and from scientific evidence.
 */
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const REDACTION_STATUSES = [
  'clean', // nothing needed redaction
  'redacted', // one or more fields were redacted
  'quarantined', // event could not be safely stored as-is
] as const;
export type RedactionStatus = (typeof REDACTION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Bounded scalar helpers
// ---------------------------------------------------------------------------

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe('RFC3339 / ISO-8601 timestamp with offset');

/** Confidence in [0,1]; distinct from severity. */
const confidence = z.number().min(0).max(1);

/**
 * A short, namespaced identifier segment. Used for event_type, action, etc.
 * Intentionally restrictive so free-form / private text cannot ride in here.
 */
const token = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'must be a short namespaced token');

/**
 * Pseudonymous actor reference. This is NEVER a raw email, name, or IP — it is
 * an opaque, stable, salted identifier produced upstream (e.g. sha256 prefix).
 * We bound length and forbid `@` and whitespace to make accidental PII obvious.
 */
const pseudonymousRef = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'actor_ref must be pseudonymous (no PII)')
  .refine((v) => !v.includes('@'), 'actor_ref must not look like an email');

/**
 * Allowlisted metadata: a bounded, flat-ish record of primitives. Rules and the
 * Trust Center read named keys from here. We forbid deeply nested arbitrary
 * payloads at the contract level to avoid capturing private content; the
 * sanitizer additionally redacts secret-looking keys/values.
 */
const metadataValue = z.union([
  z.string().max(2_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string().max(512), z.number(), z.boolean()])).max(50),
]);

export const metadataSchema = z.record(token, metadataValue);
export type SecurityEventMetadata = z.infer<typeof metadataSchema>;

// ---------------------------------------------------------------------------
// Provenance / correlation / redaction sub-objects
// ---------------------------------------------------------------------------

export const provenanceSchema = z.object({
  /** Emitting component / library that produced the event. */
  emitter: token,
  /** Version of the emitting instrumentation. */
  emitter_version: z.string().max(60).optional(),
  /** Whether the event was derived by a rule vs. observed directly. */
  derivation: z.enum(['observed', 'derived', 'model-assisted']).default('observed'),
});
export type SecurityEventProvenance = z.infer<typeof provenanceSchema>;

export const correlationSchema = z
  .object({
    trace_id: token.optional(),
    request_id: token.optional(),
    session_id: token.optional(),
    mission_id: token.optional(),
    commit_sha: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/, 'commit_sha must be a hex git sha')
      .optional(),
    actor_ref: pseudonymousRef.optional(),
    /** Free correlation keys (allowlisted tokens only). */
    keys: z.array(token).max(20).optional(),
  })
  .strict();
export type SecurityEventCorrelation = z.infer<typeof correlationSchema>;

export const redactionSchema = z
  .object({
    status: z.enum(REDACTION_STATUSES),
    /** Count of fields the sanitizer redacted (never the values themselves). */
    redacted_field_count: z.number().int().min(0).default(0),
    /** Reason, when quarantined. */
    reason: z.string().max(280).optional(),
  })
  .strict();
export type SecurityEventRedaction = z.infer<typeof redactionSchema>;

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

export const securityEventSchema = z
  .object({
    event_id: z.string().uuid(),
    schema_version: z.literal(SECURITY_EVENT_SCHEMA_VERSION),
    occurred_at: isoDateTime,
    /** Set by the ingestion service on receipt; optional at emit time. */
    received_at: isoDateTime.optional(),

    source: token,
    source_category: z.enum(SOURCE_CATEGORIES),
    environment: z.enum(ENVIRONMENTS),
    service: token,

    /** Namespaced event type, e.g. "auth.login.failure", "agent.tool.denied". */
    event_type: token,

    actor_type: z.enum(ACTOR_TYPES),
    actor_ref: pseudonymousRef.optional(),

    resource_type: token.optional(),
    resource_id: z.string().max(256).optional(),
    action: token.optional(),
    outcome: z.enum(OUTCOMES),

    severity: z.enum(SEVERITIES),
    confidence,

    /** Signal ids attached upstream (the engine may add more). */
    risk_signals: z.array(token).max(40).default([]),

    provenance: provenanceSchema,
    correlation: correlationSchema.default({}),
    redaction: redactionSchema.default({ status: 'clean', redacted_field_count: 0 }),

    metadata: metadataSchema.default({}),
  })
  .strict();

export type SecurityEvent = z.infer<typeof securityEventSchema>;

/** Event as emitted by a source, before ingestion fills received_at etc. */
export type SecurityEventInput = z.input<typeof securityEventSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validation result. Kept as a single flat shape with optional fields (rather
 * than a `ok:true | ok:false` discriminated union) so it narrows correctly even
 * under this project's `strict: false` tsconfig, where boolean discriminants
 * collapse.
 */
export interface ValidationResult {
  ok: boolean;
  /** Present when ok. */
  event?: SecurityEvent;
  /** Present when not ok. Human-readable issues (no values echoed). */
  issues?: string[];
}

/**
 * Strictly validate a candidate event. Returns a typed result — never throws
 * into a caller's control flow. Issue strings contain paths + messages only,
 * never the offending values (which could be secrets).
 */
export function validateSecurityEvent(candidate: unknown): ValidationResult {
  const parsed = securityEventSchema.safeParse(candidate);
  if (parsed.success) {
    return { ok: true, event: parsed.data };
  }
  const issues = parsed.error.issues.map((i) => {
    const path = i.path.join('.') || '(root)';
    return `${path}: ${i.message}`;
  });
  return { ok: false, issues };
}

/** Type guard form for ergonomic call sites. */
export function isSecurityEvent(candidate: unknown): candidate is SecurityEvent {
  return securityEventSchema.safeParse(candidate).success;
}
