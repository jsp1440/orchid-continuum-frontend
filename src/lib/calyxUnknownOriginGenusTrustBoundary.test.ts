import { describe, expect, it } from 'vitest';

import {
  governedCalyxGenusTurnContext,
  rejectsCalyxNavigationContext,
} from '@/lib/calyxRouteTrustBoundary';

describe('Calyx unknown-origin genus trust boundary', () => {
  it.each([
    '?origin=legacy&genus=cattleya',
    '?origin=legacy&genus=Cattleya%20labiata',
    '?origin=legacy&genus=Cattleya%2Flabiata',
    '?origin=legacy&genus=Los%20Osos',
    '?origin=legacy&genus=',
  ])('fails closed for malformed generic genus input: %s', (search) => {
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });

  it('leaves a canonical genus from an unmanaged origin to the legacy/dedicated adapter without granting governed status', () => {
    const search = '?origin=legacy&genus=Cattleya';

    expect(governedCalyxGenusTurnContext(search)).toBeUndefined();
    expect(rejectsCalyxNavigationContext(search)).toBe(false);
  });

  it('does not classify an unmanaged origin with no genus as a governed genus arrival', () => {
    expect(governedCalyxGenusTurnContext('?origin=research-station')).toBeUndefined();
  });
});
