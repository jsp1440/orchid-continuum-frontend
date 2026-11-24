/**
 * Shared policy vectors: the SAME file runs in orchid-calyx-backend
 * (tests/fixtures/atlas_locality_vectors.json against
 * app/atlas_intelligence/public_locality.py), so the server and the browser
 * cannot drift apart on thresholds, parsing or snapping.
 */
import { describe, expect, it } from 'vitest';
import vectorsDoc from './__fixtures__/atlas_locality_vectors.json';
import {
  PUBLIC_FLOOR_DEG,
  UNRESOLVED_FLOOR_DEG,
  hasThreatAssessment,
  resolveAtlasLocation,
  toPublicAtlasOccurrence,
} from './atlasLocalitySafety';
import type { AtlasOccurrencePoint } from './orchidContinuum';

interface Vector {
  name: string;
  input: {
    lat: number;
    lng: number;
    iucn_code: string | null;
    conservation_status: string | null;
    coordinate_uncertainty_m: number | null;
  };
  expected: {
    assessment_resolved: boolean;
    cell_deg: number;
    reason: string;
    cell_km: number;
    cell_row: number;
    cell_col: number;
  };
}

const vectors = (vectorsDoc as { vectors: Vector[] }).vectors;

describe('shared Atlas locality vectors (backend parity)', () => {
  it('has the owner-approved floors', () => {
    expect(PUBLIC_FLOOR_DEG).toBe(0.1);
    expect(UNRESOLVED_FLOOR_DEG).toBe(0.1);
    expect(vectors.length).toBeGreaterThan(10);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const iucnCode = v.input.iucn_code ?? undefined;
    const conservationStatus = v.input.conservation_status ?? undefined;
    const resolved = hasThreatAssessment(iucnCode, conservationStatus);
    expect(resolved).toBe(v.expected.assessment_resolved);
    const loc = resolveAtlasLocation({
      lat: v.input.lat,
      lng: v.input.lng,
      iucnCode,
      conservationStatus,
      coordinateUncertaintyM: v.input.coordinate_uncertainty_m ?? undefined,
      assessmentResolved: resolved,
    });
    expect(loc.policy.cellDeg).toBe(v.expected.cell_deg);
    expect(loc.policy.reason).toBe(v.expected.reason);
    expect(Math.round(loc.policy.cellDeg * 111)).toBe(v.expected.cell_km);
    expect(loc.lat).toBeCloseTo((v.expected.cell_row + 0.5) * v.expected.cell_deg, 9);
    expect(loc.lng).toBeCloseTo((v.expected.cell_col + 0.5) * v.expected.cell_deg, 9);
    expect(loc.policy.localityTextAllowed).toBe(false);
  });

  it('a server-generalised point is never redrawn finer and keeps the server notice', () => {
    const point = {
      id: 'x', lat: 12.25, lng: -45.75, genus: 'G', species: 's', canonicalName: 'G s', country: 'C', countries: [],
      pollinators: [], dataset: 'GBIF', verified: false, assessmentResolved: true, iucnCode: 'LC',
      locality: 'should never appear', publicCellDeg: 0.5, locationReason: 'coordinate-uncertainty',
      locationNotice: 'Shown as an area of about 56 km because the source record states 50000 m coordinate uncertainty.',
    } satisfies AtlasOccurrencePoint;
    const loc = resolveAtlasLocation(point);
    expect(loc.policy.cellDeg).toBe(0.5);
    expect(loc.policy.reason).toBe('coordinate-uncertainty');
    expect(loc.policy.notice).toMatch(/56 km/);
    expect(toPublicAtlasOccurrence(point).locality).toBeUndefined();
  });
});
