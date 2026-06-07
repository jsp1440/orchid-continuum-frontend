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

import { apiRequest, type ApiResult } from './api';

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
    const env =
      (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
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
          error: Object.assign(
            new Error(`Submission failed (${res.status})`),
            { status: res.status, endpoint: '/api/zoo/contribute' },
          ) as any,
          unconfigured: false,
        };
      }
      const data = (await res.json()) as { submission_id: string };
      return { data, error: null, unconfigured: false };
    } catch (e: any) {
      return {
        data: null,
        error: Object.assign(new Error(e?.message || 'Network error'), {
          status: 0,
          endpoint: '/api/zoo/contribute',
        }) as any,
        unconfigured: false,
      };
    }
  },
};

export const ZOO_PLACEHOLDER_MESSAGE =
  'Orchid Zoo review pipeline coming online.';
