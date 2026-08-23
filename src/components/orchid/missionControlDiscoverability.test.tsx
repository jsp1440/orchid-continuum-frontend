// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The owner must be able to find Mission Control, and finding it must not be
 * the same as being allowed in.
 *
 * The regression this guards: Mission Control stayed mounted at
 * /mission-control the whole time, and every navigation surface stopped
 * mentioning it. The capability was intact and the owner could not reach it
 * without remembering a URL — a dead end produced by absence rather than by a
 * broken link, which is why no existing test caught it.
 *
 * The opposite failure is worse. Putting an operator console into the public
 * product navigation would advertise it to every visitor, and a link that
 * carried authorization with it would be a security defect rather than a
 * usability fix. So the entry lives in the signed-in account menu, and Mission
 * Control keeps its own owner-session gate on the other side.
 */

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

import Navbar from './Navbar';

const SIGNED_IN = {
  user: { email: 'owner@example.com', user_metadata: { full_name: 'Owner' } },
  session: { access_token: 'token' },
  loading: false,
  signOut: vi.fn(),
};

const SIGNED_OUT = { user: null, session: null, loading: false, signOut: vi.fn() };

let container: HTMLDivElement;
let root: Root;

async function mount(auth: unknown) {
  mocks.useAuth.mockReturnValue(auth);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );
  });
}

/** Open the signed-in account dropdown the way a person would. */
async function openAccountMenu() {
  const trigger = [...container.querySelectorAll('button')].find((button) =>
    button.querySelector('span')?.textContent?.startsWith('O'),
  );
  if (!trigger) throw new Error('account menu trigger not found');
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const entry = () => container.querySelector('[data-testid="account-mission-control"]');
const text = () => container.textContent ?? '';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe('mission control is discoverable to a signed-in owner', () => {
  it('offers Mission Control in the account menu', async () => {
    await mount(SIGNED_IN);
    // Not visible until the menu is opened — this is the closed state.
    expect(entry()).toBeNull();

    await openAccountMenu();
    expect(entry()).not.toBeNull();
    expect(entry()!.textContent).toMatch(/mission control/i);
  });

  it('says access is gated rather than implying the link grants it', async () => {
    await mount(SIGNED_IN);
    await openAccountMenu();
    expect(text()).toMatch(/owner access required/i);
  });

  it('reaches Mission Control in two interactions from any page', async () => {
    // The acceptance target is "found in under 30 seconds without typing a
    // hidden route". Two clicks from the persistent navbar is the mechanical
    // form of that.
    await mount(SIGNED_IN);
    await openAccountMenu();
    const button = entry() as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
  });
});

describe('discoverability is not authorization', () => {
  it('shows nothing to a signed-out visitor', async () => {
    await mount(SIGNED_OUT);
    expect(entry()).toBeNull();
    expect(text()).not.toMatch(/mission control/i);

    // The menu that holds it must not exist at all, not merely be closed —
    // otherwise rendering the dropdown for everyone would still pass.
    const accountTrigger = [...container.querySelectorAll('button')].find((button) =>
      button.querySelector('span.rounded-full'),
    );
    expect(accountTrigger).toBeUndefined();
    expect(text()).toMatch(/sign in/i);
  });

  it('keeps the operator console out of the public product navigation', () => {
    // A visitor browsing the site must not be advertised an operator surface.
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/orchid/Navbar.tsx'),
      'utf8',
    );
    const primary = source.slice(source.indexOf('const PRIMARY'), source.indexOf('const MORE_GROUPS'));
    const groups = source.slice(source.indexOf('const MORE_GROUPS'), source.indexOf('const ALL_SECONDARY'));
    expect(primary).not.toContain('mission-control');
    expect(groups).not.toContain('mission-control');

    const footer = readFileSync(resolve(process.cwd(), 'src/components/orchid/Footer.tsx'), 'utf8');
    expect(footer).not.toContain('mission-control');
  });

  it('leaves the owner-session gate in place behind the link', () => {
    // The link navigates; it does not authenticate. Mission Control still
    // holds its own owner session, so a signed-in non-owner following the
    // entry meets the gate rather than the console.
    const missionControl = readFileSync(
      resolve(process.cwd(), 'src/pages/MissionControl.tsx'),
      'utf8',
    );
    expect(missionControl).toContain('validateOwnerSession');
    expect(missionControl).toContain('oc_mission_control_owner_access_v1');

    // And the navbar grants nothing: it only navigates.
    const navbar = readFileSync(resolve(process.cwd(), 'src/components/orchid/Navbar.tsx'), 'utf8');
    const missionEntry = navbar.slice(
      navbar.indexOf('account-mission-control'),
      navbar.indexOf('account-mission-control') + 400,
    );
    expect(missionEntry).not.toMatch(/createOwnerSession|setOwner|grant|token/i);
  });
});
