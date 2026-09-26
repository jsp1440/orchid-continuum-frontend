import { readFileSync } from 'node:fs';
import ts from 'typescript';
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

/**
 * Parses App.tsx and returns, for every `<Route path="…" element={…} />`, the
 * tag name of the outermost JSX element passed as that route's OWN `element`
 * prop. Checking the parsed prop (rather than a text window after the route's
 * line) means a neighbouring route's wrapper can never satisfy the check.
 */
function routeElementRoots(source: string): Map<string, string | null> {
  const file = ts.createSourceFile(
    'App.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const roots = new Map<string, string | null>();

  const attribute = (attributes: ts.JsxAttributes, name: string) =>
    attributes.properties.find(
      (prop): prop is ts.JsxAttribute =>
        ts.isJsxAttribute(prop) && prop.name.getText(file) === name,
    );

  const outermostTag = (expression: ts.Expression | undefined): string | null => {
    let node = expression;
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    if (!node) return null;
    if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(file);
    if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(file);
    return null;
  };

  const visit = (node: ts.Node) => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null;
    if (opening && opening.tagName.getText(file) === 'Route') {
      const pathAttr = attribute(opening.attributes, 'path');
      const elementAttr = attribute(opening.attributes, 'element');
      if (pathAttr?.initializer && ts.isStringLiteral(pathAttr.initializer)) {
        const path = pathAttr.initializer.text;
        const initializer = elementAttr?.initializer;
        const root =
          initializer && ts.isJsxExpression(initializer)
            ? outermostTag(initializer.expression)
            : null;
        if (roots.has(path)) throw new Error(`duplicate route ${path}`);
        roots.set(path, root);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return roots;
}

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
    const roots = routeElementRoots(appSource);
    expect([...roots.keys()].sort()).toEqual([...declaredRoutes].sort());
    for (const path of ROUTER_AUTHENTICATED_ROUTE_PATTERNS) {
      expect(roots.has(path), `missing route ${path}`).toBe(true);
      expect(
        roots.get(path),
        `${path} must pass <ProtectedRoute> as its own element`,
      ).toBe('ProtectedRoute');
    }
  });

  it('detects an unwrapped router-authenticated route even beside wrapped neighbours', () => {
    // Negative control for the check above: un-wrapping /literature while its
    // neighbour /literature/:paperId stays wrapped must be caught.
    const unwrapped = appSource.replace(
      /(<Route path="\/literature" element=\{)<ProtectedRoute[^>]*>(<Literature \/>)<\/ProtectedRoute>\}/,
      '$1$2}',
    );
    expect(unwrapped).not.toBe(appSource);
    const roots = routeElementRoots(unwrapped);
    expect(roots.get('/literature')).toBe('Literature');
    expect(roots.get('/literature/:paperId')).toBe('ProtectedRoute');
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
