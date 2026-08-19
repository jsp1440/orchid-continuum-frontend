import { describe, expect, it } from 'vitest';
import { MAPBOX_TOKEN_ENV_VAR, REGIONAL_LAYERS, mapboxConfig } from './mapboxConfig';

describe('Mapbox configuration contract', () => {
  it('names the one variable a deployment has to set', () => {
    expect(MAPBOX_TOKEN_ENV_VAR).toBe('VITE_MAPBOX_TOKEN');
  });

  it('reports unconfigured, and names the variable, when nothing is set', () => {
    // The test environment sets no token, which is the state a fresh
    // deployment is in — and the state the interface has to explain.
    const cfg = mapboxConfig();
    expect(cfg.configured).toBe(false);
    expect(cfg.token).toBeNull();
    expect(cfg.envVar).toBe('VITE_MAPBOX_TOKEN');
    expect(cfg.reason).toContain('VITE_MAPBOX_TOKEN');
  });

  it('every declared regional layer states its readiness and a reason', () => {
    for (const l of REGIONAL_LAYERS) {
      expect(l.readiness).toBeTruthy();
      expect(l.note.length).toBeGreaterThan(20);
      // A layer that is not ready must not imply a source it does not have.
      if (l.readiness === 'not-currently-supportable') {
        expect(l.candidateSource).toBeNull();
      }
    }
  });

  it('does not claim any environmental dataset is ready beyond terrain', () => {
    const ready = REGIONAL_LAYERS.filter((l) => l.readiness === 'ready-now').map((l) => l.id);
    expect(ready.sort()).toEqual(['hillshade', 'terrain']);
  });
});
