import React from 'react';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import type { WorkflowIntelligence, WorkflowIntelligenceItem } from '@/lib/workflowIntelligence';

function valueOrUnavailable(value: number | null): string {
  return value === null ? 'Unavailable' : value.toFixed(3);
}

function WorkflowCard({ item }: { item: WorkflowIntelligenceItem }) {
  const traceUrl = `${CALYX_BACKEND_BASE_URL}/api/scientific-observability/trace/${encodeURIComponent(item.correlationId)}`;
  return (
    <article className="rounded-lg border border-white/[0.08] bg-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#c9a24a]">{item.workflowType}</div>
          <h3 className="mt-1 text-sm font-medium text-[#f5f0e8]/90">{item.workflowId}</h3>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[9px] uppercase text-[#cfc8b8]/75">
          {item.displayState}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#cfc8b8]/70">
        <div><dt>Retries / rework</dt><dd className="text-[#f5f0e8]/85">{item.retryCount} / {item.reworkCount}</dd></div>
        <div><dt>Automation score</dt><dd className="text-[#f5f0e8]/85">{valueOrUnavailable(item.score)}</dd></div>
        <div><dt>Cost evidence</dt><dd className="text-[#f5f0e8]/85">{item.costState}</dd></div>
        <div><dt>Staleness</dt><dd className="text-[#f5f0e8]/85">{item.stale.value === null ? 'Unavailable' : item.stale.value ? 'Stale' : 'Current'}</dd></div>
        <div><dt>Evidence</dt><dd className="text-[#f5f0e8]/85">{item.evidenceRefs.length}</dd></div>
        <div><dt>Capability</dt><dd className="text-[#f5f0e8]/85">{item.capabilityState}</dd></div>
      </dl>
      {item.blockerRefs.length ? <p className="mt-3 text-[11px] text-amber-100/75">Blocked by: {item.blockerRefs.join(', ')}</p> : null}
      {item.findingCodes.length ? <p className="mt-2 text-[11px] text-red-100/70">Findings: {item.findingCodes.join(', ')}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        <a className="text-[#d4b34a] underline underline-offset-2" href={traceUrl} target="_blank" rel="noreferrer">Workflow evidence</a>
        <span className="text-[#cfc8b8]/55">{item.hasReviewableRunbook ? 'Generated runbook awaiting human review' : 'No eligible runbook'}</span>
      </div>
    </article>
  );
}

export default function WorkflowIntelligencePanel({ intelligence }: { intelligence?: WorkflowIntelligence | null }) {
  if (!intelligence) {
    return (
      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100/85">
        Workflow intelligence is unavailable. Missing scores, cost, and staleness are not treated as zero.
      </div>
    );
  }
  return (
    <div className="space-y-4" data-testid="workflow-intelligence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">{intelligence.contractVersion}</div>
        <div className="rounded-full border border-white/10 px-3 py-1 font-mono text-[9px] uppercase text-[#cfc8b8]/65">Advisory · human review required</div>
      </div>
      {intelligence.workflows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {intelligence.workflows.map((item) => <WorkflowCard key={item.workflowId} item={item} />)}
        </div>
      ) : (
        <p className="text-sm text-[#cfc8b8]/70">No canonical workflow observations are available. No workflow was invented.</p>
      )}
      <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-[11px] leading-5 text-emerald-100/75">
        This feed cannot dispatch agents, spend funds, publish conclusions, or mutate scientific, taxonomy, or Knowledge Graph state.
      </div>
    </div>
  );
}
