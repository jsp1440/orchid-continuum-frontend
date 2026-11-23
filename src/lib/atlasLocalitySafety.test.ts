import { describe, expect, it } from 'vitest';
import {
  atlasSensitivityResolution,
  hasThreatAssessment,
  isAtlasLocationSensitive,
  resolveAtlasLocation,
  snapToCell,
  toPublicAtlasOccurrence,
  UNRESOLVED_FLOOR_DEG,
  uncertaintyToCellDeg,
} from './atlasLocalitySafety';
import type { AtlasOccurrencePoint } from './orchidContinuum';

function syntheticPoint(assessment: Partial<AtlasOccurrencePoint>): AtlasOccurrencePoint {
  return {
    id: 'synthetic-occurrence',
    lat: 12.1234,
    lng: 45.6789,
    genus: 'Synthetic',
    species: 'example',
    canonicalName: 'Synthetic example',
    country: 'Synthetic country',
    countries: ['Synthetic country'],
    locality: 'synthetic-private-site',
    pollinators: [],
    dataset: 'Synthetic fixture',
    verified: false,
    ...assessment,
  };
}

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

  describe.each(['iucnCode', 'conservationStatus'] as const)('mixed assessment in %s', (field) => {
    it.each([
      ['CR; data deficient regionally', 'CR', 1],
      ['NE; CR', 'CR', 1],
      ['Critically Endangered; DD', 'CR', 1],
      ['Critically Endangered; not yet assessed regionally', 'CR', 1],
      ['EN; DD', 'EN', 0.5],
      ['not evaluated regionally; EN', 'EN', 0.5],
      ['Endangered; data deficient regionally', 'EN', 0.5],
      ['NE; Endangered', 'EN', 0.5],
      ['VU; data deficient regionally', 'VU', 0.25],
      ['VU; NE', 'VU', 0.25],
      ['Vulnerable; DD', 'VU', 0.25],
      ['not assessed regionally; Vulnerable', 'VU', 0.25],
      ['VU; EN; DD; CR; NE', 'CR', 1],
      ['NE; Endangered; Vulnerable; data deficient', 'EN', 0.5],
    ])('projects %s at the %s protection floor', (value, tier, cellDeg) => {
      const point = syntheticPoint({ [field]: value, assessmentResolved: false });
      const original = structuredClone(point);
      const projected = toPublicAtlasOccurrence(point);
      // Assert the public coordinates themselves, not just parser recognition.
      expect(projected.lat).toBeCloseTo((Math.floor(point.lat / cellDeg) + 0.5) * cellDeg, 8);
      expect(projected.lng).toBeCloseTo((Math.floor(point.lng / cellDeg) + 0.5) * cellDeg, 8);
      expect(projected.locality).toBeUndefined();
      expect(resolveAtlasLocation(point).policy.cellDeg).toBe(cellDeg);
      expect(resolveAtlasLocation(point).policy.notice).toContain(`(${tier})`);
      expect(hasThreatAssessment(point.iucnCode, point.conservationStatus)).toBe(true);
      expect(isAtlasLocationSensitive(point)).toBe(true);
      expect(atlasSensitivityResolution(point)).toBe('assessed-threatened');
      expect(point).toEqual(original);
    });

    it.each(['DD', 'NE', 'Data Deficient', 'not evaluated', 'not yet assessed', 'DD; NE', '', 'unknown'])(
      'keeps %s unresolved with the precaution floor', (value) => {
        const assessment = { [field]: value };
        const resolved = hasThreatAssessment(assessment.iucnCode, assessment.conservationStatus);
        const point = syntheticPoint({ ...assessment, assessmentResolved: resolved });
        const projected = toPublicAtlasOccurrence(point);
        expect(projected.lat).toBeCloseTo((Math.floor(point.lat / UNRESOLVED_FLOOR_DEG) + 0.5) * UNRESOLVED_FLOOR_DEG, 8);
        expect(projected.lng).toBeCloseTo((Math.floor(point.lng / UNRESOLVED_FLOOR_DEG) + 0.5) * UNRESOLVED_FLOOR_DEG, 8);
        expect(projected.locality).toBeUndefined();
        expect(resolved).toBe(false);
        expect(resolveAtlasLocation(point).policy.cellDeg).toBe(UNRESOLVED_FLOOR_DEG);
        expect(atlasSensitivityResolution(point)).toBe('unresolved');
      },
    );
  });

  it('uses the most severe mixed assessment across fields and retains larger source uncertainty', () => {
    const point = syntheticPoint({
      iucnCode: 'VU; DD',
      conservationStatus: 'NE; EN',
      assessmentResolved: true,
      coordinateUncertaintyM: 80_000,
    });
    const projected = toPublicAtlasOccurrence(point);
    expect(projected.lat).toBeCloseTo(12.5, 8);
    expect(projected.lng).toBeCloseTo(45.5, 8);
    expect(projected.locality).toBeUndefined();
    expect(resolveAtlasLocation(point).policy.cellDeg).toBe(1);
    expect(resolveAtlasLocation(point).policy.reason).toBe('coordinate-uncertainty');
    expect(resolveAtlasLocation({ ...point, coordinateUncertaintyM: undefined }).policy.cellDeg).toBe(0.5);
  });
});
