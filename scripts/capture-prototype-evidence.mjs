/**
 * Capture live evidence for the issue #163 dependency prototype.
 *
 * Runs on a CI runner with real network egress, so the hero photograph, the
 * Supabase records, and the Calyx media API are all live — no snapshot, no
 * fixtures. Writes iPad-dimension screenshots plus a machine-readable report
 * into docs/prototype-evidence/.
 */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:4174/prototype/dependency';
const OUT = 'docs/prototype-evidence';

const viewports = [
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
];

const report = { capturedAt: new Date().toISOString(), url: BASE, views: [], errors: [] };
const browser = await chromium.launch();

for (const vp of viewports) {
  for (const mode of ['with', 'without']) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    if (mode === 'without') {
      await page.getByRole('button', { name: /Without fungal partner/i }).click();
      await page.waitForTimeout(1200);
    }

    const name = `${vp.name}-${mode}`;
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

    const heroLoaded = await page
      .locator('img')
      .first()
      .evaluate((i) => i.complete && i.naturalWidth > 0)
      .catch(() => false);
    const heroDims = await page
      .locator('img')
      .first()
      .evaluate((i) => `${i.naturalWidth}x${i.naturalHeight}`)
      .catch(() => 'n/a');
    const headings = await page.locator('h1, h2').allInnerTexts();
    const credit = await page
      .locator('p', { hasText: /Source:/ })
      .first()
      .innerText()
      .catch(() => null);
    const snapshotNotice = await page
      .getByText('Data provenance notice')
      .count()
      .catch(() => 0);

    report.views.push({
      name,
      viewport: `${vp.width}x${vp.height}`,
      mode,
      heroPhotographLoaded: heroLoaded,
      heroNaturalSize: heroDims,
      creditLine: credit,
      usedCapturedSnapshot: snapshotNotice > 0,
      headings: headings.map((h) => h.replace(/\s+/g, ' ').trim()),
      consoleErrors: errors,
    });
    if (errors.length) report.errors.push({ view: name, errors });
    await page.close();
  }
}

await browser.close();
await writeFile(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
