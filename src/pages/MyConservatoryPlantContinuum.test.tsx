// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlantSpeciesContinuum } from './MyConservatory';

/**
 * Regression coverage for the Conservatory plant -> public Continuum handoff.
 *
 * The grower's private plant data (accession, location, readings, notes, QR)
 * must never cross into the public species continuation; only the accepted
 * species identity travels, as non-evidentiary navigational context, and the
 * action fails closed when no bounded canonical binomial is available.
 */

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

type PlantLike = {
  id: string;
  accession_number: string;
  display_name: string;
  accepted_scientific_name?: string | null;
  location?: string | null;
  notes?: string | null;
  qr_identifier: string;
  created_at: string;
  updated_at: string;
};

function plant(overrides: Partial<PlantLike> = {}): PlantLike {
  return {
    id: 'plant-1',
    accession_number: 'OC-2026-0001',
    display_name: 'My windowsill cattleya',
    accepted_scientific_name: 'Cattleya labiata',
    location: 'Greenhouse bench 2',
    notes: 'Repotted last spring; home windowsill.',
    qr_identifier: 'qr-private-identifier-abc123',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function render(p: PlantLike) {
  act(() =>
    root.render(
      <MemoryRouter>
        {/* cast: the test fixture matches the runtime Plant shape */}
        <PlantSpeciesContinuum plant={p as never} />
      </MemoryRouter>,
    ),
  );
}

function hrefs(): string[] {
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') || '');
}

describe('Conservatory plant -> Continuum species handoff', () => {
  it('offers governed Atlas / Research / Calyx actions for a plant with a bounded species', () => {
    render(plant());
    expect(container.querySelector('[data-testid="plant-species-continuum"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="plant-continuum-atlas"]')?.getAttribute('href')).toBe(
      '/atlas?species=Cattleya+labiata',
    );
    const calyx = container.querySelector('[data-testid="plant-continuum-calyx"]')?.getAttribute('href') ?? '';
    const research = container.querySelector('[data-testid="plant-continuum-research"]')?.getAttribute('href') ?? '';
    // The species identity travels, marked non-evidentiary.
    expect(calyx).toContain('genus=Cattleya');
    expect(calyx).toContain('context_is_evidence=false');
    expect(research).toContain('context_is_evidence=false');
  });

  it('never leaks the grower’s private plant data into any destination', () => {
    render(plant());
    const all = hrefs().join(' ');
    for (const secret of [
      'OC-2026-0001', // accession
      'Greenhouse', // location
      'bench', // location
      'windowsill', // display name / notes
      'Repotted', // notes
      'qr-private-identifier', // QR identity
      'plant-1', // internal id
    ]) {
      expect(all).not.toContain(secret);
    }
  });

  it('fails closed when the plant has no accepted scientific name', () => {
    render(plant({ accepted_scientific_name: null }));
    expect(container.querySelector('[data-testid="plant-species-continuum"]')).toBeNull();
    expect(hrefs()).toHaveLength(0);
  });

  it('fails closed on a non-binomial label rather than widening it', () => {
    render(plant({ accepted_scientific_name: 'Cattleya' }));
    expect(container.querySelector('[data-testid="plant-species-continuum"]')).toBeNull();
    render(plant({ accepted_scientific_name: 'Cattleya Bow Bells' }));
    expect(container.querySelector('[data-testid="plant-species-continuum"]')).toBeNull();
  });
});
