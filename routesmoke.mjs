import { chromium } from 'playwright';
const routes = ['/','/atlas','/atlas-next','/calyx','/speak-with-calyx','/lexicon','/collection','/explore',
  '/research','/education','/gallery','/oacs','/orchid-identification','/relationship-explorer','/literature',
  '/knowledge','/conservation','/climate','/habitats','/pollinators','/mycorrhizae','/societies','/about',
  '/get-involved','/saved','/account','/coming-soon','/university','/ecosystems','/intelligence-graph'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const bad = [];
for (const r of routes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto('http://127.0.0.1:4174' + r, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1800);
    const t = await page.evaluate(() => document.body.innerText || '');
    const boundary = /Something went wrong|encountered an unexpected error/i.test(t);
    const ref = errs.filter(e => /is not defined|is not a function|Cannot read/i.test(e));
    const status = boundary ? 'ERROR-BOUNDARY' : (ref.length ? 'PAGEERROR' : 'ok');
    if (status !== 'ok') bad.push([r, status, ref[0] || 'boundary']);
    console.log(`${status === 'ok' ? ' ok  ' : 'FAIL '} ${r.padEnd(26)} chars=${String(t.length).padEnd(6)} ${ref[0] ? ref[0].slice(0,80) : ''}`);
  } catch (e) {
    bad.push([r, 'NAV', e.message]); console.log(`FAIL  ${r.padEnd(26)} NAV ${e.message.slice(0,60)}`);
  }
  await page.close();
}
console.log(`\n=== ${routes.length - bad.length}/${routes.length} routes render; ${bad.length} broken ===`);
for (const [r,s,m] of bad) console.log(`  ${r}  ${s}  ${String(m).slice(0,110)}`);
await browser.close();
