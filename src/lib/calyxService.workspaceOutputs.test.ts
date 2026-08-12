import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitWorkspaceOutput = vi.fn();

vi.mock('@/features/calyx-workspace/workspaceOutputBus', () => ({
  emitWorkspaceOutput,
}));

import { emitServerWorkspaceOutputs } from './calyxService';

describe('Calyx server workspace output bridge', () => {
  beforeEach(() => emitWorkspaceOutput.mockReset());

  it('emits every server-returned grounded output through the shared workspace bus', () => {
    const outputs = [
      {
        id: 'retrieval-1',
        kind: 'table',
        title: 'Retrieved Orchid Continuum objects',
        provenance: { source_module: 'evidence-retrieval', evidence_status: 'unknown', generated: false },
        payload: { columns: [{ key: 'title', label: 'Source' }], rows: [{ title: 'Velamen study' }] },
        created_at: '2026-08-11T21:30:00Z',
      },
      {
        id: 'gaps-1',
        kind: 'text',
        title: 'Evidence gaps',
        provenance: { source_module: 'brain-mission', evidence_status: 'derived', generated: true },
        payload: { body: 'Missing replicated comparative measurements.' },
        created_at: '2026-08-11T21:30:01Z',
      },
    ];

    expect(emitServerWorkspaceOutputs(outputs)).toBe(2);
    expect(emitWorkspaceOutput).toHaveBeenNthCalledWith(1, outputs[0]);
    expect(emitWorkspaceOutput).toHaveBeenNthCalledWith(2, outputs[1]);
  });

  it('does not create panels when the server returns no output array', () => {
    expect(emitServerWorkspaceOutputs(undefined)).toBe(0);
    expect(emitServerWorkspaceOutputs({})).toBe(0);
    expect(emitWorkspaceOutput).not.toHaveBeenCalled();
  });

  it('withholds a malformed panel without breaking later valid panels or chat', () => {
    emitWorkspaceOutput.mockImplementation((output: { id?: string }) => {
      if (output.id === 'bad') throw new Error('invalid workspace output');
    });

    const malformed = { id: 'bad', kind: 'table' };
    const valid = {
      id: 'good',
      kind: 'text',
      title: 'Evidence gaps',
      provenance: { source_module: 'brain-mission', evidence_status: 'derived', generated: true },
      payload: { body: 'A bounded uncertainty statement.' },
      created_at: '2026-08-11T21:31:00Z',
    };

    expect(() => emitServerWorkspaceOutputs([malformed, valid])).not.toThrow();
    expect(emitServerWorkspaceOutputs([malformed, valid])).toBe(1);
  });
});
