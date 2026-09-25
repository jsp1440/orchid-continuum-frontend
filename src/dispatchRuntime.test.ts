import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
const paths: string[] = [];
afterEach(() => paths.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

describe('executable provider-free workflow adapter', () => {
  it('runs the real graph planner, denies all selected workers and verifies their actual receipts without mutations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-runtime-test-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const fakeGh = join(bin, 'gh');
    writeFileSync(fakeGh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OC_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[args.indexOf('--method')+1] !== 'GET') throw new Error('Unexpected mutation');
const path = args[1];
if (path.includes('contents/.oc/dispatch-ledger.json')) {
  if (!process.env.OC_TEST_LEDGER) { console.error('HTTP 404'); process.exit(1); }
  console.log(JSON.stringify({ sha: 'v1', content: Buffer.from(process.env.OC_TEST_LEDGER).toString('base64') })); process.exit(0);
}
if (path.includes('git/ref/heads/')) console.log(JSON.stringify({object:{sha:'a'.repeat(40)}}));
else if (path.includes('/issues?')) {
 const page = Number(new URL('https://example.test/'+path).searchParams.get('page'));
 console.log(JSON.stringify(page <= 10 ? Array.from({length:100},(_,i)=>({number:(page-1)*100+i+1,state:'open',title:'bounded task',body:'bounded acceptance',labels:[{name:'oc-queued'}]})) : []));
} else if (path.includes('/pulls?')) console.log('[]');
else throw new Error('Unexpected endpoint');
`);
    chmodSync(fakeGh, 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: join(dir, 'wave'), OC_RECEIPT_DIR: join(dir, 'receipts'), PROVIDER_AUTHORIZED: 'false' };
    const run = (command: string, extra: Record<string,string> = {}) => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), command], { env: { ...env, ...extra }, encoding: 'utf8' });
    // Unauthorized, and with no ledger: these undeclared issues are
    // provider-lane work, so there is no provider slot for any of them. They
    // stay queued and are reported, instead of taking eight lanes to write
    // eight denial receipts.
    const parked = run('plan'); expect(parked.status, parked.stderr).toBe(0);
    const none = JSON.parse(readFileSync(join(env.OC_PLAN_DIR, 'plan.json'), 'utf8'));
    expect(none.issues).toEqual([]);
    expect(none.providerCapacity).toMatchObject({ slots: 0, reason: 'provider_not_authorized' });
    expect(none.providerDeferred.length).toBeGreaterThan(0);
    expect(none.providerDeferred.every((d: { reason: string }) => d.reason === 'provider_capacity: provider_not_authorized')).toBe(true);
    expect(parked.stdout).toContain('provider_slots=0 (provider_not_authorized)');

    // Planned under the lanes' own policy with budget available, the wave gets
    // its one provider slot; the worker is then denied at its own boundary.
    const ledger = JSON.stringify({ schema: 1, programStartedAt: new Date(Date.now() - 86400000).toISOString(), programSpent: 0, dailySpent: {}, leases: [] });
    const planned = run('plan', { PROVIDER_AUTHORIZED: 'true', OC_PROVIDER_NO_API_MODE: 'false', OC_PROVIDER_DISABLED: '',
      OC_PROVIDER_DAILY_MAX_CALLS: '4', OC_PROVIDER_WAVE_MAX_CALLS: '1', OC_TEST_LEDGER: ledger });
    expect(planned.status, planned.stderr).toBe(0);
    const plan = JSON.parse(readFileSync(join(env.OC_PLAN_DIR, 'plan.json'), 'utf8'));
    expect(plan.providerCapacity).toMatchObject({ slots: 1, reason: 'wave_max_calls' });
    expect(plan.issues.length).toBe(1);
    expect(plan.issues.length).toBeLessThanOrEqual(8);
    for (const issue of plan.issues) {
      const admitted = run('admit', { ISSUE_NUMBER: String(issue), OC_WAVE_HASH: plan.wave.hash });
      expect(admitted.status, admitted.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, `${issue}.json`), 'utf8'))).toMatchObject({
        issue, outcome: 'provider_not_authorized', providerCalls: 0, providerCostUsd: 0, providerAuthorized: false,
      });
    }
    const audited = run('audit', { OC_WAVE_HASH: plan.wave.hash }); expect(audited.status, audited.stderr).toBe(0);
    const requests = readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(requests.every(args => args[args.indexOf('--method')+1] === 'GET')).toBe(true);
    expect(readFileSync(env.GITHUB_OUTPUT, 'utf8').match(/allowed=false/g)).toHaveLength(plan.issues.length);
    rmSync(join(env.OC_RECEIPT_DIR, `${plan.issues[0]}.json`));
    const incomplete = run('audit', { OC_WAVE_HASH: plan.wave.hash });
    expect(incomplete.status).toBe(1); expect(incomplete.stderr).toContain('diverged');
  }, 20000);
});
