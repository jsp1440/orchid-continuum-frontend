export type RouteAccessKind = 'public' | 'router-authenticated' | 'component-authorized';

/**
 * Exhaustive access classification for every route declared in App.tsx.
 *
 * Public routes must not expose private account data or operational response
 * samples. Component-authorized routes intentionally render their own
 * authentication/qualification boundary. Router-authenticated routes must be
 * wrapped in ProtectedRoute before their page component can mount.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  '/',
  '/lexicon/*',
  '/continuum-next',
  '/relationship-matrix',
  '/orchid-identification',
  '/calyx',
  '/speak-with-calyx',
  '/calyx-mobile',
  '/explore',
  '/species',
  '/genus/:name',
  '/species/:slug',
  '/about',
  '/atlas/ecuador',
  '/atlas',
  '/atlas-next',
  '/atlas/:species',
  '/admin',
  '/control-center',
  '/habitats',
  '/habitats/:biome',
  '/ecosystems/:species',
  '/pollinators',
  '/pollinators/:taxa',
  '/mycorrhizae',
  '/mycorrhizae/:taxa',
  '/gallery',
  '/climate',
  '/intelligence-graph',
  '/knowledge',
  '/literature',
  '/literature/:paperId',
  '/relationship-explorer',
  '/relationship-explorer/:species',
  '/research-station/researchers/jeffery-scott-parham',
  '/saved',
  '/oacs',
  '/zoo',
  '/widgets',
  '/education',
  '/partners',
  '/get-involved',
  '/ecosystems',
  '/conservation',
  '/societies',
  '/university',
  '/university/lab',
  '/university/applied-ai-data-science',
  '/classroom',
  '/education/judging-practice',
  '/culture/orchids-on-screen',
  '/classroom/investigation',
  '/org/:slug',
  '/project/:slug',
  '/coming-soon/:section',
  '/coming-soon',
  '*',
] as const;

export const ROUTER_AUTHENTICATED_ROUTE_PATTERNS = [
  '/mission-control/calyx',
  '/mission-control',
  '/orchid-continuum-mission-control',
  '/mission-control/intelligence-center',
  '/intelligence-center',
  '/mission-control/science',
  '/calyx-science',
  '/mission-control/matrix-registry-review',
  '/mission-control/readiness/homepage',
  '/mission-control/knowledge-graph-readiness',
  '/mission-control/ai-orchestration',
  '/ai-orchestration',
  '/diagnostics/daily-genus',
  '/collection',
  '/field',
  '/conservatory/*',
  '/research',
] as const;

export const COMPONENT_AUTHORIZED_ROUTE_PATTERNS = [
  '/account',
  '/university/review',
] as const;

export const ROUTE_ACCESS_POLICY = new Map<string, RouteAccessKind>([
  ...PUBLIC_ROUTE_PATTERNS.map((path) => [path, 'public'] as const),
  ...ROUTER_AUTHENTICATED_ROUTE_PATTERNS.map(
    (path) => [path, 'router-authenticated'] as const,
  ),
  ...COMPONENT_AUTHORIZED_ROUTE_PATTERNS.map(
    (path) => [path, 'component-authorized'] as const,
  ),
]);
