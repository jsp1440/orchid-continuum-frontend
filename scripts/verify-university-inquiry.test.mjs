import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const captured = JSON.parse(await readFile(new URL('../src/lib/__fixtures__/universityInquiry.backend.json', import.meta.url), 'utf8'));
const expectedSha = 'a'.repeat(40);

it.each(['unreachable response', 'release rejected', 'browser launch rejected'])(
  'replaces stale passing evidence when %s',
  async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), 'ocu-verifier-failure-'));
    const evidencePath = join(directory, 'evidence.json');
    await writeFile(evidencePath, JSON.stringify({ result: 'pass', old_run: true }));
    const requests = [];
    const server = createServer((request, response) => {
      requests.push(request.method + ' ' + request.url);
      if (scenario === 'unreachable response') { response.destroy(); return; }
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/learning/release-readiness') {
        response.end(JSON.stringify({
          read_only_ready: scenario !== 'release rejected',
          session_writes_enabled: false, durable_sessions_enabled: false,
          publication_enabled: false, candidate_knowledge_writes_enabled: false,
          calyx_model_calls_enabled: false, release_contract: 'OCU-RELEASE-003',
        }));
      } else if (request.url === '/api/learning/catalog') {
        response.end(JSON.stringify({ laboratory: { id: captured.laboratory.laboratory_id } }));
      } else {
        response.end(JSON.stringify(captured.laboratory));
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    try {
      await expect(run(process.execPath, [
        resolve('scripts/verify-university-inquiry.mjs'), origin, origin, evidencePath, expectedSha,
      ], {
        env: { ...process.env, CHROMIUM_EXECUTABLE_PATH: join(directory, 'missing-browser') },
        timeout: 12000,
      })).rejects.toThrow();
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      expect(evidence.result).toBe('fail');
      expect(evidence.old_run).toBeUndefined();
      expect(typeof evidence.error).toBe('string');
      expect(evidence.completed_at).toBeTruthy();
      expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  },
  15000,
);

// Subprocess negative controls use an explicit fake browser, never as live
// University integration evidence. The actual runner still owns finalization.
const playwrightUrl = pathToFileURL(createRequire(import.meta.url).resolve('@playwright/test')).href;
const browserControl = `
import playwright from ${JSON.stringify(playwrightUrl)};
let note = '', selected = false, feedback = false;
let requestListener;
const locator = (role, options = {}) => ({
  async waitFor() { if (process.env.OCU_CONTROL_FLOW_FAIL && role === 'heading') throw new Error('deliberate journey failure'); },
  async click() { if (options.name === 'Start again') { note = ''; selected = false; feedback = false; } if (options.name === 'Check reasoning') feedback = true; },
  async check() { selected = true; },
  async fill(value) { note = value; },
  async inputValue() { return note; },
  async isVisible() { return true; },
  async getAttribute() { return JSON.parse(process.env.OCU_CONTROL_ACTUAL_SHA); },
  async count() { return role === 'listitem' ? 7 : role === 'status' ? Number(feedback) : role === 'radio' && options.checked ? Number(selected) : 1; },
  filter() { return this; },
});
playwright.chromium.launch = async () => ({
  async newPage() { return {
    on(event, handler) { if (event === 'request') requestListener = handler; },
    async goto(url) { for (const path of ['chapters/control', 'laboratories/control']) requestListener({ method: () => 'GET', url: () => new URL(url).origin + '/api/learning/' + path }); },
    async setViewportSize() {}, async screenshot() {},
    async reload() { note = ''; selected = false; feedback = false; },
    getByRole: locator, getByText: () => locator('text'), getByLabel: () => locator('input'), locator: () => locator('meta'),
  }; },
  async close() { if (process.env.OCU_CONTROL_CLOSE_FAIL === 'empty') throw undefined; if (process.env.OCU_CONTROL_CLOSE_FAIL) throw new Error('deliberate teardown failure'); },
});
`;

it.each([
  { name: 'teardown rejection', closeFail: true },
  { name: 'undefined teardown rejection', closeFail: true, emptyClose: true },
  { name: 'journey and teardown rejection', closeFail: true, flowFail: true },
  { name: 'missing expected SHA', expected: null },
  { name: 'malformed expected SHA', expected: 'short-sha' },
  { name: 'missing actual SHA', actual: null },
  { name: 'unattested actual SHA', actual: 'unattested' },
  { name: 'malformed actual SHA', actual: 'short-sha' },
  { name: 'different actual SHA', actual: 'b'.repeat(40) },
  { name: 'matching exact candidate', pass: true },
])('records complete lifecycle and candidate verdict for $name', async (scenario) => {
  const directory = await mkdtemp(join(tmpdir(), 'ocu-verifier-control-'));
  const evidencePath = join(directory, 'evidence.json');
  const preloadPath = join(directory, 'browser-control.mjs');
  await writeFile(evidencePath, JSON.stringify({ result: 'pass', old_run: true }));
  await writeFile(preloadPath, browserControl);
  const actual = Object.hasOwn(scenario, 'actual') ? scenario.actual : expectedSha;
  const expected = Object.hasOwn(scenario, 'expected') ? scenario.expected : expectedSha;
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount++;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url.endsWith('release-readiness') ? {
      read_only_ready: true, session_writes_enabled: false, durable_sessions_enabled: false,
      publication_enabled: false, candidate_knowledge_writes_enabled: false,
      calyx_model_calls_enabled: false, release_contract: 'OCU-RELEASE-003',
    } :
      request.url.endsWith('catalog') ? { laboratory: { id: captured.laboratory.laboratory_id } } : captured.laboratory));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let exitError;
  try {
    try {
      await run(process.execPath, ['--import', preloadPath, resolve('scripts/verify-university-inquiry.mjs'),
        origin, origin, evidencePath, ...(expected === null ? [] : [expected])], {
        env: { ...process.env, OCU_CONTROL_ACTUAL_SHA: JSON.stringify(actual),
          OCU_CONTROL_CLOSE_FAIL: scenario.emptyClose ? 'empty' : scenario.closeFail ? '1' : '', OCU_CONTROL_FLOW_FAIL: scenario.flowFail ? '1' : '' },
        timeout: 12000,
      });
    } catch (error) { exitError = error; }
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    expect(evidence.old_run).toBeUndefined();
    expect(evidence.expected_release_sha).toBe(expected);
    expect(evidence.result, evidence.error).toBe(scenario.pass ? 'pass' : 'fail');
    expect(evidence.completed_at).toBeTruthy();
    if (scenario.pass) {
      expect(exitError).toBeUndefined();
      expect(evidence.expected_release_sha).toBe(expectedSha);
      expect(evidence.actual_release_sha).toBe(expectedSha);
      expect(evidence.cleanup_status).toBe('passed');
    } else {
      expect(exitError?.code).not.toBe(0);
      expect(exitError).toBeDefined();
      const reason = scenario.flowFail ? 'deliberate journey failure' :
        scenario.emptyClose ? 'undefined' : scenario.closeFail ? 'deliberate teardown failure' :
          expected !== expectedSha ? 'Missing or malformed expected release SHA' :
            actual === 'b'.repeat(40) ? 'Actual release SHA does not match expected candidate' : 'Missing or malformed actual release SHA';
      expect(evidence.error).toBe(reason);
      if (expected !== expectedSha) {
        expect(requestCount).toBe(0);
        expect(evidence.actual_release_sha).toBeNull();
        expect(evidence.cleanup_status).toBe('not_created');
      }
      if (scenario.closeFail) {
        expect(evidence.cleanup_error).toContain(scenario.emptyClose ? 'undefined' : 'deliberate teardown failure');
        expect(evidence.cleanup_status).toBe('failed');
        if (scenario.flowFail) expect(evidence.error).toContain('deliberate journey failure');
      }
      if (expected === expectedSha && !scenario.flowFail) {
        expect(evidence.expected_release_sha).toBe(expectedSha);
        expect(evidence.actual_release_sha).toBe(actual);
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
