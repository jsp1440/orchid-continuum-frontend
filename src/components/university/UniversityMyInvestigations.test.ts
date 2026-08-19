import { describe, expect, it } from 'vitest';
import { learnerCacheKey } from './UniversityMyInvestigations';

function tokenFor(subject: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.signature`;
}

describe('learnerCacheKey', () => {
  it('partitions cached discovery results by stable learner subject', () => {
    const learnerA = '11111111-1111-4111-8111-111111111111';
    const learnerB = '22222222-2222-4222-8222-222222222222';
    expect(learnerCacheKey(tokenFor(learnerA))).toBe(learnerA);
    expect(learnerCacheKey(tokenFor(learnerB))).toBe(learnerB);
    expect(learnerCacheKey(tokenFor(learnerA))).not.toBe(learnerCacheKey(tokenFor(learnerB)));
  });

  it('fails closed instead of sharing a cache key for malformed or missing subjects', () => {
    expect(learnerCacheKey('not-a-jwt')).toBeNull();
    expect(learnerCacheKey(tokenFor('not-a-uuid'))).toBeNull();
  });
});
