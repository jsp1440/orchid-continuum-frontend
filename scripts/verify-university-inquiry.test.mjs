import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const captured = JSON.parse(await readFile(new URL('../src/lib/__fixtures__/universityInquiry.backend.json', import.meta.url), 'utf8'));

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
        resolve('scripts/verify-university-inquiry.mjs'), origin, origin, evidencePath,
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
