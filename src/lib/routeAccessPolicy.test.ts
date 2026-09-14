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

  it('records intentional internal authorization boundaries', () => {
    expect(ROUTE_ACCESS_POLICY.get('/account')).toBe('component-authorized');
    expect(ROUTE_ACCESS_POLICY.get('/university/review')).toBe(
      'component-authorized',
    );
  });
});
