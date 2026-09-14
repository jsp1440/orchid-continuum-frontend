import { describe, expect, it } from 'vitest';
import { resolveAtlasNextIncomingGenus } from './incomingGenus';

describe('resolveAtlasNextIncomingGenus', () => {
  it('hydrates exactly one bounded canonical genus', () => {
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis'])).toBe('Phalaenopsis');
    expect(resolveAtlasNextIncomingGenus(['Laelia-anceps'])).toBe('Laelia-anceps');
  });

  it('does not silently choose a genus from a multi-genus Atlas filter', () => {
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis', 'Vanilla'])).toBeNull();
  });

  it('fails closed on malformed incoming genus context', () => {
    expect(resolveAtlasNextIncomingGenus(undefined)).toBeNull();
    expect(resolveAtlasNextIncomingGenus([])).toBeNull();
    expect(resolveAtlasNextIncomingGenus([''])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['phalaenopsis'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis amabilis'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['/locality/secret'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['34.2,-120.1'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus([`P${'h'.repeat(120)}`])).toBeNull();
  });
});
