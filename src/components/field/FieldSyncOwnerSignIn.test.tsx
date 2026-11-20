// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldSyncOwnerSignIn from './FieldSyncOwnerSignIn';
import { isOwnerSessionRejection } from '@/lib/fieldJournalOwnerSession';
import { FieldJournalSyncError } from '@/lib/fieldJournalSync';

/**
 * Installed on the iPad Home Screen, /field has no address bar and no
 * navigation, so a sync rejected for a missing owner session had no way to
 * reach the Mission Control sign-in. The Field Journal offers it in place.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function input() {
  return container.querySelector<HTMLInputElement>('#field-sync-owner-access-code')!;
}

async function typeAndSubmit(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

describe('isOwnerSessionRejection', () => {
  it('recognises only 401/403 sync rejections', () => {
    expect(isOwnerSessionRejection(new FieldJournalSyncError('no', 401, 'OBSERVATION_REJECTED'))).toBe(true);
    expect(isOwnerSessionRejection(new FieldJournalSyncError('no', 403, 'MEDIA_REJECTED'))).toBe(true);
    expect(isOwnerSessionRejection(new FieldJournalSyncError('bad', 422, 'OBSERVATION_REJECTED'))).toBe(false);
    expect(isOwnerSessionRejection(new FieldJournalSyncError('offline', null, 'OFFLINE'))).toBe(false);
    expect(isOwnerSessionRejection(new Error('boom'))).toBe(false);
    expect(isOwnerSessionRejection(null)).toBe(false);
  });
});

describe('FieldSyncOwnerSignIn', () => {
  it('signs in with the entered access code, clears it, and reports success', async () => {
    const signIn = vi.fn(async () => ({}));
    const onSignedIn = vi.fn();
    await act(async () => { root.render(<FieldSyncOwnerSignIn signIn={signIn} onSignedIn={onSignedIn} />); });
    expect(input().type).toBe('password');

    await typeAndSubmit('secret-code');

    expect(signIn).toHaveBeenCalledWith('secret-code');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('');
  });

  it('shows the failure, clears the code, and does not report success', async () => {
    const signIn = vi.fn(async () => { throw new Error('Calyx backend 401: Invalid owner access code'); });
    const onSignedIn = vi.fn();
    await act(async () => { root.render(<FieldSyncOwnerSignIn signIn={signIn} onSignedIn={onSignedIn} />); });

    await typeAndSubmit('wrong');

    expect(onSignedIn).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Invalid owner access code');
    expect(input().value).toBe('');
    expect(container.textContent).not.toContain('wrong');
  });

  it('does not call sign-in for an empty code', async () => {
    const signIn = vi.fn(async () => ({}));
    await act(async () => { root.render(<FieldSyncOwnerSignIn signIn={signIn} onSignedIn={() => {}} />); });
    await typeAndSubmit('   ');
    expect(signIn).not.toHaveBeenCalled();
  });
});
