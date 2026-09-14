import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

/**
 * Read-only consumer for the exact Hassler / World Plants release lifecycle.
 *
 * Producer contract: owner-gated `GET /api/mission-control/taxonomy/hassler-release-status`
 * (backend `runtime/hassler_release_lifecycle.py`). This surface is deliberately
 * incapable of implying upload, staging, activation, or publication — it only
 * reports what the canonical taxonomy pipeline can currently establish about the
 * one exact release, and it fails closed:
 *
 *  - a backend that does not answer this endpoint reports `unreachable`, which is
 *    NOT the same as the classified `ABSENT` state (absent = the pipeline looked
 *    and the release is not present; unreachable = we could not ask);
 *  - `UNAVAILABLE` is itself a real classified state (evidence could not be read)
 *    and is preserved rather than being flattened into `ABSENT` or a false/zero;
 *  - a downstream relink count is shown only when the backend marks its evidence
 *    `observed`; otherwise the number is withheld, never rendered as 0.
 */

export const HASSLER_RELEASE_STATUS_PATH =
  '/api/mission-control/taxonomy/hassler-release-status';

/**
 * The lifecycle ladder the backend classifies the exact release into, in order.
 * Mirrors `LIFECYCLE_STATES` in the producer; kept as a fallback for rendering
 * the ladder when the payload does not echo its own `lifecycle_states`.
 */
export const HASSLER_LIFECYCLE_STATES = [
  'UNAVAILABLE',
  'ABSENT',
  'UPLOADED_INSPECTED',
  'SMOKE_VERIFIED',
  'STAGING_IN_PROGRESS',
  'STAGED_COMPLETE',
  'SUPERSEDED',
  'ACTIVATED',
] as const;

export type HasslerLifecycleState = (typeof HASSLER_LIFECYCLE_STATES)[number];

export interface HasslerRelinkDomain {
  surface: string;
  /** Present only when the backend marked this count `observed`; otherwise null. */
  count: number | null;
  countObserved: boolean;
}

export interface HasslerReleaseStatus {
  lifecycleState: HasslerLifecycleState;
  /** The full ladder as reported by the backend, or the local fallback. */
  lifecycleStates: readonly string[];
  rationale: string | null;
  expectedRelease: { filename: string | null; versionLabel: string | null };
  activeVsStaged: string | null;
  activeReleaseId: string | null;
  stagedReleaseId: string | null;
  superseded: boolean;
  supersededBy: string | null;
  /** What the pipeline could NOT establish — kept apart from any false/zero. */
  unavailableEvidence: string[];
  evidenceComplete: boolean;
  relinkDomains: HasslerRelinkDomain[];
  relinkCountsComplete: boolean;
  relinkUnresolvedBlockers: string[];
  // Governance invariants — surfaced so the panel can never read as activation.
  readOnly: boolean;
  automaticPromotion: boolean;
}

export type HasslerReleaseStatusResult =
  | { kind: 'available'; status: HasslerReleaseStatus }
  | { kind: 'unreachable'; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
}

function isLifecycleState(value: unknown): value is HasslerLifecycleState {
  return typeof value === 'string' && (HASSLER_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function mapRelinkDomains(downstream: Record<string, unknown> | null): HasslerRelinkDomain[] {
  const domains = downstream?.domains;
  if (!Array.isArray(domains)) return [];
  const out: HasslerRelinkDomain[] = [];
  for (const raw of domains) {
    const domain = asRecord(raw);
    if (!domain) continue;
    const surface = asString(domain.surface);
    if (!surface) continue;
    // A count is a claim about how much downstream work a relink implies. Only
    // trust it when the backend says the count was observed; anything else is
    // withheld rather than shown as a confident zero.
    const observed = domain.count_evidence === 'observed';
    const count = observed && typeof domain.count === 'number' ? domain.count : null;
    out.push({ surface, count, countObserved: observed && count !== null });
  }
  return out;
}

/**
 * Interpret a raw status payload, failing closed. Pure and fetch-free so the
 * fail-closed rules are testable without a network.
 */
export function interpretHasslerReleaseStatus(payload: unknown): HasslerReleaseStatusResult {
  const root = asRecord(payload);
  if (!root) return { kind: 'unreachable', reason: 'The backend did not return a status object.' };

  const lifecycle = asRecord(root.lifecycle);
  if (!lifecycle) {
    return { kind: 'unreachable', reason: 'The backend response did not include a lifecycle classification.' };
  }

  const state = lifecycle.lifecycle_state;
  if (!isLifecycleState(state)) {
    // A missing or unrecognized state must not be rendered as ABSENT — that
    // would assert the release is not present when we simply cannot tell.
    return { kind: 'unreachable', reason: 'The backend did not report a recognized lifecycle state.' };
  }

  const activeVsStaged = asRecord(lifecycle.active_vs_staged);
  const downstream = asRecord(root.downstream_relink_impact);
  const expected = asRecord(lifecycle.expected_release);

  const reportedStates = Array.isArray(lifecycle.lifecycle_states)
    ? lifecycle.lifecycle_states.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    kind: 'available',
    status: {
      lifecycleState: state,
      lifecycleStates: reportedStates.length ? reportedStates : HASSLER_LIFECYCLE_STATES,
      rationale: asString(lifecycle.lifecycle_rationale),
      expectedRelease: {
        filename: asString(expected?.filename),
        versionLabel: asString(expected?.version_label),
      },
      activeVsStaged: asString(activeVsStaged?.state),
      activeReleaseId: asString(activeVsStaged?.active_release_id),
      stagedReleaseId: asString(activeVsStaged?.staged_release_id),
      superseded: lifecycle.superseded === true,
      supersededBy: asString(lifecycle.superseded_by),
      unavailableEvidence: asStringList(lifecycle.unavailable_evidence),
      evidenceComplete: lifecycle.evidence_complete === true,
      relinkDomains: mapRelinkDomains(downstream),
      relinkCountsComplete: downstream?.counts_complete === true,
      relinkUnresolvedBlockers: asStringList(downstream?.unresolved_blockers),
      // Coerce strictly: the panel states these as facts, so a missing or
      // non-true value must read as "not read-only" / "promotion not disabled"
      // rather than being assumed safe.
      readOnly: root.read_only === true,
      automaticPromotion: root.automatic_promotion === true,
    },
  };
}

/**
 * Fetch and interpret the exact-release lifecycle. Owner-gated on the backend;
 * any transport failure, non-2xx, or unparseable body resolves to `unreachable`
 * (fail closed) rather than throwing — except an abort, which propagates.
 */
export async function fetchHasslerReleaseStatus(
  signal?: AbortSignal,
): Promise<HasslerReleaseStatusResult> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${HASSLER_RELEASE_STATUS_PATH}`, {
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { kind: 'unreachable', reason: 'The taxonomy backend could not be reached.' };
  }
  if (!response.ok) {
    return {
      kind: 'unreachable',
      reason:
        response.status === 401 || response.status === 403
          ? 'This status requires an active Mission Control owner session.'
          : `The taxonomy backend returned ${response.status}.`,
    };
  }
  const body = await response.json().catch(() => null);
  return interpretHasslerReleaseStatus(body);
}
