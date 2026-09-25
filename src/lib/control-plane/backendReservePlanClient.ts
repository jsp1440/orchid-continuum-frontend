import {
  bridgeBackendReservePlan,
  type BackendReserveBridgeResult,
  type BackendReservePlan,
} from './backendReserveQueueBridge';
import type { ExistingWorkRef } from './orchestratorQueueBridge';
import type { QueueBridgeSourceObservation } from './portfolioSteward';

/**
 * Read-only transport from the Calyx backend's evidence-gap reserve plan
 * (GET /api/runner/knowledge-gaps/reserve-plan, `oc.reserve-refill.v1`) into
 * the canonical frontend admission bridge.
 *
 * Deterministic and provider-free: one bounded GET, no paid provider call, no
 * credentials sent. Admission only prepares proposals through
 * `bridgeBackendReservePlan`; nothing here mutates the knowledge graph,
 * taxonomy, or publishes. Any transport, content-type, or shape failure fails
 * closed to an empty, blocked plan with the reason.
 */

export const BACKEND_RESERVE_PLAN_PATH = '/api/runner/knowledge-gaps/reserve-plan';
/** Matches the backend's per-pass cap; the route rejects anything larger. */
export const MAX_RESERVE_PLAN_DEPTH = 3;
const MAX_CALLER_FINGERPRINTS = 100;
const FINGERPRINT = /^[0-9a-f]{64}$/;

export type ReservePlanFetchResult =
  | { ok: true; plan: BackendReservePlan }
  | { ok: false; reason: string };

export interface ReservePlanClientOptions {
  baseUrl: string;
  /** Must be the provider-free mode; anything else refuses to fetch. */
  mode: 'deterministic-no-api';
  reserveDepth?: number;
  /** Material fingerprints already held, so the backend skips them. */
  heldFingerprints?: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ReservePlanAdmission {
  mode: 'deterministic-no-api';
  paidProviderCalls: 0;
  bridge: BackendReserveBridgeResult;
  /** Coverage observation for `planPortfolioSteward({ queueBridgeSources })`. */
  source: QueueBridgeSourceObservation;
  transportFailure: string | null;
  upstreamReason: string | null;
}

function boundedDepth(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) return MAX_RESERVE_PLAN_DEPTH;
  return Math.min(value, MAX_RESERVE_PLAN_DEPTH);
}

function isPlanShape(value: unknown): value is BackendReservePlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return typeof plan.schema === 'string'
    && typeof plan.status === 'string'
    && Number.isInteger(plan.reserve_depth)
    && Number.isInteger(plan.queued_count)
    && Number.isInteger(plan.deficit)
    && Array.isArray(plan.proposals);
}

export function reservePlanUrl(options: ReservePlanClientOptions): string {
  const url = new URL(BACKEND_RESERVE_PLAN_PATH, `${options.baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('reserve_depth', String(boundedDepth(options.reserveDepth)));
  const held = [...new Set((options.heldFingerprints ?? []).filter((fp) => FINGERPRINT.test(fp)))]
    .sort()
    .slice(0, MAX_CALLER_FINGERPRINTS);
  for (const fingerprint of held) url.searchParams.append('fingerprint', fingerprint);
  return url.toString();
}

export async function fetchBackendReservePlan(
  options: ReservePlanClientOptions,
): Promise<ReservePlanFetchResult> {
  if (options.mode !== 'deterministic-no-api') {
    return { ok: false, reason: 'unsupported_mode' };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
    : null;
  try {
    const response = await fetchImpl(reservePlanUrl(options), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller?.signal,
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return { ok: false, reason: 'non_json_response' };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
    if (!isPlanShape(body)) return { ok: false, reason: 'invalid_plan_shape' };
    return { ok: true, plan: body };
  } catch {
    return { ok: false, reason: 'transport_error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function blockedPlan(reserveDepth: number): BackendReservePlan {
  return {
    schema: 'oc.reserve-refill.v1',
    reserve_depth: reserveDepth,
    queued_count: 0,
    deficit: 0,
    status: 'transport_unavailable',
    proposals: [],
    rejections: [],
  };
}

/**
 * Fetch the backend evidence-gap reserve plan and admit it through the
 * canonical bridge. Returns the bridge result plus a `brain-knowledge-gap`
 * coverage observation for the Portfolio Steward.
 */
export async function admitBackendReservePlan(
  existing: ExistingWorkRef[],
  options: ReservePlanClientOptions,
): Promise<ReservePlanAdmission> {
  const depth = boundedDepth(options.reserveDepth);
  const fetched = await fetchBackendReservePlan(options);
  const upstream = fetched.ok ? fetched.plan : blockedPlan(depth);
  const bridge = bridgeBackendReservePlan(upstream, existing);
  const statusReason = fetched.ok
    ? (fetched.plan as BackendReservePlan & { status_reason?: unknown }).status_reason
    : null;
  const upstreamReason = typeof statusReason === 'string' && statusReason.trim()
    ? statusReason.trim()
    : null;
  const transportFailure = 'reason' in fetched ? fetched.reason : null;
  const connected = !transportFailure && !bridge.upstreamBlocked;
  const evidence = connected
    ? [`backend reserve plan ${bridge.upstreamStatus}: ${upstream.proposals.length} proposal(s)`]
    : [
      `backend reserve plan unavailable: ${transportFailure ?? bridge.upstreamStatus}`
        + (upstreamReason ? ` (${upstreamReason})` : ''),
    ];
  return {
    mode: 'deterministic-no-api',
    paidProviderCalls: 0,
    bridge,
    source: {
      sourceKind: 'brain-knowledge-gap',
      state: connected ? 'connected' : 'unavailable',
      evidence,
    },
    transportFailure,
    upstreamReason,
  };
}

/**
 * Admission point into the Portfolio Steward: the backend reserve plan is the
 * `brain-knowledge-gap` queue-bridge source. Replaces any prior observation of
 * that source so coverage reflects this pass only.
 */
export function withBackendReserveSource<T extends { queueBridgeSources?: QueueBridgeSourceObservation[] }>(
  input: T,
  admission: ReservePlanAdmission,
): T {
  const others = (input.queueBridgeSources ?? []).filter(
    (observation) => observation.sourceKind !== 'brain-knowledge-gap',
  );
  return { ...input, queueBridgeSources: [...others, admission.source] };
}
