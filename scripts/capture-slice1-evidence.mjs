/**
 * Capture live iPad evidence for HOMEPAGE-SLICE-1.
 * Runs on CI where the approved-media host and Supabase are reachable.
 */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:4174/';
const OUT = 'docs/slice1-evidence';
const report = { capturedAt: new Date().toISOString(), views: [] };
const browser = await chromium.launch();

for (const vp of [
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);

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
