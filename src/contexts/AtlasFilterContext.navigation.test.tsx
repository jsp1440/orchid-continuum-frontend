// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AtlasFilterProvider, useAtlasFilters } from './AtlasFilterContext';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const navigate = useNavigate();
  const { filters } = useAtlasFilters();
  return (
    <div>
      <button onClick={() => navigate('/atlas?genera=Vanilla')}>Current Atlas</button>
      <button onClick={() => navigate('/atlas-next?genera=Laelia')}>Atlas Next</button>
      <output>{((filters.genera as string[] | undefined) ?? []).join('|')}</output>
    </div>
  );
}

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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AtlasFilterProvider route handoff', () => {
  it('hydrates canonical genus context when navigation enters the current Atlas', async () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AtlasFilterProvider>
            <Probe />
          </AtlasFilterProvider>
        </MemoryRouter>,
      );
    });

    const button = container.querySelectorAll('button')[0] as HTMLButtonElement;
    act(() => button.click());
    await flush();

    expect(container.querySelector('output')?.textContent).toBe('Vanilla');
  });

  it('uses the same canonical genus context on Atlas Next', async () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AtlasFilterProvider>
            <Probe />
          </AtlasFilterProvider>
        </MemoryRouter>,
      );
    });

    const button = container.querySelectorAll('button')[1] as HTMLButtonElement;
    act(() => button.click());
    await flush();

    expect(container.querySelector('output')?.textContent).toBe('Laelia');
  });
});
