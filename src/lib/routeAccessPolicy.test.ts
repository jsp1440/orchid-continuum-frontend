import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_AUTHORIZED_ROUTE_PATTERNS,
  PUBLIC_ROUTE_PATTERNS,
  ROUTE_ACCESS_POLICY,
  ROUTER_AUTHENTICATED_ROUTE_PATTERNS,
} from './routeAccessPolicy';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const declaredRoutes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map(
  (match) => match[1],
);

describe('route access policy', () => {
  it('classifies every App route exactly once', () => {
    const classifiedRoutes = [
      ...PUBLIC_ROUTE_PATTERNS,
      ...ROUTER_AUTHENTICATED_ROUTE_PATTERNS,
      ...COMPONENT_AUTHORIZED_ROUTE_PATTERNS,
    ];

    expect(new Set(classifiedRoutes).size).toBe(classifiedRoutes.length);
    expect([...classifiedRoutes].sort()).toEqual([...declaredRoutes].sort());
    expect(ROUTE_ACCESS_POLICY.size).toBe(declaredRoutes.length);
  });

  it('wraps every router-authenticated route before its page mounts', () => {
    for (const path of ROUTER_AUTHENTICATED_ROUTE_PATTERNS) {
      const start = appSource.indexOf(`<Route path="${path}"`);
      expect(start, `missing route ${path}`).toBeGreaterThanOrEqual(0);
      const declaration = appSource.slice(start, start + 800);
      expect(declaration, `${path} must use ProtectedRoute`).toContain(
        '<ProtectedRoute',
      );
    }
  });

  it('keeps aliases from bypassing operational authentication', () => {
    for (const path of [
      '/mission-control',
      '/orchid-continuum-mission-control',
      '/mission-control/intelligence-center',
      '/intelligence-center',
      '/mission-control/science',
      '/calyx-science',
      '/mission-control/ai-orchestration',
      '/ai-orchestration',
      '/diagnostics/daily-genus',
    ]) {
      expect(ROUTE_ACCESS_POLICY.get(path)).toBe('router-authenticated');
    }
  });

  it('gates the literature browser because its backend is owner/API-key only', () => {
    // GET /api/literature-extraction/* is mounted behind
    // verify_owner_or_api_key, so an anonymous visitor was always refused while
    // the route claimed to be public. The routes are signed-in entry points;
    // the pages themselves render the owner-or-API refusal a member still gets.
    for (const path of ['/literature', '/literature/:paperId']) {
      expect(ROUTE_ACCESS_POLICY.get(path)).toBe('router-authenticated');
      expect(PUBLIC_ROUTE_PATTERNS as readonly string[]).not.toContain(path);
    }
  });

  it('records intentional internal authorization boundaries', () => {
    expect(ROUTE_ACCESS_POLICY.get('/account')).toBe('component-authorized');
    expect(ROUTE_ACCESS_POLICY.get('/university/review')).toBe(
      'component-authorized',
    );
  });
});
