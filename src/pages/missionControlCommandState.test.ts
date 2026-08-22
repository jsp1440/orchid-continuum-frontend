import { describe, expect, it } from 'vitest';
import { commandStateOf } from './MissionControl';

/**
 * The Calyx operations queue renders either live backend items or a static
 * fallback, and only the backend branch carries `commandState`.
 *
 * `'commandState' in item` looks like the way to tell them apart, but on a
 * union whose other member lacks the key TypeScript narrows that member to
 * `... & Record<'commandState', unknown>` — so the property read as `unknown`
 * and could not be rendered. These pin the runtime behaviour that replaced it.
 */
describe('commandStateOf', () => {
  it('returns the state a live backend item supplies', () => {
    expect(commandStateOf({ id: 'q1', commandState: 'Waiting Owner' })).toBe('Waiting Owner');
  });

  it('returns null for a fallback item that has no command state', () => {
    expect(commandStateOf({ id: 'q2', lane: 'Queued', title: 'x' })).toBeNull();
  });

  it('refuses a non-string command state rather than rendering it', () => {
    // The failure this replaced: an unknown value reaching JSX.
    expect(commandStateOf({ commandState: 42 })).toBeNull();
    expect(commandStateOf({ commandState: { label: 'nope' } })).toBeNull();
    expect(commandStateOf({ commandState: null })).toBeNull();
  });

  it('treats a blank state as absent', () => {
    expect(commandStateOf({ commandState: '   ' })).toBeNull();
  });

  it('survives non-object inputs', () => {
    expect(commandStateOf(null)).toBeNull();
    expect(commandStateOf(undefined)).toBeNull();
    expect(commandStateOf('Waiting Owner')).toBeNull();
  });
});
