/**
 * Captures /atlas-next against the REAL occurrence store.
 *
 * This runs in CI rather than locally because the development sandbox has no
 * egress to the data host, and a screenshot of stubbed points would not be
 * evidence of anything. Every mark in these images comes from
 * fetchAtlasOccurrencePoints().
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = 'docs/evidence/atlas-next';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'ipad-landscape', width: 1180, height: 820, touch: true },
  { name: 'ipad-portrait', width: 820, height: 1180, touch: true },
];

const log = (...a) => console.log('[capture]', ...a);

/** Wait until the shell reports a non-zero record count, i.e. real data landed. */
async function waitForRecords(page, ms = 180_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const txt = await page.textContent('body').catch(() => '');
    const m = txt && txt.match(/(\d[\d,]*)\s+records/);
    if (m && Number(m[1].replace(/,/g, '')) > 0) return Number(m[1].replace(/,/g, ''));
    if (txt && /could not be reached/i.test(txt)) throw new Error('occurrence store unreachable from runner');
    if (txt && /returned no usable coordinates/i.test(txt)) throw new Error('occurrence store returned no coordinates');
    await page.waitForTimeout(1500);
  }
  throw new Error('timed out waiting for records');
}

/**
 * Let the globe settle. The camera eases toward its target in real time, and a
 * CI runner renders WebGL in software at a handful of frames per second, so the
 * flight takes several seconds of wall clock even though it is under two on
 * real hardware.
 */
const settle = (page, ms = 9000) => page.waitForTimeout(ms);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    hasTouch: vp.touch,
    isMobile: false,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  log(vp.name, 'loading');
  await page.goto(`${BASE}/atlas-next`, { waitUntil: 'domcontentloaded' });
  // The first WebGL context on a software renderer is markedly slower to come
  // up than the rest; give it room before timing anything.
  await page.waitForTimeout(2000);
  const records = await waitForRecords(page);
  log(vp.name, 'records =', records);
  await settle(page);

  await page.screenshot({ path: `${OUT}/${vp.name}-earth.png` });

  // Descend: pick the country with the most records, which opens the
  // individual-record scale.
  const countrySelect = page.locator('select').nth(1);
  const options = await countrySelect.locator('option').allTextContents();
  const firstReal = options.find((o) => /\(\d+\)$/.test(o));
  if (firstReal) {
    await countrySelect.selectOption({ label: firstReal });
    await settle(page);
    await page.screenshot({ path: `${OUT}/${vp.name}-country.png` });
  }

  results.push({ viewport: vp.name, records, country: firstReal ?? null, errors });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.errors.length)) {
  console.log('NOTE: console/page errors were recorded above.');
}
