import { describe, expect, it } from 'vitest';
import {
  ATLAS_LOCALITY_POLICY,
  atlasLayerLabel,
  atlasLayerMessage,
  type AtlasLayer,
} from '@/lib/speciesDossier';

function layer(overrides: Partial<AtlasLayer>): AtlasLayer {
  return {
    layer_id: 'occurrences',
    label: 'Occurrence points',
    state: 'provisional',
    point_count: null,
    feature_count: null,
    points: [],
    features: [],
    receipts: [],
    unavailable_reason: null,
    ...overrides,
  };
}

describe('atlasLayerLabel', () => {
  it('names the layers the backend envelope can withhold', () => {
    expect(atlasLayerLabel('occurrences')).toBe('Occurrence points');
    expect(atlasLayerLabel('protected_areas')).toBe('Protected areas');
    expect(atlasLayerLabel('all')).toBe('All layers');
  });

  it('falls back to a readable form of an unknown id instead of hiding it', () => {
    expect(atlasLayerLabel('soil_moisture')).toBe('soil moisture');
  });
});

describe('atlasLayerMessage', () => {
  it('uses the backend reason for an unavailable layer, with an honest default when none was given', () => {
    expect(atlasLayerMessage(layer({ state: 'unavailable', unavailable_reason: 'Source offline.' }))).toBe(
      'Source offline.',
    );
    expect(atlasLayerMessage(layer({ state: 'unavailable' }))).toMatch(/not published in the governed Atlas envelope/);
  });

  it('describes a published layer by counts only and restates that localities are never drawn', () => {
    expect(atlasLayerMessage(layer({ point_count: 1 }))).toBe(
      '1 point counted. Exact localities are never drawn on this page.',
    );
    expect(atlasLayerMessage(layer({ point_count: 12, feature_count: 3 }))).toBe(
      '12 points, 3 features counted. Exact localities are never drawn on this page.',
    );
    expect(atlasLayerMessage(layer({ state: 'available' }))).toBe(
      'Published in the governed Atlas envelope. Exact localities are never drawn on this page.',
    );
  });

  it('keeps the policy sentence explicit about what this page will not do', () => {
    expect(ATLAS_LOCALITY_POLICY).toMatch(/never draws coordinates/);
    expect(ATLAS_LOCALITY_POLICY).toMatch(/withheld at the source/);
  });
});
