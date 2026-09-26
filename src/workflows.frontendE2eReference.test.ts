// @vitest-environment node

/**
 * Pins the Playwright reference-backend workflow and the port independence
 * of the specs it runs.
 *
 * Until this workflow existed nothing ran e2e/ on a pull request, so #814
 * merged while breaking research-station-evidence-decision.spec.ts. These
 * tests keep the run present, least-privilege, provider-free and pinned, and
 * keep the specs runnable on whatever ports playwright.config.ts was given.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const WORKFLOW = '.github/workflows/frontend-e2e-reference.yml';
const source = readFileSync(WORKFLOW, 'utf8');

type Step = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown>; env?: unknown };
type Job = { 'runs-on'?: string; 'timeout-minutes'?: number; steps?: Step[]; permissions?: unknown; env?: Record<string, string> };
type Trigger = { branches?: string[]; paths?: string[] };
type Workflow = {
  on?: { pull_request?: Trigger; push?: Trigger; pull_request_target?: unknown; workflow_run?: unknown };
  true?: Workflow['on'];
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, Job>;
};

const workflow = yaml.load(source) as Workflow;
const triggers = workflow.on ?? workflow.true ?? {};
const jobs = Object.values(workflow.jobs ?? {});
const steps = jobs.flatMap((job) => job.steps ?? []);

/** `owner/action` -> pinned ref, as frontend-ci.yml declares it. */
function pinsIn(text: string): Map<string, string> {
  const pins = new Map<string, string>();
  for (const match of text.matchAll(/uses:\s*([^\s@]+)@([0-9a-f]{40})/g)) pins.set(match[1], match[2]);
  return pins;
}

describe('frontend-e2e-reference.yml', () => {
  it('runs on pull requests that touch the app or the suite, into main and the integration gate', () => {
    const pr = triggers.pull_request;
    expect(pr?.branches).toEqual(expect.arrayContaining(['main', 'oc-autonomous-integration']));
    expect(pr?.paths).toEqual(
      expect.arrayContaining(['src/**', 'e2e/**', 'playwright.config.ts', 'package.json', 'package-lock.json']),
    );
  });

  it('runs on pushes to main with the same path filter', () => {
    expect(triggers.push?.branches).toEqual(['main']);
    expect(triggers.push?.paths).toEqual(triggers.pull_request?.paths);
  });

  it('uses no privileged trigger', () => {
    expect(triggers.pull_request_target).toBeUndefined();
    expect(triggers.workflow_run).toBeUndefined();
  });

  it('holds a read-only token and no job widens it', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(jobs.every((job) => job.permissions === undefined)).toBe(true);
  });

  it('uses no secret and no model-provider credential', () => {
    expect(source).not.toMatch(/\$\{\{\s*secrets\./);
    expect(source).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|github\.token/);
    expect(source).not.toMatch(/OPENAI|ANTHROPIC|GEMINI|API_KEY/i);
  });

  it('cancels a superseded run on the same ref and bounds every job', () => {
    expect(workflow.concurrency?.group).toContain('${{ github.ref }}');
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(job['runs-on']).toBe('ubuntu-latest');
      expect(job['timeout-minutes']).toBeGreaterThan(0);
      expect(job['timeout-minutes']).toBeLessThanOrEqual(60);
    }
  });

  it('pins checkout and setup-node to the same SHAs as frontend-ci.yml', () => {
    const ci = pinsIn(readFileSync('.github/workflows/frontend-ci.yml', 'utf8'));
    const here = pinsIn(source);
    for (const action of ['actions/checkout', 'actions/setup-node']) {
      expect(here.get(action), action).toBeDefined();
      expect(here.get(action), action).toBe(ci.get(action));
    }
    // Every `uses:` in this file is a full SHA (the corpus rule, applied here).
    const uses = [...source.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(uses.every((ref) => /@[0-9a-f]{40}$/.test(ref))).toBe(true);
  });

  it('pins upload-artifact to a SHA already used elsewhere in the repository', () => {
    const others = readdirSync('.github/workflows')
      .filter((f) => /\.ya?ml$/.test(f) && f !== 'frontend-e2e-reference.yml')
      .map((f) => pinsIn(readFileSync(join('.github/workflows', f), 'utf8')).get('actions/upload-artifact'))
      .filter(Boolean);
    expect(others.length).toBeGreaterThan(0);
    expect(others).toContain(pinsIn(source).get('actions/upload-artifact'));
  });

  it('installs from the lockfile without lifecycle scripts and takes Chromium from that install', () => {
    const runs = steps.map((step) => step.run ?? '');
    expect(runs).toContain('npm ci --ignore-scripts');
    expect(runs).toContain('npx --no-install playwright install --with-deps chromium');
    expect(runs.some((run) => /npm (install|i)\b|playwright@/.test(run))).toBe(false);
  });

  it('runs the whole Playwright suite with CI semantics', () => {
    expect(steps.map((step) => step.run)).toContain('npx --no-install playwright test');
    expect(jobs[0].env?.CI).toBe('true');
    const credentials = steps.find((step) => step.uses?.startsWith('actions/checkout@'))?.with;
    expect(credentials?.['persist-credentials']).toBe(false);
  });

  it('uploads the HTML report and traces only on failure', () => {
    const upload = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.if).toBe('failure()');
    const path = String(upload?.with?.path ?? '');
    expect(path).toContain('playwright-report/');
    expect(path).toContain('e2e/.artifacts/');
  });
});

describe('e2e specs follow the ports playwright.config.ts was given', () => {
  const config = readFileSync('playwright.config.ts', 'utf8');

  it('exports both origins to the spec workers', () => {
    expect(config).toMatch(/process\.env\.REFERENCE_BACKEND_URL\s*=\s*REFERENCE_BACKEND;/);
    expect(config).toMatch(/process\.env\.E2E_APP_URL\s*=\s*APP;/);
  });

  it('never hardcodes the default backend or app origin outside an env fallback', () => {
    // A literal :8791 or :4173 passes on default ports and fails the moment
    // REFERENCE_BACKEND_PORT or E2E_APP_PORT remaps them.
    const offenders: string[] = [];
    for (const file of readdirSync('e2e').filter((f) => /\.spec\.ts$/.test(f))) {
      readFileSync(join('e2e', file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (!/:(8791|4173)\b/.test(line)) return;
          if (/process\.env\.(REFERENCE_BACKEND_URL|E2E_APP_URL)\s*\|\|/.test(line)) return;
          offenders.push(`e2e/${file}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
