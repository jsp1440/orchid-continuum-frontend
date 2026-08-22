// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import JudgingPractice from './JudgingPractice';

/**
 * The recovered judging sheet, rendered.
 *
 * The salvage question was never "does the arithmetic work" — it was whether
 * the tool can be honest about what it is. The retired application it came
 * from produced GPT-4o scores and recorded them as suggested award levels.
 * This page must say plainly, on screen, that it does nothing of the kind.
 */

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <JudgingPractice />
      </MemoryRouter>,
    );
  });
}

const text = () => container.textContent ?? '';

function inputs(): HTMLInputElement[] {
  return [...container.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
}

/** Enter a score the way a person would, through the real input. */
async function enter(index: number, value: string) {
  const input = inputs()[index];
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe('judging practice sheet', () => {
  it('renders every criterion of the default rubric', async () => {
    await mount();
    // AOS flower has six criteria.
    expect(inputs()).toHaveLength(6);
    expect(text()).toContain('Form');
    expect(text()).toContain('Floriferousness');
  });

  it('states that the rubric is not a current standard', async () => {
    await mount();
    expect(text()).toMatch(/not a statement of current requirements/i);
    expect(text()).toMatch(/not a real award/i);
  });

  it('does not present a completed sheet as an award', async () => {
    await mount();
    // A perfect AOS flower sheet — the strongest possible result.
    for (const [index, value] of ['30', '15', '15', '10', '15', '15'].entries()) {
      await enter(index, value);
    }

    expect(text()).toContain('100 of 100 points');
    expect(text()).toMatch(/reaches the First Class Certificate band/i);
    // The line that keeps a band from reading as a conferred award.
    expect(text()).toMatch(/not an award, not a prediction of one/i);
    expect(text()).toMatch(/nothing here is saved or submitted/i);
  });

  it('withholds a band until the sheet is complete', async () => {
    await mount();
    // 85 points entered, one criterion blank. Already past the FCC threshold.
    for (const [index, value] of ['30', '15', '15', '10', '15'].entries()) {
      await enter(index, value);
    }

    expect(text()).toContain('85 of 100 points');
    expect(text()).toMatch(/not yet scored/i);
    expect(text()).not.toMatch(/reaches the/i);
  });

  it('shows the recognitions a score cannot decide', async () => {
    await mount();
    // The legacy bug awarded CBR to any total. It is listed as what it is.
    expect(text()).toContain('CBR');
    expect(text()).toMatch(/not decided by a point total/i);
  });

  it('never claims to have assessed a plant', async () => {
    await mount();
    const rendered = text();
    expect(rendered).toMatch(/you enter every score yourself/i);
    expect(rendered).not.toMatch(/AI (analysis|judging|score)/i);
    expect(rendered).not.toMatch(/award (granted|conferred|issued)/i);
  });
});
