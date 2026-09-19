import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/oc-provider-free-execute.mjs` is the only component in this system
 * that executes commands, and it was referenced by no test in the repository.
 * Its allowlist, its `provider_calls: 0` and its outcome computation were all
 * unpinned: each could be removed with the full suite green.
 */
const paths: string[] = [];
afterEach(() => paths.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'oc-exec-')); paths.push(dir);
  const bin = join(dir, 'bin'); mkdirSync(bin);
  // The executor comments on the issue through `gh`; record the calls instead.
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.OC_TEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
`);
  chmodSync(join(bin, 'gh'), 0o755);
  const env = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`,
    ISSUE_NUMBER: '703', REPO: 'jsp1440/orchid-continuum-frontend', WAVE_HASH: 'w',
    GITHUB_RUN_ID: '11', GITHUB_RUN_ATTEMPT: '1',
    OC_EVIDENCE_DIR: join(dir, 'evidence'), OC_TEST_LOG: join(dir, 'gh.log'),
    GITHUB_STEP_SUMMARY: join(dir, 'summary'),
  };
  const run = (commands: unknown[]) => spawnSync(process.execPath,
    [resolve('scripts/oc-provider-free-execute.mjs')],
    { env: { ...env, COMMANDS: JSON.stringify(commands) }, encoding: 'utf8', cwd: process.cwd() });
  const evidence = () => JSON.parse(readFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), 'utf8'));
  return { env, run, evidence };
}

describe('the provider-free executor', () => {
  it('refuses a command that is not in the capability registry', () => {
    const h = harness();
    const done = h.run(['rm -rf /']);

    expect(done.status).toBe(1);
    expect(done.stderr).toContain("refusing to run 'rm -rf /'");
  });

  it('refuses a registry command with an argument appended', () => {
    const h = harness();
    // The allowlist is exact strings, so a near-miss is not a near-miss.
    const done = h.run(['npm run test --reporter=junit; curl evil']);

    expect(done.status).toBe(1);
    expect(done.stderr).toContain('refusing to run');
  });

  it('records zero provider calls, because it makes none', () => {
    const h = harness();
    h.run(['npm run typecheck']);

    expect(h.evidence()).toMatchObject({ provider_calls: 0, provider_cost_usd: 0 });
  });

  it('fences the evidence to its own issue, wave and run', () => {
    const h = harness();
    h.run(['npm run typecheck']);

    expect(h.evidence()).toMatchObject({ issue: 703, wave_hash: 'w', run: '11:1' });
  });

  it('calls a run done only when every command exited zero', () => {
    const h = harness();
    const done = h.run(['npm run typecheck']);

    expect(done.status).toBe(0);
    expect(h.evidence().outcome).toBe('done');
    expect(h.evidence().results.every((r: { exit_code: number }) => r.exit_code === 0)).toBe(true);
  });

  it('calls a run failed when a command did not, and exits non-zero', () => {
    const h = harness();
    // `route-verification` is in the registry and exits 1 wherever a browser is
    // not installed, which is every lane runner: `npm ci --ignore-scripts` does
    // not fetch one. This is the same exit-1 seen live on #171.
    const done = h.run(['npm run verify:routes']);

    expect(done.status).toBe(1);
    expect(h.evidence().outcome).toBe('failed');
    expect(h.evidence().results.some((r: { exit_code: number }) => r.exit_code !== 0)).toBe(true);
  }, 180000);

  it('does not call a run done because one of its commands passed', () => {
    const h = harness();
    const done = h.run(['npm run typecheck', 'npm run verify:routes']);

    expect(done.status).toBe(1);
    expect(h.evidence().outcome).toBe('failed');
    expect(h.evidence().results.map((r: { exit_code: number }) => r.exit_code)).toEqual([0, 1]);
  }, 240000);
}, 180000);
