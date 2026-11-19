/**
 * Verify the Render deployment contract.
 *
 * Render is the sole production deployment target for Orchid Continuum, so
 * `render.yaml` is the canonical Render service declaration. The checked-in
 * `public/_redirects` remains a static artifact and a human-readable mirror
 * of the same route contract, but it is not enough to configure the service.
 *
 * Static-file checks only. It never probes a live deployment.
 *
 * Vercel kill switch. The Vercel GitHub App may still be connected to this
 * repository outside the owner's control of the repo, and while it is, every
 * push would create a Vercel deployment. The repository therefore carries
 * exactly one Vercel file, `vercel.json`, whose only permitted content is
 *
 *   {"$schema": "https://openapi.vercel.sh/vercel.json",   (optional)
 *    "git": {"deploymentEnabled": false}}
 *
 * which Vercel documents as turning off automatic Git deployments for all
 * branches: https://vercel.com/docs/project-configuration/git-configuration
 * Any other key, any `true`, or a per-branch map (which leaves unlisted
 * branches enabled) is Vercel deployment configuration and fails the contract.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERCEL_SCHEMA_URL = 'https://openapi.vercel.sh/vercel.json';

/** The only Vercel file allowed in the repository: the deployment kill switch. */
export const VERCEL_KILL_SWITCH_PATH = 'vercel.json';

/**
 * Vercel configuration surfaces that must never exist. `vercel.ts` and its
 * siblings are Vercel's programmatic configuration; `now.json` is the legacy
 * name; `.vercel` holds a CLI project link; `.vercelignore` shapes uploads.
 */
export const FORBIDDEN_VERCEL_PATHS = Object.freeze([
  'vercel.ts',
  'vercel.mts',
  'vercel.js',
  'vercel.mjs',
  'vercel.cjs',
  'now.json',
  '.vercel',
  '.vercelignore',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function countKey(text, key) {
  return text.split(`"${key}"`).length - 1;
}

/**
 * Validate the text of `vercel.json`. Returns a list of failures; an empty
 * list means the file does nothing except disable every Git deployment.
 */
export function validateVercelKillSwitch(text) {
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    return [`vercel.json is not valid JSON: ${error.message}`];
  }

  if (!isPlainObject(config)) {
    return ['vercel.json must be a JSON object'];
  }

  const failures = [];

  // JSON.parse keeps the last of duplicate keys; refuse the ambiguity rather
  // than guess which one Vercel honours.
  for (const key of ['$schema', 'git', 'deploymentEnabled']) {
    if (countKey(text, key) > 1) {
      failures.push(`vercel.json declares "${key}" more than once`);
    }
  }

  for (const key of Object.keys(config)) {
    if (key !== '$schema' && key !== 'git') {
      failures.push(
        `vercel.json may only disable Git deployments; "${key}" is Vercel deployment configuration`,
      );
    }
  }

  if ('$schema' in config && config.$schema !== VERCEL_SCHEMA_URL) {
    failures.push(`vercel.json "$schema" must be ${VERCEL_SCHEMA_URL}`);
  }

  const git = config.git;
  if (!isPlainObject(git)) {
    failures.push('vercel.json must declare git.deploymentEnabled: false');
    return failures;
  }

  for (const key of Object.keys(git)) {
    if (key !== 'deploymentEnabled') {
      failures.push(`vercel.json git."${key}" is not permitted; only git.deploymentEnabled is`);
    }
  }

  if (git.deploymentEnabled !== false) {
    failures.push(
      isPlainObject(git.deploymentEnabled)
        ? 'vercel.json git.deploymentEnabled must be the boolean false; a per-branch map leaves unlisted branches deploying'
        : 'vercel.json git.deploymentEnabled must be the boolean false',
    );
  }

  return failures;
}

/** Check the repository root for Vercel files. Returns a list of failures. */
export async function validateVercelFiles(root = new URL('..', import.meta.url)) {
  const rootPath = fileURLToPath(root);
  const at = (path) => `${rootPath.replace(/\/$/, '')}/${path}`;
  const failures = [];

  for (const path of FORBIDDEN_VERCEL_PATHS) {
    if (existsSync(at(path))) {
      failures.push(`${path} is Vercel configuration; Render is the only deployment target`);
    }
  }

  if (!existsSync(at(VERCEL_KILL_SWITCH_PATH))) {
    failures.push(
      'vercel.json kill switch is missing; without it a connected Vercel GitHub App deploys every push',
    );
    return failures;
  }

  const text = await readFile(at(VERCEL_KILL_SWITCH_PATH), 'utf8');
  failures.push(...validateVercelKillSwitch(text));
  return failures;
}

const requiredRoutes = [
  '/university',
  '/university/lab',
  '/conservatory/*',
  '/mission-control',
  '/calyx',
];

const requiredPublishCommands = [
  'npm ci',
  'npm run test',
  'npm run lint',
  'npm run typecheck',
  'npm run validate:deployment',
  'npm run build',
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

function getRenderBuildCommand(blueprint) {
  const match = blueprint.match(/^\s*buildCommand:\s*(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

function validateOrderedPublishGate(command) {
  let cursor = 0;
  for (const required of requiredPublishCommands) {
    const at = command.indexOf(required, cursor);
    if (at === -1) {
      return `Render buildCommand is missing required prepublication step: ${required}`;
    }
    cursor = at + required.length;
  }
  return null;
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

  failures.push(...(await validateVercelFiles()));

  const renderBuildCommand = getRenderBuildCommand(blueprint);
  const publishGateFailure = validateOrderedPublishGate(renderBuildCommand);
  if (publishGateFailure) {
    failures.push(publishGateFailure);
  }
  if (!renderBuildCommand.includes('&&')) {
    failures.push('Render buildCommand must fail closed with && between validation steps');
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
      `${requiredStaticRewrites.length} static rewrite(s), the SPA fallback, ` +
      'the ordered fail-closed prepublication validation gate, ' +
      'and the Vercel Git-deployment kill switch.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
