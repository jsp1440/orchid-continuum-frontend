// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFieldObservation, queueFieldObservation } from '@/lib/fieldJournal';
import { FieldJournalSyncError } from '@/lib/fieldJournalSync';

/**
 * A sync rejected for a missing owner session must offer the owner sign-in
 * inside the Field Journal: installed on the Home Screen, /field has no
 * address bar or navigation to reach Mission Control. Other failures must not.
 */

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner-1' }, offlineUser: null }),
}));
vi.mock('@/lib/fieldJournalStore', () => ({
  listFieldObservations: vi.fn(async () => [observation]),
  saveFieldObservation: vi.fn(async () => undefined),
}));
vi.mock('@/lib/fieldJournalCoordinator', () => ({
  discardSavedFieldObservation: vi.fn(),
  editSavedFieldObservation: vi.fn(),
  recoverSavedFieldObservation: vi.fn(async (row: unknown) => row),
  restoreFieldObservationFromBackup: vi.fn(),
  syncSavedFieldObservation: mocks.sync,
}));
vi.mock('@/lib/fieldJournalDevice', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fieldJournalDevice')>('@/lib/fieldJournalDevice');
  return { ...actual, readFieldStorageStatus: vi.fn(async () => null) };
});
vi.mock('@/lib/fieldJournalShell', () => ({ registerFieldJournalShell: () => null }));
vi.mock('@/lib/ownerOperationsConsole', () => ({ createOwnerSession: vi.fn(async () => ({})) }));

const NOW = '2026-10-17T12:00:00.000Z';
const observation = queueFieldObservation(
  createFieldObservation(
    { accountId: 'owner-1', note: 'Flower open beside the trail.', localityVisibility: 'private', media: [] },
    { id: 'draft-1', now: NOW },
  ),
);

import CalyxField from './CalyxField';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.sync.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAndSyncAll() {
  await act(async () => { root.render(<CalyxField />); });
  await act(async () => { await Promise.resolve(); });
  const syncAll = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Sync all'))!;
  await act(async () => { syncAll.click(); });
  await act(async () => { await Promise.resolve(); });
}

const signInShown = () => container.querySelector('#field-sync-owner-access-code') !== null;

describe('CalyxField owner sign-in for sync', () => {
  it('offers the owner sign-in when the backend rejects the session', async () => {
    mocks.sync.mockRejectedValue(new FieldJournalSyncError('The field backend rejected the session.', 401, 'OBSERVATION_REJECTED'));
    await renderAndSyncAll();
    expect(mocks.sync).toHaveBeenCalled();
    expect(signInShown()).toBe(true);
  });

  it('does not offer it for other sync failures', async () => {
    mocks.sync.mockRejectedValue(new FieldJournalSyncError('The sync request timed out.', null, 'REQUEST_TIMEOUT'));
    await renderAndSyncAll();
    expect(mocks.sync).toHaveBeenCalled();
    expect(signInShown()).toBe(false);
  });
});
