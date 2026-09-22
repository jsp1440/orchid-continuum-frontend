import { describe, expect, it } from 'vitest';
import { commandsFor, routeIssue } from '../../scripts/oc-capability-router.mjs';
import { verifyRoutes } from '../../scripts/verify-render-routes.mjs';

describe('Render route verification capability', () => {
  it('routes the explicit capability to the fixed HTTP verifier', () => {
    const routing = routeIssue({
      number: 166,
      body: '',
      labels: [{ name: 'oc-cap:render-route-verification' }],
    });

    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run verify:render-routes']);
  });

  it('passes when every checked route returns the same HTML release', async () => {
    const report = await verifyRoutes({
      baseUrl: 'https://render.example',
      routes: ['/', '/explore'],
      expectedReleaseSha: 'a'.repeat(40),
      fetchImpl: async (url) => new Response(
        `<html><head><meta name="ocu-release-sha" content="${'a'.repeat(40)}"></head></html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
    });

    expect(report.passed).toBe(true);
    expect(report.release_shas).toEqual(['a'.repeat(40)]);
    expect(report.results.map(result => result.url)).toEqual([
      'https://render.example/',
      'https://render.example/explore',
    ]);
  });

  it('fails closed on a deep-link 404 or release mismatch', async () => {
    const report = await verifyRoutes({
      baseUrl: 'https://render.example',
      routes: ['/explore'],
      expectedReleaseSha: 'a'.repeat(40),
      fetchImpl: async () => new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      }),
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toContain('/explore: expected HTTP 200, got 404');
    expect(report.failures).toContain('/explore: expected text/html, got text/plain');
  });
});
