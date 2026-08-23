import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
/**
 * Playwright is not a repo dependency — the other sentinels in this directory
 * import it bare and only run where it is installed globally. Resolving both
 * ways means this script runs in CI and on a developer machine without either
 * adding a heavy dependency or silently doing nothing.
 */
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    const globalPath = process.env.PLAYWRIGHT_MODULE_PATH
      ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
    return (await import(globalPath)).chromium;
  }
}

const chromium = await loadChromium();

/**
 * Browser route sweep — does every public route actually render, and does an
 * empty-looking one say why it is empty?
 *
 * WHAT THIS PROVES. Every listed route mounts in a real browser, throws no
 * uncaught error, logs no console error, and renders either substantive
 * content or an explicit access gate. Routes that render almost nothing are
 * the ones this exists for: a page that is blank because it crashed and a page
 * that is short because it is asking you to sign in look identical to a
 * monitor that only measures length.
 *
 * WHAT THIS DOES NOT PROVE, and must not be cited as. It is a smoke sweep, not
 * a journey. It does not confirm that any scientific workflow completes, that
 * data is correct, that a backend is reachable, or that anything is deployed.
 * The completion graph's `browserEndToEnd` gate asks whether a journey was
 * driven end to end; this answers the much weaker question of whether the
 * routes come up at all. Scoring that gate from this run would be exactly the
 * kind of evidence inflation the graph exists to prevent.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 --host 127.0.0.1
 *   FRONTEND_URL=http://127.0.0.1:4173 node scripts/browser-route-sweep.mjs
 */

const frontendUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

/**
 * `gate` marks a route that is expected to render an access gate rather than
 * content. It is an expectation, not an excuse: a gated route must still say
 * what it is gating, and the assertions below check for that wording.
 */
const ROUTES = [
  { path: '/' },
  { path: '/about' },
  { path: '/atlas' },
  { path: '/atlas-next' },
  { path: '/calyx' },
  { path: '/calyx-science', gate: 'owner' },
  { path: '/classroom' },
  { path: '/climate' },
  { path: '/collection', gate: 'member' },
  { path: '/conservation' },
  { path: '/ecosystems' },
  { path: '/education' },
  { path: '/education/judging-practice' },
  { path: '/explore' },
  { path: '/gallery' },
  { path: '/get-involved' },
  { path: '/habitats' },
  { path: '/intelligence-graph' },
  { path: '/knowledge' },
  { path: '/literature' },
  { path: '/mycorrhizae' },
  { path: '/oacs' },
  { path: '/orchid-identification' },
  { path: '/partners' },
  { path: '/pollinators' },
  { path: '/relationship-explorer' },
  { path: '/relationship-matrix' },
  { path: '/research', gate: 'member' },
  { path: '/societies' },
  { path: '/speak-with-calyx' },
  { path: '/species' },
  { path: '/university' },
  { path: '/university/lab' },
  { path: '/widgets' },
  { path: '/zoo' },
  { path: '/mission-control', gate: 'owner' },
];

/** Shorter than this, with no gate wording, is a page that failed silently. */
const MIN_CONTENT_CHARS = 400;

const CRASH_PATTERN = /something went wrong|application error|unexpected error|failed to fetch dynamically imported|chunk load/i;
const GATE_PATTERN = {
  owner: /owner[- ]only|access code|owner gate|unlock/i,
  member: /sign in|restricted|members only/i,
};

const report = { frontendUrl, checkedAt: new Date().toISOString(), routes: [], passed: false, failures: [] };
await fs.mkdir('artifacts', { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      // Network failures against an absent backend are the environment, not
      // the page. A route that reports an outage honestly is passing, not
      // failing, so those are recorded and not asserted on.
      if (message.type() === 'error' && !/net::|Failed to load resource/i.test(message.text())) {
        errors.push(`console: ${message.text()}`);
      }
    });

    process.stderr.write(`  -> ${route.path}\n`);
    let entry;
    try {
      const response = await page.goto(`${frontendUrl}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.waitForTimeout(2500);
      const text = await page.evaluate(() => document.body.innerText || '');
      entry = {
        path: route.path,
        status: response ? response.status() : null,
        chars: text.replace(/\s+/g, ' ').trim().length,
        gate: route.gate ?? null,
        crashed: CRASH_PATTERN.test(text),
        gateWordingPresent: route.gate ? GATE_PATTERN[route.gate].test(text) : null,
        errors,
      };
    } catch (cause) {
      entry = { path: route.path, navigationFailed: cause.message.slice(0, 200), errors };
    }
    report.routes.push(entry);
    await page.close();
  }

  for (const entry of report.routes) {
    const where = entry.path;
    if (entry.navigationFailed) {
      report.failures.push(`${where}: navigation failed — ${entry.navigationFailed}`);
      continue;
    }
    if (entry.errors.length > 0) {
      report.failures.push(`${where}: ${entry.errors.length} page/console error(s) — ${entry.errors[0]}`);
    }
    if (entry.crashed) {
      report.failures.push(`${where}: rendered an application error`);
    }
    if (entry.gate) {
      // A gate must announce itself. A route that renders nothing and says
      // nothing is indistinguishable from one that broke.
      if (!entry.gateWordingPresent) {
        report.failures.push(`${where}: expected a ${entry.gate} gate but rendered no gate wording`);
      }
    } else if (entry.chars < MIN_CONTENT_CHARS) {
      report.failures.push(`${where}: rendered ${entry.chars} characters with no access gate to explain it`);
    }
  }

  report.passed = report.failures.length === 0;
} finally {
  await browser.close();
  await fs.writeFile('artifacts/browser-route-sweep.json', JSON.stringify(report, null, 2));
}

console.log(`Swept ${report.routes.length} routes against ${frontendUrl}`);
for (const failure of report.failures) console.log(`  FAIL ${failure}`);
console.log(report.passed ? 'PASS — every route rendered or explained itself' : `FAIL — ${report.failures.length} problem(s)`);
console.log('Report: artifacts/browser-route-sweep.json');
assert.equal(report.passed, true, 'browser route sweep found problems');
