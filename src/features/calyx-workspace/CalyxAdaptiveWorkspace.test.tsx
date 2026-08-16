// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LexiconEntry } from '@/data/types';
import { CalyxAdaptiveWorkspace } from './CalyxAdaptiveWorkspace';
import { clearWorkspaceOutputsBySource, emitWorkspaceOutput } from './workspaceOutputBus';

function entry(slug: string): LexiconEntry {
  return { id: `id-${slug}`, slug, preferred_term: slug, source_system: 'test' } as LexiconEntry;
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

function emit(id: string, sourceModule: string) {
  emitWorkspaceOutput({
    id,
    kind: 'text',
    title: id,
    provenance: { source_module: sourceModule, evidence_status: 'derived' },
    payload: { body: 'content' },
    created_at: new Date().toISOString(),
  });
}

describe('CalyxAdaptiveWorkspace stale-panel prevention', () => {
  it('clears previously opened outputs when the lexicon entry changes', () => {
    act(() => {
      root.render(<CalyxAdaptiveWorkspace entry={entry('resupination')}>content</CalyxAdaptiveWorkspace>);
    });
    act(() => emit('panel-1', 'matrix-identification'));
    expect(container.textContent).toContain('panel-1');

    act(() => {
      root.render(<CalyxAdaptiveWorkspace entry={entry('pollinium')}>content</CalyxAdaptiveWorkspace>);
    });
    expect(container.textContent).not.toContain('panel-1');
  });

  it('removes only the outputs from a source module that explicitly clears itself', () => {
    act(() => {
      root.render(<CalyxAdaptiveWorkspace entry={entry('resupination')}>content</CalyxAdaptiveWorkspace>);
    });
    act(() => {
      emit('from-vision', 'vision');
      emit('from-matrix', 'matrix-identification');
    });
    expect(container.textContent).toContain('from-vision');
    expect(container.textContent).toContain('from-matrix');

    act(() => clearWorkspaceOutputsBySource('matrix-identification'));

    expect(container.textContent).toContain('from-vision');
    expect(container.textContent).not.toContain('from-matrix');
  });
});
