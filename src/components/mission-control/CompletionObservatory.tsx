import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { COMPLETION_GRAPH, COMPLETION_GRAPH_CENSUS_DATE } from '@/lib/completion-graph/completionGraphData';
import { countIncompleteLeaves, countLeavesByStatus, getLeaves, groupLeavesByLane } from '@/lib/completion-graph/graphOps';
import { selectAdmissibleLeaf } from '@/lib/completion-graph/scheduler';
import { computeGateScore, computeNodeCensusCoverage, computeNodePercentage } from '@/lib/completion-graph/scoring';
import type { CompletionNode, CompletionStatus, Evidence, ExecutionLane } from '@/lib/completion-graph/types';

const STATUS_LABEL: Record<CompletionStatus, string> = {
  DONE: 'Done',
  PARTIAL: 'Partial',
  MISSING: 'Missing',
  BLOCKED: 'Blocked',
  OWNER_ACTION: 'Owner action',
  EXTERNAL_BLOCKER: 'External blocker',
  UNKNOWN: 'Unknown',
};

const STATUS_CLASS: Record<CompletionStatus, string> = {
  DONE: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  PARTIAL: 'border-[#d4b34a]/35 bg-[#d4b34a]/12 text-[#f1d878]',
  MISSING: 'border-red-300/30 bg-red-300/10 text-red-200',
  BLOCKED: 'border-red-400/40 bg-red-400/15 text-red-100',
  OWNER_ACTION: 'border-amber-300/30 bg-amber-300/12 text-amber-100',
  EXTERNAL_BLOCKER: 'border-red-400/40 bg-red-400/15 text-red-100',
  UNKNOWN: 'border-white/15 bg-white/[0.06] text-[#cfc8b8]/80',
};

const LANE_LABEL: Record<ExecutionLane, string> = {
  PRODUCT_COMPLETION: 'Product completion',
  INTEGRATION_COMPLETION: 'Integration completion',
  SCIENTIFIC_DATA_COMPLETION: 'Scientific/data completion',
  RELEASE_ACCEPTANCE: 'Release/acceptance',
};

function StatusBadge({ status }: { status: CompletionStatus }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function PercentageLabel({ node }: { node: CompletionNode }) {
  const percentage = computeNodePercentage(node);
  if (percentage === null) {
    return <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#cfc8b8]/55">not yet scored</span>;
  }
  if (node.children.length === 0 && node.gateScores) {
    const { coverage, evaluatedCount, totalCount } = computeGateScore(node.gateScores);
    return (
      <span className="font-mono text-[10px] text-[#cfc8b8]/75">
        {percentage}%{' '}
        <span className="text-[#cfc8b8]/45">
          ({evaluatedCount}/{totalCount} gates, {Math.round(coverage * 100)}% weight evidenced)
        </span>
      </span>
    );
  }
  const coverage = Math.round(computeNodeCensusCoverage(node) * 100);
  return (
    <span className="font-mono text-[10px] text-[#cfc8b8]/75">
      {percentage}%{' '}
      <span className="text-[#cfc8b8]/45">(leaf-weighted, {coverage}% of subtree evaluated)</span>
    </span>
  );
}

function evidenceHref(evidence: Evidence): string | null {
  const repo = 'jsp1440/orchid-continuum-frontend';
  if (evidence.kind === 'pr' || evidence.kind === 'issue') {
    const num = evidence.ref.replace(/^.*#/, '');
    if (/^\d+$/.test(num)) return `https://github.com/${repo}/${evidence.kind === 'pr' ? 'pull' : 'issues'}/${num}`;
  }
  if (evidence.kind === 'commit') {
    return `https://github.com/${repo}/commit/${evidence.ref}`;
  }
  return null;
}

function EvidenceRow({ evidence }: { evidence: Evidence }) {
  const href = evidenceHref(evidence);
  return (
    <li className="flex items-start gap-2 text-[11px] leading-5 text-[#cfc8b8]/75">
      <span className="mt-0.5 rounded border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#cfc8b8]/60">{evidence.kind}</span>
      <span className="flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#d4b34a] hover:underline">
            {evidence.ref} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <code className="text-[#cfc8b8]/85">{evidence.ref}</code>
        )}
        {evidence.note ? <span className="block text-[#cfc8b8]/55">{evidence.note}</span> : null}
      </span>
    </li>
  );
}

function GraphNodeRow({ node, depth }: { node: CompletionNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div className="border-b border-white/[0.06] last:border-0" style={{ paddingLeft: depth * 16 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 py-2.5 text-left"
      >
        {hasChildren || node.evidence.length > 0 ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#cfc8b8]/50" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#cfc8b8]/50" />
        ) : (
          <span className="w-3.5" />
        )}
        <span className="flex-1 text-sm text-[#f5f0e8]/88">{node.name}</span>
        <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfc8b8]/40">{node.type.replace('_', ' ')}</span>
        <PercentageLabel node={node} />
        <StatusBadge status={node.status} />
      </button>

      {expanded ? (
        <div className="pb-3 pl-6">
          {!hasChildren ? (
            <div className="space-y-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
              <p className="text-[12px] leading-5 text-[#cfc8b8]/80">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4b34a]">Next action — </span>
                {node.nextAction}
              </p>
              {node.lastAccomplishment ? (
                <p className="text-[12px] leading-5 text-emerald-200/75">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-300/80">Last accomplishment — </span>
                  {node.lastAccomplishment}
                </p>
              ) : null}
              {node.evidence.length > 0 ? (
                <ul className="space-y-1.5">
                  {node.evidence.map((ev, i) => (
                    <EvidenceRow key={`${ev.kind}-${ev.ref}-${i}`} evidence={ev} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            node.children.map((child) => <GraphNodeRow key={child.id} node={child} depth={depth + 1} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function CompletionObservatory() {
  const root = COMPLETION_GRAPH;

  const overallPercentage = useMemo(() => computeNodePercentage(root), [root]);
  const overallCoverage = useMemo(() => Math.round(computeNodeCensusCoverage(root) * 100), [root]);
  const incompleteCount = useMemo(() => countIncompleteLeaves(root), [root]);
  const statusCounts = useMemo(() => countLeavesByStatus(root), [root]);
  const totalLeaves = useMemo(() => getLeaves(root).length, [root]);
  const admission = useMemo(() => selectAdmissibleLeaf(root, { now: new Date().toISOString() }), [root]);
  const nextGate = admission.selected;
  const blockers = useMemo(() => admission.surfacedBlockers.filter((n) => n.status === 'BLOCKED' || n.status === 'EXTERNAL_BLOCKER'), [admission]);
  const ownerActions = useMemo(() => admission.surfacedBlockers.filter((n) => n.status === 'OWNER_ACTION'), [admission]);
  const laneGroups = useMemo(() => groupLeavesByLane(root), [root]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[#d4b34a]/25 bg-[#0d1d13]/90 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Overall completion</div>
          <div className="mt-2 text-3xl font-semibold text-[#f5f0e8]">
            {overallPercentage === null ? '—' : `${overallPercentage}%`}
          </div>
          <div className="mt-1 text-[11px] text-[#cfc8b8]/60">
            {overallPercentage === null
              ? 'No leaves scored yet'
              : `Leaf-count-weighted across scored subtrees — only ${overallCoverage}% of all tracked leaves have been evaluated`}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Incomplete leaves</div>
          <div className="mt-2 text-3xl font-semibold text-[#f5f0e8]">{incompleteCount}</div>
          <div className="mt-1 text-[11px] text-[#cfc8b8]/60">of {totalLeaves} tracked acceptance leaves</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Blockers / owner actions</div>
          <div className="mt-2 text-3xl font-semibold text-[#f5f0e8]">{blockers.length + ownerActions.length}</div>
          <div className="mt-1 text-[11px] text-[#cfc8b8]/60">{blockers.length} blocked, {ownerActions.length} awaiting owner</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Census as of</div>
          <div className="mt-2 text-lg font-semibold text-[#f5f0e8]">{new Date(COMPLETION_GRAPH_CENSUS_DATE).toLocaleDateString()}</div>
          <div className="mt-1 text-[11px] text-[#cfc8b8]/60">First-pass census — see remaining census-pending leaves below</div>
        </div>
      </div>

      {nextGate ? (
        <div className="rounded-lg border border-[#d4b34a]/30 bg-gradient-to-br from-[#0d1d13]/95 to-[#0b1a10]/90 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Scheduler — next bounded action</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#f5f0e8]/90">
            <StatusBadge status={nextGate.node.status} />
            <span className="font-medium">{nextGate.node.name}</span>
            {nextGate.lane ? <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfc8b8]/50">{LANE_LABEL[nextGate.lane]}</span> : null}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/80">{nextGate.node.nextAction}</p>
          <p className="mt-2 font-mono text-[10px] text-[#cfc8b8]/50">Ranked by: {nextGate.reasons.join(' · ')}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-100/85">
          No actionable unmet gates remain — everything left is blocked, owner-gated, or externally blocked.
        </div>
      )}

      <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
        <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Execution lanes</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(LANE_LABEL) as ExecutionLane[]).map((lane) => {
            const leaves = laneGroups[lane];
            const done = leaves.filter((l) => l.status === 'DONE').length;
            return (
              <div key={lane} className="rounded-lg border border-white/[0.06] bg-black/15 p-3">
                <div className="text-[11px] font-medium text-[#f5f0e8]/85">{LANE_LABEL[lane]}</div>
                <div className="mt-1 font-mono text-[10px] text-[#cfc8b8]/60">{done} done / {leaves.length} tracked</div>
              </div>
            );
          })}
        </div>
      </div>

      {blockers.length > 0 || ownerActions.length > 0 ? (
        <div className="rounded-lg border border-red-300/20 bg-red-300/[0.06] p-4">
          <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-red-200/80">Blockers &amp; owner actions</div>
          <ul className="space-y-2">
            {[...blockers, ...ownerActions].map((node) => (
              <li key={node.id} className="flex flex-wrap items-center gap-2 text-[12px] text-[#f5f0e8]/85">
                <StatusBadge status={node.status} />
                <span>{node.name}</span>
                <span className="text-[#cfc8b8]/55">— {node.nextAction}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Canonical completion graph</div>
          <div className="font-mono text-[9px] text-[#cfc8b8]/45">
            {statusCounts.DONE} done · {statusCounts.PARTIAL} partial · {statusCounts.MISSING} missing · {statusCounts.UNKNOWN} unknown
          </div>
        </div>
        <p className="mb-3 text-[12px] leading-5 text-[#cfc8b8]/70">
          Portfolio → Domain → Module → Capability → Integration → Acceptance Gate. Expand any row for its evidence and next bounded action.
        </p>
        <div className="max-h-[720px] overflow-y-auto rounded-lg border border-white/[0.06] bg-black/10 px-3">
          {root.children.map((domain) => (
            <GraphNodeRow key={domain.id} node={domain} depth={0} />
          ))}
        </div>
      </div>
    </div>
  );
}
