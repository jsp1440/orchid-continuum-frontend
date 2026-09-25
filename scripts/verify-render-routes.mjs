/**
 * Verify the deployed Render static site serves the SPA shell for every
 * public deep link. This is intentionally HTTP-only: it exercises the
 * service-level rewrite without requiring a browser binary in a hosted
 * deterministic lane. Browser content/journey validation remains a separate
 * acceptance gate.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ROUTES = Object.freeze([
  '/',
  '/about',
  '/atlas',
  '/atlas-next',
  '/calyx',
  '/calyx-science',
  '/classroom',
  '/climate',
  '/collection',
  '/conservation',
  '/ecosystems',
  '/education',
  '/education/judging-practice',
  '/explore',
  '/gallery',
  '/get-involved',
  '/habitats',
  '/intelligence-graph',
  '/knowledge',
  '/literature',
  '/mycorrhizae',
  '/oacs',
  '/orchid-identification',
  '/partners',
  '/pollinators',
  '/relationship-explorer',
  '/relationship-matrix',
  '/research',
  '/societies',
  '/speak-with-calyx',
  '/species',
  '/university',
  '/university/lab',
  '/widgets',
  '/zoo',
  '/mission-control',
  '/field',
  '/conservatory',
  '/admin',
  '/control-center',
  '/research-station/researchers/jeffery-scott-parham',
  '/university/applied-ai-data-science',
  '/culture/orchids-on-screen',
  '/classroom/investigation',
]);

const DEFAULT_BASE_URL = 'https://orchid-continuum-frontend-vof6.onrender.com';
const RELEASE_SHA_PATTERN = /name=["']ocu-release-sha["']\s+content=["']([^"']+)/i;

function normaliseBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export async function verifyRoutes({
  baseUrl = DEFAULT_BASE_URL,
  routes = ROUTES,
  expectedReleaseSha = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('global fetch is unavailable');

  const origin = normaliseBaseUrl(baseUrl);
  const expected = expectedReleaseSha ? String(expectedReleaseSha).trim().toLowerCase() : null;
  const results = await Promise.all(routes.map(async (path) => {
    const url = `${origin}${path}`;
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();
      const match = body.match(RELEASE_SHA_PATTERN);
      const releaseSha = match?.[1]?.toLowerCase() ?? null;
      return {
        path,
        url,
        status: response.status,
        contentType: response.headers?.get?.('content-type') ?? null,
        releaseSha,
        htmlShell: /<html\b/i.test(body),
      };
    } catch (error) {
      return { path, url, error: String(error?.message || error) };
    }
  }));

  const failures = [];
  for (const result of results) {
    if (result.error) {
      failures.push(`${result.path}: request failed — ${result.error}`);
      continue;
    }
    if (result.status !== 200) failures.push(`${result.path}: expected HTTP 200, got ${result.status}`);
    if (!String(result.contentType || '').toLowerCase().includes('text/html')) {
      failures.push(`${result.path}: expected text/html, got ${result.contentType || 'missing content type'}`);
    }
    if (!result.htmlShell) failures.push(`${result.path}: response did not contain an HTML shell`);
    if (expected && result.releaseSha !== expected) {
      failures.push(`${result.path}: expected release ${expected}, got ${result.releaseSha || 'missing'}`);
    }
  }

  const releaseShas = [...new Set(results.map(result => result.releaseSha).filter(Boolean))];
  if (releaseShas.length > 1) failures.push(`deployed release identity diverged: ${releaseShas.join(', ')}`);

  return {
    schema: 'oc.render-route-verification.v1',
    base_url: origin,
    checked_at: new Date().toISOString(),
    route_count: results.length,
    release_shas: releaseShas,
    results,
    failures,
    passed: failures.length === 0,
  };
}

async function main() {
  const report = await verifyRoutes({
    baseUrl: process.env.FRONTEND_URL || DEFAULT_BASE_URL,
    expectedReleaseSha: process.env.EXPECTED_RELEASE_SHA || null,
  });
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/render-route-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    base_url: report.base_url,
    route_count: report.route_count,
    release_shas: report.release_shas,
    passed: report.passed,
    failures: report.failures,
  }));
  process.exitCode = report.passed ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
