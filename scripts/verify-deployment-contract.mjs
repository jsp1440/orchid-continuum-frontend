/**
 * Verify the Render deployment contract.
 *
 * Render is the sole production deployment target for Orchid Continuum, so
 * `render.yaml` is the canonical Render service declaration. The checked-in
 * `public/_redirects` remains a static artifact and a human-readable mirror
 * of the same route contract, but it is not enough to configure the service.
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
  const [app, redirects, blueprint] = await Promise.all([
    read('src/App.tsx'),
    read('public/_redirects'),
    read('render.yaml'),
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

  if (!/name:\s*orchid-continuum-frontend\b/.test(blueprint)) {
    failures.push('render.yaml does not declare the canonical frontend service');
  }
  if (!/runtime:\s*static\b/.test(blueprint)) {
    failures.push('render.yaml does not declare a static-site runtime');
  }
  if (!/branch:\s*main\b/.test(blueprint)) {
    failures.push('render.yaml does not pin the production branch to main');
  }
  if (!/staticPublishPath:\s*\.\/dist\b/.test(blueprint)) {
    failures.push('render.yaml does not publish the Vite dist directory');
  }
  if (!/type:\s*rewrite[\s\S]*source:\s*\/\*[\s\S]*destination:\s*\/index\.html/.test(blueprint)) {
    failures.push('render.yaml does not declare the Render SPA rewrite');
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
