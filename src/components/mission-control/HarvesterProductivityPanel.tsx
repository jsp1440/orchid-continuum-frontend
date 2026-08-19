import React, { useEffect, useMemo, useState } from 'react';

import {
  BINDING_COPY,
  describeFlag,
  formatMetric,
  formatRate,
  loadHarvesterProductivity,
  UNAVAILABLE_LABEL,
  type HarvesterProductivity,
  type HarvesterProductivityReport,
  type WindowKey,
} from '@/lib/harvesterProductivity';

/**
 * Harvester productivity — an operations screen, not a marketing dashboard.
 *
 * Framing is Activity -> Yield -> Integration -> Problems, in that order,
 * because those are four different claims. A harvester that ran ten times and
 * retained nothing did activity and no yield, and the layout must not let those
 * blur together.
 *
 * Counters render only through formatMetric, which returns a string. An
 * unmeasured counter reads "not measured" and can never come out as 0.
 */

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

const Cell: React.FC<{ label: string; value: string; muted?: boolean }> = ({ label, value, muted }) => (
  <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">{label}</p>
    <p className={`mt-1 text-sm font-medium tabular-nums ${muted ? 'italic text-white/40' : 'text-white/90'}`}>
      {value}
    </p>
  </div>
);

const HarvesterCard: React.FC<{ harvester: HarvesterProductivity; windowKey: WindowKey }> = ({
  harvester,
  windowKey,
}) => {
  const w = harvester.windows?.[windowKey];
  const uninstrumented = harvester.telemetry_state === 'uninstrumented';

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white/90">{harvester.harvester_id}</h4>
          <p className="mt-0.5 font-mono text-[10px] text-white/35">{harvester.job_name}</p>
        </div>
        {harvester.binding_confidence !== 'exact' ? (
          <span
            className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-200"
            title={harvester.binding_note}
          >
            {harvester.binding_confidence} binding
          </span>
        ) : null}
      </header>

      {harvester.binding_confidence !== 'exact' ? (
        <p className="mt-2 text-xs leading-5 text-amber-200/80">{BINDING_COPY[harvester.binding_confidence]}</p>
      ) : null}

      {uninstrumented ? (
        <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/50">
          This source records no counters in any run. That is missing instrumentation, not a measured
          zero, so nothing below is reported as a number.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">Activity</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cell label="Runs" value={String(w?.runs_attempted ?? 0)} />
            <Cell label="Succeeded" value={String(w?.runs_succeeded ?? 0)} />
            <Cell label="Failed" value={String(w?.runs_failed ?? 0)} />
            <Cell
              label="Fetched"
              value={formatMetric(w?.records_fetched)}
              muted={w?.records_fetched?.state !== 'measured'}
            />
          </div>
        </section>

        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">Yield</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cell label="New" value={formatMetric(w?.records_new)} muted={w?.records_new?.state !== 'measured'} />
            <Cell
              label="Updated"
              value={formatMetric(w?.records_updated)}
              muted={w?.records_updated?.state !== 'measured'}
            />
            <Cell
              label="Duplicate"
              value={formatMetric(w?.records_duplicate)}
              muted={w?.records_duplicate?.state !== 'measured'}
            />
            <Cell
              label="Rejected"
              value={formatMetric(w?.records_rejected)}
              muted={w?.records_rejected?.state !== 'measured'}
            />
          </div>
        </section>

        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">Integration</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Cell
              label="Taxonomy linked"
              value={formatMetric(w?.records_linked)}
              muted={w?.records_linked?.state !== 'measured'}
            />
            <Cell
              label="Unresolved"
              value={formatMetric(w?.records_unlinked)}
              muted={w?.records_unlinked?.state !== 'measured'}
            />
            <Cell
              label="Graph elements"
              value={formatMetric(w?.graph_elements)}
              muted={w?.graph_elements?.state !== 'measured'}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-white/40">
            New per 1,000 fetched: {formatRate(w?.marginal_yield_per_1000_fetched)}
          </p>
        </section>

        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">Problems</p>
          {harvester.review_flags.length ? (
            <ul className="mt-1.5 space-y-1">
              {harvester.review_flags.map((flag) => (
                <li
                  key={flag}
                  className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100"
                >
                  {describeFlag(flag)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-white/40">Nothing flagged for review in this window.</p>
          )}
          <p className="mt-1.5 text-[11px] text-white/35">
            Last successful run: {harvester.last_successful_run ?? UNAVAILABLE_LABEL}
          </p>
        </section>
      </div>
    </article>
  );
};

export const HarvesterProductivityPanel: React.FC = () => {
  const [report, setReport] = useState<HarvesterProductivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowKey, setWindowKey] = useState<WindowKey>('24h');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loadHarvesterProductivity(controller.signal)
      .then((value) => {
        if (active) setReport(value);
      })
      .catch(() => {
        if (active) {
          setReport({
            schema_version: 'unknown',
            telemetry_state: 'unavailable',
            reason: 'Productivity telemetry could not be reached.',
            harvesters: [],
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const flagged = useMemo(
    () => (report?.harvesters ?? []).filter((h) => h.review_flags.length > 0).length,
    [report],
  );

  if (loading) {
    return <p className="text-sm text-white/50">Reading harvester productivity…</p>;
  }

  if (!report || report.telemetry_state === 'unavailable') {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-sm text-white/70">Harvester productivity is unavailable.</p>
        <p className="mt-1 text-xs leading-5 text-white/45">
          {report?.reason ?? 'No run history could be read.'} No counts are shown, because none were
          measured.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="group" aria-label="Reporting window">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWindowKey(w.key)}
              aria-pressed={windowKey === w.key}
              className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
                windowKey === w.key
                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-100'
                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/45">
          {flagged > 0
            ? `${flagged} source${flagged === 1 ? '' : 's'} flagged for review`
            : 'Nothing flagged for review'}
        </p>
      </div>

      {(report.warnings ?? []).map((warning) => (
        <p
          key={warning}
          className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100"
        >
          {warning}
        </p>
      ))}

      <div className="grid gap-3 lg:grid-cols-2">
        {report.harvesters.map((harvester) => (
          <HarvesterCard key={harvester.harvester_id} harvester={harvester} windowKey={windowKey} />
        ))}
      </div>
    </div>
  );
};

export default HarvesterProductivityPanel;
