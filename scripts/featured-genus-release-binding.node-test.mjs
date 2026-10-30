import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = 'a'.repeat(40);

function execute(expected, changes = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'featured-release-binding-'));
  try {
    mkdirSync(join(cwd, 'scripts'));
    mkdirSync(join(cwd, 'contracts'));
    for (const name of ['oc-provider-free-execute.mjs', 'oc-capability-router.mjs', 'oc-reserve-mission-binding.mjs']) {
      cpSync(join(source, 'scripts', name), join(cwd, 'scripts', name));
    }
    cpSync(join(source, 'contracts/oc-shared-capabilities.v1.json'), join(cwd, 'contracts/oc-shared-capabilities.v1.json'));
    // An owned no-op validator and supplied report isolate admission semantics;
    // this test deliberately does not run a deployed browser or fetch a service.
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'verify:featured-genus': 'node -e "process.exit(0)"' } }));
    mkdirSync(join(cwd, 'artifacts'));
    const report = {
      schema: 'oc.featured-genus-validation.v1', validation_kind: 'featured-genus-deployed',
      node_id: 'cap-homepage-featured-genus', issue: 943, wave_hash: 'fixture-wave',
      run: 'fixture-run:1', passed: true, provider_calls: 0, provider_cost_usd: 0,
      release_sha: sha, expected_release_sha: expected?.trim() || null, ...changes,
    };
    writeFileSync(join(cwd, 'artifacts/featured-genus-report.json'), JSON.stringify(report));
    const env = {
      ...process.env, NO_API_MODE: 'true', PROVIDER_AUTHORIZED: 'false',
      REPO: '', GITHUB_STEP_SUMMARY: '', ISSUE_NUMBER: '943', WAVE_HASH: 'fixture-wave',
      GITHUB_RUN_ID: 'fixture-run', GITHUB_RUN_ATTEMPT: '1', COMMANDS: '["npm run verify:featured-genus"]',
      OC_EVIDENCE_DIR: '.oc-evidence', NPM_CONFIG_OFFLINE: 'true',
    };
    if (expected === undefined) delete env.EXPECTED_RELEASE_SHA;
    else env.EXPECTED_RELEASE_SHA = expected;
    const child = spawnSync(process.execPath, ['scripts/oc-provider-free-execute.mjs'], { cwd, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 0, 'owned validator execution must pass before admission is checked');
    const evidence = JSON.parse(readFileSync(join(cwd, '.oc-evidence/943.json'), 'utf8'));
    assert.equal(evidence.outcome, 'done');
    assert.equal(evidence.results[0].exit_code, 0);
    return evidence;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

for (const [name, expected] of [['missing', undefined], ['empty', ''], ['whitespace', ' \t ']]) {
  test(`${name} independently expected SHA cannot attach product acceptance`, () => {
    assert.equal(execute(expected).acceptance, undefined);
  });
}
test('a report cannot supply its own independent expected SHA', () => {
  assert.equal(execute(undefined, { expected_release_sha: sha }).acceptance, undefined);
});
test('full matching independent/report/deployed SHAs permit scoped acceptance', () => {
  assert.equal(execute(sha).acceptance.release_sha, sha);
});
test('release SHA arrays cannot coerce into a valid deployed release', () => {
  assert.equal(execute(sha, { release_sha: [sha] }).acceptance, undefined);
});
test('non-string release SHA values fail closed', () => {
  for (const release_sha of [null, 123, true, { sha }]) {
    assert.equal(execute(sha, { release_sha }).acceptance, undefined);
  }
});
test('different deployed release or report binding cannot pass', () => {
  assert.equal(execute(sha, { release_sha: 'b'.repeat(40) }).acceptance, undefined);
  assert.equal(execute(sha, { expected_release_sha: 'b'.repeat(40) }).acceptance, undefined);
});
test('short or invalid independently expected SHA is refused', () => {
  assert.equal(execute('aaaaaaa').acceptance, undefined);
  assert.equal(execute('g'.repeat(40)).acceptance, undefined);
});
