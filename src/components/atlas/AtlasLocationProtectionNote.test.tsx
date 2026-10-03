// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import AtlasLocationProtectionNote from './AtlasLocationProtectionNote';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const note = () => container.querySelector('[data-testid="atlas-location-protection-note"]');

describe('AtlasLocationProtectionNote', () => {
  it('states source-side protection when records came from the protected view', () => {
    act(() => root.render(<AtlasLocationProtectionNote source="protected-view" />));
    expect(note()?.getAttribute('role')).toBe('note');
    expect(note()?.textContent).toMatch(/Precise locations protected/);
    expect(note()?.textContent).toMatch(/generalised at the source/);
  });

  it('is still visible on the legacy path, without claiming source protection', () => {
    act(() => root.render(<AtlasLocationProtectionNote source="legacy-table" />));
    expect(note()?.textContent).toMatch(/Locations generalised/);
    expect(note()?.textContent).not.toMatch(/at the source/);
  });
});
