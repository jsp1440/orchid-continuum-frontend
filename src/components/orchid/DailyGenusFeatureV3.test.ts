import { describe, expect, it } from 'vitest';
import { nextReplacementIndex, shouldPauseRotation } from '@/lib/dailyGenusRotation';

describe('DailyGenusFeatureV3 rotation helpers', () => {
  it('pauses rotation when hover, hidden tab, reduced motion, or too few slots', () => {
    expect(shouldPauseRotation(1, false, true, false)).toBe(true);
    expect(shouldPauseRotation(9, true, true, false)).toBe(true);
    expect(shouldPauseRotation(9, false, false, false)).toBe(true);
    expect(shouldPauseRotation(9, false, true, true)).toBe(true);
    expect(shouldPauseRotation(9, false, true, false)).toBe(false);
  });

  it('selects the next non-visible replacement index when possible', () => {
    expect(nextReplacementIndex([0, 1, 2], 3, 6)).toBe(3);
    expect(nextReplacementIndex([0, 1, 2], 1, 6)).toBe(3);
  });

  it('falls back safely when all slots are visible', () => {
    expect(nextReplacementIndex([0, 1, 2], 4, 3)).toBe(1);
    expect(nextReplacementIndex([], 2, 0)).toBe(0);
  });
});
