import { describe, it, expect } from 'vitest';
import { featuredGenusName, msUntilNextRotation, WINDOW_MS } from '@/lib/featuredGenus';

/**
 * Regression tests for the Genus of the Day resume / lifecycle logic.
 *
 * These cover:
 *  - deterministic genus resolution (should never be undefined/empty)
 *  - msUntilNextRotation boundary values (drives the timer chain)
 *  - Verifying that a long background period (iOS Safari suspension) doesn't
 *    produce an invalid genus after the window advances.
 */

describe('featuredGenusName — resume regression', () => {
  it('always returns a non-empty string for the current time', () => {
    const name = featuredGenusName();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for a time far in the future (simulates resume after long suspension)', () => {
    // Simulate the page being suspended for 2 full 12-hour windows then resumed
    const futureTime = Date.now() + 2 * WINDOW_MS;
    const name = featuredGenusName(futureTime);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('returns consistent names for the same window start and end', () => {
    const now = Date.now();
    // Two calls within the same window should be identical
    expect(featuredGenusName(now)).toBe(featuredGenusName(now + 60_000));
  });

  it('returns different names for consecutive windows', () => {
    const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
    const nextWindowStart = windowStart + WINDOW_MS;
    // Consecutive windows should differ (the list has ≥ 2 entries)
    const first = featuredGenusName(windowStart);
    const second = featuredGenusName(nextWindowStart);
    expect(first).not.toBe(second);
  });
});

describe('msUntilNextRotation — timer chain safety', () => {
  it('returns a positive number of milliseconds', () => {
    const ms = msUntilNextRotation();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(WINDOW_MS);
  });

  it('is close to WINDOW_MS at the very start of a window', () => {
    // If called 1ms after a window boundary, remaining should be ~WINDOW_MS - 1
    const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
    const ms = msUntilNextRotation(windowStart + 1);
    expect(ms).toBeGreaterThan(WINDOW_MS - 1000);
    expect(ms).toBeLessThanOrEqual(WINDOW_MS);
  });

  it('is close to 0 just before a window boundary', () => {
    // 100ms before the boundary
    const windowEnd = (Math.floor(Date.now() / WINDOW_MS) + 1) * WINDOW_MS;
    const ms = msUntilNextRotation(windowEnd - 100);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThanOrEqual(200);
  });
});
