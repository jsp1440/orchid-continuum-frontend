/**
 * Orchid Zoo (citizen science) API contracts — placeholder layer.
 * --------------------------------------------------------------
 * The public frontend does NOT talk to Zooniverse directly. The
 * preferred architecture is:
 *
 *   Zooniverse / reviewer interface
 *        ↓
 *   Orchid Continuum database
 *        ↓
 *   Orchid Continuum API
 *        ↓
 *   Public frontend (this codebase)
 *
 * This module declares the typed contracts and hooks for the public
 * frontend to consume those API endpoints once they are live.
 *
 * Future endpoints:
 *   GET  /api/zoo/status                  — review queue health
 *   GET  /api/zoo/queue                   — image validation queue
 *   POST /api/zoo/contribute              — citizen-science submission
 *   GET  /api/zoo/badges/{taxonomy_id}    — reviewed-image confidence badges
 */

import { ApiError, apiRequest, type ApiResult } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZooStatus {
  queue_depth?: number;
  reviewed_today?: number;
  active_reviewers?: number;
  last_review_at?: string;
}

export interface ZooQueueItem {
  submission_id: string;
  thumbnail_url?: string;
  proposed_taxon?: string;
  submitted_at?: string;
  review_state?: 'pending' | 'in_review' | 'needs_more_data';
}

export interface ZooContribution {
  taxon_hint?: string;
  observer_name?: string;
  observer_email?: string;
  notes?: string;
  image_url?: string;
  lat?: number;
  lng?: number;
  observed_at?: string;
}

export interface ZooBadge {
  taxonomy_id: string;
  reviewed_image_count: number;
  confidence_label: 'high' | 'medium' | 'low' | 'unverified';
  last_reviewed_at?: string;
}

type RuntimeEnv = Record<string, string | undefined>;

const env: RuntimeEnv =
  typeof import.meta !== 'undefined'
    ? ((import.meta as ImportMeta & { env?: RuntimeEnv }).env ?? {})
    : {};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const zooApi = {
  status(signal?: AbortSignal): Promise<ApiResult<ZooStatus>> {
    return apiRequest<ZooStatus>('/api/zoo/status', { signal });
  },

  queue(signal?: AbortSignal): Promise<ApiResult<ZooQueueItem[]>> {
    return apiRequest<ZooQueueItem[]>('/api/zoo/queue', { signal });
  },

  badges(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<ZooBadge>> {
    return apiRequest<ZooBadge>(
      `/api/zoo/badges/${encodeURIComponent(taxonomyId)}`,
      { signal },
    );
  },

  /**
   * Citizen-science submission. Note: this is a *placeholder hook* —
   * the public frontend should never write directly to a third-party
   * service like Zooniverse. All submissions flow through the
   * Orchid Continuum API.
   */
  async contribute(
    payload: ZooContribution,
  ): Promise<ApiResult<{ submission_id: string }>> {
    // We mirror the apiRequest contract for write endpoints.
    const base: string =
      env.VITE_API_BASE_URL || env.NEXT_PUBLIC_API_BASE_URL || '';
    if (!base) {
      return { data: null, error: null, unconfigured: true };
    }
    try {
      const res = await fetch(
        `${base.replace(/\/+$/, '')}/api/zoo/contribute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        return {
          data: null,
          error: new ApiError(
            `Submission failed (${res.status})`,
            res.status,
            '/api/zoo/contribute',
          ),
          unconfigured: false,
        };
      }
      const data = (await res.json()) as { submission_id: string };
      return { data, error: null, unconfigured: false };
    } catch (e: unknown) {
      return {
        data: null,
        error: new ApiError(
          errorMessage(e, 'Network error'),
          0,
          '/api/zoo/contribute',
        ),
        unconfigured: false,
      };
    }
  },
};

export const ZOO_PLACEHOLDER_MESSAGE =
  'Orchid Zoo review pipeline coming online.';

// ---------------------------------------------------------------------------
// Review queue state
// ---------------------------------------------------------------------------

/**
 * What the reviewer workflow may show about the live queue.
 *
 * `unavailable` and `empty` are different facts and must not be collapsed:
 * only a well-formed JSON array with no items is a confirmed empty queue. An
 * unconfigured API, a failed request, or a malformed payload is an outage, and
 * nothing is shown in place of the submissions it did not deliver.
 */
export type ZooQueueState =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'empty' }
  | { kind: 'present'; items: ZooQueueItem[] };

const REVIEW_STATES = new Set(['pending', 'in_review', 'needs_more_data']);

function isQueueItem(value: unknown): value is ZooQueueItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.submission_id !== 'string' || !item.submission_id.trim()) return false;
  for (const key of ['thumbnail_url', 'proposed_taxon', 'submitted_at'] as const) {
    if (item[key] !== undefined && item[key] !== null && typeof item[key] !== 'string') return false;
  }
  if (item.review_state !== undefined && item.review_state !== null && !REVIEW_STATES.has(String(item.review_state))) {
    return false;
  }
  return true;
}

/** Interpret a `GET /api/zoo/queue` result without inventing anything. */
export function interpretZooQueue(result: ApiResult<unknown>): ZooQueueState {
  if (result.unconfigured) {
    return { kind: 'unavailable', reason: 'The Orchid Continuum API is not configured for this deployment.' };
  }
  if (result.error) {
    return { kind: 'unavailable', reason: result.error.message || 'The review queue request failed.' };
  }
  const data = result.data;
  if (!Array.isArray(data)) {
    return { kind: 'unavailable', reason: 'The review queue response was not a list of submissions.' };
  }
  if (!data.every(isQueueItem)) {
    return { kind: 'unavailable', reason: 'The review queue response contained malformed submissions.' };
  }
  if (data.length === 0) return { kind: 'empty' };
  return { kind: 'present', items: data };
}

export async function loadZooQueue(signal?: AbortSignal): Promise<ZooQueueState> {
  return interpretZooQueue(await zooApi.queue(signal));
}
