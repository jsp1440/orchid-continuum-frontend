import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { DEPENDENCY_READINESS_CENSUS, DEPENDENCY_READINESS_CENSUS_DATE } from '@/lib/dependency-readiness/dependencyReadinessData';
import { countByReadiness, groupByEnvironment, listUnresolvedRequiredRows } from '@/lib/dependency-readiness/readinessOps';
import type { DependencyEnvironment, DependencyReadinessState, DependencyRecord } from '@/lib/dependency-readiness/types';

const READINESS_LABEL: Record<DependencyReadinessState, string> = {
  CONFIGURED: 'Configured',
  NOT_REQUIRED: 'Not required',
  MISSING: 'Missing',
  INVALID: 'Invalid',
  EXTERNAL_BLOCKER: 'External blocker',
  UNKNOWN: 'Unknown',
};

const READINESS_CLASS: Record<DependencyReadinessState, string> = {
  CONFIGURED: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  NOT_REQUIRED: 'border-white/15 bg-white/[0.06] text-[#cfc8b8]/70',
  MISSING: 'border-red-300/30 bg-red-300/10 text-red-200',
  INVALID: 'border-red-400/40 bg-red-400/15 text-red-100',
  EXTERNAL_BLOCKER: 'border-amber-300/30 bg-amber-300/12 text-amber-100',
  UNKNOWN: 'border-[#d4b34a]/35 bg-[#d4b34a]/12 text-[#f1d878]',
};

const ENVIRONMENT_LABEL: Record<DependencyEnvironment, string> = {
  BACKEND_RENDER: 'Backend · Render',
  FRONTEND_RENDER: 'Frontend · Render',
  BACKEND_GITHUB_ACTIONS: 'Backend · GitHub Actions',
  FRONTEND_GITHUB_ACTIONS: 'Frontend · GitHub Actions',
  OTHER: 'Other',
};

function ReadinessBadge({ state }: { state: DependencyReadinessState }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${READINESS_CLASS[state]}`}>
      {READINESS_LABEL[state]}
    </span>
  );
}

function DependencyRow({ record }: { record: DependencyRecord }) {
  const [expanded, setExpanded] = useState(false);
  const requiredRows = record.requirements.filter((r) => r.required);

  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2 py-2.5 text-left">
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#cfc8b8]/50" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#cfc8b8]/50" />}
        <span className="flex-1 text-sm text-[#f5f0e8]/88">{record.provider}</span>
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfc8b8]/40 sm:inline">{record.classification.replace(/_/g, ' ')}</span>
        <span className="hidden font-mono text-[9px] text-[#cfc8b8]/45 md:inline">
          {requiredRows.length === 0 ? 'not required anywhere' : `required in ${requiredRows.length} env${requiredRows.length === 1 ? '' : 's'}`}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 pb-3 pl-6">
          <p className="text-[12px] leading-5 text-[#cfc8b8]/70">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4b34a]">Owning capability — </span>
            {record.owningCapability}
          </p>
          {record.notes ? (
            <p className="text-[12px] leading-5 text-amber-100/75">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-amber-200/80">Note — </span>
              {record.notes}
            </p>
          ) : null}
          <ul className="space-y-2">
            {record.requirements.map((requirement) => (
              <li key={requirement.environment} className="space-y-1.5 rounded-lg border border-white/[0.06] bg-black/15 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#cfc8b8]/70">{ENVIRONMENT_LABEL[requirement.environment]}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfc8b8]/40">{requirement.required ? 'required' : 'not required'}</span>
                  <ReadinessBadge state={requirement.readiness} />
                </div>
                <p className="text-[11px] leading-5 text-[#cfc8b8]/65">
                  <span className="text-[#cfc8b8]/45">source — </span>
                  <code className="text-[#cfc8b8]/80">{requirement.source}</code>
                </p>
                <p className="text-[11px] leading-5 text-[#cfc8b8]/65">
                  <span className="text-[#cfc8b8]/45">validation (never reveals the value) — </span>
                  {requirement.validationMethod}
                </p>
                {requirement.lastEvidence ? (
                  <p className="text-[11px] leading-5 text-emerald-200/70">
                    <span className="text-emerald-300/70">last evidence — </span>
                    {requirement.lastEvidence}
                  </p>
                ) : null}
                <p className="text-[11px] leading-5 text-[#cfc8b8]/65">
                  <span className="text-[#cfc8b8]/45">next action — </span>
                  {requirement.blockerOrNextAction}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function DependencyReadinessMatrix() {
  const records = DEPENDENCY_READINESS_CENSUS;
  const readinessCounts = useMemo(() => countByReadiness(records), [records]);
  const environmentGroups = useMemo(() => groupByEnvironment(records), [records]);
  const unresolved = useMemo(() => listUnresolvedRequiredRows(records), [records]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[11px] leading-5 text-amber-100/80">
        <ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.5} />
        This matrix never displays, stores, or compares a credential&apos;s value — only whether it is required, where, and its
        readiness state.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(ENVIRONMENT_LABEL) as DependencyEnvironment[])
          .filter((env) => env !== 'OTHER')
          .map((env) => {
            const rows = environmentGroups[env];
            const requiredRows = rows.filter((r) => r.required);
            const settled = requiredRows.filter((r) => r.readiness === 'CONFIGURED').length;
            return (
              <div key={env} className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">{ENVIRONMENT_LABEL[env]}</div>
                <div className="mt-2 text-2xl font-semibold text-[#f5f0e8]">
                  {settled}/{requiredRows.length}
                </div>
                <div className="mt-1 text-[11px] text-[#cfc8b8]/60">required dependencies configured</div>
              </div>
            );
          })}
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Readiness across all rows</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(READINESS_LABEL) as DependencyReadinessState[]).map((state) => (
            <span key={state} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/15 px-2.5 py-1 text-[11px] text-[#cfc8b8]/75">
              <ReadinessBadge state={state} />
              {readinessCounts[state]}
            </span>
          ))}
        </div>
      </div>

      {unresolved.length > 0 ? (
        <div className="rounded-lg border border-[#d4b34a]/30 bg-gradient-to-br from-[#0d1d13]/95 to-[#0b1a10]/90 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Unresolved required dependencies</div>
          <ul className="mt-2 space-y-1.5">
            {unresolved.map((row) => (
              <li key={`${row.dependencyId}-${row.environment}`} className="flex flex-wrap items-center gap-2 text-[12px] text-[#f5f0e8]/85">
                <ReadinessBadge state={row.readiness} />
                <span>{row.provider}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfc8b8]/45">{ENVIRONMENT_LABEL[row.environment]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Dependency matrix</div>
          <div className="font-mono text-[9px] text-[#cfc8b8]/45">census as of {new Date(DEPENDENCY_READINESS_CENSUS_DATE).toLocaleDateString()}</div>
        </div>
        <p className="mb-3 text-[12px] leading-5 text-[#cfc8b8]/70">
          Every credential/config value discovered so far, its owning environments, and its readiness. Expand a row for exact
          requirement sources and the value-free validation method for each environment.
        </p>
        <div className="max-h-[640px] overflow-y-auto rounded-lg border border-white/[0.06] bg-black/10 px-3">
          {records.map((record) => (
            <DependencyRow key={record.id} record={record} />
          ))}
        </div>
      </div>
    </div>
  );
}
