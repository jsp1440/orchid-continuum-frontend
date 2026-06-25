/**
 * FRONTEND-R1 release endpoint map.
 *
 * This file documents the live backend endpoints required for the v0.1 Preview
 * Release pages. It is intentionally declarative so release pages, diagnostics,
 * and future endpoint audits can share the same source of truth.
 */

export type ReleaseEndpointStatus =
  | 'live-wired'
  | 'available-needs-wiring'
  | 'needs-backend-confirmation'
  | 'prototype-or-fallback';

export interface ReleaseEndpoint {
  page: string;
  feature: string;
  endpoint: string;
  status: ReleaseEndpointStatus;
  notes?: string;
}

export const FRONTEND_R1_RELEASE_PAGES = [
  'Homepage',
  'Genus of the Day',
  'Species Search',
  'Species Detail',
  'Atlas',
  'Research Station Landing Page',
] as const;

export const releaseEndpointMap: ReleaseEndpoint[] = [
  {
    page: 'Homepage',
    feature: 'Daily genus spotlight',
    endpoint: '/api/genus/daily',
    status: 'live-wired',
    notes: 'Consumed through ocBackend.fetchGenusOfDay and DailyGenusProvider/Home sections.',
  },
  {
    page: 'Homepage',
    feature: 'Genus image rotation',
    endpoint: '/images/genus/{genus}?limit=20',
    status: 'live-wired',
    notes: 'Image host is configured separately from the public API in backendConfig.ts.',
  },
  {
    page: 'Homepage',
    feature: 'Atlas preview / occurrence map',
    endpoint: '/api/atlas/occurrences?limit={limit}',
    status: 'live-wired',
    notes: 'Normalize backend rows before rendering map points.',
  },
  {
    page: 'Homepage',
    feature: 'Atlas statistics',
    endpoint: '/api/atlas/stats',
    status: 'available-needs-wiring',
    notes: 'Used for genera counts in ocBackend; should become explicit homepage stat source.',
  },
  {
    page: 'Homepage',
    feature: 'Literature statistics',
    endpoint: '/api/literature/stats',
    status: 'needs-backend-confirmation',
    notes: 'Required for v0.1 homepage credibility cards; verify backend path and payload.',
  },
  {
    page: 'Homepage',
    feature: 'Research station health / runner summary',
    endpoint: '/api/runner/summary',
    status: 'needs-backend-confirmation',
    notes: 'Needed for Research Station callout if the backend exposes runner status publicly.',
  },
  {
    page: 'Genus of the Day',
    feature: 'Daily genus record',
    endpoint: '/api/genus/daily',
    status: 'live-wired',
  },
  {
    page: 'Genus of the Day',
    feature: 'Genus-specific images',
    endpoint: '/images/genus/{genus}?limit=20',
    status: 'live-wired',
  },
  {
    page: 'Species Search',
    feature: 'Search results',
    endpoint: '/api/species/search?q={query}&limit={limit}',
    status: 'live-wired',
  },
  {
    page: 'Species Detail',
    feature: 'Canonical species dossier',
    endpoint: '/api/species/{taxonomy_id}',
    status: 'live-wired',
  },
  {
    page: 'Species Detail',
    feature: 'Mycorrhizal partners',
    endpoint: '/api/mycorrhizal/{taxonomy_id}',
    status: 'live-wired',
  },
  {
    page: 'Species Detail',
    feature: 'Species literature',
    endpoint: '/api/species/{taxonomy_id}/literature',
    status: 'needs-backend-confirmation',
  },
  {
    page: 'Species Detail',
    feature: 'Species occurrence summary',
    endpoint: '/api/species/{taxonomy_id}/occurrences',
    status: 'needs-backend-confirmation',
  },
  {
    page: 'Atlas',
    feature: 'Occurrence map points',
    endpoint: '/api/atlas/occurrences?limit={limit}',
    status: 'live-wired',
  },
  {
    page: 'Atlas',
    feature: 'Atlas summary statistics',
    endpoint: '/api/atlas/stats',
    status: 'available-needs-wiring',
  },
  {
    page: 'Research Station Landing Page',
    feature: 'Runner / system status',
    endpoint: '/api/runner/summary',
    status: 'needs-backend-confirmation',
  },
  {
    page: 'Research Station Landing Page',
    feature: 'Literature summary',
    endpoint: '/api/literature/stats',
    status: 'needs-backend-confirmation',
  },
  {
    page: 'Research Station Landing Page',
    feature: 'Atlas summary',
    endpoint: '/api/atlas/stats',
    status: 'available-needs-wiring',
  },
];

export const releaseEndpointSummary = releaseEndpointMap.reduce(
  (acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  },
  {} as Record<ReleaseEndpointStatus, number>,
);
