import { describe, expect, it } from 'vitest';
import {
  EDUCATION_HERO_NOTE,
  EDUCATION_TOPIC_CONTENT,
} from './educationTopics';

// #790: curated glossary must not overstate certainty or coverage.
const ABSOLUTE_CLAIMS: Array<[string, RegExp]> = [
  ['"every"', /\bevery\b/i],
  ['"always"', /\balways\b/i],
  ['"never"', /\bnever\b/i],
  ['"all orchids"', /\ball (orchids|species)\b/i],
  ['"each species"', /\beach species\b/i],
  ['"guarantee"', /\bguarantee/i],
  ['"proven"', /\bproven?\b/i],
  ['"most diverse"', /\bmost diverse\b/i],
  ['"actually respond"', /\bactually respond/i],
  ['"not infections"', /\bnot infections\b/i],
  ['"threads ... into"', /\bthreads?\b.*\binto\b/i],
];

const allText = [
  EDUCATION_HERO_NOTE,
  ...EDUCATION_TOPIC_CONTENT.flatMap(t => [t.title, t.summary, t.detail]),
];

describe('education glossary certainty guard', () => {
  it('has unique keys and non-empty content', () => {
    const keys = EDUCATION_TOPIC_CONTENT.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of EDUCATION_TOPIC_CONTENT) {
      expect(t.summary.trim().length).toBeGreaterThan(20);
      expect(t.detail.trim().length).toBeGreaterThan(20);
    }
  });

  it.each(ABSOLUTE_CLAIMS)('contains no unhedged %s claim', (_label, re) => {
    const hits = allText.filter(s => re.test(s));
    expect(hits).toEqual([]);
  });

  it('presents numeric ranges as typical guidance, not fact', () => {
    for (const key of ['vpd', 'par-dli']) {
      const t = EDUCATION_TOPIC_CONTENT.find(x => x.key === key)!;
      expect(t.detail).toMatch(/\b(typical|commonly|roughly|about|often|varies?)\b/i);
      expect(t.detail).toMatch(/\bvar(y|ies)\b/i);
    }
  });

  it('does not imply complete GloBI partner coverage', () => {
    const t = EDUCATION_TOPIC_CONTENT.find(x => x.key === 'pollination')!;
    expect(t.detail).toMatch(/incomplete/i);
    expect(t.detail).toMatch(/absence of a record is not evidence of absence/i);
  });

  it('hero note does not claim universal integration', () => {
    expect(EDUCATION_HERO_NOTE).toMatch(/still in development|varies/i);
  });
});
