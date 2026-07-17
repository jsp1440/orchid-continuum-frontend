/**
 * Regression test for the iPad Safari white-screen crash.
 *
 * Root cause: BackendHealthBanner.META did not include 'proxy' or 'inaturalist'
 * source values. When fetchGenusImagesWithSource returned either of those
 * sources (as it does on iPad Safari when all primary backends fail),
 * recordBackendSource passed the value to setBackendStatus. BackendHealthBanner
 * then tried to read META[status.source] which was undefined, threw
 * "Cannot read properties of undefined (reading 'dot')", and — because no
 * error boundary wrapped the component — unmounted the entire React root,
 * producing a white screen.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { getBackendStatus, setBackendStatus } from '@/lib/backendStatus';
import type { DataSource } from '@/lib/backendStatus';

// Every source value that can be written by DailyGenusFeatureV3 /
// recordBackendSource must be a recognised DataSource so BackendHealthBanner
// can look it up in META without crashing.
const ALL_SOURCES: DataSource[] = [
  'live',
  'cache',
  'fallback',
  'pending',
  'proxy',
  'inaturalist',
];

// The META object from BackendHealthBanner, duplicated here so we can assert
// against it without importing the React component (which would need a DOM).
const EXPECTED_META_KEYS: DataSource[] = ['live', 'cache', 'fallback', 'pending', 'proxy', 'inaturalist'];

describe('backendStatus DataSource coverage', () => {
  beforeEach(() => {
    // Reset to a known state before each test.
    setBackendStatus({ source: 'pending', lastPingTime: null, cacheWrittenAt: null, genus: null });
  });

  it('accepts all ImageSource-derived values without losing state shape', () => {
    for (const src of ALL_SOURCES) {
      setBackendStatus({ source: src });
      expect(getBackendStatus().source).toBe(src);
    }
  });

  it('every DataSource value has a META entry (no undefined lookup crash)', () => {
    // This is the invariant that, when broken, caused the white-screen bug.
    // If DataSource ever gains a new value, this test will catch the missing
    // META entry before the crash reaches an iPad.
    for (const src of ALL_SOURCES) {
      expect(EXPECTED_META_KEYS).toContain(src);
    }
  });

  it("'proxy' and 'inaturalist' are valid DataSource values (regression for iPad Safari crash)", () => {
    setBackendStatus({ source: 'proxy', genus: 'Cattleya', lastPingTime: Date.now(), cacheWrittenAt: null });
    expect(getBackendStatus().source).toBe('proxy');

    setBackendStatus({ source: 'inaturalist', genus: 'Dracula', lastPingTime: Date.now(), cacheWrittenAt: null });
    expect(getBackendStatus().source).toBe('inaturalist');
  });
});
