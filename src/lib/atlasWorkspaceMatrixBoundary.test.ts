import { describe, expect, it } from 'vitest';

import { atlasWorkspaceMatrixHref } from './featuredTaxonNavigation';

describe('Atlas workspace → Relationship Matrix boundary', () => {
  it('carries only a canonical genus as Matrix read scope', () => {
    expect(atlasWorkspaceMatrixHref('Phalaenopsis')).toBe(
      '/relationship-matrix?genus=Phalaenopsis',
    );
  });

  it('fails closed for non-canonical or record-shaped values', () => {
    const invalid = [
      '',
      'phalaenopsis',
      'Phalaenopsis amabilis',
      'Phalaenopsis/amabilis',
      'Phalaenopsis?latitude=1',
      'Costa Rica',
    ];

    for (const value of invalid) {
      expect(() => atlasWorkspaceMatrixHref(value)).toThrow();
    }
  });

  it('does not create a route channel for Atlas evidence or locality state', () => {
    const href = atlasWorkspaceMatrixHref('Paphiopedilum');

    expect(href).toBe('/relationship-matrix?genus=Paphiopedilum');
    expect(href).not.toContain('latitude=');
    expect(href).not.toContain('longitude=');
    expect(href).not.toContain('locality=');
    expect(href).not.toContain('occurrence=');
    expect(href).not.toContain('evidence=');
    expect(href).not.toContain('confidence=');
    expect(href).not.toContain('conclusion=');
    expect(href).not.toContain('layer=');
  });
});
