import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { speciesDossierContinuumActions } from '@/lib/speciesDossierContinuumNavigation';

const mountedSource = readFileSync(new URL('./SpeciesDossier.tsx', import.meta.url), 'utf8');

const forbiddenKeys = [
  'lat',
  'lng',
  'latitude',
  'longitude',
  'locality',
  'occurrence',
  'occurrence_id',
  'record_id',
  'project',
  'collector',
  'catalogue',
  'evidence',
  'confidence',
  'conclusion',
];

describe('mounted Species Dossier Continuum fan-out', () => {
  it('mounts one shared governed action model for Atlas, Research, and Calyx', () => {
    expect(mountedSource).toContain('speciesDossierContinuumActions');
    expect(mountedSource).toContain('continuumActions?.atlas');
    expect(mountedSource).toContain('continuumActions?.research');
    expect(mountedSource).toContain('continuumActions?.calyx');

    const actions = speciesDossierContinuumActions({ acceptedName: 'Phalaenopsis amabilis' });
    expect(actions).not.toBeNull();
    if (!actions) return;

    expect(actions.atlas).toBe('/atlas?species=Phalaenopsis+amabilis');

    const research = new URL(actions.research, 'https://continuum.example');
    expect(research.pathname).toBe('/research');
    expect(research.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(research.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(research.searchParams.get('origin')).toBe('species-dossier-research');
    expect(research.searchParams.get('context_is_evidence')).toBe('false');

    const calyx = new URL(actions.calyx, 'https://continuum.example');
    expect(calyx.pathname).toBe('/calyx');
    expect(calyx.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(calyx.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(calyx.searchParams.get('origin')).toBe('species-dossier-calyx');
    expect(calyx.searchParams.get('context_is_evidence')).toBe('false');

    for (const href of [actions.atlas, actions.research, actions.calyx]) {
      const url = new URL(href, 'https://continuum.example');
      for (const key of forbiddenKeys) expect(url.searchParams.has(key)).toBe(false);
    }
  });

  it('fails the mounted fan-out closed when the authoritative identity is malformed', () => {
    const actions = speciesDossierContinuumActions({
      acceptedName: '/species/opaque-route-id',
      canonicalName: 'Phalaenopsis amabilis',
    });
    expect(actions).toBeNull();
  });
});
