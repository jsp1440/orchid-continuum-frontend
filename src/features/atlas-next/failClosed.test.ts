import { describe, expect, it } from 'vitest';
import { resolveLocation, sensitivityResolution, isSensitive, UNRESOLVED_FLOOR_DEG } from './sensitivity';

/**
 * The Slice 2 safety change, pinned.
 *
 * The live store holds nine species with conservation assessments against 2,611
 * distinct names across 31,073 occurrences. 94.5% of sampled records resolve to
 * no assessment at all. Treating those as "not threatened" publishes precise
 * sites for taxa nobody has assessed, which is exactly the failure mode this
 * suite exists to prevent.
 */

const site = { lat: 4.123456, lng: -74.987654 };

describe('failing closed on an unresolved assessment', () => {
  it('generalises a record whose assessment could not be reached', () => {
    const r = resolveLocation({ ...site, assessmentResolved: false });
    expect(r.policy.generalised).toBe(true);
    expect(r.policy.cellDeg).toBe(UNRESOLVED_FLOOR_DEG);
    expect(r.policy.reason).toBe('unresolved-assessment');
    expect(r.lat).not.toBe(site.lat);
  });

  it('says it is a precaution about what is unknown, not a threat claim', () => {
    const { notice } = resolveLocation({ ...site, assessmentResolved: false }).policy;
    expect(notice).toMatch(/no conservation assessment/i);
    expect(notice).toMatch(/not a statement that the species is threatened/i);
  });

  it('withholds free-text locality under the precaution too', () => {
    // A locality string defeats coordinate generalisation, so it has to follow
    // the same rule.
    expect(resolveLocation({ ...site, assessmentResolved: false }).policy.localityTextAllowed).toBe(
      false,
    );
  });

  it('publishes the exact site once an assessment is reached and is not threatening', () => {
    const r = resolveLocation({ ...site, assessmentResolved: true, iucnCode: 'LC' });
    expect(r.lat).toBe(site.lat);
    expect(r.policy.generalised).toBe(false);
  });

  it('still applies the stronger threat protection when both could apply', () => {
    const r = resolveLocation({ ...site, assessmentResolved: false, iucnCode: 'CR' });
    expect(r.policy.cellDeg).toBe(1);
    expect(r.policy.reason).toBe('iucn-threatened');
  });

  it('does not downgrade a caller that never passed the flag', () => {
    // Legacy callers must not be silently coarsened; only an explicit false
    // means "we looked and found nothing".
    const r = resolveLocation({ ...site });
    expect(r.policy.generalised).toBe(false);
  });

  it('names the source when imprecision is what actually coarsened the coordinate', () => {
    // 40 km of stated uncertainty is coarser than the precautionary floor, so
    // it is what decided the rendering, and the notice must say so rather than
    // implying something was withheld.
    const r = resolveLocation({ ...site, assessmentResolved: false, coordinateUncertaintyM: 40_000 });
    expect(r.policy.reason).toBe('coordinate-uncertainty');
    expect(r.policy.notice).toMatch(/Nothing is being withheld/i);
  });

  it('still withholds locality text when the assessment is unresolved, whatever coarsened the coordinate', () => {
    // Which reason won the coordinate and whether a withholding decision is in
    // force are separate questions. The assessment here is unresolved, so a
    // precise locality STRING for an unassessed taxon stays withheld even
    // though source imprecision is what set the cell size.
    const r = resolveLocation({ ...site, assessmentResolved: false, coordinateUncertaintyM: 40_000 });
    expect(r.policy.localityTextAllowed).toBe(false);

    // With the assessment reached, imprecision alone withholds nothing.
    const reached = resolveLocation({ ...site, assessmentResolved: true, coordinateUncertaintyM: 40_000 });
    expect(reached.policy.localityTextAllowed).toBe(true);
    expect(reached.policy.reason).toBe('coordinate-uncertainty');
  });

  it('research access sees through the precaution but never through imprecision', () => {
    expect(resolveLocation({ ...site, assessmentResolved: false }, 'research').policy.generalised).toBe(
      false,
    );
    expect(
      resolveLocation({ ...site, assessmentResolved: false, coordinateUncertaintyM: 40_000 }, 'research')
        .policy.generalised,
    ).toBe(true);
  });
});

describe('sensitivityResolution', () => {
  it('separates the three outcomes', () => {
    expect(sensitivityResolution({ iucnCode: 'EN', conservationStatus: undefined })).toBe(
      'assessed-threatened',
    );
    expect(
      sensitivityResolution({ iucnCode: undefined, conservationStatus: undefined, assessmentResolved: true }),
    ).toBe('assessed-not-threatened');
    expect(
      sensitivityResolution({ iucnCode: undefined, conservationStatus: undefined, assessmentResolved: false }),
    ).toBe('unresolved');
  });
});

describe('isSensitive', () => {
  it('treats an unreachable assessment as sensitive for public viewers', () => {
    expect(
      isSensitive({ iucnCode: undefined, conservationStatus: undefined, assessmentResolved: false }),
    ).toBe(true);
  });
});
