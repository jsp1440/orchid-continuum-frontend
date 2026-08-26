import { describe, expect, it } from 'vitest';

import {
  JUDGING_ORGANIZATIONS,
  RUBRIC_PROVENANCE,
  judgingOrganization,
  scorePracticeSheet,
} from './judgingPractice';

/**
 * The recovered judging engine, and the two things the original got wrong.
 *
 * The retired FCOS application scored orchids by sending them to GPT-4o and
 * recording the model's numbers as `suggested_award_level` with
 * `is_award_worthy: true`. None of that came across: scores here are typed by
 * the person practising and nothing is issued or stored.
 *
 * And its `_determine_award_level` sorted awards by minimum score descending
 * and returned the first the total met. AOS records CBR with a minimum of 0, so
 * a total of 3 points came back as a Certificate of Botanical Recognition,
 * award-worthy. That bug is the reason band resolution here ignores awards a
 * point total cannot decide.
 */

const AOS_FLOWER_PERFECT = {
  Form: 30,
  Color: 15,
  'Substance/Texture': 15,
  Size: 10,
  Floriferousness: 15,
  'Stem and Presentation': 15,
};

function sheet(overrides: Record<string, number | null> = {}) {
  return { ...AOS_FLOWER_PERFECT, ...overrides };
}

describe('rubric provenance', () => {
  it('travels with the data as an unverified snapshot', () => {
    // The rubric must never be quotable as a current standard.
    expect(RUBRIC_PROVENANCE.status).toBe('unverified_historical_snapshot');
    expect(RUBRIC_PROVENANCE.statement).toMatch(/not a statement of current requirements/i);
    expect(RUBRIC_PROVENANCE.statement).toMatch(/not a real award/i);
  });

  it('keeps each category summing to 100 points', () => {
    for (const org of JUDGING_ORGANIZATIONS) {
      for (const [category, criteria] of Object.entries(org.categories)) {
        const total = criteria.reduce((sum, c) => sum + c.maxPoints, 0);
        expect(total, `${org.code}/${category}`).toBe(100);
      }
    }
  });
});

describe('practice scoring', () => {
  it('totals the points the person entered', () => {
    const result = scorePracticeSheet('AOS', 'flower', sheet())!;
    expect(result.total).toBe(100);
    expect(result.maxTotal).toBe(100);
    expect(result.complete).toBe(true);
  });

  it('resolves the highest band the total reaches', () => {
    expect(scorePracticeSheet('AOS', 'flower', sheet())!.band?.code).toBe('FCC');
    // Form is worth 30, so the rest of a perfect sheet is 70.
    expect(scorePracticeSheet('AOS', 'flower', sheet({ Form: 15 }))!.band?.code).toBe('AM'); // 85
    expect(scorePracticeSheet('AOS', 'flower', sheet({ Form: 10 }))!.band?.code).toBe('AM'); // 80, the AM floor
    expect(scorePracticeSheet('AOS', 'flower', sheet({ Form: 5 }))!.band?.code).toBe('HCC'); // 75
    expect(scorePracticeSheet('AOS', 'flower', sheet({ Form: 4 }))!.band).toBeNull(); // 74, just under
  });

  it('reaches no band below the lowest threshold', () => {
    // 100 − 30 − 15 − 15 = 40. Well under HCC's 75.
    const result = scorePracticeSheet('AOS', 'flower', sheet({ Form: 0, Color: 0, Floriferousness: 0 }))!;
    expect(result.total).toBe(40);
    expect(result.band).toBeNull();
  });

  it('never resolves a zero-threshold recognition from a score', () => {
    // The legacy bug: CBR has a minimum of 0, so sorting descending and taking
    // the first match awarded it to any total at all.
    const result = scorePracticeSheet('AOS', 'flower', {
      Form: 1,
      Color: 1,
      'Substance/Texture': 1,
      Size: 0,
      Floriferousness: 0,
      'Stem and Presentation': 0,
    })!;
    expect(result.total).toBe(3);
    expect(result.band).toBeNull();
    expect(result.nonScoredRecognitions.map((r) => r.code)).toContain('CBR');
  });

  it('carries the non-scored recognitions instead of dropping them', () => {
    // They exist and are not decided by points. Silently omitting them would
    // misrepresent the rubric as narrower than it is.
    const result = scorePracticeSheet('AOS', 'flower', sheet())!;
    expect(result.nonScoredRecognitions.map((r) => r.code).sort()).toEqual(['CBR', 'CCM']);
    expect(result.nonScoredRecognitions.find((r) => r.code === 'CBR')?.description).toMatch(
      /not decided by a point total/i,
    );
  });
});

describe('an incomplete sheet is not a verdict', () => {
  it('resolves no band while criteria remain unscored', () => {
    // The running total already clears FCC. A half-finished sheet must not
    // read as one — a partial score is not a low score, and it is not a high
    // one either.
    const partial = scorePracticeSheet('AOS', 'flower', {
      Form: 30,
      Color: 15,
      'Substance/Texture': 15,
      Size: 10,
      Floriferousness: 15,
      'Stem and Presentation': null,
    })!;
    expect(partial.total).toBe(85);
    expect(partial.complete).toBe(false);
    expect(partial.band).toBeNull();
    expect(partial.unscored).toEqual(['Stem and Presentation']);
  });

  it('reports what is available on the scored criteria only', () => {
    const partial = scorePracticeSheet('AOS', 'flower', { Form: 30 })!;
    expect(partial.scoredMax).toBe(30);
    expect(partial.maxTotal).toBe(100);
    expect(partial.unscored).toHaveLength(5);
  });
});

describe('entered values are bounded', () => {
  it('clamps a score above the criterion maximum', () => {
    const result = scorePracticeSheet('AOS', 'flower', sheet({ Form: 999 }))!;
    expect(result.entries.find((e) => e.criteria === 'Form')?.points).toBe(30);
    expect(result.total).toBe(100);
  });

  it('clamps a negative score to zero', () => {
    const result = scorePracticeSheet('AOS', 'flower', sheet({ Form: -50 }))!;
    expect(result.entries.find((e) => e.criteria === 'Form')?.points).toBe(0);
    expect(result.total).toBe(70);
  });

  it('treats a non-finite value as unscored rather than as zero', () => {
    // NaN from an empty numeric input is "not entered", not "scored nothing".
    const result = scorePracticeSheet('AOS', 'flower', sheet({ Form: Number.NaN }))!;
    expect(result.entries.find((e) => e.criteria === 'Form')?.points).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.band).toBeNull();
  });
});

describe('unknown inputs', () => {
  it('returns nothing for an organisation it does not have', () => {
    expect(scorePracticeSheet('RHS', 'flower', sheet())).toBeNull();
    expect(judgingOrganization('RHS')).toBeNull();
  });

  it('returns nothing for a category the organisation does not define', () => {
    expect(scorePracticeSheet('AOS', 'fragrance', sheet())).toBeNull();
    expect(scorePracticeSheet('EU', 'plant', {})).not.toBeNull();
  });

  it('accepts an organisation code in any case', () => {
    expect(judgingOrganization('aos')?.code).toBe('AOS');
    expect(judgingOrganization('  eu  ')?.code).toBe('EU');
  });
});
