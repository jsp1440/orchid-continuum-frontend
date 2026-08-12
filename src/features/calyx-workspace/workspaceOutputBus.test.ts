import { describe, expect, it } from 'vitest';
import {
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

  it('rejects malformed or out-of-bounds annotations before dispatch', () => {
    const outOfBounds: WorkspaceOutput = {
      ...base,
      kind: 'diagram',
      payload: {
        src: '/diagram.svg',
        alt: 'Diagram',
        annotations: [{ id: 'a1', label: 'bad', x: 90, y: 10, width: 20, height: 20 }],
      },
    };
    const malformed = {
      ...base,
      kind: 'image',
      payload: { src: '/image.jpg', alt: 'Image', annotations: [null] },
    };
    expect(() => validateWorkspaceOutput(outOfBounds)).toThrow(/bounds/);
    expect(() => validateWorkspaceOutput(malformed)).toThrow(/objects/);
  });

  it('requires supported kind, provenance, evidence status, and created_at', () => {
    const invalidKind = { ...base, kind: 'video', payload: { body: 'hello' } };
    const invalidProvenance = {
      ...base,
      kind: 'text',
      provenance: { source_module: '', evidence_status: 'unknown' },
      payload: { body: 'hello' },
    };
    const invalidStatus = {
      ...base,
      kind: 'text',
      provenance: { source_module: 'matrix', evidence_status: 'verified' },
      payload: { body: 'hello' },
    };
    const missingCreatedAt = { ...base, created_at: '', kind: 'text', payload: { body: 'hello' } };

    expect(() => validateWorkspaceOutput(invalidKind)).toThrow(/kind/);
    expect(() => validateWorkspaceOutput(invalidProvenance)).toThrow(/source_module/);
    expect(() => validateWorkspaceOutput(invalidStatus)).toThrow(/evidence_status/);
    expect(() => validateWorkspaceOutput(missingCreatedAt)).toThrow(/created_at/);
  });

  it('deeply validates table columns but permits hidden row metadata outside displayed columns', () => {
    const malformedColumns = {
      ...base,
      kind: 'table',
      payload: { columns: [null], rows: [{ rank: 1 }] },
    };
    const hiddenCitationMetadata: WorkspaceOutput = {
      ...base,
      id: 'retrieval-1',
      kind: 'table',
      provenance: { source_module: 'evidence-retrieval', evidence_status: 'unknown', generated: false },
      payload: {
        columns: [{ key: 'title', label: 'Source' }],
        rows: [{ title: 'Velamen study', citation: { revision_id: 9 } }],
      },
    };

    expect(() => validateWorkspaceOutput(malformedColumns)).toThrow(/columns/);
    expect(validateWorkspaceOutput(hiddenCitationMetadata)).toBe(hiddenCitationMetadata);
  });

  it('deeply validates chart series and referenced data values', () => {
    const chart: WorkspaceOutput = {
      ...base,
      id: 'chart-1',
      kind: 'chart',
      payload: { chart_type: 'bar', x_key: 'taxon', series: [{ key: 'score' }], data: [{ taxon: 'A', score: 0.8 }] },
    };
    const badSeries = {
      ...base,
      id: 'bad-series',
      kind: 'chart',
      payload: { chart_type: 'bar', x_key: 'taxon', series: [null], data: [] },
    };
    const badCell = {
      ...base,
      id: 'bad-cell',
      kind: 'chart',
      payload: { chart_type: 'line', x_key: 'taxon', series: [{ key: 'score' }], data: [{ taxon: 'A', score: { value: 1 } }] },
    };

    expect(validateWorkspaceOutput(chart)).toBe(chart);
    expect(() => validateWorkspaceOutput(badSeries)).toThrow(/series/);
    expect(() => validateWorkspaceOutput(badCell)).toThrow(/score/);
  });

  it('batch ingestion withholds malformed auxiliary panels while accepting valid ones', () => {
    const valid: WorkspaceOutput = {
      ...base,
      id: 'matrix-ranking',
      kind: 'table',
      provenance: { source_module: 'matrix-identification', evidence_status: 'derived', generated: true },
      payload: { columns: [{ key: 'rank', label: 'Rank' }], rows: [{ rank: 1 }] },
    };
    const malformed = { ...base, id: 'bad', kind: 'table', payload: { columns: [null], rows: [] } };

    expect(emitWorkspaceOutputs([malformed, valid])).toBe(1);
    expect(emitWorkspaceOutputs(undefined)).toBe(0);
  });
});
