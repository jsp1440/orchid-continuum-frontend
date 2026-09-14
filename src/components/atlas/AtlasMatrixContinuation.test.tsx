// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import AtlasMatrixContinuation, { matrixHrefForSingleGenus } from './AtlasMatrixContinuation';

// This repository renders components with react-dom/client createRoot under the
// jsdom environment rather than @testing-library/react (which is not a
// dependency here — see ConservatoryReadiness.test.tsx and
// SecurityTrustCenter.render.test.tsx for the same pattern).
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderContinuation(genera?: string[]): void {
  act(() => {
    root.render(
      <MemoryRouter>
        <AtlasMatrixContinuation genera={genera} />
      </MemoryRouter>,
    );
  });
}

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
    renderContinuation(['Paphiopedilum']);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Inspect Paphiopedilum relationships');

    const href = link?.getAttribute('href') ?? '';
    expect(href).toBe('/relationship-matrix?genus=Paphiopedilum');
    for (const forbidden of [
      'latitude=',
      'longitude=',
      'locality=',
      'occurrence=',
      'layer=',
      'evidence=',
      'confidence=',
      'conclusion=',
    ]) {
      expect(href).not.toContain(forbidden);
    }

    expect(container.textContent).toContain('Matrix read scope only');
  });

  it('renders no continuation for ambiguous multi-genus Atlas state', () => {
    renderContinuation(['Phalaenopsis', 'Paphiopedilum']);

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
