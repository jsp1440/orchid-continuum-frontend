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
async function waitForRecords(page, name, ms = 300_000) {
  const deadline = Date.now() + ms;
  let lastNote = '';
  while (Date.now() < deadline) {
    const txt = await page.textContent('body').catch(() => '');
    const m = txt && txt.match(/(\d[\d,]*)\s+records/);
    if (m && Number(m[1].replace(/,/g, '')) > 0) return Number(m[1].replace(/,/g, ''));

    // Say what state the page is actually in, so a timeout is diagnosable
    // rather than just a timeout.
    const note = /could not be reached/i.test(txt)
      ? 'unavailable'
      : /returned no usable coordinates/i.test(txt)
        ? 'empty'
        : /Reading the occurrence store/i.test(txt)
          ? 'loading'
          : 'unrecognised';
    if (note !== lastNote) {
      log(name, 'state:', note);
      lastNote = note;
    }
    if (note === 'unavailable') throw new Error('occurrence store unreachable from runner');
    if (note === 'empty') throw new Error('occurrence store returned no coordinates');
    await page.waitForTimeout(2000);
  }
  // Capture whatever is on screen before giving up; a picture of the stuck
  // state is worth more than the exception alone.
  await page.screenshot({ path: `${OUT}/${name}-TIMEOUT.png`, timeout: 60_000 }).catch(() => {});
  throw new Error(`timed out after ${ms / 1000}s waiting for records (last state: ${lastNote})`);
}

/**
 * Let the globe settle. The camera eases toward its target in real time, and a
 * CI runner renders WebGL in software at a handful of frames per second, so the
 * flight takes several seconds of wall clock even though it is under two on
 * real hardware.
 */
const settle = (page, ms = 9000) => page.waitForTimeout(ms);

/**
 * Wait for the second load stage. A count taken mid-load is a real count of a
 * partial read, and the interface says so — but a screenshot captioned as the
 * Atlas should show the whole Atlas.
 */
async function waitForComplete(page, name, ms = 300_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const txt = await page.textContent('body').catch(() => '');
    if (!/Still reading the store/i.test(txt)) return true;
    await page.waitForTimeout(2000);
  }
  log(name, 'WARNING: still loading when the budget ran out; counts are partial');
  return false;
}

/** Software rendering needs far longer than the 30s default for a frame. */
const shot = (page, path) => page.screenshot({ path, timeout: 180_000 });

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
  const first = await waitForRecords(page, vp.name);
  log(vp.name, 'first batch =', first);
  const complete = await waitForComplete(page, vp.name);
  const records = await waitForRecords(page, vp.name);
  log(vp.name, 'records =', records, complete ? '(complete)' : '(PARTIAL)');
  await settle(page);

  await shot(page, `${OUT}/${vp.name}-earth.png`);

  // Descend into the country with the most records, which opens the
  // individual-record scale.
  //
  // Select by INDEX, not by label. The list is sorted by record count and is
  // rebuilt when the second load stage lands, so a label read a moment earlier
  // may no longer exist by the time the click happens — which is exactly how
  // the previous run failed. The index is stable; whichever country it lands on
  // is reported below.
  const countrySelect = page.locator('select').nth(1);
  const optionCount = await countrySelect.locator('option').count();
  let firstReal = null;
  if (optionCount > 1) {
    await countrySelect.selectOption({ index: 1 });
    firstReal = await countrySelect.locator('option:checked').textContent();
    log(vp.name, 'descended into', firstReal);
    await settle(page);
    await shot(page, `${OUT}/${vp.name}-country.png`);
  }

  results.push({ viewport: vp.name, records, complete, country: firstReal ?? null, errors });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.errors.length)) {
  console.log('NOTE: console/page errors were recorded above.');
}
