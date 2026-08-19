import { describe, expect, it } from 'vitest';
import {
  atlasSensitivityResolution,
  isAtlasLocationSensitive,
  resolveAtlasLocation,
  snapToCell,
  uncertaintyToCellDeg,
} from './atlasLocalitySafety';

describe('atlasLocalitySafety', () => {
  it('fails closed when conservation assessment is unresolved', () => {
    const displayed = resolveAtlasLocation({
      lat: 10.1234,
      lng: -84.5678,
      assessmentResolved: false,
    });
    expect(displayed.policy.reason).toBe('unresolved-assessment');
    expect(displayed.policy.generalised).toBe(true);
    expect(displayed.policy.localityTextAllowed).toBe(false);
    expect(isAtlasLocationSensitive({ assessmentResolved: false })).toBe(true);
    expect(atlasSensitivityResolution({ assessmentResolved: false })).toBe('unresolved');
  });

  it('generalises threatened taxa more strongly than the precaution floor', () => {
    const displayed = resolveAtlasLocation({
      lat: 4.711,
      lng: -74.0721,
      iucnCode: 'CR',
      assessmentResolved: true,
    });
    expect(displayed.policy.reason).toBe('iucn-threatened');
    expect(displayed.policy.cellDeg).toBe(1);
    expect(displayed.policy.localityTextAllowed).toBe(false);
  });

  it('never overrides source coordinate uncertainty, even for research access', () => {
    const displayed = resolveAtlasLocation(
      {
        lat: -2.25,
        lng: -78.5,
        assessmentResolved: true,
        coordinateUncertaintyM: 30_000,
      },
      'research',
    );
    expect(displayed.policy.reason).toBe('coordinate-uncertainty');
    expect(displayed.policy.cellDeg).toBe(0.5);
    expect(displayed.policy.localityTextAllowed).toBe(true);
  });

  it('research access can see through threat protection but not source imprecision', () => {
    const displayed = resolveAtlasLocation(
      {
        lat: -12.0464,
        lng: -77.0428,
        iucnCode: 'EN',
        assessmentResolved: true,
      },
      'research',
    );
    expect(displayed.policy.reason).toBe('none');
    expect(displayed.policy.generalised).toBe(false);
    expect(isAtlasLocationSensitive({ iucnCode: 'EN', assessmentResolved: true }, 'research')).toBe(false);
  });

  it('snaps to a grid-cell centre rather than adding false jitter', () => {
    expect(snapToCell(10.12, -84.57, 0.5)).toEqual({ lat: 10.25, lng: -84.75 });
  });

  it('converts large uncertainty to an honest display cell', () => {
    expect(uncertaintyToCellDeg(1_000)).toBe(0);
    expect(uncertaintyToCellDeg(5_000)).toBe(0.1);
    expect(uncertaintyToCellDeg(30_000)).toBe(0.5);
  });
});
