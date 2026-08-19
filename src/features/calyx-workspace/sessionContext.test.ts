import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calyxContextPacket,
  clearCalyxSessionContext,
  readCalyxSessionContext,
  recordCalyxSurfaceContext,
} from './sessionContext';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class RejectingStorage extends MemoryStorage {
  override setItem() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }
}

describe('Calyx session context', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: new MemoryStorage() },
    });
  });

  afterEach(() => {
    clearCalyxSessionContext();
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('tracks the current lexicon concept and a bounded cross-page trail', () => {
    recordCalyxSurfaceContext({ surface: 'lexicon-entry', module: 'lexicon', object_type: 'lexicon_concept', object_id: 'velamen', label: 'Velamen' });
    recordCalyxSurfaceContext({ surface: 'lexicon-entry', module: 'lexicon', object_type: 'lexicon_concept', object_id: 'pollinium', label: 'Pollinium' });

    const state = readCalyxSessionContext();
    expect(state.current?.object_id).toBe('pollinium');
    expect(state.trail.map((item) => item.object_id)).toEqual(['velamen', 'pollinium']);
  });

  it('updates a repeated surface instead of inflating the session trail', () => {
    recordCalyxSurfaceContext({ surface: 'lexicon-entry', module: 'lexicon', object_id: 'velamen', label: 'Velamen', observed_at: '2026-08-11T20:00:00Z' });
    recordCalyxSurfaceContext({ surface: 'lexicon-entry', module: 'lexicon', object_id: 'velamen', label: 'Velamen', observed_at: '2026-08-11T20:01:00Z' });

    const state = readCalyxSessionContext();
    expect(state.trail).toHaveLength(1);
    expect(state.trail[0].observed_at).toBe('2026-08-11T20:01:00Z');
  });

  it('marks interface context as non-evidence in every Calyx packet', () => {
    recordCalyxSurfaceContext({ surface: 'lexicon-entry', module: 'lexicon', object_id: 'velamen', label: 'Velamen' });
    const packet = calyxContextPacket({ concept: 'velamen' });

    expect(packet.concept).toBe('velamen');
    expect(packet.context_is_evidence).toBe(false);
    expect(packet.context_purpose).toContain('reference resolution');
    expect((packet.current_surface as { object_id: string }).object_id).toBe('velamen');
  });

  it('does not crash the workspace when session storage rejects a context write', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: new RejectingStorage() },
    });

    expect(() => recordCalyxSurfaceContext({
      surface: 'matrix-identification',
      module: 'matrix-identification',
      object_id: 'velamen',
      label: 'Velamen',
    })).not.toThrow();
    expect(readCalyxSessionContext()).toEqual({ current: null, trail: [] });
  });
});
