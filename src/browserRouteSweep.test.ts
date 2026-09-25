import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('scripts/browser-route-sweep.mjs', 'utf8');

describe('browser route gate expectations', () => {
  it('treats member-authenticated science and mission entry points as member gates', () => {
    expect(source).toContain("{ path: '/calyx-science', gate: 'member' }");
    expect(source).toContain("{ path: '/mission-control', gate: 'member' }");
  });
});
