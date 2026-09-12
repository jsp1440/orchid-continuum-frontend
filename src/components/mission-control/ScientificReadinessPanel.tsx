import React from 'react';
import type { ScientificReadiness } from '@/lib/missionControlOps';

const LABELS: Record<string, string> = {
  engineering_health: 'Engineering health',
  integration_health: 'Integration health',
  data_readiness: 'Data readiness',
  scientific_evidence_readiness: 'Scientific evidence',
  product_workflow_readiness: 'Product workflow',
  freshness: 'Freshness',
};

function metricText(dimension: ScientificReadiness['dimensions'][string]): string {
  if (dimension.numerator === null || dimension.denominator === null) return 'Unavailable';
  return `${dimension.numerator}/${dimension.denominator}`;
}

export default function ScientificReadinessPanel({
  readiness,
}: {
  readiness?: ScientificReadiness | null;
}) {
  if (!readiness) {
    return (
      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100/85">
        Scientific readiness telemetry is unavailable. No missing value has been treated as zero.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="scientific-readiness">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">
            {readiness.contractVersion}
          </div>
          <div className="mt-1 text-sm text-[#f5f0e8]/85">
            Overall state: <span className="font-medium">{readiness.overallState}</span>
          </div>
        </div>
        <div className="rounded-full border border-white/10 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#cfc8b8]/65">
          Human review required
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.values(readiness.dimensions).map((dimension) => (
          <div key={dimension.key} className="rounded-lg border border-white/[0.08] bg-black/15 p-3">
            <div className="text-[12px] font-medium text-[#f5f0e8]/88">
              {LABELS[dimension.key] ?? dimension.key}
            </div>
            <div className="mt-1 font-mono text-lg text-[#d4b34a]">{metricText(dimension)}</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfc8b8]/50">
              {dimension.state}
            </div>
            {dimension.missingRequirements.length ? (
              <ul className="mt-2 space-y-1 text-[11px] leading-4 text-[#cfc8b8]/65">
                {dimension.missingRequirements.map((item) => <li key={item}>Missing: {item}</li>)}
              </ul>
            ) : null}
            {dimension.upstreamBlockers.length ? (
              <ul className="mt-2 space-y-1 text-[11px] leading-4 text-red-200/70">
                {dimension.upstreamBlockers.map((item) => <li key={item}>Blocked by: {item}</li>)}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(readiness.componentCoverage).map(([key, component]) => (
          <div key={key} className="rounded border border-white/[0.06] bg-black/10 px-3 py-2 text-[11px] text-[#cfc8b8]/70">
            <span className="capitalize text-[#f5f0e8]/82">{key}</span>
            <span className="float-right font-mono text-[9px] uppercase">{component.state}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-[11px] leading-5 text-emerald-100/75">
        This telemetry is advisory. It cannot publish scientific conclusions or authorize taxonomy or Knowledge Graph changes.
      </div>
    </div>
  );
}
