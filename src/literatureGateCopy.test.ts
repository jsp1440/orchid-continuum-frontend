import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isMemberReadRequest } from '@/lib/memberReadAuth';

/**
 * J7 (Release 1): the sign-in gate in front of /literature must describe what
 * a signed-in member can actually do. Since backend #1643 (frontend #858) a
 * member session reads the paper list; full paper views stay owner-only. The
 * gate copy previously said "a member sign-in alone does not open it yet".
 *
 * Read as text, like navigationReachability.test.ts, so the guard does not
 * mount the whole router.
 */
const APP = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');

function gateDescription(path: string): string {
  const route = APP.split('\n').find((line) => line.includes(`path="${path}"`));
  if (!route) throw new Error(`route ${path} not found`);
  const match = /description="([^"]+)"/.exec(route);
  if (!match) throw new Error(`route ${path} has no gate description`);
  return match[1];
}

const BASE = 'https://calyx.example.test';

describe('literature sign-in gate copy', () => {
  it('matches the member-read scope: the paper list is a member read, a paper view is not', () => {
    expect(isMemberReadRequest(`${BASE}/api/literature-extraction/papers`, 'GET', BASE)).toBe(true);
    expect(isMemberReadRequest(`${BASE}/api/literature-extraction/papers/p1`, 'GET', BASE)).toBe(false);
  });

  for (const path of ['/literature', '/literature/:paperId']) {
    it(`${path} tells members they can read the paper list and that full papers are owner-only`, () => {
      const copy = gateDescription(path);
      expect(copy).toMatch(/signed-in members can read the (literature )?paper list/i);
      expect(copy).toMatch(/full paper views are limited to owner access/i);
      expect(copy).not.toMatch(/member sign-in alone does not open it/i);
      expect(copy).not.toMatch(/answers only an owner session/i);
    });
  }
});
