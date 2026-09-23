import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { isExpectedOptionalSnapshotFailure } from './featured-genus-validation-policy.mjs';

const frontendUrl = (process.env.FRONTEND_URL || 'https://orchid-continuum-frontend-vof6.onrender.com/').replace(/\/$/, '');
const calyxUrl = (process.env.CALYX_URL || 'https://orchid-calyx-backend.onrender.com').replace(/\/$/, '');
const genera = ['Cattleya', 'Dracula', 'Dendrobium', 'Bulbophyllum', 'Vanilla'];
const issueNumber = Number(process.env.ISSUE_NUMBER);
const expectedReleaseSha = String(process.env.EXPECTED_RELEASE_SHA || '').trim() || null;
const report = {
  schema: 'oc.featured-genus-validation.v1',
  validation_kind: 'featured-genus-deployed',
  node_id: 'cap-homepage-featured-genus',
  issue: Number.isSafeInteger(issueNumber) && issueNumber > 0 ? issueNumber : null,
  wave_hash: process.env.WAVE_HASH || null,
  run: `${process.env.GITHUB_RUN_ID || ''}:${process.env.GITHUB_RUN_ATTEMPT || ''}`,
  frontendUrl,
  calyxUrl,
  expected_release_sha: expectedReleaseSha,
  release_sha: null,
  genera: {},
  browser: {},
  provider_calls: 0,
  provider_cost_usd: 0,
  passed: false,
  failure: null,
};

await fs.mkdir('artifacts', { recursive: true });

try {
  for (const genus of genera) {
    const response = await fetch(`${calyxUrl}/api/media/genus/${encodeURIComponent(genus)}?limit=12`);
    assert.equal(response.ok, true, `Calyx endpoint failed for ${genus}: ${response.status}`);
    const payload = await response.json();
    assert.ok(['ok', 'no_approved_media', 'invalid_genus'].includes(payload.status), `Unexpected endpoint status for ${genus}`);

    const items = Array.isArray(payload.items) ? payload.items : [];
    const urls = items.map((item) => item.image_url).filter(Boolean);
    const species = items.map((item) => item.scientific_name).filter(Boolean);
    assert.equal(urls.length, new Set(urls).size, `Duplicate media URL returned for ${genus}`);
    assert.equal(species.length, new Set(species).size, `Duplicate species returned for ${genus}`);
    assert.ok(items.every((item) => item.media_kind === 'photograph' && item.source_name && item.scientific_name), `Incomplete media provenance for ${genus}`);
    report.genera[genus] = { status: payload.status, returned_count: items.length, first_image_url: urls[0] || null };
  }

  const errors = [];
  const mediaFailures = [];
  const httpFailures = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400) {
        httpFailures.push({
          status: response.status(),
          url: response.url(),
          resource_type: response.request().resourceType(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'image') {
        mediaFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'image request failed' });
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    await page.goto(frontendUrl, { waitUntil: 'networkidle', timeout: 90_000 });
    const releaseSha = await page.locator('meta[name="ocu-release-sha"]').getAttribute('content');
    assert.match(releaseSha || '', /^[a-f0-9]{40}$/, 'deployed frontend did not attest a full release SHA');
    if (expectedReleaseSha) assert.equal(releaseSha, expectedReleaseSha, 'deployed frontend is not the expected release');
    report.release_sha = releaseSha;
    const feature = page.locator('section').filter({ hasText: 'Featured Genus' }).first();
    assert.equal(await feature.count(), 1, 'Featured Genus section was not rendered');
    assert.equal(await page.locator('#featured-genus-title').count(), 1, 'Featured Genus heading was not rendered');
    const continuationCount = await page.locator('[data-testid="featured-genus-continuation"]').count();
    assert.equal(continuationCount, 1, 'Featured Genus continuation was not rendered');
    await feature.scrollIntoViewIfNeeded();
    // The component removes a failed photograph from the candidate set and
    // renders its explicit no-media state. Give that state one render turn
    // after the browser has reported a blocked/dead remote image.
    await page.waitForTimeout(3000);

    const imageState = await feature.locator('img').evaluateAll((images) => images.map((image) => ({
      src: image.currentSrc || image.getAttribute('src'),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    })));
    const noMediaText = await feature.getByText(/No approved Continuum photograph available|No verified Orchid Continuum photograph|This approved photograph could not be loaded\. No substitute image is shown\./i).count();
    const serviceErrorText = await feature.getByText(/media service is temporarily unavailable/i).count();
    await page.screenshot({ path: 'artifacts/featured-genus.png', fullPage: false });

    const expectedMediaErrors = mediaFailures.length > 0
      ? errors.filter((error) => /^console: Failed to load resource: net::ERR_(BLOCKED_BY_RESPONSE\\.NotSameOrigin|FAILED)$/.test(error))
      : [];
    const optionalHttpFailures = httpFailures.filter(isExpectedOptionalSnapshotFailure);
    const unexpectedHttpFailures = httpFailures.filter((failure) => !isExpectedOptionalSnapshotFailure(failure));
    let optionalHttpConsoleBudget = optionalHttpFailures.length;
    const ignoredOptionalHttpErrors = [];
    const unexpectedErrors = errors.filter((error) => {
      if (expectedMediaErrors.includes(error)) return false;
      if (
        optionalHttpConsoleBudget > 0
        && /^console: Failed to load resource: the server responded with a status of 400 \(\)$/.test(error)
      ) {
        optionalHttpConsoleBudget -= 1;
        ignoredOptionalHttpErrors.push(error);
        return false;
      }
      return true;
    });
    report.browser = {
      imageState,
      noMediaText,
      serviceErrorText,
      continuationCount,
      mediaFailures,
      ignored_media_errors: expectedMediaErrors,
      httpFailures,
      ignored_optional_http_failures: optionalHttpFailures,
      ignored_optional_http_errors: ignoredOptionalHttpErrors,
      unexpected_http_failures: unexpectedHttpFailures,
      errors: unexpectedErrors,
    };
    assert.equal(serviceErrorText, 0, 'Featured Genus reached service-error state');
    if (imageState.length > 0) {
      const loadedImages = imageState.filter((image) => image.complete && image.naturalWidth > 0);
      assert.ok(loadedImages.length > 0 || noMediaText > 0, 'Featured Genus rendered neither media nor an honest no-media state');
    } else {
      assert.ok(noMediaText > 0, 'Featured Genus rendered neither media nor an honest no-media state');
    }
    assert.deepEqual(unexpectedHttpFailures, [], `HTTP failures: ${JSON.stringify(unexpectedHttpFailures)}`);
    assert.deepEqual(unexpectedErrors, [], `Browser errors: ${unexpectedErrors.join(' | ')}; HTTP failures: ${JSON.stringify(httpFailures)}`);
  } finally {
    await browser.close();
  }

  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
} finally {
  await fs.writeFile('artifacts/featured-genus-report.json', JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
