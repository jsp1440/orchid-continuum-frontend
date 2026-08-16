export type WorkspaceOutputKind = 'image' | 'diagram' | 'chart' | 'table' | 'text';

export interface WorkspaceOutputProvenance {
  source_module: string;
  source_id?: string;
  generated?: boolean;
  evidence_status: 'evidence' | 'derived' | 'illustrative' | 'unknown';
}

export interface WorkspaceAnnotation {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkspaceImagePayload {
  src: string;
  alt: string;
  caption?: string;
  annotations?: WorkspaceAnnotation[];
}

export interface WorkspaceChartPayload {
  chart_type: 'bar' | 'line';
  x_key: string;
  series: Array<{ key: string; label?: string }>;
  data: Array<Record<string, string | number>>;
}

export interface WorkspaceTablePayload {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}

export interface WorkspaceTextPayload {
  body: string;
}

export type WorkspaceOutputPayload = WorkspaceImagePayload | WorkspaceChartPayload | WorkspaceTablePayload | WorkspaceTextPayload;

export interface WorkspaceOutput {
  id: string;
  kind: WorkspaceOutputKind;
  title: string;
  subtitle?: string;
  provenance: WorkspaceOutputProvenance;
  payload: WorkspaceOutputPayload;
  created_at: string;
}

export const CALYX_WORKSPACE_OUTPUT_EVENT = 'oc:calyx-workspace-output';
export const CALYX_WORKSPACE_OUTPUT_CLEAR_EVENT = 'oc:calyx-workspace-output-clear';

const OUTPUT_KINDS = new Set<WorkspaceOutputKind>(['image', 'diagram', 'chart', 'table', 'text']);
const EVIDENCE_STATES = new Set(['evidence', 'derived', 'illustrative', 'unknown']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

function optionalString(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== 'string') throw new Error(`${name} must be a string`);
}

function assertPercent(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${name} must be between 0 and 100`);
  }
}

function validateAnnotation(value: unknown): void {
  if (!isRecord(value)) throw new Error('annotations must contain objects');
  requiredString(value.id, 'annotation.id');
  requiredString(value.label, 'annotation.label');
  assertPercent(value.x, 'annotation.x');
  assertPercent(value.y, 'annotation.y');
  assertPercent(value.width, 'annotation.width');
  assertPercent(value.height, 'annotation.height');
  if ((value.x as number) + (value.width as number) > 100 || (value.y as number) + (value.height as number) > 100) {
    throw new Error('annotation bounds must stay within image');
  }
}

function validateImagePayload(value: unknown): void {
  if (!isRecord(value)) throw new Error('image outputs require an object payload');
  requiredString(value.src, 'image src');
  requiredString(value.alt, 'image alt');
  optionalString(value.caption, 'image caption');
  if (value.annotations !== undefined) {
    if (!Array.isArray(value.annotations)) throw new Error('image annotations must be an array');
    value.annotations.forEach(validateAnnotation);
  }
}

function validateChartPayload(value: unknown): void {
  if (!isRecord(value)) throw new Error('chart outputs require an object payload');
  if (value.chart_type !== 'bar' && value.chart_type !== 'line') {
    throw new Error('chart_type must be bar or line');
  }
  const xKey = requiredString(value.x_key, 'chart x_key');
  if (!Array.isArray(value.series) || !value.series.length) throw new Error('chart outputs require series');
  const seriesKeys: string[] = [];
  value.series.forEach((series, index) => {
    if (!isRecord(series)) throw new Error('chart series entries must be objects');
    seriesKeys.push(requiredString(series.key, `chart series[${index}].key`));
    optionalString(series.label, `chart series[${index}].label`);
  });
  if (!Array.isArray(value.data)) throw new Error('chart outputs require data');
  value.data.forEach((row, index) => {
    if (!isRecord(row)) throw new Error(`chart data[${index}] must be an object`);
    for (const key of [xKey, ...seriesKeys]) {
      const cell = row[key];
      if (cell !== undefined && typeof cell !== 'string' && typeof cell !== 'number') {
        throw new Error(`chart data[${index}].${key} must be a string or number`);
      }
    }
  });
}

function validateTablePayload(value: unknown): void {
  if (!isRecord(value)) throw new Error('table outputs require an object payload');
  if (!Array.isArray(value.columns) || !value.columns.length) throw new Error('table outputs require columns');
  const columnKeys: string[] = [];
  value.columns.forEach((column, index) => {
    if (!isRecord(column)) throw new Error('table columns must contain objects');
    columnKeys.push(requiredString(column.key, `table columns[${index}].key`));
    requiredString(column.label, `table columns[${index}].label`);
  });
  if (!Array.isArray(value.rows)) throw new Error('table outputs require rows');
  value.rows.forEach((row, index) => {
    if (!isRecord(row)) throw new Error(`table rows[${index}] must be an object`);
    for (const key of columnKeys) {
      const cell = row[key];
      if (
        cell !== undefined &&
        cell !== null &&
        typeof cell !== 'string' &&
        typeof cell !== 'number' &&
        typeof cell !== 'boolean'
      ) {
        throw new Error(`table rows[${index}].${key} has an unsupported value`);
      }
    }
  });
}

function validateTextPayload(value: unknown): void {
  if (!isRecord(value)) throw new Error('text outputs require an object payload');
  requiredString(value.body, 'text body');
}

export function validateWorkspaceOutput(value: unknown): WorkspaceOutput {
  if (!isRecord(value)) throw new Error('workspace output must be an object');
  requiredString(value.id, 'workspace output id');
  requiredString(value.title, 'workspace output title');
  optionalString(value.subtitle, 'workspace output subtitle');
  requiredString(value.created_at, 'workspace output created_at');
  if (typeof value.kind !== 'string' || !OUTPUT_KINDS.has(value.kind as WorkspaceOutputKind)) {
    throw new Error('workspace output kind is invalid');
  }
  if (!isRecord(value.provenance)) throw new Error('workspace output provenance is required');
  requiredString(value.provenance.source_module, 'workspace output source_module');
  optionalString(value.provenance.source_id, 'workspace output source_id');
  if (value.provenance.generated !== undefined && typeof value.provenance.generated !== 'boolean') {
    throw new Error('workspace output generated flag must be boolean');
  }
  if (typeof value.provenance.evidence_status !== 'string' || !EVIDENCE_STATES.has(value.provenance.evidence_status)) {
    throw new Error('workspace output evidence_status is invalid');
  }

  switch (value.kind) {
    case 'image':
    case 'diagram':
      validateImagePayload(value.payload);
      break;
    case 'chart':
      validateChartPayload(value.payload);
      break;
    case 'table':
      validateTablePayload(value.payload);
      break;
    case 'text':
      validateTextPayload(value.payload);
      break;
  }
  return value as unknown as WorkspaceOutput;
}

export function emitWorkspaceOutput(output: WorkspaceOutput): void {
  const validated = validateWorkspaceOutput(output);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkspaceOutput>(CALYX_WORKSPACE_OUTPUT_EVENT, { detail: validated }));
}

/**
 * Fail-soft batch ingestion: one malformed auxiliary output (e.g. from a
 * server response) must never discard the valid outputs alongside it.
 * Returns the number of outputs actually emitted.
 */
export function emitWorkspaceOutputs(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let emitted = 0;
  for (const candidate of value) {
    try {
      emitWorkspaceOutput(validateWorkspaceOutput(candidate));
      emitted += 1;
    } catch {
      // Invalid entries remain outside the workspace rather than breaking the batch.
    }
  }
  return emitted;
}

export function clearWorkspaceOutputsBySource(sourceModule: string): void {
  const source = requiredString(sourceModule, 'workspace output source module').trim();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(CALYX_WORKSPACE_OUTPUT_CLEAR_EVENT, { detail: source }));
}

export function subscribeWorkspaceOutputs(listener: (output: WorkspaceOutput) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    try {
      listener(validateWorkspaceOutput((event as CustomEvent<unknown>).detail));
    } catch {
      // A malformed event must not take down the host workspace.
    }
  };
  window.addEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, handler);
  return () => window.removeEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, handler);
}

export function subscribeWorkspaceOutputClears(listener: (sourceModule: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const source = (event as CustomEvent<unknown>).detail;
    if (typeof source === 'string' && source.trim()) listener(source.trim());
  };
  window.addEventListener(CALYX_WORKSPACE_OUTPUT_CLEAR_EVENT, handler);
  return () => window.removeEventListener(CALYX_WORKSPACE_OUTPUT_CLEAR_EVENT, handler);
}
