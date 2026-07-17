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

describe('hidden → visible (resume) regression', () => {
  it('rotation is paused when the tab is hidden', () => {
    // tabVisible: false → shouldPauseRotation must return true
    expect(shouldPauseRotation(9, false, false, false)).toBe(true);
  });

  it('rotation resumes when the tab becomes visible again', () => {
    // tabVisible: true, no hover, no reducedMotion, 9 slots → should NOT pause
    expect(shouldPauseRotation(9, false, true, false)).toBe(false);
  });

  it('nextReplacementIndex handles a stale nextIndex larger than slotsLength', () => {
    // On resume, nextIndex might temporarily exceed slotsLength; ensure it wraps
    const result = nextReplacementIndex([0, 1, 2], 99, 5);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(5);
  });

  it('nextReplacementIndex never returns an index already in the visible set', () => {
    const visible = [0, 1, 2, 3, 4];
    const result = nextReplacementIndex(visible, 5, 10);
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThan(10);
    expect(visible).not.toContain(result);
  });

  it('nextReplacementIndex is safe with an empty visible array', () => {
    // Empty visible set on first render — should not throw
    expect(() => nextReplacementIndex([], 0, 9)).not.toThrow();
    expect(nextReplacementIndex([], 0, 9)).toBe(0);
  });

  it('shouldPauseRotation with zero slots always returns true', () => {
    // Slot array empty on initial load or mid-transition — must pause
    expect(shouldPauseRotation(0, false, true, false)).toBe(true);
  });
});
