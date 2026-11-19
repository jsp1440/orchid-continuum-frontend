import { describe, expect, it } from 'vitest';

import { canonicalDailySnapshotGenus, DAILY_SNAPSHOT_ENABLED } from '@/lib/dailyGenusContext';

describe('canonicalDailySnapshotGenus', () => {
  it('keeps the optional snapshot adapter disabled unless explicitly configured', () => {
    expect(DAILY_SNAPSHOT_ENABLED).toBe(false);
  });

  it('accepts one bounded canonical genus', () => {
    expect(canonicalDailySnapshotGenus('Phalaenopsis')).toBe('Phalaenopsis');
    expect(canonicalDailySnapshotGenus('  Paphiopedilum  ')).toBe('Paphiopedilum');
    expect(canonicalDailySnapshotGenus('X-Cattleya')).toBe('X-Cattleya');
  });

  it('fails closed for values that could corrupt genus-level homepage context', () => {
    for (const value of [
      '',
      'phalaenopsis',
      'Cattleya labiata',
      'Phalaenopsis/atlas',
      'Phalaenopsis?lat=1',
      'Los Osos',
      42,
      null,
      undefined,
    ]) {
      expect(canonicalDailySnapshotGenus(value)).toBeNull();
    }
  });

  it('rejects oversized snapshot identities', () => {
    expect(canonicalDailySnapshotGenus(`A${'a'.repeat(120)}`)).toBeNull();
  });
});
