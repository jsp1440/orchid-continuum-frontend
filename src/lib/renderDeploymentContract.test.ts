/**
 * The Render deployment contract, enforced.
 *
 * Orchid Continuum deploys to Render only. Render serves this app as a static
 * site whose `public/_redirects` ends in `/* /index.html 200`, so any path it
 * does not recognise returns the app shell with status 200. A relative API
 * path therefore resolves successfully, with HTML, and looks like a working
 * call. These tests exist so that failure mode cannot come back.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_VERCEL_PATHS,
  validateVercelFiles,
  validateVercelKillSwitch,
} from '../../scripts/verify-deployment-contract.mjs';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = walk('src').filter((f) => !/\.(test|spec)\.tsx?$/.test(f));

describe('Render is the only deployment target', () => {
  it('ships no Vercel configuration beyond the Git-deployment kill switch', async () => {
    for (const path of FORBIDDEN_VERCEL_PATHS) {
      expect(existsSync(path), path).toBe(false);
    }
    expect(existsSync('vercel.json')).toBe(true);
    expect(await validateVercelFiles()).toEqual([]);
  });

  it('keeps the SPA fallback last in public/_redirects', () => {
    const redirects = readFileSync('public/_redirects', 'utf8');
    const rules = redirects
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    const catchAll = rules.findIndex((l) => l.startsWith('/*'));
    expect(catchAll).toBe(rules.length - 1);
  });

  it('declares the same SPA fallback on the canonical Render service', () => {
    const blueprint = readFileSync('render.yaml', 'utf8');
    expect(blueprint).toContain('name: orchid-continuum-frontend');
    expect(blueprint).toContain('runtime: static');
    expect(blueprint).toContain('branch: main');
    expect(blueprint).toContain('staticPublishPath: ./dist');
    expect(blueprint).toMatch(/type: rewrite[\s\S]*source: \/\*[\s\S]*destination: \/index\.html/);
  });

  it('serves the researcher page as a static document, before the catch-all', () => {
    const redirects = readFileSync('public/_redirects', 'utf8');
    expect(redirects).toContain('/researcher-jeffery-scott-parham.html');
    expect(existsSync('public/researcher-jeffery-scott-parham.html')).toBe(true);
  });

  it('documents both Render API origins in .env.example', () => {
    const env = readFileSync('.env.example', 'utf8');
    expect(env).toContain('VITE_CALYX_API_URL');
    expect(env).toContain('VITE_API_BASE_URL');
    expect(env).toContain('orchid-calyx-backend.onrender.com');
    expect(env).toContain('orchid-continuum-public-api.onrender.com');
  });
});

describe('the vercel.json kill switch', () => {
  const schema = 'https://openapi.vercel.sh/vercel.json';
  const check = (config: unknown) => validateVercelKillSwitch(JSON.stringify(config));

  it('accepts only the form that disables every Git deployment', () => {
    expect(check({ git: { deploymentEnabled: false } })).toEqual([]);
    expect(check({ $schema: schema, git: { deploymentEnabled: false } })).toEqual([]);
  });

  it('rejects deploymentEnabled: true', () => {
    expect(check({ git: { deploymentEnabled: true } })).not.toEqual([]);
  });

  it('rejects anything that is not the boolean false', () => {
    for (const value of ['false', 0, null, []]) {
      expect(check({ git: { deploymentEnabled: value } }), JSON.stringify(value)).not.toEqual([]);
    }
    expect(check({ git: {} })).not.toEqual([]);
    expect(check({})).not.toEqual([]);
  });

  it.each([
    ['builds', [{ src: 'package.json', use: '@vercel/static-build' }]],
    ['rewrites', [{ source: '/(.*)', destination: '/index.html' }]],
    ['framework', 'vite'],
    ['buildCommand', 'npm run build'],
    ['outputDirectory', 'dist'],
    ['ignoreCommand', 'exit 1'],
    ['headers', []],
    ['github', { enabled: true }],
  ])('rejects the extra key %s', (key, value) => {
    const failures = check({ [key]: value, git: { deploymentEnabled: false } });
    expect(failures.join('\n')).toContain(`"${key}"`);
  });

  it('rejects extra keys inside git', () => {
    expect(check({ git: { deploymentEnabled: false, autoAlias: true } })).not.toEqual([]);
  });

  it('rejects a per-branch map that enables any branch', () => {
    expect(check({ git: { deploymentEnabled: { main: true } } })).not.toEqual([]);
    expect(check({ git: { deploymentEnabled: { 'feature-*': false, main: true } } })).not.toEqual(
      [],
    );
  });

  it('rejects an all-false per-branch map, which still deploys unlisted branches', () => {
    expect(check({ git: { deploymentEnabled: { main: false, '*': false } } })).not.toEqual([]);
  });

  it('rejects a foreign $schema', () => {
    expect(check({ $schema: 'https://example.com/x.json', git: { deploymentEnabled: false } }))
      .not.toEqual([]);
  });

  it('rejects duplicate keys rather than trusting last-wins parsing', () => {
    expect(
      validateVercelKillSwitch('{"git":{"deploymentEnabled":true,"deploymentEnabled":false}}'),
    ).not.toEqual([]);
  });

  it('rejects invalid JSON and non-object roots', () => {
    expect(validateVercelKillSwitch('{')).not.toEqual([]);
    expect(validateVercelKillSwitch('false')).not.toEqual([]);
    expect(validateVercelKillSwitch('[]')).not.toEqual([]);
  });
});

describe('no API client uses a relative origin', () => {
  // A fetch whose URL literal begins with /api/ resolves against the SPA
  // origin and hits the catch-all. Every such call must be composed onto an
  // absolute base instead.
  const relativeFetch = /fetch\(\s*[`'"]\/api\//;

  it('never calls fetch with a literal relative /api path', () => {
    const offenders = sourceFiles.filter((file) =>
      relativeFetch.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('never builds a template fetch URL that starts with /api', () => {
    const offenders = sourceFiles.filter((file) =>
      /fetch\(\s*`\/api\//.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
