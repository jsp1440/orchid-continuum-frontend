import { chromium } from 'playwright-core';
const routes = process.argv.slice(2);
const widths = [[1440,'desktop'],[1180,'ipad-landscape'],[834,'ipad-portrait'],[390,'phone']];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const findings = [];
for (const [w, label] of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  for (const route of routes) {
    try {
      await p.goto('http://127.0.0.1:4173' + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(1200);
      const r = await p.evaluate(() => {
        const doc = document.documentElement;
        const over = [];
        if (doc.scrollWidth > doc.clientWidth + 1) {
          for (const el of document.querySelectorAll('body *')) {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (style.position === 'fixed' || style.pointerEvents === 'none') continue;
            if (rect.width > 0 && rect.right > doc.clientWidth + 1) {
              over.push(String(el.className).slice(0, 60) || el.tagName);
            }
          }
        }
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, over: over.slice(0, 3) };
      });
      if (r.scrollWidth > r.clientWidth + 1) {
        findings.push(`${label} ${w} ${route} scrollWidth=${r.scrollWidth} | ${r.over.join(' || ')}`);
      }
    } catch (e) { findings.push(`${label} ${w} ${route} ERROR ${String(e.message).slice(0,60)}`); }
  }
  await ctx.close();
}
console.log(findings.length ? findings.join('\n') : 'NO HORIZONTAL OVERFLOW ANYWHERE');
await b.close();
