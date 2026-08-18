/**
 * Capture live iPad evidence for HOMEPAGE-SLICE-1.
 * Runs on CI where the approved-media host and Supabase are reachable.
 */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:4174/';
const OUT = 'docs/slice1-evidence';
const report = { capturedAt: new Date().toISOString(), mediaTransport: 'stubbed with verbatim live payload — endpoint CORS-blocks all preview origins', views: [] };
const browser = await chromium.launch();

for (const vp of [
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });

  // The Calyx media endpoint's CORS allowlist (_ALLOWED_MEDIA_ORIGINS) contains
  // only the four production hosts and no localhost entry, so no preview origin
  // can call it regardless of port. To verify the hero's rendering we serve that
  // ONE request from the exact payload the live API returned for this genus on
  // 2026-08-18 (verified via GitHub Actions run 32091809919). Everything else on
  // the page — Supabase evidence, occurrence data, status banners — stays live.
  await page.route('**/api/media/genus/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        status: 'ok',
        requested_genus: 'Vanilla',
        accepted_genus: 'Vanilla',
        generated_at: '2026-08-18T02:26:14.017787+00:00',
        items: [
          {
            media_id: 'oc-image:134543058',
            taxon_id: '40447',
            scientific_name: 'Vanilla planifolia',
            genus: 'Vanilla',
            image_url: 'https://content.eol.org/data/media/55/2b/c6/509.1001681.jpg',
            thumbnail_url: 'https://content.eol.org/data/media/55/2b/c6/509.1001681.jpg',
            source_name: 'EOL',
            source_record_url: null,
            license: 'cc-by-sa-3.0',
            attribution: null,
            media_kind: 'photograph',
            quality_score: null,
          },
        ],
        summary: { eligible_count: 1, returned_count: 1, exclusion_counts: {} },
      }),
    });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  // The homepage polls backend status continuously, so 'networkidle' never
  // settles. Wait for the document, then for the hero image element itself.
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page
    .locator('section[aria-label^="Featured orchid"] img')
    .first()
    .waitFor({ state: 'attached', timeout: 45000 })
    .catch(() => {});
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(5000);

  // First impression: exactly what fills the opening viewport.
  await page.screenshot({ path: `${OUT}/${vp.name}-1-hero.png` });

  const heroImg = page.locator('section[aria-label^="Featured orchid"] img').first();
  const heroLoaded = await heroImg.evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false);
  const heroBox = await heroImg.boundingBox().catch(() => null);
  const heroCoverage = heroBox ? +(((heroBox.width * Math.min(heroBox.height, vp.height)) / (vp.width * vp.height)) * 100).toFixed(1) : null;

  const h1 = await page.locator('h1').first().innerText().catch(() => null);
  const credit = await page.locator('section[aria-label^="Featured orchid"] p.font-mono').first().innerText().catch(() => null);

  // The dependency section.
  await page.locator('#what-feeds-it').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${vp.name}-2-dependency.png` });

  const depHeading = await page.locator('#what-feeds-it h2').innerText().catch(() => null);
  const scopeBadge = await page.locator('#what-feeds-it span.font-mono').first().innerText().catch(() => null);
  const depBody = await page.locator('#what-feeds-it p').allInnerTexts().catch(() => []);
  const coils = await page.locator('#what-feeds-it svg path').count().catch(() => 0);

  report.views.push({
    view: vp.name,
    viewport: `${vp.width}x${vp.height}`,
    heroPhotographLoaded: heroLoaded,
    heroPercentOfFirstViewport: heroCoverage,
    h1,
    creditLine: credit,
    dependencyHeading: depHeading,
    evidenceScopeBadge: scopeBadge,
    fungalCoilPathsDrawn: coils,
    dependencyText: depBody.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6),
    consoleErrors: errors,
  });
  await page.close();
}

await browser.close();
await writeFile(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
