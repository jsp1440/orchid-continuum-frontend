import { describe, expect, it } from 'vitest';
import { isSensitive, resolveLocation, snapToCell, uncertaintyToCellDeg } from './sensitivity';

const base = {
  lat: -0.4567,
  lng: -78.1234,
  iucnCode: undefined as string | undefined,
  conservationStatus: undefined as string | undefined,
  coordinateUncertaintyM: undefined as number | undefined,
};

describe('snapToCell', () => {
  it('returns the coordinate untouched at cell size 0', () => {
    expect(snapToCell(-0.4567, -78.1234, 0)).toEqual({ lat: -0.4567, lng: -78.1234 });
  });

  it('snaps to the centre of the containing cell, never to the point itself', () => {
    const { lat, lng } = snapToCell(-0.4567, -78.1234, 1);
    expect(lat).toBeCloseTo(-0.5, 6);
    expect(lng).toBeCloseTo(-78.5, 6);
  });

  it('is deterministic — the same input always yields the same cell', () => {
    const a = snapToCell(4.2, -74.9, 0.5);
    const b = snapToCell(4.2, -74.9, 0.5);
    expect(a).toEqual(b);
  });

  it('puts two nearby points in the same cell, which is the point of it', () => {
    expect(snapToCell(4.11, -74.11, 1)).toEqual(snapToCell(4.89, -74.89, 1));
  });
});

describe('uncertaintyToCellDeg', () => {
  it('treats a missing uncertainty as no constraint, not as zero metres', () => {
    expect(uncertaintyToCellDeg(undefined)).toBe(0);
  });

  it('keeps precise records precise', () => {
    expect(uncertaintyToCellDeg(500)).toBe(0);
  });

  it('coarsens a record whose own uncertainty is tens of kilometres', () => {
    expect(uncertaintyToCellDeg(30_000)).toBe(0.5);
    expect(uncertaintyToCellDeg(90_000)).toBe(1);
  });
});

describe('resolveLocation', () => {
  it('leaves an unthreatened, precisely located record exactly where it is', () => {
    const r = resolveLocation({ ...base });
    expect(r.lat).toBe(base.lat);
    expect(r.lng).toBe(base.lng);
    expect(r.policy.generalised).toBe(false);
    expect(r.policy.localityTextAllowed).toBe(true);
    expect(r.policy.notice).toBe('');
  });

  it('generalises a critically endangered record to a ~110 km cell', () => {
    const r = resolveLocation({ ...base, iucnCode: 'CR' });
    expect(r.policy.generalised).toBe(true);
    expect(r.policy.cellDeg).toBe(1);
    expect(r.lat).not.toBe(base.lat);
    expect(r.policy.notice).toMatch(/threatened/i);
  });

  it('withholds free-text locality whenever threat protection applies', () => {
    expect(resolveLocation({ ...base, iucnCode: 'EN' }).policy.localityTextAllowed).toBe(false);
  });

  it('reads a spelled-out conservation status when no IUCN code is present', () => {
    const r = resolveLocation({ ...base, conservationStatus: 'Critically Endangered' });
    expect(r.policy.cellDeg).toBe(1);
    expect(r.policy.reason).toBe('conservation-status');
  });

  it('does not treat Least Concern as threatened', () => {
    const r = resolveLocation({ ...base, conservationStatus: 'Least Concern', iucnCode: 'LC' });
    expect(r.policy.generalised).toBe(false);
  });

  it('research access sees through threat protection', () => {
    const r = resolveLocation({ ...base, iucnCode: 'CR' }, 'research');
    expect(r.lat).toBe(base.lat);
    expect(r.policy.generalised).toBe(false);
  });

  it('research access does NOT see through the record’s own coordinate uncertainty', () => {
    // Authorisation cannot make an observation more precise than it was made.
    const r = resolveLocation({ ...base, coordinateUncertaintyM: 60_000 }, 'research');
    expect(r.policy.generalised).toBe(true);
    expect(r.policy.reason).toBe('coordinate-uncertainty');
  });

  it('never renders finer than the scale floor asks for', () => {
    const r = resolveLocation({ ...base }, 'public', 5);
    expect(r.policy.cellDeg).toBe(5);
  });

  it('applies the coarsest of threat, uncertainty and scale', () => {
    const r = resolveLocation({ ...base, iucnCode: 'VU', coordinateUncertaintyM: 80_000 }, 'public', 0);
    // VU alone would be 0.25; the record's own 80 km uncertainty is coarser.
    expect(r.policy.cellDeg).toBe(1);
  });
});

describe('isSensitive', () => {
  it.each(['CR', 'EN', 'VU'])('flags %s as sensitive for public viewers', (code) => {
    expect(isSensitive({ iucnCode: code, conservationStatus: undefined })).toBe(true);
  });

  it('does not flag a record with no assessment', () => {
    expect(isSensitive({ iucnCode: undefined, conservationStatus: undefined })).toBe(false);
  });
});
