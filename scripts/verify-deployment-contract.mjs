/**
 * Verify the Render deployment contract.
 *
 * Render is the sole production deployment target for Orchid Continuum, so
 * `public/_redirects` is the one routing mechanism that matters. This used to
 * also validate `vercel.json`; that file has been removed along with the rest
 * of the Vercel-specific configuration.
 *
 * Static-file checks only. It never probes a live deployment.
 */

import { readFile } from 'node:fs/promises';

const requiredRoutes = [
  '/university',
  '/university/lab',
  '/conservatory/*',
  '/mission-control',
  '/calyx',
];

/** Paths Render must serve as static documents rather than through the SPA. */
const requiredStaticRewrites = [
  {
    from: '/research-station/researchers/jeffery-scott-parham',
    to: '/researcher-jeffery-scott-parham.html',
  },
];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function ruleIndex(redirects, from) {
  return redirects
    .split('\n')
    .findIndex((line) => !line.trim().startsWith('#') && line.includes(from));
}

async function main() {
  const [app, redirects] = await Promise.all([
    read('src/App.tsx'),
    read('public/_redirects'),
  ]);

  const failures = [];

  for (const route of requiredRoutes) {
    if (!app.includes(`path="${route}"`)) {
      failures.push(`Missing React route: ${route}`);
    }
  }

  if (!/^\/\*\s+\/index\.html\s+200/m.test(redirects)) {
    failures.push('public/_redirects does not contain the SPA fallback');
  }

  const catchAll = ruleIndex(redirects, '/*');
  for (const { from, to } of requiredStaticRewrites) {
    const at = ruleIndex(redirects, from);
    if (at === -1 || !redirects.includes(to)) {
      failures.push(`public/_redirects is missing the static rewrite ${from} -> ${to}`);
      continue;
    }
    // A specific rule after the catch-all never fires.
    if (catchAll !== -1 && at > catchAll) {
      failures.push(
        `public/_redirects lists ${from} after the /* catch-all, so it can never match`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('Render deployment contract validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('Render deployment contract valid.');
  console.log(
    `Verified ${requiredRoutes.length} critical client routes, ` +
      `${requiredStaticRewrites.length} static rewrite(s), and the SPA fallback.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
