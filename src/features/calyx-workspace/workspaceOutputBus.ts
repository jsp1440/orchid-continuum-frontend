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
  rows: Array<Record<string, string | number | boolean | null>>;
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

function assertPercent(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${name} must be between 0 and 100`);
}

export function validateWorkspaceOutput(output: WorkspaceOutput): WorkspaceOutput {
  if (!output.id.trim()) throw new Error('workspace output id is required');
  if (!output.title.trim()) throw new Error('workspace output title is required');
  if (!output.provenance?.source_module?.trim()) throw new Error('workspace output source_module is required');
  if ((output.kind === 'image' || output.kind === 'diagram')) {
    const payload = output.payload as WorkspaceImagePayload;
    if (!payload.src?.trim() || !payload.alt?.trim()) throw new Error('image outputs require src and alt');
    for (const annotation of payload.annotations ?? []) {
      assertPercent(annotation.x, 'annotation.x');
      assertPercent(annotation.y, 'annotation.y');
      assertPercent(annotation.width, 'annotation.width');
      assertPercent(annotation.height, 'annotation.height');
      if (annotation.x + annotation.width > 100 || annotation.y + annotation.height > 100) throw new Error('annotation bounds must stay within image');
    }
  }
  if (output.kind === 'chart') {
    const payload = output.payload as WorkspaceChartPayload;
    if (!payload.x_key || !payload.series?.length || !Array.isArray(payload.data)) throw new Error('chart outputs require x_key, series, and data');
  }
  if (output.kind === 'table') {
    const payload = output.payload as WorkspaceTablePayload;
    if (!payload.columns?.length || !Array.isArray(payload.rows)) throw new Error('table outputs require columns and rows');
  }
  return output;
}

export function emitWorkspaceOutput(output: WorkspaceOutput): void {
  validateWorkspaceOutput(output);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkspaceOutput>(CALYX_WORKSPACE_OUTPUT_EVENT, { detail: output }));
}

export function subscribeWorkspaceOutputs(listener: (output: WorkspaceOutput) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => listener(validateWorkspaceOutput((event as CustomEvent<WorkspaceOutput>).detail));
  window.addEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, handler);
  return () => window.removeEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, handler);
}
