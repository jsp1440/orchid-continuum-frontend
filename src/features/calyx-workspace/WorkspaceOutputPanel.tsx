import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WorkspaceChartPayload, WorkspaceImagePayload, WorkspaceOutput, WorkspaceTablePayload, WorkspaceTextPayload } from './workspaceOutputBus';

const EvidenceBadge: React.FC<{ status: WorkspaceOutput['provenance']['evidence_status'] }> = ({ status }) => (
  <span className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">{status}</span>
);

const ImageOutput: React.FC<{ payload: WorkspaceImagePayload }> = ({ payload }) => (
  <figure>
    <div className="relative overflow-hidden rounded-sm border border-stone-200 bg-stone-50">
      <img src={payload.src} alt={payload.alt} className="block max-h-[420px] w-full object-contain" />
      {(payload.annotations ?? []).map((annotation) => (
        <div
          key={annotation.id}
          className="absolute border-2 border-[#8E3A6B] bg-[#8E3A6B]/10"
          style={{ left: `${annotation.x}%`, top: `${annotation.y}%`, width: `${annotation.width}%`, height: `${annotation.height}%` }}
        >
          <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-[#8E3A6B] px-1.5 py-0.5 text-[10px] font-medium text-white">{annotation.label}</span>
        </div>
      ))}
    </div>
    {payload.caption ? <figcaption className="mt-2 text-xs leading-relaxed text-stone-500">{payload.caption}</figcaption> : null}
  </figure>
);

const ChartOutput: React.FC<{ payload: WorkspaceChartPayload }> = ({ payload }) => {
  const common = <><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={payload.x_key} /><YAxis /><Tooltip /><Legend /></>;
  return <div className="h-72 w-full">{payload.chart_type === 'bar' ? (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={payload.data}>{common}{payload.series.map((series) => <Bar key={series.key} dataKey={series.key} name={series.label ?? series.key} fill="#8E3A6B" />)}</BarChart></ResponsiveContainer>
  ) : (
    <ResponsiveContainer width="100%" height="100%"><LineChart data={payload.data}>{common}{payload.series.map((series) => <Line key={series.key} type="monotone" dataKey={series.key} name={series.label ?? series.key} stroke="#4A7C59" strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer>
  )}</div>;
};

const TableOutput: React.FC<{ payload: WorkspaceTablePayload }> = ({ payload }) => (
  <div className="overflow-auto rounded-sm border border-stone-200">
    <table className="min-w-full border-collapse text-left text-xs">
      <thead className="bg-stone-100 text-stone-700"><tr>{payload.columns.map((column) => <th key={column.key} className="border-b border-stone-200 px-3 py-2 font-semibold">{column.label}</th>)}</tr></thead>
      <tbody>{payload.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-stone-100 last:border-0">{payload.columns.map((column) => <td key={column.key} className="px-3 py-2 text-stone-600">{String(row[column.key] ?? '')}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

export const WorkspaceOutputPanel: React.FC<{ output: WorkspaceOutput; onClose: () => void }> = ({ output, onClose }) => (
  <article className="overflow-hidden rounded-sm border border-[#8E3A6B]/20 bg-white shadow-sm">
    <header className="flex items-start gap-3 border-b border-stone-200 px-4 py-3">
      <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#8E3A6B]">{output.kind} output · {output.provenance.source_module}</p><h3 className="mt-0.5 font-serif text-lg text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{output.title}</h3>{output.subtitle ? <p className="mt-1 text-xs text-stone-500">{output.subtitle}</p> : null}</div>
      <EvidenceBadge status={output.provenance.evidence_status} />
      <button type="button" onClick={onClose} className="rounded-sm border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-50" aria-label={`Close ${output.title}`}>Close</button>
    </header>
    <div className="p-4">
      {(output.kind === 'image' || output.kind === 'diagram') ? <ImageOutput payload={output.payload as WorkspaceImagePayload} /> : null}
      {output.kind === 'chart' ? <ChartOutput payload={output.payload as WorkspaceChartPayload} /> : null}
      {output.kind === 'table' ? <TableOutput payload={output.payload as WorkspaceTablePayload} /> : null}
      {output.kind === 'text' ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{(output.payload as WorkspaceTextPayload).body}</p> : null}
    </div>
    <footer className="border-t border-stone-100 bg-stone-50 px-4 py-2 text-[10px] text-stone-500">Source ID: {output.provenance.source_id ?? 'not supplied'} · {output.provenance.generated ? 'generated/derived output' : 'source-backed or module-provided output'}</footer>
  </article>
);
