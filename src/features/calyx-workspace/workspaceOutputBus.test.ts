import { describe, expect, it, vi } from 'vitest';
import {
  CALYX_WORKSPACE_OUTPUT_EVENT,
  emitWorkspaceOutputs,
  validateWorkspaceOutput,
  type WorkspaceOutput,
} from './workspaceOutputBus';

const base = {
  id: 'output-1',
  title: 'Velamen annotation',
  provenance: { source_module: 'vision', evidence_status: 'derived' as const, generated: false },
  created_at: '2026-08-11T21:00:00Z',
};

describe('workspace output contract', () => {
  it('accepts annotated image outputs whose bounds remain inside the image', () => {
    const output: WorkspaceOutput = {
      ...base,
      kind: 'image',
      payload: {
        src: '/images/velamen.jpg',
        alt: 'Orchid root with velamen highlighted',
        annotations: [{ id: 'a1', label: 'velamen', x: 10, y: 15, width: 30, height: 25 }],
      },
    };
    expect(validateWorkspaceOutput(output)).toBe(output);
  });

  it('rejects annotations that escape the visual evidence boundary', () => {
    const output: WorkspaceOutput = {
      ...base,
      kind: 'diagram',
      payload: {
        src: '/diagram.svg',
        alt: 'Diagram',
        annotations: [{ id: 'a1', label: 'bad', x: 90, y: 10, width: 20, height: 20 }],
      },
    };
    expect(() => validateWorkspaceOutput(output)).toThrow(/bounds/);
  });

  it('requires provenance on every cross-module panel output', () => {
    const output = {
      ...base,
      kind: 'text',
      provenance: { source_module: '', evidence_status: 'unknown' },
      payload: { body: 'hello' },
    } as WorkspaceOutput;
    expect(() => validateWorkspaceOutput(output)).toThrow(/source_module/);
  });

  it('requires a valid evidence-status label and non-empty text body', () => {
    const invalidStatus = {
      ...base,
      kind: 'text',
      provenance: { source_module: 'matrix', evidence_status: 'verified' },
      payload: { body: 'hello' },
    } as unknown as WorkspaceOutput;
    const emptyText = {
      ...base,
      kind: 'text',
      payload: { body: '   ' },
    } as WorkspaceOutput;
    expect(() => validateWorkspaceOutput(invalidStatus)).toThrow(/evidence_status/);
    expect(() => validateWorkspaceOutput(emptyText)).toThrow(/body/);
  });

  it('accepts chart and matrix-style table outputs', () => {
    const chart: WorkspaceOutput = {
      ...base,
      id: 'chart-1',
      kind: 'chart',
      payload: { chart_type: 'bar', x_key: 'taxon', series: [{ key: 'score' }], data: [{ taxon: 'A', score: 0.8 }] },
    };
    const table: WorkspaceOutput = {
      ...base,
      id: 'table-1',
      kind: 'table',
      payload: { columns: [{ key: 'character', label: 'Character' }], rows: [{ character: 'velamen present' }] },
    };
    expect(validateWorkspaceOutput(chart)).toBe(chart);
    expect(validateWorkspaceOutput(table)).toBe(table);
  });

  it('batch ingestion withholds malformed auxiliary panels while emitting valid ones', () => {
    const listener = vi.fn();
    window.addEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, listener);
    const valid: WorkspaceOutput = {
      ...base,
      id: 'matrix-ranking',
      kind: 'table',
      provenance: { source_module: 'matrix-identification', evidence_status: 'derived', generated: true },
      payload: { columns: [{ key: 'rank', label: 'Rank' }], rows: [{ rank: 1 }] },
    };
    const malformed = { id: 'bad', kind: 'table' };

    expect(emitWorkspaceOutputs([malformed, valid])).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, listener);
  });
});
