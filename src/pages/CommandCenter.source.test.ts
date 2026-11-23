import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./CommandCenter.tsx', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../lib/commandCenter.ts', import.meta.url), 'utf8');

describe('Command Center frontend hygiene', () => {
  it('never touches credentials or storage', () => {
    for (const source of [page, lib]) {
      expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|X-API-Key|x-api-key|CALYX_API_KEY|process\.env/);
      expect(source).not.toMatch(/Authorization/);
    }
  });
  it('is read-only: no non-GET requests', () => {
    expect(lib).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)/i);
    expect(page).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)/i);
  });
  it('does not render any hard-coded status data', () => {
    expect(page).not.toMatch(/status:\s*['"](DONE|RUNNING|BLOCKED|NEXT)['"]/);
    expect(page).not.toMatch(/\bmock\b|\bdemo\b|lorem/i);
  });
  it('states that the evidence is a snapshot and HTTP health is not scientific health', () => {
    expect(page).toMatch(/not live monitoring/);
    expect(page).toMatch(/not scientific health/);
  });
});
