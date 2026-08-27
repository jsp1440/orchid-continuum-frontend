import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import AtlasMatrixContinuation, { matrixHrefForSingleGenus } from './AtlasMatrixContinuation';

describe('AtlasMatrixContinuation', () => {
  it('creates a Matrix handoff only for exactly one canonical genus', () => {
    expect(matrixHrefForSingleGenus(['Phalaenopsis'])).toBe('/relationship-matrix?genus=Phalaenopsis');
    expect(matrixHrefForSingleGenus(undefined)).toBeNull();
    expect(matrixHrefForSingleGenus([])).toBeNull();
    expect(matrixHrefForSingleGenus(['Phalaenopsis', 'Paphiopedilum'])).toBeNull();
    expect(matrixHrefForSingleGenus(['phalaenopsis'])).toBeNull();
    expect(matrixHrefForSingleGenus(['Phalaenopsis amabilis'])).toBeNull();
  });

  it('renders only genus read scope and no Atlas locality/evidence state', () => {
    render(
      <MemoryRouter>
        <AtlasMatrixContinuation genera={['Paphiopedilum']} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /Inspect Paphiopedilum relationships/i });
    expect(link).toHaveAttribute('href', '/relationship-matrix?genus=Paphiopedilum');
    expect(link.getAttribute('href')).not.toContain('latitude=');
    expect(link.getAttribute('href')).not.toContain('longitude=');
    expect(link.getAttribute('href')).not.toContain('locality=');
    expect(link.getAttribute('href')).not.toContain('occurrence=');
    expect(link.getAttribute('href')).not.toContain('layer=');
    expect(link.getAttribute('href')).not.toContain('evidence=');
    expect(link.getAttribute('href')).not.toContain('confidence=');
    expect(link.getAttribute('href')).not.toContain('conclusion=');
    expect(screen.getByText(/Matrix read scope only/i)).toBeInTheDocument();
  });

  it('renders no continuation for ambiguous multi-genus Atlas state', () => {
    const { container } = render(
      <MemoryRouter>
        <AtlasMatrixContinuation genera={['Phalaenopsis', 'Paphiopedilum']} />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
