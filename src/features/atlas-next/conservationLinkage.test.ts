import { describe, expect, it } from 'vitest';
import { lookupConservation } from '@/lib/orchidContinuum';
import { resolveLocation } from './sensitivity';

/**
 * Locality protection is only as good as the assessment reaching the record.
 *
 * Conservation status is held on `species`, not on `atlas_occurrences`, so an
 * ingested occurrence inherits it through `species_id` — which many ingested
 * rows do not carry. When that link is missing, a threatened species' precise
 * coordinate would be published with no protection at all. These tests pin the
 * behaviour that closes the gap, and pin the limits of the fix.
 */

const index = {
  bySpeciesId: new Map([['sp-1', { status: 'Critically Endangered', iucn: 'CR' }]]),
  byCanonical: new Map([
    ['paphiopedilum rothschildianum', { status: 'Critically Endangered', iucn: 'CR' }],
  ]),
};

describe('lookupConservation', () => {
  it('resolves by species id when the occurrence is linked', () => {
    expect(lookupConservation(index, 'sp-1', undefined)?.iucn).toBe('CR');
  });

  it('resolves by canonical binomial when the occurrence has no species link', () => {
    expect(lookupConservation(index, undefined, 'Paphiopedilum rothschildianum')?.iucn).toBe('CR');
  });

  it('is case-insensitive on the binomial but still requires an exact name', () => {
    expect(lookupConservation(index, undefined, 'paphiopedilum ROTHSCHILDIANUM')?.iucn).toBe('CR');
    // A congener is a different species. Nothing is carried across.
    expect(lookupConservation(index, undefined, 'Paphiopedilum sanderianum')).toBeUndefined();
  });

  it('returns nothing rather than guessing when the genus alone is given', () => {
    expect(lookupConservation(index, undefined, 'Paphiopedilum')).toBeUndefined();
  });
});

describe('the linkage feeding locality protection', () => {
  const site = { lat: 6.0512, lng: 116.6234, coordinateUncertaintyM: 100 };

  it('protects an unlinked occurrence once the name resolves an assessment', () => {
    const found = lookupConservation(index, undefined, 'Paphiopedilum rothschildianum')!;
    const loc = resolveLocation(
      { ...site, iucnCode: found.iucn, conservationStatus: found.status },
      'public',
    );
    expect(loc.policy.generalised).toBe(true);
    expect(loc.lat).not.toBe(site.lat);
    expect(loc.policy.localityTextAllowed).toBe(false);
  });

  it('publishes the exact site when NOTHING resolves an assessment — the gap this closes', () => {
    const loc = resolveLocation(
      { ...site, iucnCode: undefined, conservationStatus: undefined },
      'public',
    );
    expect(loc.lat).toBe(site.lat);
    expect(loc.policy.generalised).toBe(false);
  });
});
